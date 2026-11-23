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

const puppeteer = createRequire(path.join(process.cwd(), "package.json"))("puppeteer");

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

const [distArg, route = "/", ...needles] = process.argv.slice(2);
if (!distArg) {
  console.error("usage: node probe-dist-route.js <dist-dir> <route> [text ...]");
  process.exit(2);
}

const DIST = path.resolve(distArg);
const PORT = Number(process.env.PROBE_PORT || 4321);
const SETTLE_MS = Number(process.env.PROBE_SETTLE_MS || 1500);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

const resolveFile = (urlPath) => {
  const target = path.resolve(DIST, `.${urlPath}`);
  if (target !== DIST && !target.startsWith(DIST + path.sep)) return null;
  for (const candidate of [target, path.join(target, "index.html")]) {
    if (isFile(candidate)) return candidate;
  }
  return path.join(DIST, "index.html");
};

const server = http.createServer((req, res) => {
  let file;
  try {
    file = resolveFile(decodeURIComponent(new URL(req.url, ORIGIN).pathname));
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

const run = async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      request.url().startsWith(`${ORIGIN}/`) ? request.continue() : request.abort()
    );
    await page.setViewport({ width: 1280, height: 2000 });
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

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
    await browser.close();
    server.close();
  }
};

run().catch((error) => {
  console.error("probe failed:", error.message);
  server.close();
  process.exit(1);
});
