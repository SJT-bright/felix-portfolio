import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createScrollVideoController } from "../scroll-controller.js";

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

function createHarness({ reducedMotion = false, active = true, playResult, duration = 6 } = {}) {
  const video = new FakeEventTarget();
  video.duration = duration;
  video.currentTime = 0;
  video.readyState = 1;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.paused = true;
  video.playCalls = 0;
  video.pauseCalls = 0;
  video.playSnapshots = [];
  video.play = () => {
    video.playCalls += 1;
    video.playSnapshots.push({
      muted: video.muted,
      defaultMuted: video.defaultMuted,
      volume: video.volume,
    });
    const result = typeof playResult === "function" ? playResult() : playResult;
    if (result instanceof Error) throw result;
    video.paused = false;
    return result ?? Promise.resolve();
  };
  video.pause = () => {
    video.pauseCalls += 1;
    video.paused = true;
  };

  const win = new FakeEventTarget();
  win.innerHeight = 100;
  win.scrollY = 0;
  const motionQuery = new FakeEventTarget();
  motionQuery.matches = reducedMotion;
  motionQuery.addListener = (listener) => motionQuery.addEventListener("change", listener);
  motionQuery.removeListener = (listener) => motionQuery.removeEventListener("change", listener);
  win.matchMedia = () => motionQuery;
  let nextTimerId = 1;
  const timers = new Map();
  win.setTimeout = (callback, delay) => {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  };
  win.clearTimeout = (id) => timers.delete(id);
  win.runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const { callback } of pending) callback();
  };
  win.pendingTimers = () => timers.size;
  win.timerIds = () => [...timers.keys()];
  win.scrollToCalls = [];
  win.scrollTo = (options) => win.scrollToCalls.push(options);

  const trackElement = {
    offsetTop: 0,
    offsetHeight: 100,
    getBoundingClientRect: () => (active
      ? { top: 0, bottom: 100, height: 100 }
      : { top: -200, bottom: -100, height: 100 }),
  };
  const nextElement = {
    scrollCalls: [],
    scrollIntoView(options) { this.scrollCalls.push(options); },
  };
  const triggerElement = new FakeEventTarget();
  triggerElement.textContent = "CLICK OR SCROLL TO ENTER · BGM ON";
  const bodyClasses = new Set();
  const doc = {
    body: {
      classList: {
        add: (...names) => names.forEach((name) => bodyClasses.add(name)),
        remove: (...names) => names.forEach((name) => bodyClasses.delete(name)),
      },
    },
  };
  const root = {
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
    },
  };
  const statusElement = { hidden: true, textContent: "序章暂时无法播放，请点击下方按钮重新加载。" };

  return {
    video,
    win,
    doc,
    root,
    statusElement,
    trackElement,
    triggerElement,
    nextElement,
    bodyClasses,
    motionQuery,
  };
}

function createController(harness, options = {}) {
  return createScrollVideoController({
    ...harness,
    root: harness.root,
    wheelIdleMs: 350,
    stallTimeoutMs: 1000,
    ...options,
  });
}

test("autoplay starts once with music without requiring an entry click", () => {
  const harness = createHarness();
  const controller = createController(harness, { autoPlay: true });
  assert.equal(controller.getState(), "playing");
  assert.equal(harness.video.playCalls, 1);
  assert.equal(harness.video.muted, false);
  assert.equal(harness.triggerElement.hidden, true);
  assert.equal(harness.win.listeners.has("click"), false);
  harness.win.dispatch("wheel", { deltaY: 20 });
  assert.equal(harness.video.playCalls, 1);
});

test("blocked autoplay restores sound on a trusted page interaction without rewinding", async () => {
  for (const synchronous of [false, true]) {
    const blocked = Object.assign(new Error("activation required"), { name: "NotAllowedError" });
    let attempt = 0;
    const harness = createHarness({ playResult: () => {
      if (++attempt === 1) return synchronous ? blocked : Promise.reject(blocked);
      return Promise.resolve();
    } });
    const controller = createController(harness, { autoPlay: true });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(controller.getState(), "playing");
    assert.equal(harness.video.playCalls, 2);
    assert.equal(harness.video.muted, true);
    assert.equal(harness.win.listeners.get("click")?.length, 1);
    assert.equal(harness.triggerElement.hidden, true);
    harness.video.currentTime = 2.4;
    harness.video.dispatch("loadedmetadata");
    harness.video.dispatch("timeupdate");
    assert.equal(harness.video.muted, true);
    harness.win.dispatch("click", { isTrusted: false });
    assert.equal(harness.video.muted, true, "synthetic events cannot unlock audio");
    harness.win.dispatch(synchronous ? "keydown" : "click", { isTrusted: true, key: "a" });
    await Promise.resolve();
    assert.equal(harness.video.muted, false);
    assert.equal(harness.video.currentTime, 2.4);
    assert.equal(harness.win.listeners.has("click"), false);
    harness.win.dispatch("click", { isTrusted: true });
    assert.equal(harness.video.playCalls, 3, "recovery detaches after success");
  }
});

