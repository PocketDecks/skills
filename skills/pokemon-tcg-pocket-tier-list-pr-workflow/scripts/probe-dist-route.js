// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks
//
// Prints the rendered DOM of one route from a local production build, for
// evidence that curl cannot give (a table filled after hydration, a link
// count, a notice that must be absent).
//
// Usage, from the repository root after `yarn build`:
//   node <skill-dir>/scripts/probe-dist-route.js dist /statistics/ "No deck movement"
//
// Requiring this file defines helpers only. The server and browser start from
// the CLI.
//
// What it does, and nothing else:
// - Serves the build directory on 127.0.0.1 only (PROBE_PORT, default 4321).
//   A path resolves to its file, then to <dir>/index.html, then falls back to
//   the root index.html so client-only routes still mount. Paths that resolve
//   outside the build directory get a 404.
// - Opens the route in headless Chromium through the repository's own
//   Puppeteer dev dependency. Set PUPPETEER_EXECUTABLE_PATH to use a system
//   Chrome, as the repository's .env.example describes.
// - Aborts every request that is not for that loopback server, so the probe
//   makes no outside network calls. Card images, fonts, ads and Firebase do
//   not load; text and links still render.
// - Waits PROBE_SETTLE_MS (default 1500) after the network goes idle, then
//   prints JSON: the title, the number of /deck/ and /ja/deck/ links, whether
//   each given text appears in the body, page errors, and the first 20
//   non-empty body lines.
// It writes no files and exits non-zero on any failure.

const fs = require("fs");
const http = require("http");
const path = require("path");
const { createRequire } = require("module");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".woff2": "font/woff2",
};

const isFile = (item) => fs.existsSync(item) && fs.statSync(item).isFile();

const resolveFile = (dist, urlPath) => {
  const root = path.resolve(dist);
  const target = path.resolve(root, `.${urlPath}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  for (const candidate of [target, path.join(target, "index.html")]) {
    if (isFile(candidate)) return candidate;
  }
  return path.join(root, "index.html");
};

const isLoopbackRequest = (url, origin) => url.startsWith(`${origin}/`);

const createServer = (dist, origin) =>
  http.createServer((req, res) => {
    let file;
    try {
      file = resolveFile(dist, decodeURIComponent(new URL(req.url, origin).pathname));
    } catch {
      file = null;
    }
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });

const run = async (distArg, route, needles) => {
  const dist = path.resolve(distArg);
  const port = Number(process.env.PROBE_PORT || 4321);
  const settleMs = Number(process.env.PROBE_SETTLE_MS || 1500);
  const origin = `http://127.0.0.1:${port}`;
  const puppeteer = createRequire(path.join(process.cwd(), "package.json"))("puppeteer");
  const server = createServer(dist, origin);
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      isLoopbackRequest(request.url(), origin) ? request.continue() : request.abort()
    );
    await page.setViewport({ width: 1280, height: 2000 });
    await page.goto(`${origin}${route}`, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, settleMs));

    const result = await page.evaluate((texts) => {
      const body = document.body.innerText;
      return {
        title: document.title,
        deckLinks: document.querySelectorAll('a[href^="/deck/"], a[href^="/ja/deck/"]').length,
        found: Object.fromEntries(texts.map((text) => [text, body.includes(text)])),
        lines: body
          .split("\n")
          .filter((line) => line.trim())
          .slice(0, 20),
      };
    }, needles);

    console.log(JSON.stringify({ route, ...result, pageErrors }, null, 2));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
};

if (require.main === module) {
  const [distArg, route = "/", ...needles] = process.argv.slice(2);
  if (!distArg) {
    console.error("usage: node probe-dist-route.js <dist-dir> <route> [text ...]");
    process.exit(2);
  }
  run(distArg, route, needles).catch((error) => {
    console.error("probe failed:", error.message);
    process.exit(1);
  });
}

module.exports = { resolveFile, isLoopbackRequest };
