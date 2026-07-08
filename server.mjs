// Standalone production server: serves the built frontend from dist/ and the
// api/ handlers against a PERSISTENT PGlite database (no Vercel, no external
// Postgres — this entry point never uses DATABASE_URL or the Neon driver).
//
//   npm run build && npm start
//
// Environment:
//   PGLITE_DATA_DIR  where PGlite stores its data (default ./data)
//   PORT             listen port (default 3000)

import http from "node:http";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
// Importing this registers the .js→.ts resolve hook before any api/ imports.
import { createApiHandler } from "./scripts/lib/serve-api.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(rootDir, "dist");
const indexHtmlPath = join(distDir, "index.html");

if (!existsSync(indexHtmlPath)) {
  console.error(
    "dist/index.html not found — the frontend has not been built. Run `npm run build` first."
  );
  process.exit(1);
}

// --- database (persistent) + api routes ----------------------------------
const dataDir = process.env.PGLITE_DATA_DIR ?? "./data";
const handleApi = await createApiHandler(new PGlite(dataDir));

// --- static files ---------------------------------------------------------
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function sendFile(res, filePath) {
  const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(readFileSync(filePath));
}

const server = http.createServer(async (req, res) => {
  // /api/* — real handlers via the shared adapter.
  if (await handleApi(req, res)) return;

  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request");
    return;
  }

  // Resolve inside dist/ and reject anything that escapes it (path traversal).
  const filePath = resolve(distDir, "." + pathname.replace(/\\/g, "/"));
  if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  // SPA fallback: everything else gets index.html (replaces vercel.json rewrites).
  sendFile(res, indexHtmlPath);
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(
    `time-clock standalone server on http://localhost:${port} ` +
      `(PGlite data dir: ${resolve(dataDir)})`
  );
});
