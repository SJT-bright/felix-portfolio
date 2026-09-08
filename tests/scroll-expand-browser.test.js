import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = "/tests/fixtures/scroll-expand-harness.html";
const videoPath = "/assets/sailing-august-9.mp4";
const posterPath = "/assets/sailing-august-9-poster.jpg";

const executableCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.platform === "win32" && process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
    : null,
].filter(Boolean);

const executablePath = executableCandidates.find((candidate) => existsSync(candidate));

async function openHarness(browser, baseUrl, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 900, height: 800 },
    reducedMotion: options.reducedMotion ?? "no-preference",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  if (options.initScript) await page.addInitScript(options.initScript);
  await page.goto(new URL(fixturePath, baseUrl).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.dataset.harnessReady === "true");
  return { context, page, pageErrors, consoleErrors };
}

async function render(page, props = {}) {
  await page.evaluate((nextProps) => window.__scrollExpandHarness.render(nextProps), props);
  await page.locator(".scroll-expand").waitFor({ state: "attached" });
}

function installMediaSpies() {
  window.__mediaCalls = { play: 0, pause: 0, playSnapshots: [] };
  HTMLMediaElement.prototype.play = function play() {
    window.__mediaCalls.play += 1;
    window.__mediaCalls.playSnapshots.push({
      muted: this.muted,
      defaultMuted: this.defaultMuted,
      volume: this.volume,
    });
    return Promise.reject(new DOMException("Autoplay blocked by harness", "NotAllowedError"));
  };
  HTMLMediaElement.prototype.pause = function pause() {
    window.__mediaCalls.pause += 1;
  };
}

