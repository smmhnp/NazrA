/**
 * serve.mjs — سرور ایستای توسعه بدون هیچ وابستگی (node:http).
 * اجرا: npm start  |  PORT=8080 npm start
 * سرصفحههای no-store از کششدن ناخواسته در محیط توسعه جلوگیری میکنند.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4173);
const host = "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    let filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(root + path.sep) && filePath !== path.join(root, "index.html")) {
      response.writeHead(403); response.end("Forbidden"); return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      if (!path.extname(pathname)) filePath = path.join(root, "index.html");
      else { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("404 — یافت نشد"); return; }
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    };
    if (filePath.endsWith("sw.js")) {
      headers["Service-Worker-Allowed"] = "/";
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    response.writeHead(200, headers);
    if (request.method === "HEAD") { response.end(); return; }
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`500 — ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`موسسه آموزش عالی شاندیز | نهضت هر شب جمعه`);
  console.log(`در حال اجرا: http://localhost:${port}/  (میزبان: ${host})`);
});
