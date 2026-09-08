/** Browser gate for the React Felix sailing and DriftWall page. */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (projectError) {
    const candidates = [
      process.env.PLAYWRIGHT_MODULE_PATH,
      process.env.USERPROFILE
        ? path.join(
          process.env.USERPROFILE,
          ".cache",
          "codex-runtimes",
          "codex-primary-runtime",
          "dependencies",
          "node",
          "node_modules",
          "playwright",
        )
        : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      try {
        return require(candidate);
      } catch {
        // Continue through explicit, then bundled runtime candidates.
      }
    }

    throw new Error(
      "Playwright is unavailable from the project, PLAYWRIGHT_MODULE_PATH, and the bundled runtime.",
      { cause: projectError },
    );
  }
}

const { chromium } = await loadPlaywright();
const baseUrl = process.env.FELIX_BASE_URL ?? "http://127.0.0.1:52124/";
const invalidGatewayPhotoUrl = new URL("/invalid-gateway-photo.svg", baseUrl).href;
const invalidGatewayPhoto404Message = "Failed to load resource: the server responded with a status of 404 (Not Found)";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(projectRoot, "artifacts");
const writeDriftWallScreenshots = process.env.FELIX_WRITE_DRIFTWALL_SCREENSHOTS === "1";
const writeProjectShowcaseScreenshots = process.env.FELIX_WRITE_PROJECT_SHOWCASE_SCREENSHOTS === "1";
const projectShowcaseScreenshotOnly = writeProjectShowcaseScreenshots && !writeDriftWallScreenshots;
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.platform === "win32" && process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
    : null,
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : null,
  process.platform === "linux" ? "/usr/bin/google-chrome" : null,
  process.platform === "linux" ? "/usr/bin/chromium" : null,
].filter(Boolean);
const browserExecutable = browserCandidates.find((candidate) => existsSync(candidate));
const viewports = [
  { label: "mobile-320", width: 320, height: 700 },
  { label: "mobile-375", width: 375, height: 740 },
  { label: "mobile-414", width: 414, height: 780 },
  { label: "tablet-768", width: 768, height: 900 },
  { width: 1280, height: 900, label: "desktop-1280" },
  { label: "desktop", width: 1440, height: 900 },
];
const screenshotViewports = [
  { label: "desktop", width: 1440, height: 900, file: "felix-driftwall-desktop.png" },
  { label: "mobile-320", width: 320, height: 700, file: "felix-driftwall-mobile-320.png" },
];
const projectShowcaseScreenshotViewports = [
  { label: "desktop", width: 1440, height: 900, file: "felix-project-showcase-desktop.png" },
  { label: "mobile-320", width: 320, height: 700, file: "felix-project-showcase-mobile-320.png" },
];
const projectShowcaseFrameGutter = 16;
const transparentGif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);
const projectMediaFallbackText = "作品预览暂时无法加载";
const expectedProjectLinks = [
  "https://mufeng-fragrance.pages.dev/",
  "https://nick-fox.pages.dev/1/",
  "https://hhh416873-gif.github.io/",
  "https://0ef20201a59546889a9bd4bc4bc87642.app.workbuddy.link/",
  "https://lxl12138com-cyber.github.io/moon-whisper-tarot/",
  "https://9bd684df375b4bd29a9f49a6e7ac5fd6.app.workbuddy.link",
  "https://network-wonders-after.pages.dev/#why",
  "https://0ef20201a59546889a9bd4bc4bc87642.app.workbuddy.link/",
];
const expectedProjectImages = [
  { file: "project-01-mufeng-fragrance", width: 3208, height: 1730, fit: "contain", position: "50% 50%" },
  { file: "project-02-fox26-portfolio", width: 2010, height: 1734, fit: "cover", position: "50% 0%" },
  { file: "project-03-poetry-universe", width: 1984, height: 1704, fit: "cover", position: "50% 0%" },
  { file: "project-04-world-love-letter", width: 1998, height: 1706, fit: "cover", position: "50% 50%" },
  { file: "project-05-moon-whisper-tarot", width: 2010, height: 1708, fit: "cover", position: "50% 50%" },
  { file: "project-06-mercedes-cinematic", width: 2116, height: 1368, fit: "cover", position: "50% 50%" },
  { file: "project-07-network-wonders", width: 2796, height: 1614, fit: "contain", position: "50% 50%" },
  { file: "project-08-world-love-letter-sea", width: 2800, height: 1612, fit: "contain", position: "50% 50%" },
];

let assertionCount = 0;
function check(condition, message) {
  assertionCount += 1;
  if (!condition) throw new Error(message);
}

async function verifyRangeContract() {
  const rootResponse = await fetch(baseUrl);
  const html = await rootResponse.text();
  const labResponse = await fetch(new URL("/lab", baseUrl));
  const labHtml = await labResponse.text();
  check(rootResponse.status === 200, `production root status was ${rootResponse.status}`);
  check(labResponse.status === 200, `production /lab status was ${labResponse.status}`);
  check(labHtml === html, "production /lab did not resolve to the current SPA document");
  check(!html.includes("/src/main.jsx"), "production HTML still references /src/main.jsx");
  const scriptPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  check(Boolean(scriptPath), "production HTML does not expose its Vite entry chunk");
  check(/^\/assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]+\.js$/.test(scriptPath), `production entry is not hashed: ${scriptPath}`);
  const scriptResponse = await fetch(new URL(scriptPath, baseUrl));
  const script = await scriptResponse.text();
  check(scriptResponse.status === 200, `production entry status was ${scriptResponse.status}`);
  check(
    scriptResponse.headers.get("Content-Type")?.toLowerCase().includes("javascript"),
    `production entry MIME was ${scriptResponse.headers.get("Content-Type")}`,
  );
  const stylesheetPaths = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]);
  check(stylesheetPaths.length > 0, "production HTML does not expose a Vite stylesheet");
  check(
    stylesheetPaths.every((href) => /^\/assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]+\.css$/.test(href)),
    `production stylesheets are not all hashed: ${stylesheetPaths.join(", ")}`,
  );
  for (const stylesheetPath of stylesheetPaths) {
    const stylesheetResponse = await fetch(new URL(stylesheetPath, baseUrl));
    check(stylesheetResponse.status === 200, `${stylesheetPath} status was ${stylesheetResponse.status}`);
    check(
      stylesheetResponse.headers.get("Content-Type")?.toLowerCase().includes("text/css"),
      `${stylesheetPath} MIME was ${stylesheetResponse.headers.get("Content-Type")}`,
    );
  }
  const portfolioResponse = await fetch(new URL("/portfolio/index.html", baseUrl));
  const portfolioHtml = await portfolioResponse.text();
  check(portfolioResponse.status === 200, `portfolio document status was ${portfolioResponse.status}`);
  check(portfolioHtml !== html, "portfolio document was replaced by the SPA fallback");
  check(portfolioHtml.includes("app.js"), "portfolio document no longer references its standalone app.js");
  const missingAssetResponse = await fetch(new URL("/assets/creative-lab-missing.js", baseUrl));
  check(missingAssetResponse.status === 404, `missing asset status was ${missingAssetResponse.status}`);
  const mediaPath = script.match(/assets\/wormhole-home-with-audio-[A-Za-z0-9_-]+\.mp4/)?.[0];
  check(Boolean(mediaPath), "production bundle does not reference the hashed Hero video");
  const response = await fetch(new URL(mediaPath, baseUrl), {
    headers: { Range: "bytes=0-0" },
  });
  const contentRange = response.headers.get("Content-Range");
  check(response.status === 206, `Range status was ${response.status}`);
  check(response.headers.get("Accept-Ranges")?.toLowerCase() === "bytes", "Accept-Ranges is not bytes");
  check(contentRange === "bytes 0-0/4727355", `Content-Range was ${contentRange}`);
  check(response.headers.get("Content-Length") === "1", "Range length is not one byte");
  check((await response.arrayBuffer()).byteLength === 1, "Range body is not one byte");
}

async function installProjectVideoPlayProbe(context) {
  await context.addInitScript(() => {
    const probe = { attempts: [], playingEvents: 0 };
    const nativePlay = HTMLMediaElement.prototype.play;
    globalThis.__felixProjectVideoPlayProbe = probe;

    document.addEventListener("playing", (event) => {
      if (event.target?.matches?.(".project-card__video")) probe.playingEvents += 1;
    }, true);

    HTMLMediaElement.prototype.play = function projectVideoPlayProbe(...args) {
      if (!this.matches?.(".project-card__video")) return nativePlay.apply(this, args);

      const attempt = {
        status: "invoked",
        muted: this.muted,
        defaultMuted: this.defaultMuted,
        volume: this.volume,
      };
      probe.attempts.push(attempt);
      try {
        const result = nativePlay.apply(this, args);
        if (result && typeof result.then === "function") {
          result.then(
            () => { attempt.status = "resolved"; },
            () => { attempt.status = "rejected"; },
          );
        } else {
          attempt.status = "resolved";
        }
        return result;
      } catch (error) {
        attempt.status = "threw";
        throw error;
      }
    };
  });
}

async function waitForAnimationFrames(page, count = 2) {
  await page.evaluate((frameCount) => new Promise((resolve) => {
    const next = (remaining) => {
      if (remaining <= 0) resolve();
      else requestAnimationFrame(() => next(remaining - 1));
    };
    next(frameCount);
  }), count);
}

async function readProjectVideoPlayProbe(page) {
  return page.evaluate(() => ({
    attempts: (globalThis.__felixProjectVideoPlayProbe?.attempts ?? []).map(({
      status,
      muted,
      defaultMuted,
      volume,
    }) => ({ status, muted, defaultMuted, volume })),
    playingEvents: globalThis.__felixProjectVideoPlayProbe?.playingEvents ?? 0,
  }));
}

async function openRoute(browser, viewport, options = {}) {
  const consoleErrors = [];
  const pageErrors = [];
  const requestUrls = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    javaScriptEnabled: options.javaScriptEnabled !== false,
  });
  if (options.beforePage) await options.beforePage(context);
  const page = await context.newPage();
  context.on("request", (request) => requestUrls.push(request.url()));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const routeUrl = new URL(options.path ?? "/", baseUrl).href;
  await page.goto(routeUrl, { waitUntil: "domcontentloaded" });
  if (options.waitFor) await page.waitForSelector(options.waitFor);
  if (options.javaScriptEnabled !== false) {
    await page.evaluate(() => document.fonts.ready);
    await waitForAnimationFrames(page);
  }
  return { context, page, consoleErrors, pageErrors, requestUrls };
}

async function openPage(browser, viewport, options = {}) {
  const consoleErrors = [];
  const pageErrors = [];
  const invalidGatewayPhoto404 = { received: 0, consumed: 0 };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
  });
  await installProjectVideoPlayProbe(context);
  if (!options.liveImages) {
    await context.route("https://picsum.photos/**", (route) => route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: transparentGif,
    }));
  }
  const page = await context.newPage();
  page.on("response", (response) => {
    if (response.url() === invalidGatewayPhotoUrl && response.status() === 404) {
      invalidGatewayPhoto404.received += 1;
    }
  });
  page.on("console", (message) => {
    if (
      message.type() === "error"
      && invalidGatewayPhoto404.received > invalidGatewayPhoto404.consumed
      && message.text() === invalidGatewayPhoto404Message
    ) {
      invalidGatewayPhoto404.consumed += 1;
      return;
    }
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#wormhole-video");
  await verifyInitialLoader(page, viewport, options.reducedMotion);
  await page.waitForSelector(".drift-wall[data-running]");
  await page.waitForSelector(".scroll-expand[data-progress]");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page, consoleErrors, pageErrors, invalidGatewayPhoto404 };
}

async function verifyInitialLoader(page, viewport, reducedMotion = false) {
  await page.waitForSelector("#site-loader", { state: "visible" });
  const initial = await page.evaluate(() => {
    const loader = document.querySelector("#site-loader");
    if (!loader) return { detached: true };
    const visual = loader?.querySelector(".site-loader__visual");
    const brand = loader?.querySelector(".site-loader__brand");
    const progress = loader?.querySelector("[role='progressbar']");
    const video = document.querySelector("#wormhole-video");
    const loaderBounds = loader?.getBoundingClientRect();
    const visualBounds = visual?.getBoundingClientRect();
    const brandBounds = brand?.getBoundingClientRect();
    const orbitStyle = getComputedStyle(loader?.querySelector(".site-loader__art--orbit"));
    const dotStyle = getComputedStyle(loader?.querySelector(".site-loader__dot"));
    return {
      progress: Number.parseFloat(loader?.dataset.progress),
      angle: Number.parseFloat(loader?.style.getPropertyValue("--site-loader-angle")),
      percentage: loader?.querySelector("[data-site-loader-percentage]")?.textContent,
      ariaValue: Number(progress?.getAttribute("aria-valuenow")),
      loaderBounds: loaderBounds && {
        left: loaderBounds.left,
        top: loaderBounds.top,
        right: loaderBounds.right,
        bottom: loaderBounds.bottom,
      },
      visualBounds: visualBounds && {
        left: visualBounds.left,
        top: visualBounds.top,
        right: visualBounds.right,
        bottom: visualBounds.bottom,
        width: visualBounds.width,
        height: visualBounds.height,
      },
      brandBounds: brandBounds && {
        left: brandBounds.left,
        top: brandBounds.top,
        right: brandBounds.right,
        bottom: brandBounds.bottom,
      },
      bodyLocked: document.body.classList.contains("site-loading"),
      rootBusy: document.querySelector("#root")?.getAttribute("aria-busy"),
      rootInert: document.querySelector("#root")?.inert,
      videoPaused: video?.paused,
      videoTime: video?.currentTime,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      orbitTransform: orbitStyle.transform,
      orbitTransition: orbitStyle.transitionDuration,
      dotDisplay: dotStyle.display,
    };
  });

  if (initial.detached) return;

  check(initial.progress >= 0 && initial.progress < 100, `${viewport.label}: loader progress is invalid ${initial.progress}`);
  check(Math.abs(initial.angle - (initial.progress * 3.6)) <= 0.1, `${viewport.label}: loader angle does not match progress`);
  check(initial.ariaValue === Math.round(initial.progress), `${viewport.label}: loader ARIA progress is stale`);
  check(/^\d{3}%$/.test(initial.percentage), `${viewport.label}: loader percentage format is ${initial.percentage}`);
  check(initial.bodyLocked && initial.rootBusy === "true" && initial.rootInert, `${viewport.label}: loader does not lock the page`);
  check(initial.videoPaused && Math.abs(initial.videoTime) <= 0.01, `${viewport.label}: Hero started behind the loader`);
  check(Math.abs(initial.loaderBounds.left) <= 1 && Math.abs(initial.loaderBounds.top) <= 1, `${viewport.label}: loader misses the top-left viewport edge`);
  check(Math.abs(initial.loaderBounds.right - viewport.width) <= 1, `${viewport.label}: loader misses the right viewport edge`);
  check(Math.abs(initial.loaderBounds.bottom - viewport.height) <= 1, `${viewport.label}: loader misses the bottom viewport edge`);
  check(Math.abs(initial.visualBounds.width - initial.visualBounds.height) <= 1, `${viewport.label}: loader artwork is not square`);
  check(initial.visualBounds.left >= 0 && initial.visualBounds.right <= viewport.width, `${viewport.label}: loader artwork overflows horizontally`);
  check(initial.brandBounds.left >= 0 && initial.brandBounds.right <= viewport.width, `${viewport.label}: loader credit overflows horizontally`);
  check(initial.brandBounds.top >= 0 && initial.brandBounds.bottom < initial.visualBounds.top, `${viewport.label}: loader credit overlaps the planet`);
  check(Math.abs(initial.overflow) <= 1, `${viewport.label}: loader creates horizontal overflow`);
  if (reducedMotion) {
    check(initial.orbitTransform === "none", `${viewport.label}: reduced-motion orbit still rotates`);
    check(initial.orbitTransition === "0s", `${viewport.label}: reduced-motion orbit still transitions`);
    check(initial.dotDisplay === "none", `${viewport.label}: reduced-motion progress dot is still visible`);
  }

  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 180, cancelable: true }));
  });
  await page.waitForTimeout(40);
  const lockedVideo = await page.locator("#wormhole-video").evaluate((video) => ({
    paused: video.paused,
    currentTime: video.currentTime,
  }));
  check(lockedVideo.paused && Math.abs(lockedVideo.currentTime) <= 0.01, `${viewport.label}: loader wheel input reached the Hero`);

  await page.waitForSelector("#site-loader", { state: "detached", timeout: 10000 });
  const released = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains("site-loading"),
    rootBusy: document.querySelector("#root")?.hasAttribute("aria-busy"),
    rootInert: document.querySelector("#root")?.inert,
    paused: document.querySelector("#wormhole-video")?.paused,
    currentTime: document.querySelector("#wormhole-video")?.currentTime,
  }));
  check(!released.bodyLocked && !released.rootBusy && !released.rootInert, `${viewport.label}: loader did not release the page`);
  check(released.paused && Math.abs(released.currentTime) <= 0.01, `${viewport.label}: loader completion autoplayed the Hero`);
}

