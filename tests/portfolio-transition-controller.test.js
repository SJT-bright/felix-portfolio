import assert from "node:assert/strict";
import test from "node:test";

import { createPortfolioTransitionController } from "../src/lib/portfolio-transition-controller.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ listener, options });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener) {
    const entries = (this.listeners.get(type) ?? []).filter((entry) => entry.listener !== listener);
    if (entries.length) this.listeners.set(type, entries);
    else this.listeners.delete(type);
  }

  dispatch(type, values = {}) {
    const event = {
      type,
      button: type === "click" ? 0 : undefined,
      cancelable: true,
      defaultPrevented: false,
      preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
      },
      ...values,
    };
    for (const { listener } of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    for (const name of names) this.values.add(name);
  }

  remove(...names) {
    for (const name of names) this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement extends FakeEventTarget {
  constructor() {
    super();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value),
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function createHarness({
  reducedMotion = false,
  playMode = "resolve",
  duration = 6,
  legacyMediaQuery = false,
} = {}) {
  const linkElement = new FakeElement();
  linkElement.setAttribute("href", "/portfolio/index.html");
  linkElement.href = "http://localhost/portfolio/index.html";

  const videoElement = new FakeElement();
  videoElement.duration = duration;
  videoElement.currentTime = 0;
  videoElement.muted = true;
  videoElement.defaultMuted = true;
  videoElement.volume = 0;
  videoElement.paused = true;
  videoElement.playCalls = 0;
  videoElement.pauseCalls = 0;
  videoElement.playSnapshots = [];
  let resolvePlay;
  let rejectPlay;
  videoElement.play = () => {
    videoElement.playCalls += 1;
    videoElement.playSnapshots.push({
      muted: videoElement.muted,
      defaultMuted: videoElement.defaultMuted,
      volume: videoElement.volume,
    });
    if (playMode === "throw") throw new Error("play failed synchronously");
    if (playMode === "pending") {
      return new Promise((resolve, reject) => {
        resolvePlay = resolve;
        rejectPlay = reject;
      });
    }
    if (playMode === "reject") return Promise.reject(new Error("play was blocked"));
    videoElement.paused = false;
    return Promise.resolve();
  };
  videoElement.pause = () => {
    videoElement.pauseCalls += 1;
    videoElement.paused = true;
  };

  const overlayElement = new FakeElement();
  overlayElement.dataset.active = "false";
  overlayElement.dataset.complete = "false";
  const skipElement = new FakeElement();
  skipElement.focusCalls = [];
  skipElement.blurCalls = 0;
  skipElement.focus = (options) => skipElement.focusCalls.push(options);
  skipElement.blur = () => { skipElement.blurCalls += 1; };

  const documentObject = new FakeEventTarget();
  documentObject.body = { classList: new FakeClassList() };

  const motionQuery = new FakeEventTarget();
  motionQuery.matches = reducedMotion;
  if (legacyMediaQuery) {
    motionQuery.addListener = (listener) => FakeEventTarget.prototype.addEventListener.call(
      motionQuery,
      "change",
      listener,
    );
    motionQuery.removeListener = (listener) => FakeEventTarget.prototype.removeEventListener.call(
      motionQuery,
      "change",
      listener,
    );
    motionQuery.addEventListener = undefined;
    motionQuery.removeEventListener = undefined;
  }

  const windowObject = new FakeEventTarget();
  windowObject.matchMedia = () => motionQuery;
  let nextTimerId = 1;
  const timers = new Map();
  windowObject.setTimeout = (callback, delay) => {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  };
  windowObject.clearTimeout = (id) => timers.delete(id);
  windowObject.timerEntries = () => [...timers.entries()];
  windowObject.runDelay = (delay) => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay === delay);
    for (const [id, timer] of pending) {
      timers.delete(id);
      timer.callback();
    }
  };
  windowObject.pendingTimers = () => timers.size;

  const navigationCalls = [];
  const navigate = (href) => navigationCalls.push(href);

  return {
    linkElement,
    videoElement,
    overlayElement,
    skipElement,
    documentObject,
    windowObject,
    motionQuery,
    navigationCalls,
    navigate,
    resolvePlay: () => resolvePlay?.(),
    rejectPlay: () => rejectPlay?.(new Error("late play failure")),
  };
}