test("a browser blocking even muted autoplay exposes a usable playback fallback", async () => {
  const blocked = Object.assign(new Error("activation required"), { name: "NotAllowedError" });
  const harness = createHarness({ playResult: () => Promise.reject(blocked) });
  const controller = createController(harness, { autoPlay: true });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(controller.getState(), "idle");
  assert.equal(harness.video.playCalls, 2);
  assert.equal(harness.triggerElement.hidden, false);
  assert.equal(harness.win.listeners.has("click"), false);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
});

test("a normal page click automatically starts ambience after muted completion", async () => {
  const blocked = Object.assign(new Error("activation required"), { name: "NotAllowedError" });
  let attempt = 0;
  const harness = createHarness({ playResult: () => ++attempt === 1 ? Promise.reject(blocked) : Promise.resolve() });
  const audioInstances = [];
  harness.video.currentSrc = "wormhole.mp4";
  harness.win.Audio = class {
    constructor() { audioInstances.push(this); this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  const controller = createController(harness, { autoPlay: true });
  await Promise.resolve();
  await Promise.resolve();
  harness.video.currentTime = 5.6;
  harness.video.dispatch("timeupdate");
  harness.video.dispatch("ended");
  harness.win.runTimers();
  harness.win.runTimers();
  assert.equal(controller.getState(), "completed");
  assert.equal(audioInstances.length, 0);
  assert.equal(harness.win.listeners.has("click"), true);
  harness.win.dispatch("click", { isTrusted: true });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(audioInstances.length, 1);
  assert.equal(audioInstances[0].paused, false);
  assert.equal(audioInstances[0].volume, 0.22);
  assert.equal(harness.win.listeners.has("click"), false);
  controller.destroy();
  assert.equal(audioInstances[0].paused, true);
  assert.equal(harness.win.listeners.size, 0);
});

test("a late autoplay rejection cannot restart a destroyed controller", async () => {
  let rejectPlay;
  const harness = createHarness({ playResult: new Promise((_, reject) => { rejectPlay = reject; }) });
  const controller = createController(harness, { autoPlay: true });
  controller.destroy();
  rejectPlay(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
  await Promise.resolve();
  assert.equal(harness.video.playCalls, 1);
  assert.equal(harness.video.paused, true);
  assert.equal(harness.win.listeners.has("click"), false);
});

test("blocked audio listeners are removed on destroy and ignore another video's entry", async () => {
  const blocked = Object.assign(new Error("activation required"), { name: "NotAllowedError" });
  let attempt = 0;
  const harness = createHarness({ playResult: () => ++attempt === 1 ? Promise.reject(blocked) : Promise.resolve() });
  const controller = createController(harness, { autoPlay: true });
  await Promise.resolve();
  harness.win.dispatch("click", { isTrusted: true, target: { closest: () => ({}) } });
  harness.win.dispatch("keydown", { isTrusted: true, key: "Escape" });
  harness.win.dispatch("keydown", { isTrusted: true, key: "r", ctrlKey: true });
  assert.equal(harness.video.playCalls, 2);
  assert.equal(harness.video.muted, true);
  assert.equal(harness.win.listeners.get("click")?.length, 1);
  controller.destroy();
  assert.equal(harness.win.listeners.size, 0);
});

test("initializes the Hero with BGM enabled, paused, at frame zero, and listens non-passively", () => {
  const harness = createHarness();
  createController(harness);

  assert.equal(harness.video.muted, false);
  assert.equal(harness.video.defaultMuted, false);
  assert.equal(harness.video.volume, 1);
  assert.equal(harness.video.paused, true);
  assert.equal(harness.video.currentTime, 0);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
  assert.equal(harness.root.style.values.get("--scroll-progress"), "0");
  assert.deepEqual(harness.win.listeners.get("wheel")?.[0].options, { passive: false });
  assert.deepEqual(harness.win.listeners.get("touchmove")?.[0].options, { passive: false });
  assert.equal(harness.triggerElement.listeners.get("click")?.length, 1);
});

test("one downward wheel starts one complete playback and locks inertial wheel input", () => {
  const harness = createHarness();
  const controller = createController(harness);
  const first = harness.win.dispatch("wheel", { deltaY: 80, deltaX: 0 });
  const repeat = harness.win.dispatch("wheel", { deltaY: 40, deltaX: 0 });

  assert.equal(first.defaultPrevented, true);
  assert.equal(repeat.defaultPrevented, true);
  assert.equal(harness.video.playCalls, 1);
  assert.deepEqual(harness.video.playSnapshots, [{ muted: false, defaultMuted: false, volume: 1 }]);
  assert.equal(controller.getState(), "playing");
});

test("the visible Hero trigger starts the same single playback path", () => {
  const harness = createHarness();
  const controller = createController(harness);
  const first = harness.triggerElement.dispatch("click");
  const repeat = harness.triggerElement.dispatch("click");

  assert.equal(first.defaultPrevented, true);
  assert.equal(repeat.defaultPrevented, true);
  assert.equal(harness.video.playCalls, 1);
  assert.deepEqual(harness.video.playSnapshots, [{ muted: false, defaultMuted: false, volume: 1 }]);
  assert.equal(controller.getState(), "playing");
});

test("an autoplay-policy rejection asks for a click and retries with sound instead of falling back to muted", async () => {
  const blocked = new Error("user activation is required");
  blocked.name = "NotAllowedError";
  const harness = createHarness({ playResult: () => Promise.reject(blocked) });
  const controller = createController(harness);

  harness.win.dispatch("wheel", { deltaY: 20 });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(controller.getState(), "idle");
  assert.equal(harness.video.muted, false);
  assert.equal(harness.video.defaultMuted, false);
  assert.equal(harness.video.volume, 1);
  assert.equal(harness.video.currentTime, 0);
  assert.equal(harness.bodyClasses.has("video-audio-blocked"), true);
  assert.equal(harness.statusElement.hidden, false);
  assert.match(harness.statusElement.textContent, /请点击屏幕.*开启音乐/);
  assert.equal(harness.bodyClasses.has("video-complete"), false);

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
  harness.triggerElement.dispatch("click");

  assert.equal(controller.getState(), "playing");
  assert.equal(harness.video.playCalls, 2);
  assert.equal(harness.bodyClasses.has("video-audio-blocked"), false);
  assert.deepEqual(harness.video.playSnapshots.at(-1), {
    muted: false,
    defaultMuted: false,
    volume: 1,
  });
});

test("corrects a partially scrolled Hero to its absolute document top before playback", () => {
  const harness = createHarness();
  harness.win.scrollY = 320;
  harness.trackElement.getBoundingClientRect = () => ({
    top: -36,
    bottom: 64,
    height: 100,
  });
  createController(harness);

  const event = harness.win.dispatch("wheel", { deltaY: 80, deltaX: 0 });

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(harness.win.scrollToCalls, [{ top: 284, behavior: "auto" }]);
  assert.equal(harness.video.playCalls, 1);
});

test("falls back to positional scrollTo when the options overload throws and still plays", () => {
  const harness = createHarness();
  harness.win.scrollY = 320;
  harness.trackElement.getBoundingClientRect = () => ({
    top: -36,
    bottom: 64,
    height: 100,
  });
  harness.win.scrollToCalls = [];
  harness.win.scrollTo = (...args) => {
    harness.win.scrollToCalls.push(args);
    if (args.length === 1 && typeof args[0] === "object") {
      throw new TypeError("ScrollToOptions is unsupported");
    }
  };
  createController(harness);

  assert.doesNotThrow(() => {
    harness.win.dispatch("wheel", { deltaY: 80, deltaX: 0 });
  });
  assert.deepEqual(harness.win.scrollToCalls, [
    [{ top: 284, behavior: "auto" }],
    [0, 284],
  ]);
  assert.equal(harness.video.playCalls, 1);
});

test("continues playback when both modern and positional scrollTo calls throw", () => {
  const harness = createHarness();
  harness.win.scrollY = 320;
  harness.trackElement.getBoundingClientRect = () => ({
    top: -36,
    bottom: 64,
    height: 100,
  });
  harness.win.scrollToCalls = [];
  harness.win.scrollTo = (...args) => {
    harness.win.scrollToCalls.push(args);
    throw new TypeError("scrollTo is unavailable");
  };
  const controller = createController(harness);

  assert.doesNotThrow(() => {
    harness.win.dispatch("wheel", { deltaY: 80, deltaX: 0 });
  });
  assert.deepEqual(harness.win.scrollToCalls, [
    [{ top: 284, behavior: "auto" }],
    [0, 284],
  ]);
  assert.equal(harness.video.playCalls, 1);
  assert.equal(controller.getState(), "playing");
});

test("upward, horizontal-dominant, zero, and offscreen wheel input do not start playback", () => {
  for (const values of [
    { deltaY: -10, deltaX: 0 },
    { deltaY: 5, deltaX: 20 },
    { deltaY: 0, deltaX: 0 },
  ]) {
    const harness = createHarness();
    createController(harness);
    const event = harness.win.dispatch("wheel", values);
    assert.equal(event.defaultPrevented, false);
    assert.equal(harness.video.playCalls, 0);
  }

  const offscreen = createHarness({ active: false });
  createController(offscreen);
  assert.equal(offscreen.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, false);
  assert.equal(offscreen.video.playCalls, 0);
});

test("real media time drives the progress rule", () => {
  const harness = createHarness({ duration: 8 });
  createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  harness.video.currentTime = 2;
  harness.video.dispatch("timeupdate");
  assert.equal(harness.root.style.values.get("--scroll-progress"), "0.25");
});

test("ended reveals the real landing in place and never moves to the first work section", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  harness.video.currentTime = harness.video.duration;
  harness.video.dispatch("ended");
  harness.video.dispatch("ended");

  assert.equal(controller.getState(), "revealing");
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(harness.win.scrollToCalls.length, 0);
  assert.equal(harness.bodyClasses.has("video-complete"), true);
  assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, true);
  harness.win.runTimers();
  assert.equal(controller.getState(), "settling");
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(harness.win.scrollToCalls.length, 0);
  assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, true);
  harness.win.runTimers();
  assert.equal(controller.getState(), "completed");
  assert.equal(harness.bodyClasses.has("home-intro-pending"), false);
  assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, false);
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(harness.win.scrollToCalls.length, 0);
});

