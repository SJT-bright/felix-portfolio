import test from "node:test";
import assert from "node:assert/strict";

let math = {};

try {
  math = await import("../src/components/ScrollExpand/scroll-expand-math.js");
} catch {
  // The availability assertion below provides a deliberate RED failure
  // until the production module exists.
}

const call = (name, ...args) => {
  assert.equal(typeof math[name], "function", `${name} must be exported`);
  return math[name](...args);
};

test("ScrollExpand exports its pure geometry helpers", () => {
  for (const name of [
    "normaliseScrollExpandOptions",
    "getScrollExpandProgress",
    "getScrollExpandFrame",
    "getScrollExpandBlend",
  ]) {
    assert.equal(typeof math[name], "function", `${name} must be exported`);
  }
});

test("zero smoothing follows the scrollbar in one frame without a permanent RAF", () => {
  assert.equal(call("getScrollExpandBlend", 0, 1000 / 60), 1);
  assert.equal(call("getScrollExpandBlend", -1, 1000 / 60), 1);
  const eased = call("getScrollExpandBlend", 0.13, 1000 / 60);
  assert.ok(eased > 0 && eased < 1);
});

test("approved options create a 2.35 viewport window-scroll track", () => {
  const options = call("normaliseScrollExpandOptions", {
    startWidth: 30,
    startHeight: 30,
    startRadius: 43,
    endRadius: 13,
    mediaZoom: 1.54,
    scrollDistance: 1,
    smoothing: 0.13,
  });

  assert.deepEqual(
    {
      startWidth: options.startWidth,
      startHeight: options.startHeight,
      startRadius: options.startRadius,
      endRadius: options.endRadius,
      mediaZoom: options.mediaZoom,
      scrollDistance: options.scrollDistance,
      smoothing: options.smoothing,
      holdDistance: options.holdDistance,
      overlayScrim: options.overlayScrim,
      totalViewports: options.totalViewports,
    },
    {
      startWidth: 30,
      startHeight: 30,
      startRadius: 43,
      endRadius: 13,
      mediaZoom: 1.54,
      scrollDistance: 1,
      smoothing: 0.13,
      holdDistance: 0.35,
      overlayScrim: 0.45,
      totalViewports: 2.35,
    },
  );
});

test("local track progress clamps before, within, and after the section", () => {
  const metrics = { trackTop: 2400, viewportHeight: 800, scrollDistance: 1 };

  assert.equal(call("getScrollExpandProgress", { ...metrics, scrollY: 2000 }), 0);
  assert.equal(call("getScrollExpandProgress", { ...metrics, scrollY: 2800 }), 0.5);
  assert.equal(call("getScrollExpandProgress", { ...metrics, scrollY: 3200 }), 1);
  assert.equal(call("getScrollExpandProgress", { ...metrics, scrollY: 4000 }), 1);
});

test("frame geometry matches the approved start and end states", () => {
  const options = call("normaliseScrollExpandOptions", {
    startWidth: 30,
    startHeight: 30,
    startRadius: 43,
    endRadius: 13,
    mediaZoom: 1.54,
    scrollDistance: 1,
    smoothing: 0.13,
  });
  const start = call("getScrollExpandFrame", 0, options);
  const end = call("getScrollExpandFrame", 1, options);

  assert.deepEqual(start, {
    insetBlock: 35,
    insetInline: 35,
    radius: 43,
    mediaScale: 1.54,
    scrimOpacity: 0,
    contentOpacity: 0,
    hintOpacity: 1,
  });
  assert.deepEqual(end, {
    insetBlock: 0,
    insetInline: 0,
    radius: 13,
    mediaScale: 1,
    scrimOpacity: 0.45,
    contentOpacity: 1,
    hintOpacity: 0,
  });
});

test("invalid numeric options are converted to finite safe values", () => {
  const options = call("normaliseScrollExpandOptions", {
    startWidth: Number.NaN,
    startHeight: 140,
    startRadius: -5,
    endRadius: Number.POSITIVE_INFINITY,
    mediaZoom: 0,
    scrollDistance: -2,
    holdDistance: -1,
    smoothing: 4,
    overlayScrim: -3,
  });

  assert.equal(options.startWidth, 42);
  assert.equal(options.startHeight, 100);
  assert.equal(options.startRadius, 0);
  assert.equal(options.endRadius, 13);
  assert.equal(options.mediaZoom, 1.35);
  assert.equal(options.scrollDistance, 0.01);
  assert.equal(options.holdDistance, 0);
  assert.equal(options.smoothing, 1);
  assert.equal(options.overlayScrim, 0);
  assert.ok(Number.isFinite(options.totalViewports));
});
