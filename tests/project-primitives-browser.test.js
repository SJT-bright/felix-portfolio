import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = "/tests/fixtures/project-primitives-harness.html";
const executableCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.platform === "win32" && process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
    : null,
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => existsSync(candidate));

async function openHarness(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(new URL(fixturePath, baseUrl).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.dataset.harnessReady === "true");
  return { context, page, pageErrors };
}

async function render(page, depth = 12.5) {
  await page.evaluate((nextDepth) => window.__projectPrimitivesHarness.render({ depth: nextDepth }), depth);
  await page.locator("[data-testid=card-container]").waitFor({ state: "attached" });
}

async function renderLinkBranches(page) {
  await page.evaluate(() => window.__projectPrimitivesHarness.renderLinkBranches());
  await page.locator("[data-testid=project-card-linked] .project-card__link").waitFor({ state: "attached" });
  await page.locator("[data-testid=drift-wall-linked] .drift-wall__links").waitFor({ state: "attached" });
}

async function inspectLinkBranches(page) {
  return page.evaluate(() => {
    const inspectSurface = (selector) => {
      const surface = document.querySelector(`${selector} .project-card__link`);
      return {
        tag: surface?.tagName ?? null,
        state: surface?.dataset.linkState ?? null,
        href: surface?.getAttribute("href") ?? null,
        target: surface?.getAttribute("target") ?? null,
        rel: surface?.getAttribute("rel") ?? null,
        ariaLabel: surface?.getAttribute("aria-label") ?? null,
      };
    };
    const inspectWall = (selector) => {
      const wall = document.querySelector(selector);
      const tiles = [...wall?.querySelectorAll(".drift-wall__tile") ?? []];
      const navLinks = [...wall?.querySelectorAll(".drift-wall__links a") ?? []];
      return {
        tileCount: tiles.length,
        tileTags: tiles.map((tile) => tile.tagName),
        tileLinks: tiles.filter((tile) => tile.matches("a")).map((tile) => ({
          href: tile.getAttribute("href"),
          target: tile.getAttribute("target"),
          rel: tile.getAttribute("rel"),
          tabIndex: tile.getAttribute("tabindex"),
          ariaHidden: tile.getAttribute("aria-hidden"),
        })),
        hasAuxiliaryNav: Boolean(wall?.querySelector(".drift-wall__links")),
        navLinks: navLinks.map((link) => ({
          href: link.getAttribute("href"),
          target: link.getAttribute("target"),
          rel: link.getAttribute("rel"),
        })),
      };
    };

    return {
      pendingProject: inspectSurface("[data-testid=project-card-pending]"),
      linkedProject: inspectSurface("[data-testid=project-card-linked]"),
      pendingWall: inspectWall("[data-testid=drift-wall-pending]"),
      linkedWall: inspectWall("[data-testid=drift-wall-linked]"),
    };
  });
}

