import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRangeServer, parseSingleRange } from "../tests/range-server.mjs";

const size = 4_627_992;

async function listen(server, t, cleanup) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await cleanup?.();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function rawRequest(baseUrl, requestPath, method = "GET") {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname,
      port,
      path: requestPath,
      method,
      headers: { Connection: "close" },
      agent: false,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

async function createSpaFixture(t) {
  const siteRoot = await mkdtemp(path.join(tmpdir(), "felix-spa-root-"));
  await mkdir(path.join(siteRoot, "assets"));
  await mkdir(path.join(siteRoot, "portfolio"));
  await writeFile(path.join(siteRoot, "index.html"), "<!doctype html><title>Felix React shell</title>");
  await writeFile(path.join(siteRoot, "assets", "app.js"), "console.log('felix')");
  await writeFile(path.join(siteRoot, "portfolio", "index.html"), "<!doctype html><title>Portfolio standalone</title>");
  const server = createRangeServer(siteRoot);
  const baseUrl = await listen(server, t, () => rm(siteRoot, { recursive: true, force: true }));
  return { baseUrl, siteRoot };
}

test("requires an explicit site root", () => {
  assert.throws(() => createRangeServer(), /site root/i);
});

test("falls back to the React shell for safe extensionless GET and HEAD routes", async (t) => {
  const { baseUrl, siteRoot } = await createSpaFixture(t);
  const shell = await readFile(path.join(siteRoot, "index.html"));

  for (const requestPath of ["/lab", "/lab/", "/nested/client-route"]) {
    const response = await rawRequest(baseUrl, requestPath);
    assert.equal(response.status, 200, requestPath);
    assert.deepEqual(response.body, shell, requestPath);
    assert.match(response.headers["content-type"] ?? "", /^text\/html/);
  }

  const head = await rawRequest(baseUrl, "/lab", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body.byteLength, 0);
  assert.equal(Number(head.headers["content-length"]), shell.byteLength);
});

test("serves real standalone files before considering SPA fallback", async (t) => {
  const { baseUrl, siteRoot } = await createSpaFixture(t);
  const portfolio = await readFile(path.join(siteRoot, "portfolio", "index.html"));
  const response = await rawRequest(baseUrl, "/portfolio/index.html");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, portfolio);
  assert.match(response.body.toString(), /Portfolio standalone/);
  assert.doesNotMatch(response.body.toString(), /Felix React shell/);
});

test("does not hide missing assets or extension-bearing paths behind the SPA shell", async (t) => {
  const { baseUrl } = await createSpaFixture(t);

  for (const requestPath of ["/assets/missing.js", "/missing.png", "/folder.with-dot/route.js"]) {
    const response = await rawRequest(baseUrl, requestPath);
    assert.equal(response.status, 404, requestPath);
  }
});

test("rejects malformed, NUL, traversal, and backslash paths while remaining available", async (t) => {
  const { baseUrl } = await createSpaFixture(t);
  const probes = [
    ["/%E0%A4%A", 400],
    ["/bad%00path", 400],
    ["/%2e%2e%2fsecret", 403],
    ["/nested/%2E%2E/secret", 403],
    ["/nested%5csecret", 403],
  ];

  for (const [requestPath, expectedStatus] of probes) {
    const response = await rawRequest(baseUrl, requestPath);
    assert.equal(response.status, expectedStatus, requestPath);
  }

  const healthy = await rawRequest(baseUrl, "/lab");
  assert.equal(healthy.status, 200);
  assert.match(healthy.body.toString(), /Felix React shell/);
});

test("allows only GET and HEAD", async (t) => {
  const { baseUrl } = await createSpaFixture(t);

  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await rawRequest(baseUrl, "/lab", method);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, "GET, HEAD");
  }
});

test("parses a suffix byte range", () => {
  assert.deepEqual(parseSingleRange("bytes=-500", size), {
    start: 4_627_492,
    end: 4_627_991,
  });
  // A suffix longer than the resource is still satisfiable and selects all bytes.
  assert.deepEqual(parseSingleRange(`bytes=-${size + 1}`, size), {
    start: 0,
    end: 4_627_991,
  });
});

test("parses open-ended and explicit byte ranges", () => {
  assert.deepEqual(parseSingleRange("bytes=20-", size), { start: 20, end: 4_627_991 });
  assert.deepEqual(parseSingleRange("bytes=20-99", size), { start: 20, end: 99 });
});

test("rejects zero, invalid, and unsatisfiable byte ranges", () => {
  for (const header of ["bytes=-0", "bytes=abc-def", "bytes=20-19", `bytes=${size}-`]) {
    assert.equal(parseSingleRange(header, size), null, header);
  }
});

test("serves both transition videos as exact one-byte range responses", async (t) => {
  const siteRoot = fileURLToPath(new URL("../", import.meta.url));
  const server = createRangeServer(siteRoot);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  for (const asset of ["wormhole-home.mp4", "portfolio-entry-transition.mp4"]) {
    const response = await fetch(`http://127.0.0.1:${port}/assets/${asset}`, {
      headers: { Range: "bytes=0-0" },
    });

    assert.equal(response.status, 206, asset);
    assert.equal(response.headers.get("accept-ranges"), "bytes", asset);
    assert.match(response.headers.get("content-range") ?? "", /^bytes 0-0\/\d+$/, asset);
    assert.equal(response.headers.get("content-length"), "1", asset);
    assert.equal((await response.arrayBuffer()).byteLength, 1, asset);
  }
});

test("serves SVG images with a browser-decodable MIME type", async (t) => {
  const siteRoot = await mkdtemp(path.join(tmpdir(), "felix-range-svg-"));
  await writeFile(
    path.join(siteRoot, "probe.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3"/></svg>',
  );
  const server = createRangeServer(siteRoot);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(siteRoot, { recursive: true, force: true });
  });

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/probe.svg`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml");
});

test("accepts a site root with a trailing directory separator", async (t) => {
  const siteRoot = fileURLToPath(new URL("../", import.meta.url));
  const server = createRangeServer(siteRoot);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/index.html`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
});
