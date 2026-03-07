import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const showcaseDir = path.join(repoRoot, "output", "playwright", "store");
const shotsDir = path.join(showcaseDir, "screenshots");
const playwrightModulePath = process.env.PLAYWRIGHT_MODULE_PATH;
const port = 4173;
const firefoxExecutablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE;

const { firefox } = playwrightModulePath
  ? await import(pathToFileURL(playwrightModulePath).href)
  : await import("playwright");

const pages = [
  {
    file: "popup-showcase.html",
    output: "fire-summary-store-popup.png",
    viewport: { width: 1280, height: 800 },
  },
  {
    file: "settings-showcase.html",
    output: "fire-summary-store-settings.png",
    viewport: { width: 1280, height: 800 },
  },
  {
    file: "discussion-showcase.html",
    output: "fire-summary-store-discussion.png",
    viewport: { width: 1280, height: 800 },
  },
];

await fs.mkdir(shotsDir, { recursive: true });

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const server = http.createServer(async (request, response) => {
  try {
    const requestPath = new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname;
    const normalizedPath = path.normalize(
      path.join(repoRoot, decodeURIComponent(requestPath.replace(/^\/+/, "")))
    );

    if (!normalizedPath.startsWith(repoRoot)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const stats = await fs.stat(normalizedPath);
    const filePath = stats.isDirectory() ? path.join(normalizedPath, "index.html") : normalizedPath;
    const extname = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fsSync.createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => {
  server.listen(port, "127.0.0.1", resolve);
});

const browser = await firefox.launch({
  executablePath: firefoxExecutablePath || undefined,
  headless: true,
});

try {
  for (const pageSpec of pages) {
    const page = await browser.newPage({ viewport: pageSpec.viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(15000);
    const pageUrl = `http://127.0.0.1:${port}/output/playwright/store/${pageSpec.file}`;
    console.log(`Rendering ${pageSpec.output} from ${pageUrl}`);
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
    });
    await page.screenshot({
      path: path.join(shotsDir, pageSpec.output),
      fullPage: false,
    });
    await page.close();
  }

  console.log(`Created screenshots in ${shotsDir}`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
