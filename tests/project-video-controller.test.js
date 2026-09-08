import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createProjectVideoController } from "../src/components/ProjectShowcase/project-video-controller.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type, values = {}) {
    this.listeners.get(type)?.({ type, ...values });
  }
}

function createHarness({
  visible = true,
  reducedMotion = false,
  observerAvailable = true,
  legacyMediaQuery = false,
  rejectPlay = false,
  throwOnPlay = false,
  deferredPlay = false,
} = {}) {
  const video = new FakeEventTarget();
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.paused = true;
  video.pauseCalls = 0;
  video.playCalls = 0;
  video.playSnapshots = [];
  let resolvePlay;
  video.pause = () => {
    video.pauseCalls += 1;
    video.paused = true;
  };
  video.play = () => {
    video.playCalls += 1;
    video.playSnapshots.push({
      muted: video.muted,
      defaultMuted: video.defaultMuted,
      volume: video.volume,
    });
    if (throwOnPlay) throw new Error("blocked synchronously");
    video.paused = false;
    if (deferredPlay) return new Promise((resolve) => { resolvePlay = resolve; });
    return rejectPlay ? Promise.reject(new Error("blocked")) : Promise.resolve();
  };

  const doc = new FakeEventTarget();
  doc.visibilityState = visible ? "visible" : "hidden";
  const mediaQuery = new FakeEventTarget();
  mediaQuery.matches = reducedMotion;
  if (legacyMediaQuery) {
    mediaQuery.addListener = (listener) => FakeEventTarget.prototype.addEventListener.call(mediaQuery, "change", listener);
    mediaQuery.removeListener = (listener) => FakeEventTarget.prototype.removeEventListener.call(mediaQuery, "change", listener);
  }

  const win = { matchMedia: () => mediaQuery };
  const observers = [];
  if (observerAvailable) {
    win.IntersectionObserver = class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.disconnected = false;
        observers.push(this);
      }

      observe(root) { this.root = root; }
      disconnect() { this.disconnected = true; }
      emit(ratio, isIntersecting = true) {
        this.callback([{ target: this.root, intersectionRatio: ratio, isIntersecting }]);
      }
      emitEntries(entries) {
        this.callback(entries.map((entry) => ({
          target: Object.hasOwn(entry, "target") ? entry.target : this.root,
          intersectionRatio: entry.ratio,
          isIntersecting: entry.isIntersecting ?? true,
        })));
      }
    };
  }

  return {
    root: new FakeEventTarget(),
    video,
    win,
    doc,
    mediaQuery,
    observers,
    resolvePlay: () => resolvePlay?.(),
  };
}

function createController(harness) {
  return createProjectVideoController(harness);
}

test("starts paused and only plays after a 35% visible intersection", async () => {
  const harness = createHarness();
  createController(harness);

  assert.equal(harness.video.pauseCalls, 1);
  assert.equal(harness.video.muted, false);
  assert.equal(harness.video.defaultMuted, false);
  assert.equal(harness.video.volume, 0.65);
  assert.equal(harness.observers[0].options.threshold, 0.35);
  harness.observers[0].emit(0.34);
  assert.equal(harness.video.playCalls, 0);

  harness.observers[0].emit(0.35);
  await Promise.resolve();
  assert.equal(harness.video.playCalls, 1);
  assert.deepEqual(harness.video.playSnapshots, [
    { muted: false, defaultMuted: false, volume: 0.65 },
  ]);
});

test("pauses when the page becomes hidden and resumes only after visibility returns", () => {
  const harness = createHarness();
  createController(harness);
  harness.observers[0].emit(0.35);
  assert.equal(harness.video.playCalls, 1, "the card must first be eligible to play");

  harness.doc.visibilityState = "hidden";
  harness.doc.dispatch("visibilitychange");
  assert.equal(harness.video.pauseCalls, 2);

  harness.doc.visibilityState = "visible";
  harness.doc.dispatch("visibilitychange");
  assert.equal(harness.video.playCalls, 2, "visibility recovery should restore eligibility");
});

test("pauses for reduced motion and resumes only after the preference is removed", () => {
  const harness = createHarness();
  createController(harness);
  harness.observers[0].emit(0.35);
  assert.equal(harness.video.playCalls, 1, "the card must first be eligible to play");

  harness.mediaQuery.matches = true;
  harness.mediaQuery.dispatch("change");
  assert.equal(harness.video.pauseCalls, 2);

  harness.mediaQuery.matches = false;
  harness.mediaQuery.dispatch("change");
  assert.equal(harness.video.playCalls, 2, "motion-preference recovery should restore eligibility");
});