function createController(harness, options = {}) {
  return createPortfolioTransitionController({
    ...harness,
    targetHref: "/portfolio/index.html#entry-video",
    watchdogMs: 1000,
    progressWatchdogMs: 250,
    handoffDelayMs: 120,
    ...options,
  });
}

test("initializes a reusable inactive overlay without changing the link href", () => {
  const harness = createHarness();
  const controller = createController(harness);

  assert.equal(controller.getState(), "idle");
  assert.equal(harness.linkElement.getAttribute("href"), "/portfolio/index.html");
  assert.equal(harness.overlayElement.dataset.active, "false");
  assert.equal(harness.overlayElement.dataset.complete, "false");
  assert.equal(harness.overlayElement.attributes.get("aria-hidden"), "true");
  assert.equal(harness.overlayElement.style.values.get("--portfolio-transition-progress"), "0");
  assert.equal(harness.skipElement.tabIndex, -1);
  assert.equal(harness.videoElement.muted, false);
  assert.equal(harness.videoElement.defaultMuted, false);
  assert.equal(harness.videoElement.volume, 1);
  assert.equal(harness.videoElement.currentTime, 0);
  assert.equal(harness.videoElement.pauseCalls, 1);
});

test("an unmodified primary click activates one playback and focuses the skip control", () => {
  const harness = createHarness();
  const controller = createController(harness);

  const first = harness.linkElement.dispatch("click");
  const repeated = harness.linkElement.dispatch("click");

  assert.equal(first.defaultPrevented, true);
  assert.equal(repeated.defaultPrevented, true);
  assert.equal(controller.getState(), "playing");
  assert.equal(harness.videoElement.playCalls, 1);
  assert.deepEqual(harness.videoElement.playSnapshots, [
    { muted: false, defaultMuted: false, volume: 1 },
  ]);
  assert.equal(harness.overlayElement.dataset.active, "true");
  assert.equal(harness.overlayElement.dataset.complete, "false");
  assert.equal(harness.overlayElement.attributes.get("aria-hidden"), "false");
  assert.equal(harness.overlayElement.classList.contains("is-active"), true);
  assert.equal(harness.documentObject.body.classList.contains("portfolio-transition-active"), true);
  assert.deepEqual(harness.skipElement.focusCalls, [{ preventScroll: true }]);
  assert.equal(harness.skipElement.tabIndex, 0);
  assert.equal(harness.windowObject.pendingTimers(), 2);
  assert.equal(harness.linkElement.getAttribute("href"), "/portfolio/index.html");
});

test("modified, middle-button, and previously-cancelled clicks retain native link behavior", () => {
  const variants = [
    { button: 1 },
    { button: 0, metaKey: true },
    { button: 0, ctrlKey: true },
    { button: 0, shiftKey: true },
    { button: 0, altKey: true },
    { button: 0, defaultPrevented: true },
  ];

  for (const variant of variants) {
    const harness = createHarness();
    const controller = createController(harness);
    const event = harness.linkElement.dispatch("click", variant);
    assert.equal(event.defaultPrevented, variant.defaultPrevented ?? false);
    assert.equal(controller.getState(), "idle");
    assert.equal(harness.videoElement.playCalls, 0);
    assert.deepEqual(harness.navigationCalls, []);
  }
});

test("reduced motion bypasses media and immediately navigates to the marker URL", () => {
  const harness = createHarness({ reducedMotion: true });
  const controller = createController(harness);
  const event = harness.linkElement.dispatch("click");

  assert.equal(event.defaultPrevented, true);
  assert.equal(controller.getState(), "navigating");
  assert.equal(harness.videoElement.playCalls, 0);
  assert.equal(harness.overlayElement.dataset.active, "false");
  assert.deepEqual(harness.navigationCalls, ["/portfolio/index.html#entry-video"]);
});