test("the landing reveal locks inertial input until the fade and quiet window finish", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  harness.video.dispatch("ended");

  assert.equal(controller.getState(), "revealing");
  assert.equal(harness.win.dispatch("keydown", { key: "PageDown" }).defaultPrevented, true);
  assert.equal(
    harness.win.dispatch("touchmove", { touches: [{ clientX: 100, clientY: 100 }] }).defaultPrevented,
    true,
  );
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  harness.win.runTimers();
  assert.equal(controller.getState(), "settling");
  harness.win.runTimers();
  assert.equal(controller.getState(), "completed");
  assert.equal(harness.win.dispatch("keydown", { key: "PageDown" }).defaultPrevented, false);
  assert.equal(
    harness.win.dispatch("touchmove", { touches: [{ clientX: 100, clientY: 100 }] }).defaultPrevented,
    false,
  );
});

test("replay resets the completed prelude, stops its old ambient loop, and finishes in place again", () => {
  const harness = createHarness();
  const audioInstances = [];
  harness.video.currentSrc = "https://example.test/wormhole.mp4";
  harness.win.Audio = class {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
      this.paused = true;
      audioInstances.push(this);
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  const controller = createController(harness, { ambientSrc: "site-background-music.mp3" });
  assert.equal(audioInstances[0].src, "site-background-music.mp3");
  assert.equal(audioInstances[0].paused, true);
  assert.equal(audioInstances[0].loop, true);
  assert.equal(audioInstances[0].preload, "auto");
  harness.triggerElement.dispatch("click");
  harness.video.currentTime = 5.5;
  harness.video.dispatch("timeupdate");
  harness.video.dispatch("ended");
  harness.win.runTimers();
  harness.win.runTimers();
  const ambient = audioInstances[0];
  assert.equal(controller.getState(), "completed");
  assert.equal(ambient.paused, false);
  ambient.currentTime = 3;

  controller.replay();
  controller.replay();

  assert.equal(controller.getState(), "playing");
  assert.equal(harness.video.playCalls, 2);
  assert.equal(harness.video.currentTime, 0);
  assert.deepEqual(harness.video.playSnapshots.at(-1), {
    muted: false, defaultMuted: false, volume: 1,
  });
  assert.equal(harness.bodyClasses.has("video-complete"), false);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
  assert.equal(harness.root.style.values.get("--scroll-progress"), "0");
  assert.equal(ambient.paused, true);
  assert.equal(ambient.currentTime, 0);
  assert.equal(ambient.volume, 0);
  assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, true);
  harness.video.currentTime = 2;
  harness.video.dispatch("timeupdate");
  assert.equal(harness.root.style.values.get("--scroll-progress"), String(1 / 3));

  harness.video.dispatch("ended");
  harness.win.runTimers();
  harness.win.runTimers();
  assert.equal(controller.getState(), "completed");
  assert.equal(harness.bodyClasses.has("video-complete"), true);
  assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, false);
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(harness.win.scrollToCalls.length, 0);
  assert.equal(ambient.paused, false);

  controller.destroy();
  assert.equal(ambient.paused, true);
  assert.equal(ambient.volume, 0);
  controller.replay();
  assert.equal(harness.video.playCalls, 2);
});

