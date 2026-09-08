import assert from "node:assert/strict";
import test from "node:test";

import {
  clampLoaderProgress,
  createHomeLoaderController,
  loaderProgressToAngle,
} from "../src/lib/home-loader-controller.js";

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this });
  }
}

function createElement() {
  const target = new FakeTarget();
  const attributes = new Map();
  return Object.assign(target, {
    attributes,
    dataset: {},
    hidden: false,
    inert: false,
    removed: false,
    style: {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, value);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    remove() {
      this.removed = true;
    },
  });
}

function createScheduler() {
  let time = 0;
  let id = 0;
  const timers = new Map();
  const frames = new Map();

  const win = {
    performance: { now: () => time },
    setTimeout(callback, delay = 0) {
      const timerId = ++id;
      timers.set(timerId, { callback, due: time + Math.max(0, Number(delay) || 0) });
      return timerId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
    requestAnimationFrame(callback) {
      const frameId = ++id;
      frames.set(frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(frameId) {
      frames.delete(frameId);
    },
  };

  function runDueTimers() {
    let ran = true;
    while (ran) {
      ran = false;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= time)
        .sort((left, right) => left[1].due - right[1].due);
      for (const [timerId, timer] of due) {
        if (!timers.delete(timerId)) continue;
        timer.callback();
        ran = true;
      }
    }
  }

  function advance(duration) {
    const target = time + duration;
    while (time < target) {
      time = Math.min(target, time + 16);
      runDueTimers();
      const pendingFrames = [...frames.values()];
      frames.clear();
      for (const callback of pendingFrames) callback(time);
      runDueTimers();
    }
  }

  return { win, advance, timers, frames };
}

function createHarness(options = {}) {
  const scheduler = createScheduler();
  const bodyClasses = new Set();
  const doc = {
    body: {
      classList: {
        add: (...names) => names.forEach((name) => bodyClasses.add(name)),
        remove: (...names) => names.forEach((name) => bodyClasses.delete(name)),
      },
    },
  };
  const video = Object.assign(new FakeTarget(), {
    readyState: options.videoReadyState ?? 0,
    networkState: options.videoNetworkState ?? 0,
    duration: 6,
    buffered: {
      length: 0,
      end: () => 0,
    },
  });
  const image = Object.assign(new FakeTarget(), {
    complete: options.imageComplete ?? false,
  });
  const loaderElement = createElement();
  const rootElement = createElement();
  const progressElement = createElement();
  const percentageElement = createElement();
  percentageElement.textContent = "000%";
  const announcementElement = createElement();
  announcementElement.textContent = "正在加载首页体验。";
  let completionCalls = 0;

  const controller = createHomeLoaderController({
    video,
    image,
    loaderElement,
    rootElement,
    progressElement,
    percentageElement,
    announcementElement,
    win: scheduler.win,
    doc,
    minVisibleMs: options.minVisibleMs ?? 700,
    completionMs: options.completionMs ?? 420,
    completionHoldMs: options.completionHoldMs ?? 180,
    exitMs: options.exitMs ?? 420,
    timeoutMs: options.timeoutMs ?? 8000,
    onComplete: () => { completionCalls += 1; },
  });

  return {
    ...scheduler,
    bodyClasses,
    video,
    image,
    loaderElement,
    rootElement,
    progressElement,
    percentageElement,
    announcementElement,
    controller,
    completionCalls: () => completionCalls,
  };
}

test("loader progress clamps and maps 0–100 exactly onto 0–360 degrees", () => {
  assert.equal(clampLoaderProgress(-1), 0);
  assert.equal(clampLoaderProgress(35.5), 35.5);
  assert.equal(clampLoaderProgress(120), 100);
  assert.equal(clampLoaderProgress(Number.NaN), 0);

  assert.equal(loaderProgressToAngle(0), 0);
  assert.equal(loaderProgressToAngle(25), 90);
  assert.equal(loaderProgressToAngle(50), 180);
  assert.equal(loaderProgressToAngle(75), 270);
  assert.equal(loaderProgressToAngle(100), 360);
});

test("critical image and video readiness complete once, unlock the page, and reach 360 degrees", () => {
  const harness = createHarness();
  assert.equal(harness.controller.getState(), "loading");
  assert.equal(harness.bodyClasses.has("site-loading"), true);
  assert.equal(harness.rootElement.inert, true);
  assert.equal(harness.rootElement.attributes.get("aria-busy"), "true");

  harness.image.dispatch("load");
  harness.video.dispatch("loadedmetadata");
  harness.video.dispatch("canplay");
  harness.advance(1800);

  assert.equal(harness.controller.getState(), "completed");
  assert.equal(harness.controller.getProgress(), 100);
  assert.equal(harness.loaderElement.style.values.get("--site-loader-angle"), "360.000deg");
  assert.equal(harness.loaderElement.style.values.get("--site-loader-dashoffset"), "0");
  assert.equal(harness.percentageElement.textContent, "100%");
  assert.equal(harness.progressElement.attributes.get("aria-valuenow"), "100");
  assert.equal(harness.loaderElement.removed, true);
  assert.equal(harness.bodyClasses.has("site-loading"), false);
  assert.equal(harness.rootElement.inert, false);
  assert.equal(harness.rootElement.attributes.has("aria-busy"), false);
  assert.equal(harness.completionCalls(), 1);
});

test("cached assets take the synchronous readiness path without skipping the authored completion", () => {
  const harness = createHarness({
    imageComplete: true,
    videoReadyState: 3,
    minVisibleMs: 0,
    completionMs: 0,
    completionHoldMs: 0,
    exitMs: 0,
  });

  harness.advance(16);
  assert.equal(harness.controller.getState(), "completed");
  assert.equal(harness.controller.getProgress(), 100);
  assert.equal(harness.completionCalls(), 1);
});

test("media failure and absolute timeout both fail open instead of trapping the visitor", () => {
  const mediaFailure = createHarness({
    imageComplete: true,
    minVisibleMs: 0,
    completionMs: 0,
    completionHoldMs: 0,
    exitMs: 0,
  });
  mediaFailure.video.dispatch("error");
  mediaFailure.advance(16);
  assert.equal(mediaFailure.controller.getState(), "completed");
  assert.equal(mediaFailure.loaderElement.dataset.outcome, "media-failed-open");

  const timeout = createHarness({
    minVisibleMs: 0,
    completionMs: 0,
    completionHoldMs: 0,
    exitMs: 0,
    timeoutMs: 32,
  });
  timeout.advance(48);
  assert.equal(timeout.controller.getState(), "completed");
  assert.equal(timeout.loaderElement.dataset.outcome, "timeout-failed-open");
  assert.equal(timeout.completionCalls(), 1);
});

test("a source that failed before the loader mounted completes the loader without the network timeout", () => {
  const harness = createHarness({ imageComplete: true, videoNetworkState: 3 });
  harness.advance(600);
  assert.equal(harness.loaderElement.removed, false, "the loading animation must still be visible");
  harness.advance(1200);
  assert.equal(harness.controller.getState(), "completed");
  assert.equal(harness.loaderElement.dataset.outcome, "media-failed-open");
  assert.equal(harness.controller.getProgress(), 100);
  assert.equal(harness.completionCalls(), 1);
});

test("destroy cancels animation, timers, and media listeners for StrictMode remounts", () => {
  const harness = createHarness();
  harness.controller.destroy();
  harness.controller.destroy();
  harness.image.dispatch("load");
  harness.video.dispatch("canplay");
  harness.advance(9000);

  assert.equal(harness.controller.getState(), "destroyed");
  assert.equal(harness.completionCalls(), 0);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.video.listeners.get("canplay")?.size ?? 0, 0);
  assert.equal(harness.image.listeners.get("load")?.size ?? 0, 0);
});