async function waitForVideoMetadata(page) {
  await page.waitForFunction(() => {
    const video = document.querySelector("#wormhole-video");
    return video
      && video.readyState >= HTMLMediaElement.HAVE_METADATA
      && Number.isFinite(video.duration)
      && video.duration > 0;
  });
}

async function verifyHero(page, viewport) {
  await waitForVideoMetadata(page);
  const initial = await page.evaluate(() => {
    const video = document.querySelector("#wormhole-video");
    const track = document.querySelector(".scroll-track");
    return {
      muted: video.muted,
      defaultMuted: video.defaultMuted,
      volume: video.volume,
      paused: video.paused,
      controls: video.controls,
      loop: video.loop,
      trackHeight: track.offsetHeight,
      viewportHeight: window.innerHeight,
      currentSrc: video.currentSrc,
    };
  });
  check(
    !initial.muted && !initial.defaultMuted && initial.volume > 0,
    `${viewport.label}: hero BGM is disabled ${JSON.stringify(initial)}`,
  );
  check(initial.paused, `${viewport.label}: hero video is not paused by default`);
  check(!initial.controls && !initial.loop, `${viewport.label}: hero video exposes controls or loops`);
  check(initial.trackHeight >= initial.viewportHeight - 1, `${viewport.label}: hero is shorter than one viewport`);
  check(initial.trackHeight <= initial.viewportHeight + 1, `${viewport.label}: hero is taller than one viewport`);
  check(/wormhole-home-with-audio-[A-Za-z0-9_-]+\.mp4(?:$|\?)/.test(initial.currentSrc), `${viewport.label}: unexpected video source ${initial.currentSrc}`);

  const beforeScrollY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => {
    const video = document.querySelector("#wormhole-video");
    return Boolean(video && (
      (!video.paused && video.currentTime > 0.05)
      || document.body.classList.contains("video-audio-blocked")
    ));
  }, undefined, { polling: "raf", timeout: 5000 });
  const audioBlocked = await page.evaluate(() => document.body.classList.contains("video-audio-blocked"));
  if (audioBlocked) {
    const prompt = await page.locator("#video-status").textContent();
    check(prompt?.includes("请点击屏幕"), `${viewport.label}: blocked Hero does not request an audio gesture: ${prompt}`);
    await page.locator(".hero-trigger").click();
  }
  await page.waitForFunction(() => {
    const video = document.querySelector("#wormhole-video");
    return video && !video.paused && video.currentTime > 0.05;
  }, undefined, { polling: "raf", timeout: 5000 });
  const started = await page.locator("#wormhole-video").evaluate((video) => ({
    muted: video.muted,
    defaultMuted: video.defaultMuted,
    volume: video.volume,
    paused: video.paused,
    currentTime: video.currentTime,
  }));
  check(
    !started.muted
      && !started.defaultMuted
      && started.volume > 0
      && !started.paused
      && started.currentTime > 0,
    `${viewport.label}: Hero did not start with BGM ${JSON.stringify(started)}`,
  );
  check(
    await page.locator(".drift-wall").getAttribute("data-running") === "false",
    `${viewport.label}: DriftWall runs while the hero is still in view`,
  );
  await page.mouse.wheel(0, 360);
  await page.waitForTimeout(120);
  check(
    Math.abs((await page.evaluate(() => window.scrollY)) - beforeScrollY) <= 1,
    `${viewport.label}: repeated wheel escaped the Hero during playback`,
  );
  await page.waitForFunction(() => {
    const video = document.querySelector("#wormhole-video");
    const profile = document.querySelector("[data-profile-landing]");
    const prelude = document.querySelector("[data-wormhole-prelude]");
    return video?.ended
      && document.body.classList.contains("video-complete")
      && Number.parseFloat(getComputedStyle(profile).opacity) > 0.99
      && Number.parseFloat(getComputedStyle(prelude).opacity) < 0.01;
  }, null, { timeout: 12000 });
  check(await page.locator("#wormhole-video").evaluate((video) => video.paused), `${viewport.label}: video is not paused after ending`);
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => {
    const profile = document.querySelector("[data-profile-landing]");
    const portrait = document.querySelector("[data-profile-portrait]");
    const portraitImage = portrait.querySelector("img");
    const archive = document.querySelector("#image-archive");
    const profileBounds = profile.getBoundingClientRect();
    const portraitBounds = portrait.getBoundingClientRect();
    const wheel = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    window.dispatchEvent(wheel);
    return {
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      archiveTop: archive.getBoundingClientRect().top,
      profileTop: profileBounds.top,
      profileBottom: profileBounds.bottom,
      profileOpacity: Number.parseFloat(getComputedStyle(profile).opacity),
      profileVisibility: getComputedStyle(profile).visibility,
      preludeOpacity: Number.parseFloat(getComputedStyle(document.querySelector("[data-wormhole-prelude]")).opacity),
      portraitWidth: portraitBounds.width,
      portraitHeight: portraitBounds.height,
      portraitChildren: portrait.childElementCount,
      portraitImageComplete: portraitImage.complete,
      portraitImageNaturalWidth: portraitImage.naturalWidth,
      portraitImageNaturalHeight: portraitImage.naturalHeight,
      profileOverflow: profile.scrollHeight - profile.clientHeight,
      syntheticWheelPrevented: wheel.defaultPrevented,
    };
  });
  check(
    Math.abs(end.scrollY - beforeScrollY) <= 1,
    `${viewport.label}: prelude end moved the page ${JSON.stringify(end)}`,
  );
  check(end.profileOpacity > 0.99 && end.profileVisibility === "visible", `${viewport.label}: personal landing is not visible ${JSON.stringify(end)}`);
  check(end.preludeOpacity < 0.01, `${viewport.label}: prelude did not fade away ${JSON.stringify(end)}`);
  check(Math.abs(end.profileTop) <= 1 && end.profileBottom >= end.viewportHeight - 1, `${viewport.label}: personal landing does not fill the viewport ${JSON.stringify(end)}`);
  check(end.archiveTop >= end.viewportHeight - 2, `${viewport.label}: archive replaced the real first page ${JSON.stringify(end)}`);
  check(
    end.portraitWidth > 0
      && end.portraitHeight > 0
      && end.portraitChildren === 2
      && end.portraitImageComplete
      && end.portraitImageNaturalWidth === 940
      && end.portraitImageNaturalHeight === 940,
    `${viewport.label}: profile portrait is invalid ${JSON.stringify(end)}`,
  );
  check(end.profileOverflow <= 1, `${viewport.label}: personal landing overflows vertically by ${end.profileOverflow}px`);
  check(!end.syntheticWheelPrevented, `${viewport.label}: landing did not release fresh user input`);

  await page.mouse.wheel(0, Math.min(viewport.height * 0.9, 720));
  await page.waitForFunction(() => window.scrollY > 0);
  check(await page.evaluate(() => window.scrollY > 0), `${viewport.label}: a fresh wheel did not leave the personal landing`);
}

async function verifyHeroCopy(page, viewport) {
  const intro = page.locator(".hero-intro");
  check(await intro.count() === 1, `${viewport.label}: hero introduction is missing`);
  const metrics = await intro.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const cue = document.querySelector(".scroll-cue").getBoundingClientRect();
    const contact = document.querySelector(".contact").getBoundingClientRect();
    const scrimBackgroundImage = getComputedStyle(document.querySelector(".stage-scrim")).backgroundImage;
    const profile = document.querySelector("[data-profile-landing]");
    return {
      text: element.textContent,
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      cueTop: cue.top,
      contactBottom: contact.bottom,
      scrimBackgroundImage,
      profileText: profile.textContent,
      profileOpacity: Number.parseFloat(getComputedStyle(profile).opacity),
      profileVisibility: getComputedStyle(profile).visibility,
    };
  });
  check(metrics.text.includes("准备好了吗？"), `${viewport.label}: hero heading is missing`);
  check(metrics.text.includes("和我一起，穿过这道入口。"), `${viewport.label}: hero lead is missing`);
  check(metrics.profileText.includes("我是 Felix。"), `${viewport.label}: personal landing heading is missing`);
  check(metrics.profileText.includes("社群群主 · AI 创作者"), `${viewport.label}: personal landing role is missing`);
  check(metrics.profileText.includes("面向 AI 新手与进阶创作者"), `${viewport.label}: personal landing community introduction is missing`);
  check(metrics.profileText.includes("累计接单收入超过 7000 元"), `${viewport.label}: personal landing website experience is missing`);
  check(metrics.profileText.includes("个人履历不构成机构背书"), `${viewport.label}: personal landing attribution note is missing`);
  check(metrics.profileOpacity < 0.01 && metrics.profileVisibility === "hidden", `${viewport.label}: personal landing appears before the prelude`);
  check(metrics.left >= 0 && metrics.right <= viewport.width, `${viewport.label}: hero introduction overflows horizontally`);
  check(metrics.top >= metrics.contactBottom, `${viewport.label}: hero introduction overlaps the contact`);
  check(metrics.bottom <= metrics.cueTop, `${viewport.label}: hero introduction overlaps the scroll cue`);
  check(metrics.scrimBackgroundImage !== "none", `${viewport.label}: hero stage scrim has no gradient`);
}

async function moveToGallery(page) {
  await page.locator("#image-archive").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const section = document.querySelector("#image-archive");
    window.scrollTo({
      top: section.getBoundingClientRect().top + window.scrollY,
      behavior: "instant",
    });
  });
  await page.waitForFunction(() => document.querySelector(".drift-wall")?.dataset.running === "true");
}

async function verifyGallery(page, viewport) {
  await moveToGallery(page);
  const geometry = await page.evaluate(() => {
    const root = document.querySelector(".drift-wall");
    const frame = document.querySelector(".gallery-wall-frame");
    const styles = getComputedStyle(root);
    const title = document.querySelector("#gallery-title").getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    return {
      columns: root.querySelectorAll(":scope .drift-wall__col").length,
      links: root.querySelectorAll(".drift-wall__links a").length,
      interactiveTiles: root.querySelectorAll("a.drift-wall__tile").length,
      tileWidth: styles.getPropertyValue("--dw-tile-w").trim(),
      tileHeight: styles.getPropertyValue("--dw-tile-h").trim(),
      gap: styles.getPropertyValue("--dw-gap").trim(),
      frameHeight: frameBox.height,
      titleInside: title.left >= -1 && title.right <= window.innerWidth + 1,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      firstTransform: getComputedStyle(root.querySelector(".drift-wall__track")).transform,
    };
  });
  check(geometry.columns === 4, `${viewport.label}: expected 4 columns, got ${geometry.columns}`);
  check(geometry.links === 0, `${viewport.label}: placeholder gallery exposed ${geometry.links} false links`);
  check(geometry.interactiveTiles === 0, `${viewport.label}: placeholder gallery exposed ${geometry.interactiveTiles} interactive tiles`);
  check(geometry.tileWidth === "184px", `${viewport.label}: tile width is ${geometry.tileWidth}`);
  check(geometry.tileHeight === "136px", `${viewport.label}: tile height is ${geometry.tileHeight}`);
  check(geometry.gap === "12px", `${viewport.label}: gap is ${geometry.gap}`);
  check(geometry.frameHeight > 0 && geometry.frameHeight <= 600, `${viewport.label}: invalid wall height`);
  check(geometry.titleInside, `${viewport.label}: gallery title leaves the viewport`);
  check(geometry.overflow <= 1, `${viewport.label}: horizontal overflow is ${geometry.overflow}px`);

  await page.waitForFunction(
    (start) => getComputedStyle(document.querySelector(".drift-wall__track")).transform !== start,
    geometry.firstTransform,
  );
  const movedTransform = await page.locator(".drift-wall__track").first().evaluate(
    (track) => getComputedStyle(track).transform,
  );
  const runningState = await page.locator(".drift-wall").getAttribute("data-running");
  check(
    movedTransform !== geometry.firstTransform,
    `${viewport.label}: wall did not drift running=${runningState} start=${geometry.firstTransform} end=${movedTransform}`,
  );

  const hitPoint = await page.evaluate(() => {
    const root = document.querySelector(".drift-wall");
    const box = root.getBoundingClientRect();
    for (let y = Math.max(0, box.top) + 8; y < Math.min(innerHeight, box.bottom); y += 16) {
      for (let x = Math.max(0, box.left) + 8; x < Math.min(innerWidth, box.right); x += 16) {
        const tile = document.elementFromPoint(x, y)?.closest?.("[data-tile-id]");
        if (tile) return { x, y, id: tile.dataset.tileId };
      }
    }
    return null;
  });
  check(Boolean(hitPoint), `${viewport.label}: no painted tile accepts pointer input`);
  await page.mouse.move(hitPoint.x, hitPoint.y);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-tile-id="${id}"]`)?.classList.contains("is-active"),
    hitPoint.id,
  );
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => !document.querySelector(".drift-wall__tile.is-active"));

  const failedTile = page.locator(`[data-tile-id="${hitPoint.id}"]`);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-tile-id="${id}"] img`)?.classList.contains("is-loaded"),
    hitPoint.id,
  );
  await failedTile.locator("img").evaluate((image) => {
    image.dispatchEvent(new Event("error"));
  });
  await page.waitForFunction((id) => {
    const tile = document.querySelector(`[data-tile-id="${id}"]`);
    const fallback = tile?.querySelector(".drift-wall__fallback");
    return tile
      && !tile.querySelector("img")
      && fallback
      && !fallback.classList.contains("is-hidden")
      && fallback.getAttribute("aria-hidden") !== "true"
      && Number.parseFloat(getComputedStyle(fallback).opacity) > 0;
  }, hitPoint.id);
  check(true, `${viewport.label}: failed image fallback is visible`);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForFunction(() => document.querySelector(".drift-wall")?.dataset.running === "false");
  const pausedBefore = await page.locator(".drift-wall__track").first().evaluate(
    (track) => getComputedStyle(track).transform,
  );
  await page.waitForTimeout(320);
  const pausedAfter = await page.locator(".drift-wall__track").first().evaluate(
    (track) => getComputedStyle(track).transform,
  );
  check(pausedAfter === pausedBefore, `${viewport.label}: offscreen wall keeps animating`);
}

async function readScrollExpandState(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".scroll-expand");
    const stage = root.querySelector(".scroll-expand__stage");
    const content = root.querySelector(".scroll-expand__content");
    const copyLines = [...root.querySelectorAll(".scroll-expand__copy-line")];
    const status = root.querySelector(".scroll-expand__status");
    const media = root.querySelector(".scroll-expand__media");
    const rootStyles = getComputedStyle(root);
    const stageBox = stage.getBoundingClientRect();
    const video = document.querySelector("#wormhole-video");
    return {
      progress: Number.parseFloat(root.dataset.progress),
      rootHeight: root.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      nestedOverflow: root.scrollHeight - root.clientHeight,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      stageTop: stageBox.top,
      stageBottom: stageBox.bottom,
      insetBlock: Number.parseFloat(rootStyles.getPropertyValue("--expand-inset-block")),
      insetInline: Number.parseFloat(rootStyles.getPropertyValue("--expand-inset-inline")),
      radius: Number.parseFloat(rootStyles.getPropertyValue("--expand-radius")),
      scale: Number.parseFloat(rootStyles.getPropertyValue("--expand-media-scale")),
      scrimOpacity: Number.parseFloat(rootStyles.getPropertyValue("--expand-scrim-opacity")),
      contentOpacity: Number.parseFloat(getComputedStyle(content).opacity),
      text: content.textContent,
      copyLineRects: copyLines.map((line) => {
        const range = document.createRange();
        range.selectNodeContents(line);
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        return {
          count: rects.length,
          top: rects[0]?.top ?? Number.NaN,
        };
      }),
      statusText: status.textContent.trim(),
      statusHidden: status.hidden,
      mediaState: root.dataset.mediaState,
      mediaPresent: Boolean(media),
      heroMuted: video.muted,
      heroDefaultMuted: video.defaultMuted,
      heroVolume: video.volume,
      heroPaused: video.paused,
      heroRatio: video.duration > 0 ? video.currentTime / video.duration : 0,
    };
  });
}

