import test from "node:test";
import assert from "node:assert/strict";
import { clamp01, getScrollProgress, progressToTime } from "../scroll-math.js";

test("clamp01 confines finite values and rejects non-finite input", () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(3), 1);
  assert.equal(clamp01(Number.NaN), 0);
});

test("getScrollProgress maps the usable scroll range to zero through one", () => {
  assert.equal(getScrollProgress(0, 5000, 1000), 0);
  assert.equal(getScrollProgress(2000, 5000, 1000), 0.5);
  assert.equal(getScrollProgress(4000, 5000, 1000), 1);
  assert.equal(getScrollProgress(8000, 5000, 1000), 1);
  assert.equal(getScrollProgress(10, 1000, 1000), 0);
});

test("progressToTime maps valid duration and refuses invalid metadata", () => {
  assert.equal(progressToTime(0.5, 6), 3);
  assert.equal(progressToTime(2, 6), 6);
  assert.equal(progressToTime(0.5, 0), null);
  assert.equal(progressToTime(0.5, Number.POSITIVE_INFINITY), null);
});