test("pauses for a media error and never retries after later eligibility changes", () => {
  const harness = createHarness();
  createController(harness);
  harness.observers[0].emit(0.35);
  assert.equal(harness.video.playCalls, 1, "the card must first be eligible to play");

  harness.video.dispatch("error");
  assert.equal(harness.video.pauseCalls, 2);

  harness.observers[0].emit(0);
  harness.observers[0].emit(0.35);
  assert.equal(harness.video.playCalls, 1, "a failed video must remain ineligible");
});

test("pauses after leaving the viewport and plays again after re-entry", () => {
  const harness = createHarness();
  createController(harness);
  harness.observers[0].emit(0.35);
  assert.equal(harness.video.playCalls, 1, "the card must first be eligible to play");

  harness.observers[0].emit(0);
  assert.equal(harness.video.pauseCalls, 2);

  harness.observers[0].emit(0.35);
  assert.equal(harness.video.playCalls, 2, "viewport re-entry should restore eligibility");
});

test("uses the latest record when one observer batch crosses in and back out", () => {
  const harness = createHarness();
  createController(harness);

  harness.observers[0].emitEntries([
    { ratio: 0.35, isIntersecting: true },
    { ratio: 0, isIntersecting: false },
  ]);

  assert.equal(harness.video.playCalls, 0, "a stale visible record must not override the latest offscreen record");
  assert.equal(harness.video.pauseCalls, 2, "the latest offscreen record must keep the video paused");
});

test("ignores empty observer batches and selects the latest matching root record from interleaved targets", () => {
  const harness = createHarness();
  createController(harness);
  const observer = harness.observers[0];
  const otherRoot = {};

  observer.emitEntries([]);
  assert.equal(harness.video.playCalls, 0, "an empty batch must not change playback eligibility");
  assert.equal(harness.video.pauseCalls, 1, "an empty batch must not trigger a redundant pause");

  observer.emitEntries([
    { target: harness.root, ratio: 0, isIntersecting: false },
    { target: otherRoot, ratio: 0, isIntersecting: false },
    { target: harness.root, ratio: 0.35, isIntersecting: true },
    { target: otherRoot, ratio: 0.9, isIntersecting: true },
  ]);
  assert.equal(harness.video.playCalls, 1, "a trailing record for another target must be ignored");

  observer.emitEntries([
    { target: harness.root, ratio: 0.35, isIntersecting: true },
    { target: otherRoot, ratio: 0, isIntersecting: false },
    { target: harness.root, ratio: 0, isIntersecting: false },
    { target: otherRoot, ratio: 0.9, isIntersecting: true },
  ]);
  assert.equal(harness.video.playCalls, 1, "a stale visible root record must not start another play");
  assert.equal(harness.video.pauseCalls, 2, "the latest matching root record must decide the final state");
});

test("handles rejected play requests without retrying", async () => {
  const harness = createHarness({ rejectPlay: true });
  createController(harness);
  harness.observers[0].emit(0.35);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.video.playCalls, 1);
  assert.equal(harness.video.pauseCalls, 2);
  assert.deepEqual(harness.video.playSnapshots, [
    { muted: false, defaultMuted: false, volume: 0.65 },
  ]);
});

test("a click retries a browser-blocked visible card with BGM enabled", async () => {
  const harness = createHarness({ rejectPlay: true });
  createController(harness);
  harness.observers[0].emit(0.35);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.video.playCalls, 1);
  harness.video.play = () => {
    harness.video.playCalls += 1;
    harness.video.playSnapshots.push({
      muted: harness.video.muted,
      defaultMuted: harness.video.defaultMuted,
      volume: harness.video.volume,
    });
    harness.video.paused = false;
    return Promise.resolve();
  };
  harness.root.dispatch("click");

  assert.equal(harness.video.playCalls, 2);
  assert.deepEqual(harness.video.playSnapshots.at(-1), {
    muted: false,
    defaultMuted: false,
    volume: 0.65,
  });
  assert.equal(harness.video.paused, false);
});

test("audio focus prevents overlapping card BGM and a click explicitly transfers playback", () => {
  const sharedWindow = { matchMedia: () => null };
  const first = createHarness();
  const second = createHarness();
  first.win = sharedWindow;
  second.win = sharedWindow;

  class SharedObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
    }
    observe(root) { this.root = root; }
    disconnect() {}
    emit(ratio) {
      this.callback([{ target: this.root, intersectionRatio: ratio, isIntersecting: ratio > 0 }]);
    }
  }
  const instances = [];
  sharedWindow.IntersectionObserver = class extends SharedObserver {
    constructor(callback, options) {
      super(callback, options);
      instances.push(this);
    }
  };

  const firstController = createController(first);
  const secondController = createController(second);
  instances[0].emit(0.35);
  instances[1].emit(0.35);

  assert.equal(first.video.playCalls, 1);
  assert.equal(second.video.playCalls, 0, "a second visible card must not overlap the active BGM");
  second.root.dispatch("click");
  assert.equal(first.video.paused, true);
  assert.equal(second.video.playCalls, 1);
  assert.equal(second.video.paused, false);
  assert.deepEqual(second.video.playSnapshots[0], {
    muted: false,
    defaultMuted: false,
    volume: 0.65,
  });

  firstController.destroy();
  secondController.destroy();
});