async function verifyScrollExpand(page, viewport) {
  await page.locator(".scroll-expand").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const root = document.querySelector(".scroll-expand");
    return root?.dataset.progress === "1.0000"
      && root.dataset.running === "false"
      && root.dataset.mediaState === "ready";
  }, undefined, { polling: "raf", timeout: 5000 });
  const stage = await readScrollExpandState(page);
  check(
    Math.abs((stage.rootHeight / stage.viewportHeight) - 1) < 0.02,
    `${viewport.label}: static creation handoff is ${stage.rootHeight / stage.viewportHeight} viewports`,
  );
  check(
    Math.abs(stage.insetBlock) < 0.05 && Math.abs(stage.insetInline) < 0.05,
    `${viewport.label}: static creation handoff is not full bleed block=${stage.insetBlock} inline=${stage.insetInline}`,
  );
  check(Math.abs(stage.radius) < 0.05, `${viewport.label}: static creation handoff radius is ${stage.radius}`);
  check(Math.abs(stage.scale - 1) < 0.005, `${viewport.label}: static creation media scale is ${stage.scale}`);
  check(Math.abs(stage.scrimOpacity - 0.45) < 0.01, `${viewport.label}: static creation scrim is ${stage.scrimOpacity}`);
  check(stage.contentOpacity > 0.98, `${viewport.label}: creation copy opacity is ${stage.contentOpacity}`);
  check(stage.documentOverflow <= 1, `${viewport.label}: ScrollExpand causes horizontal overflow`);
  check(stage.nestedOverflow <= 1, `${viewport.label}: window mode exposes a nested scrollbar`);
  check(stage.text.includes("在这里，做自己的创世主"), `${viewport.label}: final heading is missing`);
  check(stage.text.includes("思路打开，把重复交给 AI，把想法留给自己。"), `${viewport.label}: final body is missing`);
  check(
    stage.copyLineRects.length === 2
      && stage.copyLineRects.every((line) => line.count === 1)
      && (viewport.width < 768
        ? Math.abs(stage.copyLineRects[0].top - stage.copyLineRects[1].top) > 1
        : Math.abs(stage.copyLineRects[0].top - stage.copyLineRects[1].top) <= 1),
    `${viewport.label}: responsive body line treatment is incorrect`,
  );
  check(
    !stage.heroMuted && !stage.heroDefaultMuted && stage.heroVolume > 0 && stage.heroPaused,
    `${viewport.label}: third section changed Hero BGM configuration ${JSON.stringify({
      muted: stage.heroMuted,
      defaultMuted: stage.heroDefaultMuted,
      volume: stage.heroVolume,
      paused: stage.heroPaused,
    })}`,
  );
  check(stage.heroRatio > 0.94, `${viewport.label}: hero did not remain at its final frame`);

  await page.locator(".scroll-expand__media").evaluate((image) => image.dispatchEvent(new Event("error")));
  await page.waitForFunction(() => document.querySelector(".scroll-expand")?.dataset.mediaState === "error");
  const failed = await readScrollExpandState(page);
  check(!failed.mediaPresent, `${viewport.label}: failed ScrollExpand image remains mounted`);
  check(failed.contentOpacity > 0.98, `${viewport.label}: media failure hides the final copy`);
  check(!failed.statusHidden, `${viewport.label}: media failure status remains hidden`);
  check(
    failed.statusText === "媒体暂时无法加载，介绍内容仍可阅读。",
    `${viewport.label}: media failure status is not localized`,
  );
}

async function moveToProjectShowcase(page) {
  await page.locator("[data-project-showcase]").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".project-card")];
    const card = cards.find((candidate) => candidate.querySelector(".project-card__video")) ?? cards[0];
    const top = card.getBoundingClientRect().top + window.scrollY;
    const target = Math.max(0, top - ((window.innerHeight - card.offsetHeight) / 2));
    window.scrollTo({ top: target, behavior: "instant" });
  });
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll(".project-card")];
    const card = cards.find((candidate) => candidate.querySelector(".project-card__video")) ?? cards[0];
    if (!card) return false;
    const box = card.getBoundingClientRect();
    const visibleHeight = Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0));
    return box.height > 0 && (visibleHeight / box.height) >= 0.35;
  }, undefined, { polling: "raf", timeout: 5000 });
}

async function readProjectShowcaseLayout(page) {
  return page.evaluate(() => {
    const section = document.querySelector("[data-project-showcase]");
    const grid = section?.querySelector(".project-bento-grid");
    const cards = [...section?.querySelectorAll(".project-card") ?? []];
    const surfaces = [...section?.querySelectorAll(".project-card__link") ?? []];
    const links = [...section?.querySelectorAll("a.project-card__link") ?? []];
    const readyLinks = [...section?.querySelectorAll('a.project-card__link[data-link-state="ready"]') ?? []];
    const pendingSurfaces = [...section?.querySelectorAll('.project-card__link[data-link-state="pending"]') ?? []];
    const videos = [...section?.querySelectorAll(".project-card__video") ?? []];
    const images = [...section?.querySelectorAll(".project-card__image") ?? []];
    const portfolioEntries = [...section?.querySelectorAll(".portfolio-entry") ?? []];
    const portfolioGateways = [...section?.querySelectorAll(".portfolio-gateway") ?? []];
    const portfolioEntry = portfolioEntries[0];
    const gateway = portfolioGateways[0];
    const horizontalBounds = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right };
    };
    const fullBounds = (element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      sections: document.querySelectorAll("[data-project-showcase]").length,
      cards: cards.length,
      surfaces: surfaces.length,
      links: links.length,
      readyLinks: readyLinks.length,
      pendingSurfaces: pendingSurfaces.length,
      videos: videos.length,
      images: images.length,
      linkProps: readyLinks.map((link) => ({
        href: link.getAttribute("href"),
        target: link.getAttribute("target"),
        rel: link.getAttribute("rel"),
        linkState: link.dataset.linkState,
      })),
      portfolioEntries: portfolioEntries.length,
      portfolioEntry: portfolioEntry ? {
        href: portfolioEntry.getAttribute("href"),
        bounds: horizontalBounds(portfolioEntry),
        visible: (() => {
          const box = portfolioEntry.getBoundingClientRect();
          const style = getComputedStyle(portfolioEntry);
          return style.display !== "none"
            && style.visibility !== "hidden"
            && style.visibility !== "collapse"
            && Number.parseFloat(style.opacity) > 0
            && box.width > 0
            && box.height > 0;
        })(),
      } : null,
      gateway: gateway ? {
        top: gateway.getBoundingClientRect().top,
        title: gateway.querySelector(".portfolio-gateway__title")?.textContent.trim(),
        cta: gateway.querySelector(".portfolio-entry")?.textContent.trim(),
        image: {
          currentSrc: gateway.querySelector(".portfolio-gateway__image")?.currentSrc,
          objectFit: getComputedStyle(gateway.querySelector(".portfolio-gateway__image")).objectFit,
          objectPosition: getComputedStyle(gateway.querySelector(".portfolio-gateway__image")).objectPosition,
        },
        columns: getComputedStyle(gateway).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
        overflow: gateway.scrollWidth - gateway.clientWidth,
        order: grid?.compareDocumentPosition(gateway),
        coverage: {
          portal: fullBounds(gateway),
          photo: fullBounds(gateway.querySelector(".portfolio-gateway__photo")),
          image: fullBounds(gateway.querySelector(".portfolio-gateway__image")),
        },
        bounds: {
          portal: horizontalBounds(gateway),
          photo: horizontalBounds(gateway.querySelector(".portfolio-gateway__photo")),
          cta: horizontalBounds(gateway.querySelector(".portfolio-entry")),
        },
      } : null,
      portfolioGateways: portfolioGateways.length,
      grid: {
        bottom: grid.getBoundingClientRect().bottom,
      },
      columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cardBounds: cards.map(horizontalBounds),
      surfaceBounds: surfaces.map(horizontalBounds),
      videoProps: videos.map((video) => ({
        muted: video.muted,
        defaultMuted: video.defaultMuted,
        volume: video.volume,
        loop: video.loop,
        inline: video.playsInline,
        preload: video.preload,
        controls: video.controls,
        autoplay: video.autoplay,
        source: video.currentSrc || video.src,
        poster: video.poster,
      })),
      imageProps: images.map((image) => {
        const media = image.closest(".project-card__media");
        const imageBox = image.getBoundingClientRect();
        const mediaBox = media.getBoundingClientRect();
        return {
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          widthAttribute: image.getAttribute("width"),
          heightAttribute: image.getAttribute("height"),
          source: image.currentSrc || image.src,
          objectFit: getComputedStyle(image).objectFit,
          objectPosition: getComputedStyle(image).objectPosition,
          containedByMedia: imageBox.left >= mediaBox.left - 1
            && imageBox.right <= mediaBox.right + 1
            && imageBox.top >= mediaBox.top - 1
            && imageBox.bottom <= mediaBox.bottom + 1,
        };
      }),
    };
  });
}

function checkPortfolioGatewayLayout(layout, viewport) {
  const { gateway } = layout;
  check(layout.portfolioGateways === 1 && gateway, `${viewport.label}: expected one portfolio gateway`);
  check(gateway.order & 4, `${viewport.label}: portfolio gateway must follow the project grid`);
  check(
    gateway.top >= layout.grid.bottom - 1,
    `${viewport.label}: portfolio gateway overlaps the project grid ${JSON.stringify({ grid: layout.grid, gateway })}`,
  );
  check(gateway.title === "影像馆", `${viewport.label}: gateway title is ${gateway.title}`);
  check(gateway.cta === "进入作品影像馆", `${viewport.label}: gateway CTA is ${gateway.cta}`);
  check(
    Boolean(gateway.image.currentSrc) && new URL(gateway.image.currentSrc).origin === new URL(baseUrl).origin,
    `${viewport.label}: gateway image is not local ${gateway.image.currentSrc}`,
  );
  check(
    gateway.columns === (viewport.width < 768 ? 1 : 2),
    `${viewport.label}: gateway grid has ${gateway.columns} columns`,
  );
  check(gateway.image.objectFit === "cover", `${viewport.label}: gateway image object-fit is ${gateway.image.objectFit}`);
  check(gateway.image.objectPosition === "50% 50%", `${viewport.label}: gateway image object-position is ${gateway.image.objectPosition}`);
  for (const layer of ["photo", "image"]) {
    const portal = gateway.coverage.portal;
    const bounds = gateway.coverage[layer];
    check(
      Math.abs(bounds.left - portal.left) <= 1
        && Math.abs(bounds.right - portal.right) <= 1
        && Math.abs(bounds.top - portal.top) <= 1
        && Math.abs(bounds.bottom - portal.bottom) <= 1,
      `${viewport.label}: gateway ${layer} does not cover the portal ${JSON.stringify({ portal, bounds })}`,
    );
  }
  check(gateway.overflow <= 1, `${viewport.label}: gateway horizontal overflow is ${gateway.overflow}px`);
  for (const [name, bounds] of [
    ["portal", gateway.bounds.portal],
    ["photo", gateway.bounds.photo],
    ["cta", gateway.bounds.cta],
  ]) {
    check(
      bounds.left >= -1 && bounds.right <= viewport.width + 1,
      `${viewport.label}: gateway ${name} escapes the viewport ${JSON.stringify(bounds)}`,
    );
  }
}

function checkProjectShowcaseLayout(layout, viewport) {
  check(layout.sections === 1, `${viewport.label}: expected one Project Showcase section, got ${layout.sections}`);
  check(layout.cards === 8, `${viewport.label}: expected eight project cards, got ${layout.cards}`);
  check(layout.surfaces === 8, `${viewport.label}: expected eight project surfaces, got ${layout.surfaces}`);
  check(layout.links === 8 && layout.readyLinks === 8, `${viewport.label}: expected eight ready project links, got ${layout.links}/${layout.readyLinks}`);
  check(layout.pendingSurfaces === 0, `${viewport.label}: expected no pending project surfaces, got ${layout.pendingSurfaces}`);
  check(layout.videos === 0, `${viewport.label}: expected no project videos, got ${layout.videos}`);
  check(layout.images === 8, `${viewport.label}: expected eight project images, got ${layout.images}`);
  for (const [index, readyLink] of layout.linkProps.entries()) {
    const relTokens = new Set(readyLink?.rel?.split(/\s+/).filter(Boolean));
    check(
      readyLink?.href === expectedProjectLinks[index]
        && readyLink.target === "_blank"
        && readyLink.linkState === "ready"
        && relTokens.has("noopener")
        && relTokens.has("noreferrer"),
      `${viewport.label}: project ${index + 1} link contract is unsafe or incorrect ${JSON.stringify(readyLink)}`,
    );
  }
  check(layout.portfolioEntries === 1, `${viewport.label}: expected one portfolio entry, got ${layout.portfolioEntries}`);
  check(
    layout.portfolioEntry.href === "/portfolio/index.html",
    `${viewport.label}: portfolio entry href is ${layout.portfolioEntry?.href}`,
  );
  check(layout.portfolioEntry.visible, `${viewport.label}: portfolio entry is not visible`);
  check(
    layout.portfolioEntry.bounds.left >= 0 && layout.portfolioEntry.bounds.right <= viewport.width,
    `${viewport.label}: portfolio entry escapes the viewport ${JSON.stringify(layout.portfolioEntry.bounds)}`,
  );
  check(
    layout.columns === (viewport.width < 768 ? 1 : 2),
    `${viewport.label}: project grid has ${layout.columns} columns`,
  );
  check(layout.overflow <= 1, `${viewport.label}: Project Showcase horizontal overflow is ${layout.overflow}px`);
  for (const [index, bounds] of layout.cardBounds.entries()) {
    check(
      bounds.left >= -1 && bounds.right <= viewport.width + 1,
      `${viewport.label}: project card ${index + 1} escapes the viewport ${JSON.stringify(bounds)}`,
    );
  }
  for (const [index, bounds] of layout.surfaceBounds.entries()) {
    check(
      bounds.left >= -1 && bounds.right <= viewport.width + 1,
      `${viewport.label}: project surface ${index + 1} escapes the viewport ${JSON.stringify(bounds)}`,
    );
  }
  for (const [index, video] of layout.videoProps.entries()) {
    check(
      !video.muted && !video.defaultMuted && video.volume > 0,
      `${viewport.label}: project video ${index + 1} BGM is disabled ${JSON.stringify(video)}`,
    );
    check(video.loop, `${viewport.label}: project video ${index + 1} does not loop`);
    check(video.inline, `${viewport.label}: project video ${index + 1} is not inline`);
    check(video.preload === "metadata", `${viewport.label}: project video ${index + 1} preload is ${video.preload}`);
    check(!video.controls && !video.autoplay, `${viewport.label}: project video ${index + 1} exposes controls or autoplay`);
    check(
      /sailing-august-9-[A-Za-z0-9_-]+\.mp4(?:$|\?)/.test(video.source),
      `${viewport.label}: project video ${index + 1} source is ${video.source}`,
    );
  }
  for (const [index, previewImage] of layout.imageProps.entries()) {
    const expected = expectedProjectImages[index];
    check(
      previewImage?.complete
        && previewImage.naturalWidth === expected.width
        && previewImage.naturalHeight === expected.height
        && previewImage.widthAttribute === String(expected.width)
        && previewImage.heightAttribute === String(expected.height),
      `${viewport.label}: project ${index + 1} preview image did not load at its declared dimensions ${JSON.stringify(previewImage)}`,
    );
    check(
      new URL(previewImage.source).origin === new URL(baseUrl).origin
        && new RegExp(`${expected.file}-[A-Za-z0-9_-]+\\.(?:jpg|png)(?:$|\\?)`).test(previewImage.source),
      `${viewport.label}: project ${index + 1} preview is not its local hashed asset ${previewImage.source}`,
    );
    check(
      previewImage.objectFit === expected.fit
        && previewImage.objectPosition === expected.position
        && previewImage.containedByMedia,
      `${viewport.label}: project ${index + 1} preview framing is incorrect ${JSON.stringify(previewImage)}`,
    );
  }
}