test("media time updates progress while only actual forward progress renews the stall watchdog", () => {
  const harness = createHarness({ duration: 8 });
  createController(harness);
  harness.linkElement.dispatch("click");
  const initialTimers = harness.windowObject.timerEntries();
  const hardTimerId = initialTimers.find(([, timer]) => timer.delay === 1000)[0];
  const progressTimerId = initialTimers.find(([, timer]) => timer.delay === 250)[0];

  harness.videoElement.dispatch("timeupdate");
  assert.deepEqual(harness.windowObject.timerEntries().map(([id]) => id), [hardTimerId, progressTimerId]);

  harness.videoElement.currentTime = 2;
  harness.videoElement.dispatch("timeupdate");
  const renewedTimers = harness.windowObject.timerEntries();
  assert.equal(harness.overlayElement.style.values.get("--portfolio-transition-progress"), "0.25");
  assert.equal(renewedTimers.some(([id]) => id === hardTimerId), true, "the absolute watchdog must not renew");
  assert.equal(renewedTimers.some(([id]) => id === progressTimerId), false, "real media progress renews the stall timer");
});

test("ended exposes the white completion frame before one delayed navigation", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.linkElement.dispatch("click");
  harness.videoElement.dispatch("ended");
  harness.videoElement.dispatch("ended");

  assert.equal(controller.getState(), "handoff");
  assert.equal(harness.overlayElement.dataset.complete, "true");
  assert.equal(harness.overlayElement.classList.contains("is-complete"), true);
  assert.equal(harness.documentObject.body.classList.contains("portfolio-transition-complete"), true);
  assert.equal(harness.overlayElement.style.values.get("--portfolio-transition-progress"), "1");
  assert.deepEqual(harness.navigationCalls, []);
  assert.deepEqual(harness.windowObject.timerEntries().map(([, timer]) => timer.delay), [120]);

  harness.windowObject.runDelay(120);
  harness.videoElement.dispatch("error");
  assert.equal(controller.getState(), "navigating");
  assert.deepEqual(harness.navigationCalls, ["/portfolio/index.html#entry-video"]);
});

test("skip and Escape each fail open immediately and remain single-shot", () => {
  for (const method of ["skip", "escape"]) {
    const harness = createHarness();
    const controller = createController(harness);
    harness.linkElement.dispatch("click");
    const event = method === "skip"
      ? harness.skipElement.dispatch("click")
      : harness.documentObject.dispatch("keydown", { key: "Escape" });
    harness.videoElement.dispatch("ended");
    harness.videoElement.dispatch("error");

    assert.equal(event.defaultPrevented, true);
    assert.equal(controller.getState(), "navigating");
    assert.deepEqual(harness.navigationCalls, ["/portfolio/index.html#entry-video"]);
    assert.equal(harness.windowObject.pendingTimers(), 0);
  }
});

test("synchronous and rejected play failures navigate instead of trapping the visitor", async () => {
  for (const playMode of ["throw", "reject"]) {
    const harness = createHarness({ playMode });
    const controller = createController(harness);
    assert.doesNotThrow(() => harness.linkElement.dispatch("click"));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(controller.getState(), "navigating");
    assert.deepEqual(harness.navigationCalls, ["/portfolio/index.html#entry-video"]);
    assert.equal(harness.windowObject.pendingTimers(), 0);
  }
});

test("media error, progress timeout, and absolute timeout all navigate fail-open", () => {
  const idleErrorHarness = createHarness();
  const idleController = createController(idleErrorHarness);
  idleErrorHarness.videoElement.dispatch("error");
  assert.equal(idleController.getState(), "idle", "preload errors must not cause unsolicited navigation");
  assert.deepEqual(idleErrorHarness.navigationCalls, []);

  const errorHarness = createHarness();
  createController(errorHarness);
  errorHarness.linkElement.dispatch("click");
  errorHarness.videoElement.dispatch("error");
  assert.deepEqual(errorHarness.navigationCalls, ["/portfolio/index.html#entry-video"]);

  const stalledHarness = createHarness();
  createController(stalledHarness);
  stalledHarness.linkElement.dispatch("click");
  stalledHarness.windowObject.runDelay(250);
  assert.deepEqual(stalledHarness.navigationCalls, ["/portfolio/index.html#entry-video"]);

  const hardHarness = createHarness();
  createController(hardHarness, { progressWatchdogMs: 0 });
  hardHarness.linkElement.dispatch("click");
  hardHarness.windowObject.runDelay(1000);
  assert.deepEqual(hardHarness.navigationCalls, ["/portfolio/index.html#entry-video"]);
});