function linkBranchFailures(state) {
  const failures = [];
  const safeRel = (value) => new Set((value ?? "").split(/\s+/).filter(Boolean));
  const expectSafeExternalLink = (link, label) => {
    if (!link?.href) failures.push(`${label}: missing href`);
    if (link?.target !== "_blank") failures.push(`${label}: missing target`);
    const rel = safeRel(link?.rel);
    if (!rel.has("noreferrer") || !rel.has("noopener")) failures.push(`${label}: unsafe rel`);
  };

  if (state.pendingProject.tag !== "DIV") failures.push("pending project: not a div");
  if (state.pendingProject.state !== "pending") failures.push("pending project: wrong state");
  if (state.pendingProject.href !== null) failures.push("pending project: exposed href");
  if (state.linkedProject.tag !== "A") failures.push("linked project: not an anchor");
  if (state.linkedProject.state !== "ready") failures.push("linked project: wrong state");
  if (state.linkedProject.href !== "https://portfolio.test/project/demo") failures.push("linked project: href not trimmed or forwarded");
  if (!state.linkedProject.ariaLabel?.startsWith("Linked project")) failures.push("linked project: missing accessible label");
  expectSafeExternalLink(state.linkedProject, "linked project");

  if (state.pendingWall.tileCount < 1) failures.push("pending wall: no visual tiles");
  if (state.pendingWall.tileTags.some((tag) => tag !== "DIV")) failures.push("pending wall: visual anchor exposed");
  if (state.pendingWall.hasAuxiliaryNav || state.pendingWall.navLinks.length !== 0) failures.push("pending wall: auxiliary links exposed");
  if (state.linkedWall.tileCount < 1) failures.push("linked wall: no visual tiles");
  if (state.linkedWall.tileTags.some((tag) => tag !== "A")) failures.push("linked wall: visual tile is not an anchor");
  state.linkedWall.tileLinks.forEach((link, index) => {
    expectSafeExternalLink(link, `linked wall tile ${index}`);
    if (link.tabIndex !== "-1" || link.ariaHidden !== "true") failures.push(`linked wall tile ${index}: visual-only semantics changed`);
  });
  if (!state.linkedWall.hasAuxiliaryNav || state.linkedWall.navLinks.length !== 2) failures.push("linked wall: auxiliary navigation count changed");
  state.linkedWall.navLinks.forEach((link, index) => expectSafeExternalLink(link, `linked wall nav ${index}`));
  if (state.linkedWall.navLinks.map((link) => link.href).join("|") !== "https://portfolio.test/work/one|https://portfolio.test/work/two") {
    failures.push("linked wall: hrefs not forwarded in source order");
  }
  return failures;
}

async function pointer(page, type, init = {}) {
  await page.locator("[data-testid=card-container]").dispatchEvent(type, {
    pointerId: 17,
    clientX: 100,
    clientY: 50,
    bubbles: true,
    ...init,
  });
}