async function verifyPortfolioGateway(page, viewport, invalidGatewayPhoto404) {
  const layout = await readProjectShowcaseLayout(page);
  checkPortfolioGatewayLayout(layout, viewport);

  const gatewayImage = page.locator(".portfolio-gateway__image");
  const gatewayPhoto = page.locator(".portfolio-gateway__photo");
  const before = await gatewayPhoto.boundingBox();
  check(Boolean(before) && before.width > 0 && before.height > 0, `${viewport.label}: gateway backdrop has no dimensions before error`);
  try {
    await page.waitForFunction(() => {
      const image = document.querySelector(".portfolio-gateway__image");
      return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    }, undefined, { polling: "raf", timeout: 5000 });
  } catch (imageLoadError) {
    const currentSrc = await gatewayImage.evaluate((image) => image.currentSrc);
    throw new Error(`${viewport.label}: gateway image did not load before error probe ${currentSrc}`, { cause: imageLoadError });
  }
  const initialGatewayImage = await gatewayImage.evaluate((image) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    currentSrc: image.currentSrc,
  }));
  check(
    initialGatewayImage.complete && initialGatewayImage.naturalWidth > 0 && initialGatewayImage.naturalHeight > 0,
    `${viewport.label}: gateway image did not load before error probe ${initialGatewayImage.currentSrc}`,
  );
  await gatewayImage.evaluate((image) => { image.src = "/invalid-gateway-photo.svg"; });
  await page.waitForFunction(() => {
    const image = document.querySelector(".portfolio-gateway__image");
    return image?.complete && image.naturalWidth === 0;
  }, undefined, { polling: "raf", timeout: 5000 });
  check(
    invalidGatewayPhoto404.received === 1,
    `${viewport.label}: gateway error probe did not receive exactly one local 404 ${JSON.stringify(invalidGatewayPhoto404)}`,
  );
  const fallback = await gatewayPhoto.evaluate((photo) => {
    const label = photo.querySelector(".portfolio-gateway__photo-fallback");
    const labelStyle = label ? getComputedStyle(label) : null;
    const photoBox = photo.getBoundingClientRect();
    const labelBox = label?.getBoundingClientRect();
    return {
      text: label?.textContent.trim(),
      visible: Boolean(labelStyle
        && labelStyle.display !== "none"
        && labelStyle.visibility !== "hidden"
        && Number.parseFloat(labelStyle.opacity) > 0
        && labelBox.width > 0
        && labelBox.height > 0),
      width: photoBox.width,
      height: photoBox.height,
    };
  });
  check(
    fallback.text === "影像馆人物写真背景" && fallback.visible,
    `${viewport.label}: gateway backdrop fallback is not visible ${JSON.stringify(fallback)}`,
  );
  check(
    Math.abs(fallback.width - before.width) <= 1 && Math.abs(fallback.height - before.height) <= 1,
    `${viewport.label}: gateway backdrop collapsed after error ${JSON.stringify({ before, fallback })}`,
  );
}

async function verifyProjectShowcase(page, viewport, invalidGatewayPhoto404) {
  await moveToProjectShowcase(page);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll(".project-card__image")];
    return images.length === 6
      && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
  }, undefined, { polling: "raf", timeout: 5000 });
  checkProjectShowcaseLayout(await readProjectShowcaseLayout(page), viewport);
  await verifyPortfolioGateway(page, viewport, invalidGatewayPhoto404);

  await page.waitForFunction(() => {
    const video = document.querySelector(".project-card__video");
    return video && video.readyState >= HTMLMediaElement.HAVE_METADATA;
  }, undefined, { polling: "raf", timeout: 5000 });
  try {
    await page.waitForFunction(() => {
      const videos = [...document.querySelectorAll(".project-card__video")];
      return videos.some((video) => !video.paused && video.currentTime > 0);
    }, undefined, { polling: "raf", timeout: 5000 });
  } catch (playbackError) {
    const [validPosters, probe] = await Promise.all([
      page.locator(".project-card__video").evaluateAll((videos) => videos.every((video) => (
        video.paused
        && video.error === null
        && video.poster.length > 0
        && getComputedStyle(video).display !== "none"
      ))),
      readProjectVideoPlayProbe(page),
    ]);
    const explicitPolicyFailure = probe.attempts.length > 0
      && probe.attempts.some(({ status }) => status === "rejected" || status === "threw");
    check(
      validPosters && explicitPolicyFailure,
      `${viewport.label}: visible project video did not play without an explicit policy failure ${JSON.stringify(probe)}: ${playbackError.message}`,
    );
  }

  const playbackProbe = await readProjectVideoPlayProbe(page);
  check(playbackProbe.attempts.length > 0, `${viewport.label}: no project video play attempt was observed`);
  check(
    playbackProbe.attempts.every((attempt) => (
      attempt.muted === false
      && attempt.defaultMuted === false
      && attempt.volume > 0
    )),
    `${viewport.label}: a project video play attempt did not carry BGM ${JSON.stringify(playbackProbe)}`,
  );

  const readyProjectLinks = page.locator('a.project-card__link[data-link-state="ready"]');
  const portfolioEntry = page.locator(".portfolio-entry");
  const projectShowcase = page.locator("[data-project-showcase]");
  await projectShowcase.focus();
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => document.activeElement === document.querySelector('a.project-card__link[data-link-state="ready"]'),
    undefined,
    { polling: "raf", timeout: 2000 },
  );
  check(
    await readyProjectLinks.first().evaluate((link) => link === document.activeElement && link.matches(":focus-visible")),
    `${viewport.label}: first Tab did not focus the ready Mufeng project link`,
  );
  for (let index = 1; index < expectedProjectLinks.length; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForFunction(
      (projectIndex) => document.activeElement === document.querySelectorAll('a.project-card__link[data-link-state="ready"]')[projectIndex],
      index,
      { polling: "raf", timeout: 2000 },
    );
  }
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => document.activeElement === document.querySelector(".portfolio-entry"),
    undefined,
    { polling: "raf", timeout: 2000 },
  );
  const entryFocus = await portfolioEntry.evaluate((entry) => {
    const box = entry.getBoundingClientRect();
    const style = getComputedStyle(entry);
    const probe = document.createElement("span");
    probe.style.color = "var(--color-text)";
    document.body.append(probe);
    const expectedColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      active: entry === document.activeElement,
      focusVisible: entry.matches(":focus-visible"),
      color: style.color,
      expectedColor,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineStyle: style.outlineStyle,
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
    };
  });
  check(entryFocus.active && entryFocus.focusVisible, `${viewport.label}: portfolio entry does not receive focus-visible`);
  check(
    entryFocus.color === entryFocus.expectedColor,
    `${viewport.label}: portfolio entry final color ${entryFocus.color} does not match --color-text ${entryFocus.expectedColor}`,
  );
  check(
    entryFocus.outlineStyle !== "none" && entryFocus.outlineWidth > 0 && entryFocus.outlineOffset > 0,
    `${viewport.label}: portfolio entry focus outline or offset is not visible ${JSON.stringify(entryFocus)}`,
  );
  check(
    entryFocus.left >= 0 && entryFocus.right <= viewport.width,
    `${viewport.label}: focused portfolio entry escapes the viewport ${JSON.stringify(entryFocus)}`,
  );
  const entryOutlineExtent = entryFocus.outlineWidth + Math.max(0, entryFocus.outlineOffset);
  check(
    entryFocus.left - entryOutlineExtent >= -1
      && entryFocus.right + entryOutlineExtent <= viewport.width + 1
      && entryFocus.top - entryOutlineExtent >= -1
      && entryFocus.bottom + entryOutlineExtent <= viewport.height + 1,
    `${viewport.label}: portfolio entry focus outline escapes the viewport ${JSON.stringify(entryFocus)}`,
  );
  await portfolioEntry.click({ trial: true });

  if (viewport.width === 1440) {
    const desktopCard = page.locator(".project-card-container").last();
    await desktopCard.scrollIntoViewIfNeeded();
    await waitForAnimationFrames(page);
    const interaction = await desktopCard.evaluate((container) => {
      const box = container.getBoundingClientRect();
      return { x: box.left + (box.width * 0.75), y: box.top + (box.height * 0.25) };
    });
    await page.mouse.move(interaction.x, interaction.y);
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll(".project-card-container");
      const container = cards.item(cards.length - 1);
      const style = getComputedStyle(container);
      return Math.abs(Number.parseFloat(style.getPropertyValue("--project-rotate-x"))) > 0.1
        && Math.abs(Number.parseFloat(style.getPropertyValue("--project-rotate-y"))) > 0.1;
    }, undefined, { polling: "raf", timeout: 2000 });
    const depth = await desktopCard.evaluate((container) => {
      const style = getComputedStyle(container);
      const body = container.querySelector(".project-card-body");
      const content = container.querySelector(".project-card__content");
      return {
        rotateX: Number.parseFloat(style.getPropertyValue("--project-rotate-x")),
        rotateY: Number.parseFloat(style.getPropertyValue("--project-rotate-y")),
        bodyTransform: getComputedStyle(body).transform,
        contentTransform: getComputedStyle(content).transform,
      };
    });
    check(Math.abs(depth.rotateX) <= 5 && Math.abs(depth.rotateY) <= 5, `desktop: project rotation is unbounded ${JSON.stringify(depth)}`);
    check(depth.bodyTransform !== "none" && depth.contentTransform !== "none", "desktop: project depth did not activate");
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll(".project-card-container");
      const style = getComputedStyle(cards.item(cards.length - 1));
      return Math.abs(Number.parseFloat(style.getPropertyValue("--project-rotate-x"))) < 0.01
        && Math.abs(Number.parseFloat(style.getPropertyValue("--project-rotate-y"))) < 0.01;
    }, undefined, { polling: "raf", timeout: 2000 });
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  try {
    await page.waitForFunction(() => {
      const videos = [...document.querySelectorAll(".project-card__video")];
      return videos.length === 2 && videos.every((video) => video.paused);
    }, undefined, { polling: "raf", timeout: 5000 });
  } catch (pauseError) {
    const states = await page.locator(".project-card__video").evaluateAll((videos) => videos.map((video) => {
      const box = video.getBoundingClientRect();
      return { paused: video.paused, currentTime: video.currentTime, top: box.top, bottom: box.bottom };
    }));
    throw new Error(`${viewport.label}: offscreen project videos did not all pause ${JSON.stringify(states)}`, { cause: pauseError });
  }

  await moveToProjectShowcase(page);
  const firstVideoCard = page.locator(".project-card").filter({ has: page.locator(".project-card__video") }).first();
  await firstVideoCard.evaluate((card) => { card.dataset.browserErrorTarget = "true"; });
  const failedVideoCard = page.locator('[data-browser-error-target="true"]');
  await failedVideoCard.locator(".project-card__video").evaluate((video) => video.dispatchEvent(new Event("error")));
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-browser-error-target="true"]');
    const fallback = card?.querySelector(".project-card__fallback");
    if (!card || card.querySelector(".project-card__video") || !fallback) return false;
    const style = getComputedStyle(fallback);
    const box = fallback.getBoundingClientRect();
    const horizontalIntersection = Math.min(box.right, innerWidth) - Math.max(box.left, 0);
    const verticalIntersection = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && style.visibility !== "collapse"
      && Number.parseFloat(style.opacity) > 0
      && box.width > 0
      && box.height > 0
      && horizontalIntersection > 0
      && verticalIntersection > 0;
  }, undefined, { polling: "raf", timeout: 5000 });
  const failedCard = await failedVideoCard.evaluate((card) => ({
    fallback: card.querySelector(".project-card__fallback")?.textContent.trim(),
    title: Boolean(card.querySelector("h3")),
    description: Boolean(card.querySelector(".project-card__description")),
    surface: Boolean(card.querySelector('.project-card__link[data-link-state="pending"]')),
    link: Boolean(card.querySelector("a.project-card__link")),
    remainingCards: document.querySelectorAll(".project-card").length,
    remainingVideos: document.querySelectorAll(".project-card__video").length,
    remainingImages: document.querySelectorAll(".project-card__image").length,
    remainingLinks: document.querySelectorAll("a.project-card__link").length,
  }));
  check(
    failedCard.fallback === projectMediaFallbackText,
    `${viewport.label}: project video fallback is not visible: ${JSON.stringify(failedCard.fallback)}`,
  );
  check(
    failedCard.title && failedCard.description && failedCard.surface && !failedCard.link,
    `${viewport.label}: failed project card lost its honest pending state`,
  );
  check(
    failedCard.remainingCards === 8
      && failedCard.remainingVideos === 1
      && failedCard.remainingImages === 6
      && failedCard.remainingLinks === 6,
    `${viewport.label}: media failure damaged sibling cards ${JSON.stringify(failedCard)}`,
  );
}

async function verifyReducedMotionProjectShowcase(page) {
  const probeBefore = await readProjectVideoPlayProbe(page);
  await moveToProjectShowcase(page);
  await waitForAnimationFrames(page, 2);
  await page.waitForFunction(() => [...document.querySelectorAll(".project-card__video")].every((video) => video.paused), undefined, {
    polling: "raf",
    timeout: 5000,
  });
  const probeAfter = await readProjectVideoPlayProbe(page);
  const state = await page.evaluate(() => {
    const entries = [...document.querySelectorAll(".portfolio-entry")];
    const entry = entries[0];
    const inner = entry?.querySelector(".portfolio-entry__inner");
    const entryStyle = entry ? getComputedStyle(entry) : null;
    const entryBox = entry?.getBoundingClientRect();
    const photo = document.querySelector(".portfolio-gateway__photo");
    const photoStyle = photo ? getComputedStyle(photo) : null;
    return {
      videoCount: document.querySelectorAll(".project-card__video").length,
      imageCount: document.querySelectorAll(".project-card__image").length,
      videosPaused: [...document.querySelectorAll(".project-card__video")].every((video) => video.paused),
      resting: [...document.querySelectorAll(".project-card-body, .project-card-item")].every((element) => {
        const style = getComputedStyle(element);
        return style.transform === "none" && (style.transitionProperty === "none" || style.transitionDuration === "0s");
      }),
      surfaces: [...document.querySelectorAll(".project-card__link")].map((surface) => ({
        tag: surface.tagName,
        linkState: surface.dataset.linkState,
        tabIndex: surface.tabIndex,
      })),
      links: document.querySelectorAll("a.project-card__link").length,
      portfolioEntry: {
        count: entries.length,
        href: entry?.getAttribute("href"),
        visible: Boolean(entry && entryStyle
          && entryStyle.display !== "none"
          && entryStyle.visibility !== "hidden"
          && entryStyle.visibility !== "collapse"
          && Number.parseFloat(entryStyle.opacity) > 0
          && entryBox.width > 0
          && entryBox.height > 0),
        entryTransitionProperty: entryStyle?.transitionProperty,
        entryTransitionDuration: entryStyle?.transitionDuration,
        shineAnimationName: inner ? getComputedStyle(inner, "::before").animationName : null,
      },
      gateway: {
        photo: {
          transform: photoStyle?.transform,
          transitionDuration: photoStyle?.transitionDuration,
        },
      },
    };
  });
  check(
    state.videoCount === 2 && state.imageCount === 6 && state.videosPaused,
    `reduced-motion Project Showcase media state is incorrect ${JSON.stringify({
      videoCount: state.videoCount,
      imageCount: state.imageCount,
      videosPaused: state.videosPaused,
    })}`,
  );
  check(
    probeAfter.attempts.length === probeBefore.attempts.length,
    `reduced-motion Project Showcase invoked play ${JSON.stringify({ probeBefore, probeAfter })}`,
  );
  check(
    probeAfter.playingEvents === probeBefore.playingEvents,
    `reduced-motion Project Showcase emitted playing ${JSON.stringify({ probeBefore, probeAfter })}`,
  );
  check(state.resting, "reduced-motion Project Showcase transforms or transitions are active");
  const readySurfaces = state.surfaces.filter((surface) => surface.linkState === "ready");
  const pendingSurfaces = state.surfaces.filter((surface) => surface.linkState === "pending");
  check(
    state.links === 6
      && state.surfaces.length === 8
      && readySurfaces.length === 6
      && readySurfaces.every((surface) => surface.tag === "A" && surface.tabIndex === 0)
      && pendingSurfaces.length === 2
      && pendingSurfaces.every((surface) => surface.tag === "DIV" && surface.tabIndex === -1),
    `reduced-motion project surface states are incorrect ${JSON.stringify(state.surfaces)}`,
  );
  check(
    state.portfolioEntry.count === 1
      && state.portfolioEntry.href === "/portfolio/index.html"
      && state.portfolioEntry.visible,
    `reduced-motion portfolio entry is missing or hidden ${JSON.stringify(state.portfolioEntry)}`,
  );
  check(
    state.portfolioEntry.entryTransitionProperty === "none"
      || state.portfolioEntry.entryTransitionDuration.split(",").every((duration) => duration.trim() === "0s"),
    `reduced-motion portfolio entry transition is active ${JSON.stringify(state.portfolioEntry)}`,
  );
  check(
    state.portfolioEntry.shineAnimationName === "none",
    `reduced-motion portfolio shine animation is ${state.portfolioEntry.shineAnimationName}`,
  );
  check(state.gateway.photo.transform === "none", `reduced-motion gateway photo transform is ${state.gateway.photo.transform}`);
  check(
    state.gateway.photo.transitionDuration.split(",").every((duration) => duration.trim() === "0s"),
    `reduced-motion gateway photo transition is ${state.gateway.photo.transitionDuration}`,
  );
  const portfolioEntry = page.locator(".portfolio-entry");
  await portfolioEntry.focus();
  check(await portfolioEntry.evaluate((node) => node === document.activeElement), "reduced-motion portfolio entry cannot be focused");
  await portfolioEntry.click({ trial: true });
}