test("the failed-prelude button reloads media and retries with sound without revealing the landing", () => {
  const harness = createHarness();
  const controller = createController(harness);
  let loadCalls = 0;
  harness.video.load = () => {
    loadCalls += 1;
    harness.video.error = null;
  };
  harness.triggerElement.dispatch("click");
  // A failed <source> request can leave HTMLVideoElement.error empty.
  harness.video.error = null;
  harness.video.dispatch("error");
  assert.equal(controller.getState(), "failed");
  assert.equal(harness.win.pendingTimers(), 0);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
  assert.match(harness.triggerElement.textContent, /重新加载并播放/);

  harness.triggerElement.dispatch("click");

  assert.equal(loadCalls, 1);
  assert.equal(controller.getState(), "playing");
  assert.equal(harness.video.playCalls, 2);
  assert.equal(harness.video.currentTime, 0);
  assert.equal(harness.video.muted, false);
  assert.equal(harness.video.volume, 1);
  assert.equal(harness.statusElement.hidden, true);
  assert.equal(harness.bodyClasses.has("video-failed"), false);
  assert.equal(harness.bodyClasses.has("video-complete"), false);
  assert.equal(harness.triggerElement.textContent, "CLICK OR SCROLL TO ENTER · BGM ON");
  assert.equal(harness.win.pendingTimers(), 1);
});