function installLifecycleSpies() {
  window.__lifecycle = {
    rootScrollAdds: 0,
    rootScrollRemoves: 0,
    windowResizeAdds: 0,
    windowResizeRemoves: 0,
    resizeObservers: 0,
    resizeDisconnects: 0,
    legacyAdds: 0,
    legacyRemoves: 0,
    rafRequests: 0,
    rafPending: 0,
  };

  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function addEventListener(type, listener, options) {
    if (type === "scroll" && this instanceof HTMLElement && this.classList.contains("scroll-expand")) {
      window.__lifecycle.rootScrollAdds += 1;
    }
    if (type === "resize" && this === window) window.__lifecycle.windowResizeAdds += 1;
    return nativeAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function removeEventListener(type, listener, options) {
    if (type === "scroll" && this instanceof HTMLElement && this.classList.contains("scroll-expand")) {
      window.__lifecycle.rootScrollRemoves += 1;
    }
    if (type === "resize" && this === window) window.__lifecycle.windowResizeRemoves += 1;
    return nativeRemove.call(this, type, listener, options);
  };

  class HarnessResizeObserver {
    constructor(callback) {
      this.callback = callback;
      window.__lifecycle.resizeObservers += 1;
    }

    observe() {}

    disconnect() {
      window.__lifecycle.resizeDisconnects += 1;
    }
  }
  window.ResizeObserver = HarnessResizeObserver;

  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const pending = new Set();
  window.requestAnimationFrame = (callback) => {
    window.__lifecycle.rafRequests += 1;
    window.__lifecycle.rafPending += 1;
    const id = nativeRaf((timestamp) => {
      if (pending.delete(id)) window.__lifecycle.rafPending -= 1;
      callback(timestamp);
    });
    pending.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (pending.delete(id)) window.__lifecycle.rafPending -= 1;
    nativeCancel(id);
  };
}

function installLegacyMediaQuery() {
  window.ResizeObserver = undefined;
  window.__legacyMediaQuery = { adds: 0, removes: 0 };
  window.matchMedia = () => ({
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    addListener() {
      window.__legacyMediaQuery.adds += 1;
    },
    removeListener() {
      window.__legacyMediaQuery.removes += 1;
    },
  });
}

test("ScrollExpand browser component contract", async (t) => {
  const vite = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, "vite.config.js"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  await vite.listen();
  const address = vite.httpServer.address();
  assert.equal(typeof address, "object");
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  t.after(async () => {
    await browser.close();
    await vite.close();
  });

  await t.test("zero smoothing reaches the target in one frame and becomes idle", async () => {
    const run = await openHarness(browser, baseUrl, { initScript: installLifecycleSpies });
    try {
      await render(run.page, { smoothing: 0, useWindowScroll: true });
      await run.page.waitForFunction(() => document.querySelector(".scroll-expand")?.dataset.running === "false");
      await run.page.evaluate(() => window.scrollTo({ top: innerHeight / 2, behavior: "instant" }));
      await run.page.waitForFunction(() => {
        const root = document.querySelector(".scroll-expand");
        return root?.dataset.running === "false"
          && Math.abs(Number.parseFloat(root.dataset.progress) - 0.5) < 0.001;
      });

      const settled = await run.page.evaluate(() => ({ ...window.__lifecycle }));
      await run.page.waitForTimeout(160);
      const later = await run.page.evaluate(() => ({ ...window.__lifecycle }));
      assert.equal(settled.rafPending, 0);
      assert.equal(later.rafPending, 0);
      assert.equal(later.rafRequests, settled.rafRequests, "idle component kept requesting animation frames");
      assert.deepEqual(run.pageErrors, []);
    } finally {
      await run.context.close();
    }
  });

  await t.test("video props are audible and a rejected play attempt is contained", async () => {
    const run = await openHarness(browser, baseUrl, { initScript: installMediaSpies });
    try {
      await render(run.page, {
        src: videoPath,
        poster: posterPath,
        mediaType: "video",
        enabled: true,
      });
      const video = run.page.locator(".scroll-expand__media");
      const state = await video.evaluate((element) => ({
        tagName: element.tagName,
        src: element.getAttribute("src"),
        poster: element.getAttribute("poster"),
        autoplay: element.autoplay,
        muted: element.muted,
        defaultMuted: element.defaultMuted,
        volume: element.volume,
        loop: element.loop,
        playsInline: element.playsInline,
      }));
      assert.deepEqual(state, {
        tagName: "VIDEO",
        src: videoPath,
        poster: posterPath,
        autoplay: false,
        muted: false,
        defaultMuted: false,
        volume: 0.8,
        loop: true,
        playsInline: true,
      });
      await run.page.waitForFunction(() => window.__mediaCalls.play > 0);
      await run.page.waitForTimeout(30);
      const playSnapshots = await run.page.evaluate(() => window.__mediaCalls.playSnapshots);
      assert.ok(playSnapshots.length > 0);
      assert.ok(playSnapshots.every(({ muted, defaultMuted, volume }) => (
        muted === false && defaultMuted === false && volume === 0.8
      )));
      assert.deepEqual(run.pageErrors, [], "play() rejection escaped the component");

      const pausesBeforeDisable = await run.page.evaluate(() => window.__mediaCalls.pause);
      await run.page.evaluate((props) => window.__scrollExpandHarness.render(props), {
        src: videoPath,
        poster: posterPath,
        mediaType: "video",
        enabled: false,
      });
      await run.page.waitForFunction(
        (before) => window.__mediaCalls.pause > before,
        pausesBeforeDisable,
      );
      assert.equal(await video.evaluate((element) => element.autoplay), false);
    } finally {
      await run.context.close();
    }
  });

  await t.test("reduced motion renders expanded, suppresses autoplay, and pauses video", async () => {
    const run = await openHarness(browser, baseUrl, {
      reducedMotion: "reduce",
      initScript: installMediaSpies,
    });
    try {
      await render(run.page, {
        src: videoPath,
        poster: posterPath,
        mediaType: "video",
      });
      await run.page.waitForFunction(() => window.__mediaCalls.pause > 0);
      const state = await run.page.locator(".scroll-expand").evaluate((root) => {
        const video = root.querySelector("video");
        return {
          progress: root.dataset.progress,
          running: root.dataset.running,
          reduced: root.dataset.reducedMotion,
          autoplay: video.autoplay,
          height: root.getBoundingClientRect().height,
          viewport: innerHeight,
          calls: { ...window.__mediaCalls },
        };
      });
      assert.equal(state.progress, "1.0000");
      assert.equal(state.running, "false");
      assert.equal(state.reduced, "true");
      assert.equal(state.autoplay, false);
      assert.equal(state.calls.play, 0);
      assert.ok(state.calls.pause > 0);
      assert.ok(Math.abs(state.height - state.viewport) <= 1);
    } finally {
      await run.context.close();
    }
  });

  await t.test("an image error recovers to video when the URL stays unchanged", async () => {
    const run = await openHarness(browser, baseUrl, { initScript: installMediaSpies });
    try {
      await run.page.route(`**${videoPath}`, () => {});
      await render(run.page, { src: videoPath, mediaType: "image" });
      await run.page.locator(".scroll-expand__media").evaluate((image) => {
        image.dispatchEvent(new Event("error"));
      });
      await run.page.waitForFunction(() => document.querySelector(".scroll-expand")?.dataset.mediaState === "error");
      assert.equal(await run.page.locator(".scroll-expand__media").count(), 0);

      await run.page.evaluate((props) => window.__scrollExpandHarness.render(props), {
        src: videoPath,
        mediaType: "video",
        poster: posterPath,
      });
      await run.page.locator(".scroll-expand__media").waitFor();
      assert.equal(await run.page.locator(".scroll-expand__media").evaluate((node) => node.tagName), "VIDEO");
      assert.equal(await run.page.locator(".scroll-expand").getAttribute("data-media-state"), "loading");
    } finally {
      await run.context.close();
    }
  });

  await t.test("computed geometry wins over conflicting style while custom style survives", async () => {
    const run = await openHarness(browser, baseUrl);
    try {
      await render(run.page, {
        style: {
          "--expand-track-height": "999px",
          outline: "7px solid transparent",
        },
      });
      const style = await run.page.locator(".scroll-expand").evaluate((root) => ({
        trackHeight: root.style.getPropertyValue("--expand-track-height"),
        outlineWidth: root.style.outlineWidth,
      }));
      assert.equal(style.trackHeight, "235dvh");
      assert.equal(style.outlineWidth, "7px");
    } finally {
      await run.context.close();
    }
  });

  await t.test("disabled and default local modes keep useful viewport geometry", async () => {
    const run = await openHarness(browser, baseUrl);
    try {
      await render(run.page, { enabled: false, useWindowScroll: true });
      const disabled = await run.page.locator(".scroll-expand").evaluate((root) => ({
        enabled: root.dataset.enabled,
        height: root.getBoundingClientRect().height,
        viewport: window.innerHeight,
        progress: root.dataset.progress,
      }));
      assert.equal(disabled.enabled, "false");
      assert.equal(disabled.progress, "1.0000");
      assert.ok(Math.abs(disabled.height - disabled.viewport) <= 1);

      await render(run.page, { enabled: true, useWindowScroll: false });
      const local = await run.page.locator(".scroll-expand").evaluate((root) => ({
        height: root.clientHeight,
        scrollHeight: root.scrollHeight,
        viewport: window.innerHeight,
      }));
      assert.ok(Math.abs(local.height - local.viewport) <= 1);
      assert.ok(local.scrollHeight > local.height);

      await run.page.evaluate(() => {
        document.querySelector("#root").style.height = "520px";
      });
      await render(run.page, { enabled: true, useWindowScroll: false });
      const constrained = await run.page.locator(".scroll-expand").evaluate((root) => ({
        rootHeight: root.getBoundingClientRect().height,
        stageHeight: root.querySelector(".scroll-expand__stage").getBoundingClientRect().height,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      }));
      assert.ok(Math.abs(constrained.rootHeight - 520) <= 1);
      assert.ok(Math.abs(constrained.stageHeight - 520) <= 1);
      assert.ok(constrained.scrollHeight > constrained.clientHeight);
    } finally {
      await run.context.close();
    }
  });

  await t.test("StrictMode and unmount clean listeners, observers, and pending RAF", async () => {
    const run = await openHarness(browser, baseUrl, { initScript: installLifecycleSpies });
    try {
      await render(run.page, { useWindowScroll: false, smoothing: 0.13 });
      await run.page.waitForFunction(() => document.querySelector(".scroll-expand")?.dataset.running === "false");
      const mounted = await run.page.evaluate(() => ({ ...window.__lifecycle }));
      assert.ok(mounted.rootScrollAdds >= 2, "StrictMode did not exercise a setup/cleanup cycle");
      assert.equal(mounted.rootScrollAdds - mounted.rootScrollRemoves, 1);
      assert.equal(mounted.windowResizeAdds - mounted.windowResizeRemoves, 1);
      assert.equal(mounted.resizeObservers - mounted.resizeDisconnects, 1);

      await run.page.evaluate(() => window.__scrollExpandHarness.unmount());
      await run.page.waitForFunction(() => !document.querySelector(".scroll-expand"));
      const unmounted = await run.page.evaluate(() => ({ ...window.__lifecycle }));
      assert.equal(unmounted.rootScrollAdds, unmounted.rootScrollRemoves);
      assert.equal(unmounted.windowResizeAdds, unmounted.windowResizeRemoves);
      assert.equal(unmounted.resizeObservers, unmounted.resizeDisconnects);
      assert.equal(unmounted.rafPending, 0);
    } finally {
      await run.context.close();
    }
  });

  await t.test("missing ResizeObserver and legacy matchMedia remain supported and cleaned", async () => {
    const run = await openHarness(browser, baseUrl, { initScript: installLegacyMediaQuery });
    try {
      await render(run.page, { smoothing: 0 });
      await run.page.waitForFunction(() => document.querySelector(".scroll-expand")?.dataset.running === "false");
      const mounted = await run.page.evaluate(() => ({ ...window.__legacyMediaQuery }));
      assert.ok(mounted.adds >= 2, "StrictMode did not subscribe through addListener");
      assert.equal(mounted.adds - mounted.removes, 1);

      await run.page.evaluate(() => window.__scrollExpandHarness.unmount());
      const unmounted = await run.page.evaluate(() => ({ ...window.__legacyMediaQuery }));
      assert.equal(unmounted.adds, unmounted.removes);
      assert.deepEqual(run.pageErrors, []);
      assert.deepEqual(run.consoleErrors, []);
    } finally {
      await run.context.close();
    }
  });
});