test("project primitives browser behavior", async (t) => {
  const vite = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, "vite.config.js"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  let browser = null;
  t.after(async () => {
    await browser?.close();
    await vite.close();
  });
  await vite.listen();
  const address = vite.httpServer.address();
  assert.equal(typeof address, "object");
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

  await t.test("renders Bento wrappers with merged classes, children, and forwarded attributes", async () => {
    const run = await openHarness(browser, `http://127.0.0.1:${address.port}/`);
    try {
      await render(run.page);
      const bento = await run.page.locator("[data-testid=bento-grid]").evaluate((element) => ({
        tag: element.tagName,
        className: element.className,
        ariaLabel: element.getAttribute("aria-label"),
        childText: element.querySelector("[data-testid=bento-child]")?.textContent,
      }));
      const item = await run.page.locator("[data-testid=bento-grid-item]").evaluate((element) => ({
        tag: element.tagName,
        className: element.className,
        project: element.dataset.project,
      }));

      assert.deepEqual(bento, {
        tag: "DIV",
        className: "project-bento-grid custom-grid",
        ariaLabel: "Project grid",
        childText: "Bento content",
      });
      assert.deepEqual(item, {
        tag: "DIV",
        className: "project-bento-grid__item custom-item",
        project: "one",
      });
      assert.deepEqual(run.pageErrors, []);
    } finally {
      await run.context.close();
    }
  });

  await t.test("rotates from current-target bounds, clamps, and preserves native pointer behavior", async () => {
    const run = await openHarness(browser, `http://127.0.0.1:${address.port}/`);
    try {
      await render(run.page);
      const rotation = () => run.page.locator("[data-testid=card-container]").evaluate((element) => ({
        x: element.style.getPropertyValue("--project-rotate-x"),
        y: element.style.getPropertyValue("--project-rotate-y"),
      }));

      await pointer(run.page, "pointermove");
      assert.deepEqual(await rotation(), { x: "0deg", y: "0deg" });
      await pointer(run.page, "pointermove", { clientX: 0, clientY: 0 });
      assert.deepEqual(await rotation(), { x: "5deg", y: "-5deg" });
      await pointer(run.page, "pointermove", { clientX: -100, clientY: 200 });
      assert.deepEqual(await rotation(), { x: "-5deg", y: "-5deg" });

      await pointer(run.page, "pointerout");
      assert.deepEqual(await rotation(), { x: "0deg", y: "0deg" }, "pointerleave did not reset rotation");
      await pointer(run.page, "pointermove", { clientX: 0, clientY: 0 });
      assert.notDeepEqual(await rotation(), { x: "0deg", y: "0deg" }, "pointercancel was not tested from a rotated state");
      await pointer(run.page, "pointercancel");
      assert.deepEqual(await rotation(), { x: "0deg", y: "0deg" }, "pointercancel did not reset rotation");
      await pointer(run.page, "pointermove", { clientX: 200, clientY: 100 });
      assert.notDeepEqual(await rotation(), { x: "0deg", y: "0deg" }, "blur was not tested from a rotated state");
      await run.page.locator("[data-testid=card-container]").focus();
      await run.page.locator("[data-testid=card-container]").evaluate((element) => element.blur());
      assert.deepEqual(await rotation(), { x: "0deg", y: "0deg" }, "blur did not reset rotation");

      const events = await run.page.evaluate(() => window.__projectPrimitivesEvents);
      assert.deepEqual(events.map(({ type }) => type), ["pointermove", "pointermove", "pointermove", "pointerleave", "pointermove", "pointercancel", "pointermove", "blur"]);
      assert.ok(events.every(({ defaultPrevented, captured }) => !defaultPrevented && !captured));
      await run.page.locator("[data-testid=semantic-card]").click();
      assert.equal(await run.page.evaluate(() => window.__projectPrimitivesClicks), 1);
      assert.deepEqual(run.pageErrors, []);
    } finally {
      await run.context.close();
    }
  });

  await t.test("renders CardItem as requested and merges finite-safe depth styles", async () => {
    const run = await openHarness(browser, `http://127.0.0.1:${address.port}/`);
    try {
      for (const [depth, expectedDepth] of [[12.5, "12.5px"], [Number.NaN, "0px"], [Number.POSITIVE_INFINITY, "0px"]]) {
        await run.page.evaluate((nextDepth) => window.__projectPrimitivesHarness.render({ depth: nextDepth }), depth);
        const item = await run.page.locator("[data-testid=semantic-card]").evaluate((element) => ({
          tag: element.tagName,
          depth: element.style.getPropertyValue("--project-depth"),
          color: element.style.color,
        }));
        assert.deepEqual(item, { tag: "A", depth: expectedDepth, color: "rgb(1, 2, 3)" });
      }
      assert.deepEqual(run.pageErrors, []);
    } finally {
      await run.context.close();
    }
  });

  await t.test("renders pending and real-link branches with truthful, safe DOM semantics", async () => {
    const run = await openHarness(browser, `http://127.0.0.1:${address.port}/`);
    try {
      await renderLinkBranches(run.page);
      const initial = await inspectLinkBranches(run.page);
      assert.deepEqual(linkBranchFailures(initial), []);

      // Mutation proof: these are the two regressions the branch test is intended to catch.
      await run.page.evaluate(() => {
        document.querySelector("[data-testid=project-card-linked] .project-card__link")?.removeAttribute("href");
        document.querySelector("[data-testid=drift-wall-linked] .drift-wall__tile")?.removeAttribute("target");
      });
      const mutatedFailures = linkBranchFailures(await inspectLinkBranches(run.page));
      assert.ok(mutatedFailures.includes("linked project: href not trimmed or forwarded"));
      assert.ok(mutatedFailures.includes("linked project: missing href"));
      assert.ok(mutatedFailures.some((failure) => /^linked wall tile \d+: missing target$/.test(failure)));

      await render(run.page);
      await renderLinkBranches(run.page);
      assert.deepEqual(linkBranchFailures(await inspectLinkBranches(run.page)), [], "rerender did not restore the production DOM");
      assert.deepEqual(run.pageErrors, []);
    } finally {
      await run.context.close();
    }
  });
});