test("a source that failed before controller startup offers a reload even without MediaError", () => {
  const harness = createHarness();
  harness.video.readyState = 0;
  harness.video.networkState = 3;
  harness.video.error = null;
  let loadCalls = 0;
  harness.video.load = () => {
    loadCalls += 1;
    harness.video.networkState = 2;
  };
  const controller = createController(harness);

  assert.equal(controller.getState(), "failed");
  assert.equal(harness.statusElement.hidden, false);
  assert.match(harness.triggerElement.textContent, /重新加载并播放/);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
  assert.equal(harness.bodyClasses.has("video-complete"), false);

  harness.triggerElement.dispatch("click");
  assert.equal(loadCalls, 1);
  assert.equal(controller.getState(), "playing");
  assert.equal(harness.video.muted, false);
  assert.equal(harness.video.volume, 1);
});

test("reduced motion preserves the mandatory video and wheel input plays it with sound", () => {
  const harness = createHarness({ reducedMotion: true });
  const controller = createController(harness);
  assert.equal(controller.getState(), "idle");
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
  assert.equal(harness.bodyClasses.has("video-complete"), false);
  assert.equal(harness.video.playCalls, 0);
  const event = harness.win.dispatch("wheel", { deltaY: 20 });

  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.video.playCalls, 1);
  assert.deepEqual(harness.video.playSnapshots, [{ muted: false, defaultMuted: false, volume: 1 }]);
  assert.equal(harness.video.currentTime, 0);
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(harness.win.scrollToCalls.length, 0);
  assert.equal(controller.getState(), "playing");
  assert.equal(harness.bodyClasses.has("video-complete"), false);
  harness.video.dispatch("ended");
  assert.equal(harness.bodyClasses.has("video-complete"), true);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), false);
  assert.equal(controller.getState(), "completed");
});

