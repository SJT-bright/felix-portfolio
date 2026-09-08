import test from "node:test";
import assert from "node:assert/strict";

import {
  columnFactor,
  distributeItems,
  getColumnMeta,
  normalizeOffset,
} from "../src/components/DriftWall/drift-wall-math.js";

test("columnFactor is deterministic and keeps variance centered around one", () => {
  assert.equal(columnFactor(0, 0), 1);
  assert.equal(columnFactor(3, 0.45), columnFactor(3, 0.45));
  assert.ok(columnFactor(3, 0.45) >= 0.55);
  assert.ok(columnFactor(3, 0.45) <= 1.45);
});

test("distributeItems fills empty columns with the first item", () => {
  const items = [{ title: "Peaks" }, { title: "Pup" }, { title: "Falls" }];
  const columns = distributeItems(items, 4);

  assert.deepEqual(columns.slice(0, 3), items.map((item) => [item]));
  assert.deepEqual(columns[3], [items[0]]);
  assert.notEqual(columns[3], columns[0]);
});

test("distributeItems handles empty data and invalid column counts safely", () => {
  assert.deepEqual(distributeItems([], 4), [[], [], [], []]);
  assert.deepEqual(distributeItems([{ title: "One" }], 0), [[{ title: "One" }]]);
});

test("getColumnMeta supplies enough repeated content to cover the viewport", () => {
  assert.deepEqual(getColumnMeta(2, 136, 12, 600), {
    copyHeight: 296,
    copies: 5,
  });
  assert.deepEqual(getColumnMeta(0, 136, 12, 0), {
    copyHeight: 148,
    copies: 2,
  });
});

test("normalizeOffset wraps positive and negative drift without seams", () => {
  assert.equal(normalizeOffset(310, 296), 14);
  assert.equal(normalizeOffset(-14, 296), 282);
  assert.equal(normalizeOffset(20, 0), 0);
});
