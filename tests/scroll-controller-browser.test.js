import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";

import { chromium } from "playwright";

const chromeCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
    : null,
].filter(Boolean);

const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
const controllerSource = await readFile(new URL("../scroll-controller.js", import.meta.url), "utf8");
const videoBgmSource = await readFile(new URL("../src/lib/video-bgm.js", import.meta.url), "utf8");

const fixture = String.raw`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; }
      #hero, #next { height: 100vh; }
      #hero { background: #052a46; touch-action: auto; }
      #next { background: #071a2b; }
    </style>
  </head>
  <body>
    <section id="hero">
      <video id="video" muted playsinline></video>
      <p id="status" hidden>视频暂时无法播放，请继续向下浏览。</p>
    </section>
    <section id="next"></section>
    <script type="module">
      import { createScrollVideoController } from "/scroll-controller.js";

      const video = document.querySelector("#video");
      let playCalls = 0;
      const playSnapshots = [];
      video.play = () => {
        playCalls += 1;
        playSnapshots.push({
          muted: video.muted,
          defaultMuted: video.defaultMuted,
          volume: video.volume,
        });
        return Promise.resolve();
      };
      video.pause = () => {};

      const controller = createScrollVideoController({
        video,
        win: window,
        doc: document,
        root: document.documentElement,
        statusElement: document.querySelector("#status"),
        trackElement: document.querySelector("#hero"),
        nextElement: document.querySelector("#next"),
        swipeThreshold: 24,
        stallTimeoutMs: 0,
      });

      window.__heroProbe = {
        get playCalls() { return playCalls; },
        get playSnapshots() { return playSnapshots; },
        get state() { return controller.getState(); },
        get muted() { return video.muted; },
        get defaultMuted() { return video.defaultMuted; },
        get volume() { return video.volume; },
      };
    </script>
  </body>
</html>`;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("real gradual upward touch input is captured before threshold and starts once without page scroll", {
  timeout: 30_000,
}, async (t) => {
  if (!executablePath) {
    t.skip("System Chrome is unavailable for the real-touch browser contract");
    return;
  }

  const server = createServer((request, response) => {
    if (request.url === "/scroll-controller.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(controllerSource);
      return;
    }
    if (request.url === "/src/lib/video-bgm.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(videoBgmSource);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixture);
  });
  await listen(server);

  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const address = server.address();
    const context = await browser.newContext({
      viewport: { width: 390, height: 700 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean(window.__heroProbe));
      const beforeScrollY = await page.evaluate(() => window.scrollY);
      const session = await context.newCDPSession(page);

      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 195, y: 520 }],
      });
      for (const y of [510, 500, 490]) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 195, y }],
        });
        await page.waitForTimeout(40);
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(100);

      const result = await page.evaluate(() => ({
        playCalls: window.__heroProbe.playCalls,
        playSnapshots: window.__heroProbe.playSnapshots,
        state: window.__heroProbe.state,
        scrollY: window.scrollY,
        muted: window.__heroProbe.muted,
        defaultMuted: window.__heroProbe.defaultMuted,
        volume: window.__heroProbe.volume,
      }));
      assert.deepEqual(result, {
        playCalls: 1,
        playSnapshots: [{ muted: false, defaultMuted: false, volume: 1 }],
        state: "playing",
        scrollY: beforeScrollY,
        muted: false,
        defaultMuted: false,
        volume: 1,
      });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    await close(server);
  }
});
