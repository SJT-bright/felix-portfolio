import assert from "node:assert/strict";
import test from "node:test";

import { isHomeSectionHash, normalizePathname, resolvePage } from "../src/lib/page-route.js";

test("normalizes only trailing slashes without decoding or case-folding", () => {
  assert.equal(normalizePathname("/"), "/");
  assert.equal(normalizePathname("/lab/"), "/lab");
  assert.equal(normalizePathname("/lab///"), "/lab///");
  assert.equal(normalizePathname("/LAB"), "/LAB");
  assert.equal(normalizePathname("/%6cab"), "/%6cab");
});

test("resolves only the home and creative lab paths", () => {
  assert.equal(resolvePage("/"), "home");
  assert.equal(resolvePage("/lab"), "lab");
  assert.equal(resolvePage("/lab/"), "lab");
  assert.equal(resolvePage("/lab///"), "not-found");
  assert.equal(resolvePage("/LAB"), "not-found");
  assert.equal(resolvePage("/unknown"), "not-found");
});

test("treats invalid pathname values as unknown instead of home", () => {
  for (const value of [undefined, null, "", 42, {}, []]) {
    assert.equal(resolvePage(value), "not-found");
  }
});

test("recognizes the home sections available for navigation after the intro", () => {
  for (const hash of ["#image-archive", "#project-showcase", "#portfolio-gallery"]) {
    assert.equal(isHomeSectionHash(hash), true);
  }
  for (const hash of ["", "#unknown", "image-archive", "#IMAGE-ARCHIVE", null, 42]) {
    assert.equal(isHomeSectionHash(hash), false);
  }
});