async function checkFocusedControl(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  check(await locator.isVisible(), `${label}: control is not visible`);
  await locator.focus();
  const focusState = await locator.evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return {
      active: node === document.activeElement,
      width: box.width,
      height: box.height,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  check(focusState.active, `${label}: control cannot receive focus`);
  check(focusState.width > 0 && focusState.height > 0, `${label}: control has no rendered box`);
  check(
    (focusState.outlineStyle !== "none" && focusState.outlineWidth !== "0px")
      || (focusState.boxShadow !== "none" && focusState.boxShadow !== ""),
    `${label}: focused control has no visible outline ${JSON.stringify(focusState)}`,
  );
}

async function checkHashTarget(page, hash, label) {
  await page.waitForFunction((expectedHash) => {
    const target = document.querySelector(expectedHash);
    if (!target || location.hash !== expectedHash) return false;
    const box = target.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight;
  }, hash, { polling: "raf", timeout: 5000 });
  try {
    await page.waitForFunction((expectedHash) => (
      document.activeElement === document.querySelector(expectedHash)
    ), hash, { polling: "raf", timeout: 5000 });
  } catch (error) {
    const diagnostic = await page.evaluate((expectedHash) => ({
      hash: location.hash,
      activeTag: document.activeElement?.tagName,
      activeId: document.activeElement?.id,
      activeClass: document.activeElement?.className,
      targetTabIndex: document.querySelector(expectedHash)?.getAttribute("tabindex"),
      targetConnected: document.querySelector(expectedHash)?.isConnected,
    }), hash);
    throw new Error(`${label}: hash target focus timed out ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  const targetState = await page.evaluate((expectedHash) => {
    const target = document.querySelector(expectedHash);
    const box = target.getBoundingClientRect();
    return {
      hash: location.hash,
      active: document.activeElement === target,
      top: box.top,
      bottom: box.bottom,
      viewportHeight: innerHeight,
    };
  }, hash);
  check(targetState.hash === hash, `${label}: hash was ${targetState.hash}`);
  check(targetState.active, `${label}: target did not receive focus`);
  check(
    targetState.bottom > 0 && targetState.top < targetState.viewportHeight,
    `${label}: target is outside the viewport ${JSON.stringify(targetState)}`,
  );
}

async function verifyLabGateway(run, viewport) {
  const page = run.page;
  const gateway = page.locator("[data-lab-gateway]");
  check(await gateway.count() === 1, `${viewport.label}: lab gateway is missing or duplicated`);
  const resolvedLink = await gateway.evaluate((node) => node.matches("a")) ? gateway : gateway.locator('a[href="/lab"]');
  check(await resolvedLink.count() === 1, `${viewport.label}: lab gateway does not expose one native /lab link`);
  check(await resolvedLink.getAttribute("href") === "/lab", `${viewport.label}: lab gateway href changed`);
  await page.evaluate(() => document.fonts.ready);
  const geometry = await gateway.evaluate((root, mobileWidth) => {
    const bounds = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
      };
    };
    const gatewayTitle = root.querySelector("#lab-gateway-title");
    const projectTitle = document.querySelector("#project-showcase-title");
    const account = root.querySelector(".lab-gateway__account");
    const copyControl = root.querySelector("[data-gateway-copy]");
    const statusLine = root.querySelector("[data-gateway-status]");
    const cta = root.querySelector('.lab-gateway__link[href="/lab"]');
    const range = document.createRange();
    range.selectNodeContents(gatewayTitle);
    const rawRects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    const text = gatewayTitle.textContent;
    const characterBoxes = [...text].map((character, index) => {
      const characterRange = document.createRange();
      characterRange.setStart(gatewayTitle.firstChild, index);
      characterRange.setEnd(gatewayTitle.firstChild, index + 1);
      const rect = characterRange.getBoundingClientRect();
      return { character, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    const lineTolerance = 2;
    const lines = [];
    for (const box of characterBoxes) {
      let line = lines.find((candidate) => Math.abs(candidate.top - box.top) <= lineTolerance);
      if (!line) {
        line = { top: box.top, bottom: box.bottom, text: "", cjkCount: 0 };
        lines.push(line);
      }
      line.text += box.character;
      if (/[\u3400-\u9fff]/u.test(box.character)) line.cjkCount += 1;
      line.bottom = Math.max(line.bottom, box.bottom);
    }
    lines.sort((first, second) => first.top - second.top);
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const viewportWidth = window.innerWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      title: bounds(gatewayTitle),
      titleFontSize: Number.parseFloat(getComputedStyle(gatewayTitle).fontSize),
      projectTitleFontSize: Number.parseFloat(getComputedStyle(projectTitle).fontSize),
      account: bounds(account),
      copyControl: bounds(copyControl),
      status: bounds(statusLine),
      cta: bounds(cta),
      lines,
      rangeLineRectCount: rawRects.length,
      lastLineCjkCount: lines.at(-1)?.cjkCount ?? 0,
      mobileWidth,
      rootFontSize,
      viewportWidth,
      scrollWidth,
      horizontalOverflow: scrollWidth - viewportWidth,
    };
  }, viewport.width);
  const diagnostics = JSON.stringify(geometry);
  check(
    geometry.title.display !== "none" && geometry.title.visibility !== "hidden"
      && geometry.title.width > 0 && geometry.title.height > 0,
    `${viewport.label}: gateway title is not visible; measurements=${diagnostics}`,
  );
  check(
    geometry.title.left >= -1 && geometry.title.right <= geometry.viewportWidth + 1,
    `${viewport.label}: gateway title escapes viewport; measurements=${diagnostics}`,
  );
  check(
    geometry.titleFontSize <= geometry.projectTitleFontSize + 1,
    `${viewport.label}: subordinate gateway title is larger than the Project Showcase title; measurements=${diagnostics}`,
  );
  if ([320, 375, 414].includes(viewport.width)) {
    check(
      geometry.lastLineCjkCount >= 3,
      `${viewport.label}: gateway title final physical line has ${geometry.lastLineCjkCount} CJK characters; measurements=${diagnostics}`,
    );
  }
  check(
    geometry.account.display !== "none" && geometry.account.visibility !== "hidden"
      && geometry.account.width > 0 && geometry.account.height > 0
      && geometry.account.width <= geometry.rootFontSize * 34 + 2,
    `${viewport.label}: gateway account measure is broken or exceeds 34rem; measurements=${diagnostics}`,
  );
  check(
    geometry.copyControl.display !== "none" && geometry.copyControl.visibility !== "hidden"
      && geometry.copyControl.width > 0 && geometry.copyControl.height > 0,
    `${viewport.label}: gateway copy control is hidden; measurements=${diagnostics}`,
  );
  check(
    geometry.status.display !== "none" && geometry.status.visibility !== "hidden",
    `${viewport.label}: gateway status line is hidden; measurements=${diagnostics}`,
  );
  check(
    geometry.cta.display !== "none" && geometry.cta.visibility !== "hidden"
      && geometry.cta.width > 0 && geometry.cta.height > 0
      && geometry.cta.left >= -1 && geometry.cta.right <= geometry.viewportWidth + 1,
    `${viewport.label}: gateway CTA is hidden or outside viewport; measurements=${diagnostics}`,
  );
  check(
    geometry.horizontalOverflow <= 1,
    `${viewport.label}: gateway causes horizontal overflow; measurements=${diagnostics}`,
  );
  await checkFocusedControl(page, resolvedLink, `${viewport.label}: lab gateway CTA`);
  if (viewport.width >= 1280) {
    await run.context.addInitScript(() => {
      const probe = { clipboardValues: [] };
      globalThis.__gatewayCopyProbe = probe;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText(value) {
            probe.clipboardValues.push(value);
            return Promise.resolve();
          },
        },
      });
    });
    await page.reload();
    const reloadedGateway = page.locator("[data-lab-gateway]");
    await reloadedGateway.scrollIntoViewIfNeeded();
    await reloadedGateway.locator('a[href="/lab"]').click();
    await page.waitForFunction(() => (
      document.querySelector("[data-gateway-status]")?.textContent.trim() === "已复制微信号 SJTbright-future"
    ), null, { timeout: 5000 });
    const copiedValues = await page.evaluate(() => globalThis.__gatewayCopyProbe.clipboardValues);
    check(
      JSON.stringify(copiedValues) === JSON.stringify(["SJTbright-future"]),
      `${viewport.label}: gateway benefit click did not copy the WeChat contact: ${JSON.stringify(copiedValues)}`,
    );
    await page.waitForURL((url) => url.pathname === "/lab", { timeout: 5000 });
  }
}

async function verifyLabTypography(page, viewport) {
  await page.evaluate(() => document.fonts.ready);
  const accessibleTitle = page.getByRole("heading", {
    level: 1,
    name: "先看作品，再决定是否继续交流。",
    exact: true,
  });
  check(
    await accessibleTitle.count() === 1 && await accessibleTitle.isVisible(),
    `${viewport.label}: the complete Lab h1 accessible name must be unique and visible`,
  );
  const geometry = await page.evaluate(() => {
    const bounds = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const parsedLineHeight = Number.parseFloat(style.lineHeight);
      const lineHeight = Number.isFinite(parsedLineHeight)
        ? parsedLineHeight
        : Number.parseFloat(style.fontSize) * 1.2;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        lineHeight,
        clientRectCount: node.getClientRects().length,
        cjkCount: [...node.textContent].filter((character) => /[\u3400-\u9fff]/u.test(character)).length,
        text: node.textContent.trim(),
      };
    };
    const lines = [...document.querySelectorAll("[data-lab-title-line]")].map(bounds);
    const title = document.querySelector("#lab-title");
    const intro = document.querySelector(".lab-hero__intro");
    const contactAccount = document.querySelector(".lab-contact__account");
    const copyButton = document.querySelector("[data-copy-contact]");
    const ctas = [...document.querySelectorAll('.lab-hero__actions a')].map(bounds);
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      lines,
      title: title ? bounds(title) : null,
      intro: intro ? bounds(intro) : null,
      ctas,
      contactAccount: contactAccount ? bounds(contactAccount) : null,
      copyButton: copyButton ? bounds(copyButton) : null,
      rootFontSize,
      viewportWidth: window.innerWidth,
      scrollWidth,
      horizontalOverflow: scrollWidth - window.innerWidth,
    };
  });
  const diagnostics = JSON.stringify(geometry);
  check(
    geometry.lines.length === 3,
    `${viewport.label}: expected exactly 3 Lab title lines, found ${geometry.lines.length}; measurements=${diagnostics}`,
  );
  for (const [index, line] of geometry.lines.entries()) {
    check(
      line.display !== "none" && line.visibility !== "hidden" && line.width > 0 && line.height > 0,
      `${viewport.label}: title line ${index + 1} is not visible; measurements=${diagnostics}`,
    );
    check(
      line.clientRectCount === 1 && line.height <= line.lineHeight * 1.35,
      `${viewport.label}: title line ${index + 1} wraps physically; measurements=${diagnostics}`,
    );
    if ([320, 375, 414].includes(viewport.width)) {
      check(
        line.cjkCount >= 3,
        `${viewport.label}: title line ${index + 1} has only ${line.cjkCount} CJK characters; measurements=${diagnostics}`,
      );
    }
  }
  check(geometry.horizontalOverflow <= 1, `${viewport.label}: Lab horizontal overflow; measurements=${diagnostics}`);
  for (const [label, node] of [
    ["title", geometry.title],
    ["hero intro", geometry.intro],
    ["hero CTA 1", geometry.ctas[0]],
    ["hero CTA 2", geometry.ctas[1]],
    ["contact account", geometry.contactAccount],
    ["contact copy button", geometry.copyButton],
  ]) {
    check(Boolean(node), `${viewport.label}: ${label} is missing; measurements=${diagnostics}`);
    check(
      node.left >= -1 && node.right <= geometry.viewportWidth + 1,
      `${viewport.label}: ${label} escapes the viewport; measurements=${diagnostics}`,
    );
  }
  check(
    geometry.intro.width <= geometry.rootFontSize * 36 + 2,
    `${viewport.label}: hero intro exceeds the 36rem reading measure; measurements=${diagnostics}`,
  );
}

async function verifyCreativeLab(browser, viewport) {
  const run = await openRoute(browser, viewport, {
    path: "/lab",
    waitFor: "[data-lab-page]",
    beforePage: async (context) => {
      await context.route("https://picsum.photos/**", (route) => route.fulfill({
        status: 200,
        contentType: "image/gif",
        body: transparentGif,
      }));
    },
  });
  try {
    await run.page.waitForLoadState("networkidle");
    const initialRequestCount = run.requestUrls.length;
    const localOrigin = new URL(baseUrl).origin;
    const externalRequests = run.requestUrls.slice(0, initialRequestCount).filter((url) => {
      const protocol = new URL(url).protocol;
      return protocol !== "data:" && protocol !== "blob:" && new URL(url).origin !== localOrigin;
    });
    check(externalRequests.length === 0, `${viewport.label}: lab requested remote resources: ${externalRequests.join(" | ")}`);
    check(await run.page.locator("[data-lab-page]").count() === 1, `${viewport.label}: lab root is missing or duplicated`);
    await verifyLabTypography(run.page, viewport);
    check(await run.page.locator("#lab-results").count() === 1, `${viewport.label}: lab results section is missing`);
    check(await run.page.locator("#lab-contact").count() === 1, `${viewport.label}: lab contact section is missing`);
    check(
      await run.page.locator("[data-lab-page]").getByText("先看作品，再决定是否继续交流。", { exact: true }).count() === 1,
      `${viewport.label}: lab identity headline changed`,
    );
    check(
      await run.page.locator("#lab-contact").getByText("SJTbright-future", { exact: true }).count() === 1,
      `${viewport.label}: contact key is missing or duplicated`,
    );
    check(
      await run.page.locator("#lab-contact").getByText("由 Felix 自主发起，与学校官方机构无隶属关系。", { exact: true }).count() === 1,
      `${viewport.label}: lab independence note changed`,
    );
    const resultHrefs = await run.page.locator("[data-lab-result]").evaluateAll((nodes) => nodes.map((node) => {
      const link = node.matches("a") ? node : node.querySelector("a");
      return link?.getAttribute("href") ?? null;
    }));
    check(resultHrefs.length === 3, `${viewport.label}: expected 3 lab results, found ${resultHrefs.length}`);
    check(
      JSON.stringify(resultHrefs) === JSON.stringify(["/#project-showcase", "/#image-archive", "/portfolio/index.html"]),
      `${viewport.label}: lab result hrefs were ${JSON.stringify(resultHrefs)}`,
    );
    const overflow = await run.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    check(
      overflow.scrollWidth <= overflow.clientWidth + 1 && overflow.bodyScrollWidth <= overflow.clientWidth + 1,
      `${viewport.label}: lab has horizontal overflow ${JSON.stringify(overflow)}`,
    );

    const primaryResultsCta = run.page.locator('a[href="#lab-results"]').first();
    const primaryContactCta = run.page.locator('a[href="#lab-contact"]').first();
    await checkFocusedControl(run.page, run.page.locator(".lab-page__home"), `${viewport.label}: home CTA`);
    await checkFocusedControl(run.page, primaryResultsCta, `${viewport.label}: results CTA`);
    await checkFocusedControl(run.page, primaryContactCta, `${viewport.label}: contact CTA`);
    await checkFocusedControl(run.page, run.page.locator("[data-copy-contact]"), `${viewport.label}: copy CTA`);
    for (let index = 0; index < resultHrefs.length; index += 1) {
      const result = run.page.locator("[data-lab-result]").nth(index);
      const resultLink = await result.evaluate((node) => node.matches("a"));
      await checkFocusedControl(
        run.page,
        resultLink ? result : result.locator("a").first(),
        `${viewport.label}: result CTA ${index + 1}`,
      );
    }

    await primaryResultsCta.click();
    await checkHashTarget(run.page, "#lab-results", `${viewport.label}: results jump`);
    await primaryContactCta.click();
    await checkHashTarget(run.page, "#lab-contact", `${viewport.label}: contact jump`);

    check(run.consoleErrors.length === 0, `${viewport.label}: lab console errors: ${run.consoleErrors.join(" | ")}`);
    check(run.pageErrors.length === 0, `${viewport.label}: lab page errors: ${run.pageErrors.join(" | ")}`);
    console.log(`LAB VIEWPORT PASS: ${viewport.label} ${viewport.width}x${viewport.height}`);
  } finally {
    await run.context.close();
  }
}

async function verifyLabResultNavigation(browser) {
  const viewport = viewports.at(-1);
  const cases = [
    { href: "/#project-showcase", hash: "#project-showcase", selector: "#project-showcase" },
    { href: "/#image-archive", hash: "#image-archive", selector: "#image-archive" },
  ];
  for (const testCase of cases) {
    const run = await openRoute(browser, viewport, {
      path: "/lab",
      waitFor: "[data-lab-page]",
      beforePage: async (context) => {
        await context.route("https://picsum.photos/**", (route) => route.fulfill({
          status: 200,
          contentType: "image/gif",
          body: transparentGif,
        }));
      },
    });
    try {
      const result = run.page.locator(
        `[data-lab-result][href="${testCase.href}"], [data-lab-result] a[href="${testCase.href}"]`,
      );
      check(await result.count() === 1, `desktop: missing lab result link ${testCase.href}`);
      await Promise.all([
        run.page.waitForURL((url) => url.pathname === "/" && url.hash === testCase.hash),
        result.click(),
      ]);
      await run.page.waitForSelector("[data-project-showcase]");
      await checkHashTarget(run.page, testCase.selector, `desktop result ${testCase.href}`);
      check(run.consoleErrors.length === 0, `desktop result ${testCase.href}: console errors ${run.consoleErrors.join(" | ")}`);
      check(run.pageErrors.length === 0, `desktop result ${testCase.href}: page errors ${run.pageErrors.join(" | ")}`);
    } finally {
      await run.context.close();
    }
  }
}

async function verifyLabCopyCases(browser) {
  const cases = [
    { label: "clipboard", mode: "clipboard", expected: "已复制", expectedExecCalls: 0 },
    { label: "fallback-success", mode: "fallback-success", expected: "已复制", expectedExecCalls: 1 },
    {
      label: "fallback-failure",
      mode: "fallback-failure",
      expected: "无法自动复制，请手动复制上方账号。",
      expectedExecCalls: 1,
    },
  ];
  for (const testCase of cases) {
    const run = await openRoute(browser, viewports.at(-1), {
      path: "/lab",
      waitFor: "[data-lab-page]",
      beforePage: async (context) => {
        await context.addInitScript((mode) => {
          const probe = { clipboardValues: [], execCalls: 0 };
          globalThis.__labCopyProbe = probe;
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText(value) {
                probe.clipboardValues.push(value);
                return mode === "clipboard" ? Promise.resolve() : Promise.reject(new Error("clipboard denied"));
              },
            },
          });
          document.execCommand = (command) => {
            if (command === "copy") probe.execCalls += 1;
            return mode === "fallback-success";
          };
        }, testCase.mode);
      },
    });
    try {
      const button = run.page.locator("[data-copy-contact]");
      await button.focus();
      await button.click();
      await run.page.waitForFunction((expected) => (
        document.querySelector("[data-copy-status]")?.textContent.trim() === expected
      ), testCase.expected);
      const copyState = await run.page.evaluate(() => ({
        status: document.querySelector("[data-copy-status]")?.textContent.trim(),
        activeIsButton: document.activeElement === document.querySelector("[data-copy-contact]"),
        temporaryTextareas: document.querySelectorAll("textarea").length,
        probe: globalThis.__labCopyProbe,
      }));
      check(copyState.status === testCase.expected, `${testCase.label}: status was ${copyState.status}`);
      if (testCase.mode !== "clipboard") {
        check(copyState.activeIsButton, `${testCase.label}: copy fallback did not restore button focus`);
      }
      check(copyState.temporaryTextareas === 0, `${testCase.label}: fallback textarea was not removed`);
      check(copyState.probe.execCalls === testCase.expectedExecCalls, `${testCase.label}: execCommand calls were ${copyState.probe.execCalls}`);
      check(
        JSON.stringify(copyState.probe.clipboardValues) === JSON.stringify(["SJTbright-future"]),
        `${testCase.label}: copied values were ${JSON.stringify(copyState.probe.clipboardValues)}`,
      );
      check(run.consoleErrors.length === 0, `${testCase.label}: console errors ${run.consoleErrors.join(" | ")}`);
      check(run.pageErrors.length === 0, `${testCase.label}: page errors ${run.pageErrors.join(" | ")}`);
    } finally {
      await run.context.close();
    }
  }
}

async function verifyNoScriptAndUnknownRoutes(browser) {
  const noScriptRun = await openRoute(browser, viewports.at(-1), { javaScriptEnabled: false });
  try {
    const labLink = noScriptRun.page.locator('a[href="/lab"]');
    check(await labLink.count() === 1, "JavaScript-disabled root must expose exactly one native /lab link");
    check(await labLink.isVisible(), "JavaScript-disabled root /lab link is not visible");
    await Promise.all([
      noScriptRun.page.waitForURL((url) => url.pathname === "/lab"),
      labLink.click(),
    ]);
    const noScriptBody = (await noScriptRun.page.locator("body").innerText()).trim();
    check(noScriptBody.length >= 40, `JavaScript-disabled /lab fallback is not readable: ${JSON.stringify(noScriptBody)}`);
    check(noScriptBody.includes("Felix"), "JavaScript-disabled /lab fallback does not identify Felix");
    const homeLink = noScriptRun.page.locator('a[href="/"]');
    check(await homeLink.count() === 1 && await homeLink.isVisible(), "JavaScript-disabled /lab must expose exactly one native home recovery link");
    await Promise.all([
      noScriptRun.page.waitForURL((url) => url.pathname === "/"),
      homeLink.click(),
    ]);
    check(new URL(noScriptRun.page.url()).pathname === "/", "JavaScript-disabled home recovery did not return to root");
  } finally {
    await noScriptRun.context.close();
  }

  const unknownRun = await openRoute(browser, viewports.at(-1), {
    path: "/definitely-not-a-route",
    waitFor: "[data-not-found]",
  });
  try {
    const notFound = unknownRun.page.locator("[data-not-found]");
    const title = unknownRun.page.locator("#not-found-title");
    const homeLink = unknownRun.page.locator('[data-not-found] a[href="/"]');
    check(await notFound.count() === 1 && await notFound.isVisible(), "unknown route must expose one visible [data-not-found]");
    check(await title.count() === 1 && await title.isVisible(), "unknown route must expose one visible title");
    check(await homeLink.count() === 1 && await homeLink.isVisible(), "unknown route does not expose exactly one visible native home link");
    await checkFocusedControl(unknownRun.page, homeLink, "unknown route home link");
    const notFoundGeometry = await unknownRun.page.evaluate(() => {
      const titleNode = document.querySelector("#not-found-title");
      const heroNode = document.querySelector("[data-not-found] > .lab-hero");
      const primaryButton = document.querySelector("[data-not-found] .lab-button--primary");
      const keyProperties = [
        "display", "font-size", "line-height", "letter-spacing", "word-break", "overflow-wrap", "text-wrap",
      ];
      const matchingTitleRules = [];
      const visitRules = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) visitRules(rule.cssRules);
          if (!rule.selectorText || !titleNode) continue;
          const declaresTitleProperty = keyProperties.some((property) => rule.style.getPropertyValue(property));
          if (!declaresTitleProperty) continue;
          try {
            if (titleNode.matches(rule.selectorText)) matchingTitleRules.push(rule.selectorText);
          } catch {
            // Ignore selectors unsupported by Element.matches; they cannot be confirmed as a title match.
          }
        }
      };
      for (const styleSheet of document.styleSheets) {
        try {
          visitRules(styleSheet.cssRules);
        } catch {
          // Same-origin build styles are inspectable; skip any browser-protected stylesheet.
        }
      }
      const baseButtonProbe = document.createElement("a");
      baseButtonProbe.className = "lab-button";
      baseButtonProbe.textContent = "probe";
      document.querySelector("[data-not-found]")?.append(baseButtonProbe);
      const baseButtonStyle = getComputedStyle(baseButtonProbe);
      const baseButton = {
        backgroundColor: baseButtonStyle.backgroundColor,
        borderColor: baseButtonStyle.borderColor,
      };
      baseButtonProbe.remove();
      return {
        titleInsideLabPage: Boolean(titleNode?.closest("[data-lab-page]")),
        titleLineNodes: document.querySelectorAll("[data-lab-title-line]").length,
        matchingTitleRules,
        hero: heroNode ? {
          gridTemplateColumns: getComputedStyle(heroNode).gridTemplateColumns,
          childOrder: [...heroNode.children].map((child) => child.id || child.className || child.tagName),
          directChildCount: heroNode.children.length,
        } : null,
        primaryButton: primaryButton ? {
          backgroundColor: getComputedStyle(primaryButton).backgroundColor,
          borderColor: getComputedStyle(primaryButton).borderColor,
        } : null,
        baseButton,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        viewportWidth: window.innerWidth,
      };
    });
    check(notFoundGeometry.titleLineNodes === 0, `unknown route leaked Lab title lines ${JSON.stringify(notFoundGeometry)}`);
    check(!notFoundGeometry.titleInsideLabPage, `unknown route title inherited the Lab page contract ${JSON.stringify(notFoundGeometry)}`);
    check(
      notFoundGeometry.matchingTitleRules.length === 0,
      `unknown route title matches Lab title CSS rules ${JSON.stringify(notFoundGeometry)}`,
    );
    check(Boolean(notFoundGeometry.hero), `unknown route hero is missing ${JSON.stringify(notFoundGeometry)}`);
    check(
      notFoundGeometry.hero.directChildCount === 3
        && (
          notFoundGeometry.hero.gridTemplateColumns === "none"
          || notFoundGeometry.hero.gridTemplateColumns.trim().split(/\s+/).length === 1
        ),
      `unknown route inherited the Lab desktop two-column hierarchy ${JSON.stringify(notFoundGeometry)}`,
    );
    check(Boolean(notFoundGeometry.primaryButton), `unknown route primary home link is missing ${JSON.stringify(notFoundGeometry)}`);
    check(
      notFoundGeometry.primaryButton.backgroundColor === notFoundGeometry.baseButton.backgroundColor
        && notFoundGeometry.primaryButton.borderColor === notFoundGeometry.baseButton.borderColor,
      `unknown route primary home link inherited Lab active styling ${JSON.stringify(notFoundGeometry)}`,
    );
    check(
      notFoundGeometry.scrollWidth <= notFoundGeometry.viewportWidth + 1,
      `unknown route has horizontal overflow ${JSON.stringify(notFoundGeometry)}`,
    );
    check(unknownRun.consoleErrors.length === 0, `unknown route console errors: ${unknownRun.consoleErrors.join(" | ")}`);
    check(unknownRun.pageErrors.length === 0, `unknown route page errors: ${unknownRun.pageErrors.join(" | ")}`);
  } finally {
    await unknownRun.context.close();
  }
}

async function verifyReducedMotionLab(browser) {
  const run = await openRoute(browser, viewports.at(-1), {
    path: "/lab",
    waitFor: "[data-lab-page]",
    reducedMotion: true,
  });
  try {
    const state = await run.page.evaluate(() => ({
      results: document.querySelectorAll("[data-lab-result]").length,
      contactVisible: Boolean(document.querySelector("#lab-contact")?.getBoundingClientRect().height),
      activeTransitions: [...document.querySelectorAll(".lab-button, .lab-result")].filter((node) => (
        getComputedStyle(node).transitionDuration.split(",").some((duration) => duration.trim() !== "0s")
      )).map((node) => node.className),
      loopingAnimations: [...document.querySelectorAll("[data-lab-page], [data-lab-page] *")].filter((node) => {
        const style = getComputedStyle(node);
        if (style.animationName === "none") return false;
        return style.animationIterationCount.split(",").some((count) => count === "infinite" || Number.parseFloat(count) > 1);
      }).map((node) => node.className || node.tagName),
    }));
    check(state.results === 3 && state.contactVisible, `reduced-motion lab is incomplete ${JSON.stringify(state)}`);
    check(state.activeTransitions.length === 0, `reduced-motion lab has active transitions ${JSON.stringify(state.activeTransitions)}`);
    check(state.loopingAnimations.length === 0, `reduced-motion lab has looping animations ${JSON.stringify(state.loopingAnimations)}`);
    check(run.consoleErrors.length === 0, `reduced-motion lab console errors: ${run.consoleErrors.join(" | ")}`);
    check(run.pageErrors.length === 0, `reduced-motion lab page errors: ${run.pageErrors.join(" | ")}`);
  } finally {
    await run.context.close();
  }
}

async function verifyReducedMotion(browser) {
  const viewport = viewports.at(-1);
  const run = await openPage(browser, viewport, { reducedMotion: true });
  try {
    await run.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await run.page.waitForFunction(() => (
      document.body.classList.contains("video-complete")
      && Number.parseFloat(getComputedStyle(document.querySelector("[data-profile-landing]")).opacity) > 0.99
    ));
    const reducedHero = await run.page.evaluate(() => {
      const video = document.querySelector("#wormhole-video");
      const profile = document.querySelector("[data-profile-landing]");
      return {
        muted: video.muted,
        defaultMuted: video.defaultMuted,
        volume: video.volume,
        paused: video.paused,
        currentTime: video.currentTime,
        scrollY: window.scrollY,
        archiveTop: document.querySelector("#image-archive").getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
        profileOpacity: Number.parseFloat(getComputedStyle(profile).opacity),
        profileTransition: getComputedStyle(profile).transitionDuration,
      };
    });
    check(
      !reducedHero.muted
        && !reducedHero.defaultMuted
        && reducedHero.volume > 0
        && reducedHero.paused
        && reducedHero.currentTime < 0.05,
      `reduced-motion Hero unexpectedly played ${JSON.stringify(reducedHero)}`,
    );
    check(Math.abs(reducedHero.scrollY) <= 1, `reduced-motion prelude skip moved the page ${JSON.stringify(reducedHero)}`);
    check(reducedHero.archiveTop >= reducedHero.viewportHeight - 2, `reduced-motion skipped the personal landing ${JSON.stringify(reducedHero)}`);
    check(reducedHero.profileOpacity > 0.99 && reducedHero.profileTransition.split(",").every((value) => value.trim() === "0s"), `reduced-motion landing still animates ${JSON.stringify(reducedHero)}`);
    await run.page.mouse.wheel(0, 120);
    await run.page.waitForFunction(() => window.scrollY > 0);
    await run.page.locator("#image-archive").scrollIntoViewIfNeeded();
    await run.page.waitForTimeout(240);
    check(
      await run.page.locator(".drift-wall").getAttribute("data-running") === "false",
      "reduced-motion wall reports running",
    );
    const before = await run.page.locator(".drift-wall__track").first().getAttribute("style");
    await run.page.waitForTimeout(360);
    const after = await run.page.locator(".drift-wall__track").first().getAttribute("style");
    check(before === after, "reduced-motion wall transform changed");
    check(await run.page.locator(".drift-wall__links a").count() === 0, "reduced-motion gallery exposed placeholder links");
    check(await run.page.locator("a.drift-wall__tile").count() === 0, "reduced-motion gallery exposed interactive placeholder tiles");
    await run.page.locator(".scroll-expand").scrollIntoViewIfNeeded();
    await run.page.waitForFunction(() => document.querySelector(".scroll-expand")?.dataset.reducedMotion === "true");
    const expand = await readScrollExpandState(run.page);
    check(expand.progress === 1, `reduced-motion ScrollExpand progress is ${expand.progress}`);
    check(expand.contentOpacity > 0.98, "reduced-motion ScrollExpand copy is hidden");
    check(
      Math.abs(expand.rootHeight - expand.viewportHeight) <= 1,
      `reduced-motion ScrollExpand still consumes ${expand.rootHeight / expand.viewportHeight} viewports`,
    );
    check(
      await run.page.locator(".scroll-expand").getAttribute("data-running") === "false",
      "reduced-motion ScrollExpand reports running",
    );
    await verifyReducedMotionProjectShowcase(run.page);
    const gatewayTransitionDurations = await run.page.locator(".lab-gateway__link").evaluate((node) => (
      getComputedStyle(node).transitionDuration.split(",").map((duration) => duration.trim())
    ));
    check(
      gatewayTransitionDurations.every((duration) => duration === "0s"),
      `reduced-motion Lab gateway transition is active ${JSON.stringify(gatewayTransitionDurations)}`,
    );
    check(run.consoleErrors.length === 0, `reduced-motion console errors: ${run.consoleErrors.join(" | ")}`);
    check(run.pageErrors.length === 0, `reduced-motion page errors: ${run.pageErrors.join(" | ")}`);
  } finally {
    await run.context.close();
  }
}

async function readPortfolioExitLayout(page) {
  return page.evaluate(() => {
    const link = document.querySelector(".portfolio-exit");
    const wordmark = document.querySelector(".wordmark");
    if (!link || !wordmark) return null;
    const box = link.getBoundingClientRect();
    const wordmarkBox = wordmark.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      wordmarkBottom: wordmarkBox.bottom,
      gapFromWordmark: box.top - wordmarkBox.bottom,
      hitIsExit: Boolean(hit && (hit === link || link.contains(hit))),
    };
  });
}

async function verifyReturnedPortfolioGateway(page, label) {
  await page.waitForFunction(() => {
    const target = document.querySelector("#portfolio-gallery");
    if (!target || location.hash !== "#portfolio-gallery") return false;
    const box = target.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight;
  }, undefined, { polling: "raf", timeout: 5000 });
  const state = await page.evaluate(() => {
    const box = document.querySelector("#portfolio-gallery").getBoundingClientRect();
    return { hash: location.hash, top: box.top, bottom: box.bottom, scrollY, viewportHeight: innerHeight };
  });
  check(state.hash === "#portfolio-gallery", `${label}: return hash is ${state.hash}`);
  check(state.bottom > 0 && state.top < state.viewportHeight, `${label}: gallery gateway is offscreen ${JSON.stringify(state)}`);
  check(state.scrollY > state.viewportHeight, `${label}: return stayed near the page top ${JSON.stringify(state)}`);
}

async function preparePortfolioEntryTransition(page) {
  const transition = page.locator("[data-portfolio-transition]");
  const video = transition.locator(".portfolio-transition__video");
  const skip = transition.locator(".portfolio-transition__skip");
  check(await transition.count() === 1, "portfolio entry transition must expose exactly one overlay");
  check(await video.count() === 1, "portfolio entry transition must expose exactly one video");
  check(await skip.count() === 1, "portfolio entry transition must expose exactly one skip control");

  await page.waitForFunction(() => {
    const media = document.querySelector(".portfolio-transition__video");
    return media
      && media.readyState >= HTMLMediaElement.HAVE_METADATA
      && Number.isFinite(media.duration)
      && media.duration > 0;
  }, undefined, { polling: "raf", timeout: 5000 });

  const initial = await transition.evaluate((overlay) => {
    const media = overlay.querySelector(".portfolio-transition__video");
    const skipControl = overlay.querySelector(".portfolio-transition__skip");
    globalThis.__felixPortfolioTransitionProbe = {
      activeSeen: overlay.dataset.active === "true",
      completeSeen: overlay.dataset.complete === "true",
      playingEvents: 0,
      playingStates: [],
    };
    const updateProbe = () => {
      globalThis.__felixPortfolioTransitionProbe.activeSeen ||= overlay.dataset.active === "true";
      globalThis.__felixPortfolioTransitionProbe.completeSeen ||= overlay.dataset.complete === "true";
    };
    new MutationObserver(updateProbe).observe(overlay, {
      attributes: true,
      attributeFilter: ["data-active", "data-complete"],
    });
    media.addEventListener("playing", () => {
      globalThis.__felixPortfolioTransitionProbe.playingEvents += 1;
      globalThis.__felixPortfolioTransitionProbe.playingStates.push({
        muted: media.muted,
        defaultMuted: media.defaultMuted,
        volume: media.volume,
      });
    });
    media.playbackRate = 8;
    return {
      className: overlay.className,
      active: overlay.dataset.active,
      complete: overlay.dataset.complete,
      bodyActive: document.body.classList.contains("portfolio-transition-active"),
      video: {
        muted: media.muted,
        defaultMuted: media.defaultMuted,
        volume: media.volume,
        paused: media.paused,
        playsInline: media.playsInline,
        preload: media.preload,
        controls: media.controls,
        loop: media.loop,
        autoplay: media.autoplay,
        playbackRate: media.playbackRate,
        source: media.currentSrc || media.src,
      },
      skip: {
        tagName: skipControl?.tagName,
        text: skipControl?.textContent.trim(),
      },
    };
  });
  check(initial.className.split(/\s+/).includes("portfolio-transition"), `portfolio overlay class is ${initial.className}`);
  check(initial.active !== "true" && initial.complete !== "true", `portfolio transition starts active ${JSON.stringify(initial)}`);
  check(!initial.bodyActive, "portfolio transition body class is active before entry");
  check(
    !initial.video.muted && !initial.video.defaultMuted && initial.video.volume > 0,
    `portfolio transition BGM is disabled ${JSON.stringify(initial.video)}`,
  );
  check(initial.video.paused, "portfolio transition video is not paused by default");
  check(initial.video.playsInline, "portfolio transition video is not playsInline");
  check(initial.video.preload === "metadata", `portfolio transition video preload is ${initial.video.preload}`);
  check(
    !initial.video.controls && !initial.video.loop && !initial.video.autoplay,
    `portfolio transition video exposes controls, loop, or autoplay ${JSON.stringify(initial.video)}`,
  );
  check(initial.video.playbackRate === 8, `portfolio transition playback rate is ${initial.video.playbackRate}`);
  check(
    /portfolio-entry-transition-with-bgm-[A-Za-z0-9_-]+\.mp4(?:$|\?)/.test(initial.video.source),
    `portfolio transition video source is ${initial.video.source}`,
  );
  check(
    initial.skip.tagName === "BUTTON" && initial.skip.text.includes("跳过"),
    `portfolio transition skip control is invalid ${JSON.stringify(initial.skip)}`,
  );

  return { transition, video, skip };
}

async function verifyActivePortfolioEntryTransition(page) {
  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-portfolio-transition]");
    const media = overlay?.querySelector(".portfolio-transition__video");
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const probe = globalThis.__felixPortfolioTransitionProbe;
    return overlay?.dataset.active === "true"
      && document.body.classList.contains("portfolio-transition-active")
      && overlayStyle.visibility !== "hidden"
      && Number.parseFloat(overlayStyle.opacity) > 0.99
      && probe?.activeSeen
      && probe.playingEvents > 0
      && media
      && !media.paused
      && media.currentTime > 0;
  }, undefined, { polling: "raf", timeout: 5000 });

  const active = await page.locator("[data-portfolio-transition]").evaluate((overlay) => {
    const box = overlay.getBoundingClientRect();
    const style = getComputedStyle(overlay);
    const media = overlay.querySelector(".portfolio-transition__video");
    const skip = overlay.querySelector(".portfolio-transition__skip");
    return {
      dataActive: overlay.dataset.active,
      dataComplete: overlay.dataset.complete,
      bodyActive: document.body.classList.contains("portfolio-transition-active"),
      box: { left: box.left, top: box.top, width: box.width, height: box.height },
      viewport: { width: innerWidth, height: innerHeight },
      position: style.position,
      visibility: style.visibility,
      opacity: Number.parseFloat(style.opacity),
      video: {
        muted: media.muted,
        defaultMuted: media.defaultMuted,
        volume: media.volume,
        paused: media.paused,
        currentTime: media.currentTime,
        playbackRate: media.playbackRate,
      },
      skipVisible: (() => {
        const skipStyle = getComputedStyle(skip);
        const skipBox = skip.getBoundingClientRect();
        return skipStyle.display !== "none"
          && skipStyle.visibility !== "hidden"
          && Number.parseFloat(skipStyle.opacity) > 0
          && skipBox.width > 0
          && skipBox.height > 0;
      })(),
      playingEvents: globalThis.__felixPortfolioTransitionProbe?.playingEvents ?? 0,
      playingStates: globalThis.__felixPortfolioTransitionProbe?.playingStates ?? [],
    };
  });
  check(active.dataActive === "true" && active.bodyActive, `portfolio transition did not activate ${JSON.stringify(active)}`);
  check(active.position === "fixed", `portfolio transition position is ${active.position}`);
  check(
    Math.abs(active.box.left) <= 1
      && Math.abs(active.box.top) <= 1
      && Math.abs(active.box.width - active.viewport.width) <= 1
      && Math.abs(active.box.height - active.viewport.height) <= 1,
    `portfolio transition is not fullscreen ${JSON.stringify(active)}`,
  );
  check(
    active.visibility !== "hidden" && active.opacity > 0.99,
    `portfolio transition is not visibly covering the page ${JSON.stringify(active)}`,
  );
  check(
    !active.video.paused
      && active.video.currentTime > 0
      && active.video.playbackRate === 8
      && active.playingEvents > 0,
    `portfolio transition video is not playing ${JSON.stringify(active)}`,
  );
  check(
    !active.video.muted
      && !active.video.defaultMuted
      && active.video.volume > 0
      && active.playingStates.length > 0
      && active.playingStates.every((state) => (
        state.muted === false
        && state.defaultMuted === false
        && state.volume > 0
      )),
    `portfolio transition did not play with BGM ${JSON.stringify(active)}`,
  );
  check(active.skipVisible, "portfolio transition skip control is not visible while playing");

  await page.waitForFunction(() => (
    document.querySelector("[data-portfolio-transition]")?.dataset.complete === "true"
      && globalThis.__felixPortfolioTransitionProbe?.completeSeen
  ), undefined, { polling: "raf", timeout: 5000 });
  const complete = await page.evaluate(() => ({
    dataComplete: document.querySelector("[data-portfolio-transition]")?.dataset.complete,
    completeSeen: globalThis.__felixPortfolioTransitionProbe?.completeSeen,
    bodyActive: document.body.classList.contains("portfolio-transition-active"),
  }));
  check(
    complete.dataComplete === "true" && complete.completeSeen && complete.bodyActive,
    `portfolio transition completion handoff is missing ${JSON.stringify(complete)}`,
  );
}

async function verifyPortfolioRoute(browser) {
  const run = await openPage(browser, { name: "portfolio", width: 1440, height: 900 });
  const requestUrls = [];
  const recordRequest = (request) => requestUrls.push(request.url());
  run.context.on("request", recordRequest);

  try {
    const portfolioEntry = run.page.locator(".portfolio-entry");
    check(await portfolioEntry.count() === 1, "portfolio route must expose exactly one CTA");
    check(await portfolioEntry.isVisible(), "portfolio route CTA is not visible");
    check(
      await portfolioEntry.getAttribute("href") === "/portfolio/index.html",
      "portfolio route CTA does not preserve the raw /portfolio/index.html href",
    );

    await preparePortfolioEntryTransition(run.page);

    const portfolioNavigation = run.page.waitForURL(
      (url) => url.pathname.endsWith("/portfolio/index.html"),
      { waitUntil: "domcontentloaded", timeout: 10000 },
    );
    await portfolioEntry.click();
    await verifyActivePortfolioEntryTransition(run.page);
    await portfolioNavigation;
    check(run.context.pages().length === 1, "portfolio route opened a second window");
    check(
      new URL(run.page.url()).pathname === "/portfolio/index.html",
      `portfolio route URL is ${run.page.url()}`,
    );

    const entryArrival = await run.page.evaluate(() => ({
      hash: location.hash,
      fromVideoEntry: document.documentElement.classList.contains("from-video-entry"),
      veilBackground: getComputedStyle(document.querySelector("#veil")).backgroundColor.replaceAll(" ", ""),
    }));
    check(entryArrival.hash === "", `portfolio video-entry hash was not cleared ${JSON.stringify(entryArrival)}`);
    check(entryArrival.fromVideoEntry, `portfolio target did not retain its video-entry marker ${JSON.stringify(entryArrival)}`);
    check(
      entryArrival.veilBackground === "rgb(255,255,255)",
      `portfolio video-entry veil is not white ${JSON.stringify(entryArrival)}`,
    );

    await run.page.waitForFunction(() => {
      const app = window.__app;
      const veil = document.querySelector("#veil");
      const canvas = document.querySelector("#stage canvas");
      return app?.started
        && app.entrance.p >= 0.999
        && getComputedStyle(veil).visibility === "hidden"
        && canvas
        && app.tiles.length === 60
        && app.tiles.every((tile) => tile.mesh.visible && tile.mesh.material.opacity >= 0.99);
    }, undefined, { polling: "raf", timeout: 10000 });

    const exitLink = run.page.locator(".portfolio-exit");
    check(await exitLink.count() === 1, "portfolio must expose exactly one exit link");
    check(await exitLink.isVisible(), "portfolio exit link is not visible");
    check(await exitLink.textContent() === "← 返回影像馆入口", "portfolio exit copy is wrong");
    check(
      await exitLink.getAttribute("href") === "/#portfolio-gallery",
      "portfolio exit href does not target its gateway",
    );
    check(
      await exitLink.getAttribute("aria-label") === "返回影像馆入口",
      "portfolio exit accessible name does not match its visible label",
    );
    check(
      await run.page.getByRole("link", { name: "返回影像馆入口", exact: true }).count() === 1,
      "portfolio exit computed accessible name is not unique",
    );

    const exitLayout = await readPortfolioExitLayout(run.page);
    check(Boolean(exitLayout), "portfolio exit layout is unavailable");
    check(exitLayout.height >= 44, `portfolio exit touch target is ${exitLayout.height}px`);
    check(
      exitLayout.left >= 0
        && exitLayout.top >= 0
        && exitLayout.right <= exitLayout.viewportWidth
        && exitLayout.bottom <= exitLayout.viewportHeight,
      `portfolio exit escapes viewport ${JSON.stringify(exitLayout)}`,
    );
    check(exitLayout.gapFromWordmark >= 8, `portfolio exit overlaps its wordmark ${JSON.stringify(exitLayout)}`);
    check(exitLayout.hitIsExit, "portfolio exit is not the pointer target at its center");

    await run.page.keyboard.press("Tab");
    const keyboardState = await exitLink.evaluate((link) => {
      const style = getComputedStyle(link);
      return {
        active: document.activeElement === link,
        focusVisible: link.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    check(keyboardState.active, `portfolio exit is not first in the Tab order ${JSON.stringify(keyboardState)}`);
    check(
      keyboardState.focusVisible
        && keyboardState.outlineStyle !== "none"
        && keyboardState.outlineWidth >= 2,
      `portfolio exit focus indicator is not visible ${JSON.stringify(keyboardState)}`,
    );

    await run.page.mouse.move(
      exitLayout.left + exitLayout.width / 2,
      exitLayout.top + exitLayout.height / 2,
    );
    await run.page.waitForTimeout(250);
    const hoverColors = await exitLink.evaluate((link) => {
      const style = getComputedStyle(link);
      return {
        background: style.backgroundColor.replaceAll(" ", ""),
        color: style.color.replaceAll(" ", ""),
      };
    });
    check(
      hoverColors.background === "rgb(0,0,0)" && hoverColors.color === "rgb(255,255,255)",
      `portfolio exit hover colors are wrong ${JSON.stringify(hoverColors)}`,
    );

    const steady = await run.page.evaluate(() => {
      const canvas = document.querySelector("#stage canvas");
      const box = canvas.getBoundingClientRect();
      const fallback = document.querySelector("#fallback");
      return {
        tileCount: window.__app.tiles.length,
        visibleTileCount: window.__app.tiles.filter(
          (tile) => tile.mesh.visible && tile.mesh.material.opacity >= 0.99,
        ).length,
        canvas: { left: box.left, top: box.top, width: box.width, height: box.height },
        fallbackDisplay: getComputedStyle(fallback).display,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        yaw: window.__app.view.yaw,
      };
    });
    check(steady.tileCount === 60 && steady.visibleTileCount === 60, `portfolio tiles are not steady ${JSON.stringify(steady)}`);
    check(
      steady.canvas.width > 0
        && steady.canvas.height > 0
        && Math.abs(steady.canvas.left) <= 1
        && Math.abs(steady.canvas.top) <= 1
        && Math.abs(steady.canvas.width - 1440) <= 1
        && Math.abs(steady.canvas.height - 900) <= 1,
      `portfolio canvas is not full viewport ${JSON.stringify(steady.canvas)}`,
    );
    check(steady.fallbackDisplay === "none", `portfolio fallback is ${steady.fallbackDisplay}`);
    check(steady.horizontalOverflow <= 0, `portfolio horizontal overflow is ${steady.horizontalOverflow}px`);

    const canvas = run.page.locator("#stage canvas");
    const canvasBox = await canvas.boundingBox();
    check(Boolean(canvasBox), "portfolio canvas has no pointer target bounds");
    const dragStart = {
      x: canvasBox.x + canvasBox.width * 0.2,
      y: canvasBox.y + canvasBox.height * 0.55,
    };
    await run.page.mouse.move(dragStart.x, dragStart.y);
    await run.page.mouse.down();
    await run.page.mouse.move(dragStart.x + 120, dragStart.y + 24, { steps: 8 });
    await run.page.mouse.up();
    await run.page.waitForFunction(
      (yaw) => Math.abs(window.__app.view.yaw - yaw) > 0.01,
      steady.yaw,
      { polling: "raf", timeout: 2000 },
    );
    const draggedYaw = await run.page.evaluate(() => window.__app.view.yaw);
    check(Math.abs(draggedYaw - steady.yaw) > 0.01, "portfolio canvas drag did not change yaw");

    const scanColumns = [0.12, 0.31, 0.5, 0.69, 0.88];
    const scanRows = [0.2, 0.4, 0.6, 0.8];
    let clickedPoint = null;
    for (const row of scanRows) {
      for (const column of scanColumns) {
        const point = {
          x: canvasBox.x + canvasBox.width * column,
          y: canvasBox.y + canvasBox.height * row,
        };
        await run.page.mouse.click(point.x, point.y);
        try {
          await run.page.locator("#viewer").waitFor({ state: "visible", timeout: 350 });
          clickedPoint = point;
          break;
        } catch {
          // Continue through the bounded 5x4 raycast grid.
        }
      }
      if (clickedPoint) break;
    }
    check(Boolean(clickedPoint), "portfolio 5x4 canvas raycast grid did not open a work");
    const viewerCoversExit = await run.page.evaluate(() => {
      const link = document.querySelector(".portfolio-exit");
      const viewer = document.querySelector("#viewer");
      const box = link.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return Boolean(hit && viewer.contains(hit));
    });
    check(viewerCoversExit, "portfolio viewer does not cover the exit link interaction area");
    await run.page.locator("#viewer-x").click();
    await run.page.locator("#viewer").waitFor({ state: "hidden", timeout: 2000 });

    const visualFilter = run.page.locator('.filters button[data-f="a"]');
    await visualFilter.click();
    await run.page.waitForFunction(
      () => document.querySelector('.filters button[data-f="a"]')?.classList.contains("on"),
      undefined,
      { polling: "raf", timeout: 1000 },
    );
    await run.page.waitForFunction(() => window.__app.tiles
      .filter((tile) => tile.item.g !== "a")
      .every((tile) => !tile.onDome && !tile.mesh.visible && tile.mesh.material.opacity <= 0.01),
    undefined, { polling: "raf", timeout: 3000 });
    const filterEvidence = await run.page.evaluate(() => ({
      selected: document.querySelector('.filters button[data-f="a"]')?.classList.contains("on"),
      matchingVisible: window.__app.tiles.filter(
        (tile) => tile.item.g === "a" && tile.onDome && tile.mesh.visible,
      ).length,
      nonmatchingHidden: window.__app.tiles.filter(
        (tile) => tile.item.g !== "a" && !tile.onDome && !tile.mesh.visible,
      ).length,
    }));
    check(
      filterEvidence.selected
        && filterEvidence.matchingVisible === 34
        && filterEvidence.nonmatchingHidden === 26,
      `portfolio VISUAL filter state is wrong ${JSON.stringify(filterEvidence)}`,
    );

    const originEvidence = await run.page.evaluate(() => ({
      origin: location.origin,
      resources: performance.getEntriesByType("resource").map((entry) => entry.name),
    }));
    const nonLocalRequests = requestUrls.filter((url) => new URL(url).origin !== originEvidence.origin);
    const nonLocalResources = originEvidence.resources.filter(
      (url) => new URL(url).origin !== originEvidence.origin,
    );
    check(nonLocalRequests.length === 0, `portfolio made non-local requests: ${nonLocalRequests.join(" | ")}`);
    check(nonLocalResources.length === 0, `portfolio loaded non-local resources: ${nonLocalResources.join(" | ")}`);
    check(run.consoleErrors.length === 0, `portfolio console errors: ${run.consoleErrors.join(" | ")}`);
    check(run.pageErrors.length === 0, `portfolio page errors: ${run.pageErrors.join(" | ")}`);
    console.log(
      `PORTFOLIO ROUTE PASS: ${run.page.url()} ${steady.visibleTileCount} tiles ${steady.canvas.width}x${steady.canvas.height} `
      + `drag=${Math.abs(draggedYaw - steady.yaw).toFixed(3)} click=${Math.round(clickedPoint.x)},${Math.round(clickedPoint.y)} `
      + `filter=${filterEvidence.matchingVisible}/${filterEvidence.nonmatchingHidden} errors=0`,
    );

    await run.page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });
    await run.page.keyboard.press("Tab");
    check(await exitLink.evaluate((link) => document.activeElement === link), "portfolio exit is not reachable by Tab before activation");
    await run.page.evaluate(() => document.body.removeAttribute("tabindex"));
    await Promise.all([
      run.page.waitForURL(
        (url) => url.pathname === "/" && url.hash === "#portfolio-gallery",
        { waitUntil: "domcontentloaded" },
      ),
      run.page.keyboard.press("Enter"),
    ]);
    check(run.context.pages().length === 1, "portfolio exit opened a second window");
    await verifyReturnedPortfolioGateway(run.page, "desktop portfolio exit");
    await waitForAnimationFrames(run.page);
    check(run.consoleErrors.length === 0, `portfolio return console errors: ${run.consoleErrors.join(" | ")}`);
    check(run.pageErrors.length === 0, `portfolio return page errors: ${run.pageErrors.join(" | ")}`);
  } finally {
    run.context.off("request", recordRequest);
    await run.context.close();
  }

  const mobileConsoleErrors = [];
  const mobilePageErrors = [];
  const mobileContext = await browser.newContext({ viewport: { width: 320, height: 700 } });
  try {
    await mobileContext.route("https://picsum.photos/**", (route) => route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: transparentGif,
    }));
    const mobilePage = await mobileContext.newPage();
    mobilePage.on("console", (message) => {
      if (message.type() === "error") mobileConsoleErrors.push(message.text());
    });
    mobilePage.on("pageerror", (error) => mobilePageErrors.push(String(error)));
    await mobilePage.goto(new URL("/portfolio/index.html", baseUrl).href, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForSelector(".portfolio-exit", { state: "visible" });
    await mobilePage.evaluate(() => document.fonts.ready);
    await waitForAnimationFrames(mobilePage);
    const mobileLayout = await readPortfolioExitLayout(mobilePage);
    check(Boolean(mobileLayout), "mobile portfolio exit layout is unavailable");
    check(mobileLayout.height >= 44, `mobile portfolio exit touch target is ${mobileLayout.height}px`);
    check(
      mobileLayout.left >= 0
        && mobileLayout.top >= 0
        && mobileLayout.right <= mobileLayout.viewportWidth
        && mobileLayout.bottom <= mobileLayout.viewportHeight,
      `mobile portfolio exit escapes viewport ${JSON.stringify(mobileLayout)}`,
    );
    check(
      mobileLayout.gapFromWordmark >= 8,
      `mobile portfolio exit overlaps its wordmark ${JSON.stringify(mobileLayout)}`,
    );
    check(mobileLayout.hitIsExit, "mobile portfolio exit is not the pointer target at its center");
    await Promise.all([
      mobilePage.waitForURL(
        (url) => url.pathname === "/" && url.hash === "#portfolio-gallery",
        { waitUntil: "domcontentloaded" },
      ),
      mobilePage.locator(".portfolio-exit").click(),
    ]);
    check(mobileContext.pages().length === 1, "mobile portfolio exit opened a second window");
    await verifyReturnedPortfolioGateway(mobilePage, "mobile portfolio exit");
    await waitForAnimationFrames(mobilePage);
    check(mobileConsoleErrors.length === 0, `mobile portfolio console errors: ${mobileConsoleErrors.join(" | ")}`);
    check(mobilePageErrors.length === 0, `mobile portfolio page errors: ${mobilePageErrors.join(" | ")}`);
    console.log(`PORTFOLIO EXIT MOBILE PASS: ${mobileLayout.width}x${mobileLayout.height} gap=${mobileLayout.gapFromWordmark}`);
  } finally {
    await mobileContext.close();
  }
}

async function captureScreenshots(browser) {
  await mkdir(artifactRoot, { recursive: true });
  for (const viewport of screenshotViewports) {
    const run = await openPage(browser, viewport, { liveImages: true });
    try {
      await run.page.locator("#image-archive").scrollIntoViewIfNeeded();
      await run.page.waitForTimeout(1200);
      await run.page.screenshot({ path: path.join(artifactRoot, viewport.file) });
      check(run.consoleErrors.length === 0, `${viewport.label}: screenshot console errors`);
      check(run.pageErrors.length === 0, `${viewport.label}: screenshot page errors`);
    } finally {
      await run.context.close();
    }
  }
}

async function openProjectShowcaseScreenshotPage(browser, viewport) {
  const consoleErrors = [];
  const pageErrors = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function freezeProjectScreenshotVideo(...args) {
      if (this.matches?.(".project-card__video")) return Promise.resolve();
      return nativePlay.apply(this, args);
    };
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root");
  await page.waitForSelector("[data-project-showcase]");
  await page.evaluate(() => document.fonts.ready);
  return { context, page, consoleErrors, pageErrors };
}

async function prepareProjectShowcaseScreenshotFrame(page, viewport) {
  await page.evaluate((frameGutter) => {
    const section = document.querySelector("[data-project-showcase]");
    window.scrollTo({
      top: section.getBoundingClientRect().top + window.scrollY,
      behavior: "instant",
    });

    const title = document.querySelector("#project-showcase-title");
    const cards = [...document.querySelectorAll(".project-card")];
    const framedCards = cards.slice(0, innerWidth < 768 ? 1 : 2);
    const rowBottom = Math.max(...framedCards.map((card) => card.getBoundingClientRect().bottom));
    const neededShift = Math.max(0, rowBottom - (innerHeight - frameGutter));
    const titleRoom = Math.max(0, title.getBoundingClientRect().top - 1);
    window.scrollBy({ top: Math.min(neededShift, titleRoom), behavior: "instant" });
  }, projectShowcaseFrameGutter);
  await page.waitForFunction(() => {
    const videos = [...document.querySelectorAll(".project-card__video")];
    const images = [...document.querySelectorAll(".project-card__image")];
    return videos.length === 2
      && images.length === 6
      && videos.every((video) => (
        video.readyState >= HTMLMediaElement.HAVE_METADATA
        && Number.isFinite(video.duration)
        && video.duration > 0
      ))
      && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
  }, undefined, { polling: "raf", timeout: 5000 });
  await page.evaluate(() => {
    for (const video of document.querySelectorAll(".project-card__video")) {
      video.pause();
      const target = Math.min(video.duration * 0.25, Math.max(0, video.duration - 0.05));
      video.dataset.screenshotTarget = String(target);
      video.currentTime = target;
    }
  });
  await page.waitForFunction(() => [...document.querySelectorAll(".project-card__video")].every((video) => {
    const target = Number.parseFloat(video.dataset.screenshotTarget);
    return video.paused
      && !video.seeking
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && Number.isFinite(target)
      && Math.abs(video.currentTime - target) < 0.06;
  }), undefined, { polling: "raf", timeout: 5000 });
  await waitForAnimationFrames(page, 2);
  const frame = await page.evaluate(() => {
    const bounds = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return {
      title: bounds(document.querySelector("#project-showcase-title")),
      cards: [...document.querySelectorAll(".project-card")]
        .slice(0, innerWidth < 768 ? 1 : 2)
        .map(bounds),
    };
  });
  check(
    frame.title.left >= -1
      && frame.title.right <= viewport.width + 1
      && frame.title.top >= -1
      && frame.title.bottom <= viewport.height + 1,
    `${viewport.label}: Project Showcase screenshot title is clipped ${JSON.stringify(frame.title)}`,
  );
  for (const [index, card] of frame.cards.entries()) {
    check(
      card.left >= -1 && card.right <= viewport.width + 1 && card.top >= -1
        && card.bottom <= viewport.height - projectShowcaseFrameGutter + 1,
      `${viewport.label}: Project Showcase screenshot card ${index + 1} is clipped ${JSON.stringify(card)}`,
    );
  }
}

async function captureProjectShowcaseScreenshots(browser) {
  await mkdir(artifactRoot, { recursive: true });
  for (const viewport of projectShowcaseScreenshotViewports) {
    const run = await openProjectShowcaseScreenshotPage(browser, viewport);
    try {
      await prepareProjectShowcaseScreenshotFrame(run.page, viewport);
      checkProjectShowcaseLayout(await readProjectShowcaseLayout(run.page), viewport);
      await run.page.screenshot({ path: path.join(artifactRoot, viewport.file) });
      check(run.consoleErrors.length === 0, `${viewport.label}: Project Showcase screenshot console errors`);
      check(run.pageErrors.length === 0, `${viewport.label}: Project Showcase screenshot page errors`);
    } finally {
      await run.context.close();
    }
  }
}

if (!projectShowcaseScreenshotOnly) {
  await verifyRangeContract();
}
const browser = await chromium.launch({
  headless: true,
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
});

try {
  if (writeDriftWallScreenshots) {
    await captureScreenshots(browser);
  }
  if (writeProjectShowcaseScreenshots) {
    await captureProjectShowcaseScreenshots(browser);
  }
  if (!writeDriftWallScreenshots && !writeProjectShowcaseScreenshots) {
    for (const viewport of viewports) {
      const run = await openPage(browser, viewport);
      try {
        await verifyHeroCopy(run.page, viewport);
        await verifyHero(run.page, viewport);
        await verifyGallery(run.page, viewport);
        await verifyScrollExpand(run.page, viewport);
        await verifyProjectShowcase(run.page, viewport, run.invalidGatewayPhoto404);
        await verifyLabGateway(run, viewport);
        check(run.consoleErrors.length === 0, `${viewport.label}: console errors: ${run.consoleErrors.join(" | ")}`);
        check(run.pageErrors.length === 0, `${viewport.label}: page errors: ${run.pageErrors.join(" | ")}`);
        console.log(`VIEWPORT PASS: ${viewport.label} ${viewport.width}x${viewport.height}`);
      } finally {
        await run.context.close();
      }
      await verifyCreativeLab(browser, viewport);
    }
    await verifyPortfolioRoute(browser);
    await verifyLabResultNavigation(browser);
    await verifyLabCopyCases(browser);
    await verifyNoScriptAndUnknownRoutes(browser);
    await verifyReducedMotion(browser);
    await verifyReducedMotionLab(browser);
  }
} finally {
  await browser.close();
}

console.log(`BROWSER PASS: ${assertionCount} assertions`);