test("enabling reduced motion during playback immediately navigates", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.linkElement.dispatch("click");
  harness.motionQuery.matches = true;
  harness.motionQuery.dispatch("change", { matches: true });

  assert.equal(controller.getState(), "navigating");
  assert.deepEqual(harness.navigationCalls, ["/portfolio/index.html#entry-video"]);
  assert.equal(harness.windowObject.pendingTimers(), 0);
});

test("a persisted pageshow resets playback, timers, progress, and visual state for BFCache return", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.linkElement.dispatch("click");
  harness.videoElement.currentTime = 3;
  harness.videoElement.dispatch("timeupdate");

  harness.windowObject.dispatch("pageshow", { persisted: false });
  assert.equal(controller.getState(), "playing");
  harness.windowObject.dispatch("pageshow", { persisted: true });

  assert.equal(controller.getState(), "idle");
  assert.equal(harness.videoElement.currentTime, 0);
  assert.equal(harness.windowObject.pendingTimers(), 0);
  assert.equal(harness.overlayElement.dataset.active, "false");
  assert.equal(harness.overlayElement.dataset.complete, "false");
  assert.equal(harness.overlayElement.classList.contains("is-active"), false);
  assert.equal(harness.documentObject.body.classList.contains("portfolio-transition-active"), false);
  assert.equal(harness.overlayElement.style.values.get("--portfolio-transition-progress"), "0");
  assert.equal(harness.skipElement.blurCalls, 1);
  assert.equal(harness.skipElement.tabIndex, -1);

  harness.linkElement.dispatch("click");
  assert.equal(harness.videoElement.playCalls, 2, "the restored page must remain reusable");
});

test("destroy removes listeners, timers, classes, data state, and invalidates a late play rejection", async () => {
  const harness = createHarness({ playMode: "pending" });
  const controller = createController(harness);
  harness.linkElement.dispatch("click");
  controller.destroy();
  controller.destroy();
  harness.rejectPlay();
  await Promise.resolve();
  await Promise.resolve();
  harness.windowObject.runDelay(1000);

  assert.equal(controller.getState(), "destroyed");
  assert.equal(harness.windowObject.pendingTimers(), 0);
  assert.equal(harness.linkElement.listeners.size, 0);
  assert.equal(harness.videoElement.listeners.size, 0);
  assert.equal(harness.skipElement.listeners.size, 0);
  assert.equal(harness.documentObject.listeners.size, 0);
  assert.equal(harness.windowObject.listeners.size, 0);
  assert.equal(harness.motionQuery.listeners.size, 0);
  assert.equal(harness.documentObject.body.classList.values.size, 0);
  assert.equal(harness.overlayElement.classList.values.size, 0);
  assert.equal(harness.overlayElement.dataset.active, "false");
  assert.equal(harness.overlayElement.dataset.complete, "false");
  assert.equal(harness.overlayElement.style.values.get("--portfolio-transition-progress"), "0");
  assert.equal(harness.skipElement.tabIndex, -1);
  assert.deepEqual(harness.navigationCalls, []);
});

test("supports legacy motion-query listeners and returns a safe controller for incomplete DOM", () => {
  const harness = createHarness({ legacyMediaQuery: true });
  const controller = createController(harness);
  assert.equal(harness.motionQuery.listeners.get("change")?.length, 1);
  controller.destroy();
  assert.equal(harness.motionQuery.listeners.has("change"), false);

  const unavailable = createPortfolioTransitionController({ linkElement: null });
  assert.equal(unavailable.getState(), "unavailable");
  assert.doesNotThrow(() => unavailable.destroy());
});
