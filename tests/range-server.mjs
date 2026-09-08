/** Minimal static test server with single-byte-range support for local media. */
import http from "node:http";
import { createReadStream, stat } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? process.env.PORT ?? 52124);
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"], [".mp4", "video/mp4"], [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
]);

function sendError(request, response, statusCode, extraHeaders = {}) {
  const message = http.STATUS_CODES[statusCode];
  response.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(message),
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  response.end(request.method === "HEAD" ? undefined : message);
}

export function parseSingleRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match || !Number.isSafeInteger(size) || size <= 0 || (match[1] === "" && match[2] === "")) return null;
  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  if (match[2] === "") return { start, end: size - 1 };
  const requestedEnd = Number(match[2]);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function pipeFile(response, filePath, options) {
  const stream = createReadStream(filePath, options);
  stream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(http.STATUS_CODES[500]);
    }
    else response.destroy();
  });
  stream.pipe(response);
}

function serveFile(request, response, filePath, info) {
  const type = mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream";
  const common = { "Content-Type": type, "Accept-Ranges": "bytes" };
  if (request.headers.range) {
    const range = parseSingleRange(request.headers.range, info.size);
    if (!range) {
      response.writeHead(416, { "Content-Range": `bytes */${info.size}`, ...common });
      return response.end();
    }
    response.writeHead(206, {
      ...common, "Content-Length": range.end - range.start + 1,
      "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
    });
    return request.method === "HEAD" ? response.end() : pipeFile(response, filePath, range);
  }
  response.writeHead(200, { ...common, "Content-Length": info.size });
  return request.method === "HEAD" ? response.end() : pipeFile(response, filePath);
}

function isTraversalPath(rawPath, decodedPath) {
  if (rawPath.includes("\\") || decodedPath.includes("\\")) return true;
  return decodedPath.split("/").some((segment) => segment === "..");
}

export function createRangeServer(siteRoot) {
  if (typeof siteRoot !== "string" || siteRoot.trim() === "") {
    throw new TypeError("An explicit site root is required.");
  }
  const resolvedRoot = path.resolve(siteRoot);
  return http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendError(request, response, 405, { Allow: "GET, HEAD" });
    }

    let requestPath;
    let rawPath;
    try {
      const rawTargetPath = request.url.split("?", 1)[0];
      const decodedTargetPath = decodeURIComponent(rawTargetPath);
      if (decodedTargetPath.includes("\0")) return sendError(request, response, 400);
      if (isTraversalPath(rawTargetPath, decodedTargetPath)) return sendError(request, response, 403);

      const parsedUrl = new URL(request.url, "http://localhost");
      rawPath = parsedUrl.pathname;
      requestPath = decodeURIComponent(rawPath);
    } catch {
      return sendError(request, response, 400);
    }
    if (requestPath.includes("\0")) return sendError(request, response, 400);
    if (isTraversalPath(rawPath, requestPath)) return sendError(request, response, 403);

    const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const resolved = path.resolve(resolvedRoot, relativePath);
    if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
      return sendError(request, response, 403);
    }

    stat(resolved, (statError, info) => {
      if (!statError && info.isFile()) return serveFile(request, response, resolved, info);

      const mayFallback =
        statError &&
        (statError.code === "ENOENT" || statError.code === "ENOTDIR") &&
        path.extname(requestPath) === "";
      if (!mayFallback) return sendError(request, response, 404);

      const shellPath = path.join(resolvedRoot, "index.html");
      stat(shellPath, (shellError, shellInfo) => {
        if (shellError || !shellInfo.isFile()) return sendError(request, response, 404);
        return serveFile(request, response, shellPath, shellInfo);
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
  createRangeServer(distRoot).listen(port, "127.0.0.1", () => console.log(`Range test server listening on ${port}`));
}