test("contains synchronous play failures and requires an intersecting entry", () => {
  const harness = createHarness({ throwOnPlay: true });
  createController(harness);

  assert.doesNotThrow(() => harness.observers[0].emit(0.8, false));
  assert.equal(harness.video.playCalls, 0);
  assert.doesNotThrow(() => harness.observers[0].emit(0.35));
  assert.equal(harness.video.playCalls, 1);
});

test("pauses an overdue play request after leaving the viewport", async () => {
  const harness = createHarness({ deferredPlay: true });
  createController(harness);
  harness.observers[0].emit(0.35);
  harness.observers[0].emit(0);
  const pausesAfterExit = harness.video.pauseCalls;

  harness.resolvePlay();
  await Promise.resolve();
  assert.equal(harness.video.pauseCalls, pausesAfterExit + 1);
});

test("pauses an overdue play request that resolves after controller destruction", async () => {
  const harness = createHarness({ deferredPlay: true });
  const controller = createController(harness);
  harness.observers[0].emit(0.35);
  assert.equal(harness.video.playCalls, 1, "the visible card should create one pending play request");

  controller.destroy();
  const pausesAfterDestroy = harness.video.pauseCalls;
  harness.resolvePlay();
  await Promise.resolve();

  assert.equal(harness.video.pauseCalls, pausesAfterDestroy + 1, "a resolved stale play must be paused again");
  assert.equal(harness.video.playCalls, 1, "destroying must prevent all new play requests");
});

test("returns a safe idempotent controller for incomplete DOM inputs", () => {
  const controller = createProjectVideoController({ root: null, video: null });
  assert.doesNotThrow(() => controller.destroy());
  assert.doesNotThrow(() => controller.destroy());
});

test("treats a video without event APIs as an incomplete input", () => {
  const doc = new FakeEventTarget();
  doc.visibilityState = "visible";
  const controller = createProjectVideoController({
    root: {},
    video: { play() {}, pause() {} },
    win: {},
    doc,
  });
  assert.doesNotThrow(() => controller.destroy());
});

test("stays paused without IntersectionObserver", () => {
  const harness = createHarness({ observerAvailable: false });
  createController(harness);

  assert.equal(harness.video.pauseCalls, 1);
  assert.equal(harness.video.playCalls, 0);
});

test("uses legacy media-query listeners when modern events are unavailable", () => {
  const harness = createHarness({ legacyMediaQuery: true });
  harness.mediaQuery.addEventListener = undefined;
  harness.mediaQuery.removeEventListener = undefined;
  const controller = createController(harness);

  assert.equal(harness.mediaQuery.listeners.has("change"), true);
  controller.destroy();
  assert.equal(harness.mediaQuery.listeners.has("change"), false);
});

test("destroy is idempotent and releases every observer and listener", () => {
  const harness = createHarness();
  const controller = createController(harness);

  controller.destroy();
  controller.destroy();
  const pausesAfterDestroy = harness.video.pauseCalls;
  harness.observers[0].emit(0.35);
  harness.doc.dispatch("visibilitychange");
  harness.video.dispatch("error");

  assert.equal(harness.observers[0].disconnected, true);
  assert.equal(harness.doc.listeners.size, 0);
  assert.equal(harness.video.listeners.size, 0);
  assert.equal(harness.root.listeners.size, 0);
  assert.equal(harness.video.playCalls, 0);
  assert.equal(harness.video.pauseCalls, pausesAfterDestroy);
});

test("hook source guarantees per-effect destroy cleanup and failed-video short circuit", async () => {
  // No DOM-capable React renderer is installed, so this source contract guards the
  // StrictMode-relevant lifecycle shape without introducing a runtime dependency.
  const source = await readFile(
    new URL("../src/components/ProjectShowcase/useViewportVideo.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(failed\) \{\s*video\.pause\(\);\s*return undefined;/);
  assert.match(source, /const controller = createProjectVideoController\(/);
  assert.match(source, /return \(\) => controller\.destroy\(\);/);
  assert.match(source, /\}, \[failed, rootRef, videoRef\]\);/);
});