test("reduced motion still allows an explicit replay and returns to the landing afterward", () => {
  const harness = createHarness({ reducedMotion: true });
  const controller = createController(harness);
  harness.triggerElement.dispatch("click");
  harness.video.dispatch("ended");
  assert.equal(controller.getState(), "completed");
  assert.equal(harness.video.playCalls, 1);

  controller.replay();

  assert.equal(controller.getState(), "playing");
  assert.equal(harness.bodyClasses.has("video-complete"), false);
  assert.equal(harness.video.playCalls, 2);
  assert.deepEqual(harness.video.playSnapshots.at(-1), { muted: false, defaultMuted: false, volume: 1 });
  assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
  assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, true);
  harness.video.currentTime = harness.video.duration;
  harness.video.dispatch("ended");
  assert.equal(controller.getState(), "completed");
  assert.equal(harness.bodyClasses.has("video-complete"), true);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), false);
  assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, false);
  assert.equal(harness.win.scrollToCalls.length, 0);
});

test("an intentional one-finger upward swipe starts playback while a downward swipe passes through", () => {
  const harness = createHarness();
  createController(harness, { swipeThreshold: 24 });
  harness.win.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 180 }] });
  const move = harness.win.dispatch("touchmove", { touches: [{ clientX: 102, clientY: 145 }] });
  assert.equal(move.defaultPrevented, true);
  assert.equal(harness.video.playCalls, 1);

  const downward = createHarness();
  createController(downward, { swipeThreshold: 24 });
  downward.win.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 100 }] });
  assert.equal(downward.win.dispatch("touchmove", { touches: [{ clientX: 100, clientY: 140 }] }).defaultPrevented, false);
  assert.equal(downward.video.playCalls, 0);
});

test("gradual upward touch movement is owned before the play threshold and never scrolls the page", () => {
  const harness = createHarness();
  createController(harness, { swipeThreshold: 24 });
  harness.win.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 200 }] });
  const first = harness.win.dispatch("touchmove", { touches: [{ clientX: 100, clientY: 190 }] });
  const second = harness.win.dispatch("touchmove", { touches: [{ clientX: 101, clientY: 180 }] });
  const third = harness.win.dispatch("touchmove", { touches: [{ clientX: 101, clientY: 170 }] });

  assert.equal(first.defaultPrevented, true);
  assert.equal(second.defaultPrevented, true);
  assert.equal(third.defaultPrevented, true);
  assert.equal(harness.video.playCalls, 1);
});

test("keyboard next-page intents start playback once and lock while playing", () => {
  const harness = createHarness();
  createController(harness);
  const first = harness.win.dispatch("keydown", { key: "PageDown", repeat: false });
  const repeat = harness.win.dispatch("keydown", { key: "ArrowDown", repeat: true });
  assert.equal(first.defaultPrevented, true);
  assert.equal(repeat.defaultPrevented, true);
  assert.equal(harness.video.playCalls, 1);
});

test("play rejection and synchronous failure preserve the prelude with a usable retry", async () => {
  for (const playResult of [Promise.reject(new Error("blocked")), new Error("threw")]) {
    const harness = createHarness({ playResult });
    const controller = createController(harness);
    harness.win.dispatch("wheel", { deltaY: 20 });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(controller.getState(), "failed");
    assert.equal(harness.statusElement.hidden, false);
    assert.equal(harness.bodyClasses.has("video-failed"), true);
    assert.equal(harness.bodyClasses.has("video-complete"), false);
    assert.equal(harness.bodyClasses.has("home-intro-pending"), true);
    assert.equal(harness.nextElement.scrollCalls.length, 0);
    assert.equal(harness.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, true);
    harness.win.runTimers();
    harness.win.runTimers();
    assert.equal(controller.getState(), "failed");
    assert.equal(harness.video.playCalls, 1);
    harness.video.play = () => {
      harness.video.playCalls += 1;
      harness.video.paused = false;
      return Promise.resolve();
    };
    assert.equal(harness.win.dispatch("keydown", { key: "Enter" }).defaultPrevented, true);
    assert.equal(controller.getState(), "playing");
    assert.equal(harness.video.playCalls, 2);
    assert.equal(harness.video.muted, false);
  }
});

test("media errors and stalls keep the mandatory prelude and ignore scroll retries", () => {
  const errored = createHarness();
  const errorController = createController(errored);
  errored.win.dispatch("wheel", { deltaY: 20 });
  errored.video.dispatch("error");
  assert.equal(errorController.getState(), "failed");
  assert.equal(errored.bodyClasses.has("video-complete"), false);
  assert.equal(errored.bodyClasses.has("home-intro-pending"), true);
  assert.equal(errored.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, true);

  const stalled = createHarness();
  const stalledController = createController(stalled);
  stalled.win.dispatch("wheel", { deltaY: 20 });
  stalled.video.dispatch("waiting");
  stalled.win.runTimers();
  assert.equal(stalledController.getState(), "failed");
  assert.equal(stalled.statusElement.hidden, false);
  assert.equal(stalled.bodyClasses.has("video-complete"), false);
  assert.equal(stalled.win.dispatch("wheel", { deltaY: 20 }).defaultPrevented, true);
  assert.equal(stalled.win.dispatch("keydown", { key: "PageDown" }).defaultPrevented, true);
  assert.equal(stalled.win.dispatch("touchmove", { touches: [{ clientX: 10, clientY: 10 }] }).defaultPrevented, true);
  stalled.video.dispatch("ended");
  assert.equal(stalledController.getState(), "failed");
  assert.equal(stalled.video.playCalls, 1);
  assert.equal(stalled.video.paused, true);
});

test("watchdog renewal requires real media-time progress, not noisy media events", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  const originalTimer = harness.win.timerIds()[0];

  harness.video.dispatch("waiting");
  harness.video.dispatch("playing");
  harness.video.dispatch("timeupdate");
  assert.deepEqual(harness.win.timerIds(), [originalTimer]);

  harness.win.runTimers();
  assert.equal(controller.getState(), "failed");
});

test("enabling reduced motion during playback preserves the video and completes only at its end", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  harness.motionQuery.matches = true;
  harness.motionQuery.dispatch("change", { matches: true });

  assert.equal(harness.video.paused, false);
  assert.equal(controller.getState(), "playing");
  assert.equal(harness.bodyClasses.has("video-complete"), false);
  harness.video.dispatch("ended");
  assert.equal(controller.getState(), "completed");
  assert.equal(harness.bodyClasses.has("video-complete"), true);
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(harness.win.scrollToCalls.length, 0);
});

test("destroy removes every listener, timer, class, and late media effect", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  controller.destroy();
  harness.video.dispatch("ended");
  harness.win.runTimers();

  assert.equal(controller.getState(), "destroyed");
  assert.equal(harness.win.listeners.size, 0);
  assert.equal(harness.video.listeners.size, 0);
  assert.equal(harness.triggerElement.listeners.size, 0);
  assert.equal(harness.win.pendingTimers(), 0);
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(harness.bodyClasses.has("video-playing"), false);
  assert.equal(harness.bodyClasses.has("video-audio-blocked"), false);
  assert.equal(harness.bodyClasses.has("home-intro-pending"), false);
});

test("destroy removes the reduced-motion change listener and ignores later preference changes", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  assert.equal(harness.motionQuery.listeners.get("change")?.length, 1);

  controller.destroy();
  harness.motionQuery.matches = true;
  harness.motionQuery.dispatch("change", { matches: true });

  assert.equal(harness.motionQuery.listeners.has("change"), false);
  assert.equal(harness.nextElement.scrollCalls.length, 0);
  assert.equal(controller.getState(), "destroyed");
});

test("destroy after failure clears every global status artifact", () => {
  const harness = createHarness();
  const controller = createController(harness);
  harness.win.dispatch("wheel", { deltaY: 20 });
  harness.video.dispatch("error");
  assert.equal(harness.bodyClasses.has("video-failed"), true);

  controller.destroy();
  assert.equal(harness.bodyClasses.size, 0);
  assert.equal(harness.statusElement.hidden, true);
  assert.equal(harness.root.style.values.get("--scroll-progress"), "0");
});

test("the legacy bootstrap remains guarded and does not inject an automatic next section", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
  assert.match(source, /querySelector\(["']#wormhole-video["']\)/);
  assert.match(source, /querySelector\(["']\.hero-trigger["']\)/);
  assert.match(source, /if\s*\(video\s*&&\s*statusElement\s*&&\s*trackElement\s*&&\s*triggerElement\)/);
  assert.match(source, /triggerElement/);
  assert.doesNotMatch(source, /#image-archive|nextElement/);
});
