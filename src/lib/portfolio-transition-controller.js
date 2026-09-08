import { claimVideoBgm, enableVideoBgm, releaseVideoBgm } from "./video-bgm.js";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const ACTIVE_BODY_CLASS = "portfolio-transition-active";
const COMPLETE_BODY_CLASS = "portfolio-transition-complete";
const ACTIVE_OVERLAY_CLASS = "is-active";
const COMPLETE_OVERLAY_CLASS = "is-complete";
const PROGRESS_PROPERTY = "--portfolio-transition-progress";

function isEventTarget(value) {
  return Boolean(value?.addEventListener && value?.removeEventListener);
}

function isUnmodifiedPrimaryClick(event) {
  return !event.defaultPrevented
    && (event.button === undefined || event.button === 0)
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function noopController() {
  return {
    destroy() {},
    getState: () => "unavailable",
  };
}

export function createPortfolioTransitionController({
  linkElement,
  videoElement,
  overlayElement,
  skipElement = null,
  reducedMotion,
  targetHref,
  navigate,
  watchdogMs = 15000,
  progressWatchdogMs = 5000,
  handoffDelayMs = 180,
  windowObject = globalThis.window,
  documentObject = globalThis.document,
} = {}) {
  if (
    !isEventTarget(linkElement)
    || !isEventTarget(videoElement)
    || !videoElement.play
    || !videoElement.pause
    || !isEventTarget(overlayElement)
    || !overlayElement.style?.setProperty
    || !overlayElement.classList
    || !isEventTarget(windowObject)
    || !isEventTarget(documentObject)
    || !documentObject.body?.classList
  ) {
    return noopController();
  }

  const destination = typeof targetHref === "string" && targetHref.length > 0
    ? targetHref
    : linkElement.getAttribute?.("href") || linkElement.href;
  if (!destination) return noopController();

  const setTimer = windowObject.setTimeout?.bind(windowObject) ?? globalThis.setTimeout;
  const clearTimer = windowObject.clearTimeout?.bind(windowObject) ?? globalThis.clearTimeout;
  const mediaQuery = typeof reducedMotion === "object" && reducedMotion !== null
    ? reducedMotion
    : windowObject.matchMedia?.(REDUCED_MOTION_QUERY);
  const prefersReducedMotion = () => (
    typeof reducedMotion === "boolean" ? reducedMotion : Boolean(mediaQuery?.matches)
  );
  const navigateTo = typeof navigate === "function"
    ? navigate
    : (href) => windowObject.location?.assign?.(href);

  let state = "idle";
  let generation = 0;
  let hardWatchdogTimer = null;
  let progressWatchdogTimer = null;
  let handoffTimer = null;
  let lastProgressTime = 0;
  let navigationStarted = false;

  function setProgress(value) {
    overlayElement.style.setProperty(PROGRESS_PROPERTY, String(clampProgress(value)));
  }

  function setOverlayData(name, value) {
    if (overlayElement.dataset) overlayElement.dataset[name] = String(value);
    else overlayElement.setAttribute?.(`data-${name}`, String(value));
  }

  function clearNamedTimer(name) {
    const timer = name === "hard"
      ? hardWatchdogTimer
      : name === "progress"
        ? progressWatchdogTimer
        : handoffTimer;
    if (timer !== null) clearTimer(timer);
    if (name === "hard") hardWatchdogTimer = null;
    else if (name === "progress") progressWatchdogTimer = null;
    else handoffTimer = null;
  }

  function clearTimers() {
    clearNamedTimer("hard");
    clearNamedTimer("progress");
    clearNamedTimer("handoff");
  }

  function pauseVideo() {
    try {
      videoElement.pause();
    } catch {
      // Navigation and teardown must not be trapped by a broken media element.
    }
    releaseVideoBgm(videoElement, { owner: windowObject });
  }

  function resetVisualState() {
    documentObject.body.classList.remove(ACTIVE_BODY_CLASS, COMPLETE_BODY_CLASS);
    overlayElement.classList.remove(ACTIVE_OVERLAY_CLASS, COMPLETE_OVERLAY_CLASS);
    setOverlayData("active", false);
    setOverlayData("complete", false);
    overlayElement.setAttribute?.("aria-hidden", "true");
    if (skipElement) skipElement.tabIndex = -1;
    setProgress(0);
  }

  function navigateNow() {
    if (state === "destroyed" || navigationStarted) return;
    navigationStarted = true;
    generation += 1;
    clearTimers();
    pauseVideo();
    state = "navigating";
    navigateTo(destination);
  }

  function scheduleTimer(name, delay, callback) {
    clearNamedTimer(name);
    const normalizedDelay = Number(delay);
    if (!Number.isFinite(normalizedDelay) || normalizedDelay <= 0) return;
    const operation = generation;
    const timer = setTimer(() => {
      if (operation !== generation || state === "destroyed") return;
      if (name === "hard") hardWatchdogTimer = null;
      else if (name === "progress") progressWatchdogTimer = null;
      else handoffTimer = null;
      callback();
    }, normalizedDelay);
    if (name === "hard") hardWatchdogTimer = timer;
    else if (name === "progress") progressWatchdogTimer = timer;
    else handoffTimer = timer;
  }

  function startProgressWatchdog() {
    if (state !== "playing") return;
    scheduleTimer("progress", progressWatchdogMs, navigateNow);
  }

  function activateOverlay() {
    documentObject.body.classList.add(ACTIVE_BODY_CLASS);
    documentObject.body.classList.remove(COMPLETE_BODY_CLASS);
    overlayElement.classList.add(ACTIVE_OVERLAY_CLASS);
    overlayElement.classList.remove(COMPLETE_OVERLAY_CLASS);
    setOverlayData("active", true);
    setOverlayData("complete", false);
    overlayElement.setAttribute?.("aria-hidden", "false");
    if (skipElement) skipElement.tabIndex = 0;
    setProgress(0);
    try {
      skipElement?.focus?.({ preventScroll: true });
    } catch {
      try {
        skipElement?.focus?.();
      } catch {
        // Focusing the escape hatch is an enhancement, not a navigation gate.
      }
    }
  }

  function startPlayback() {
    if (state !== "idle") return;
    if (prefersReducedMotion()) {
      navigateNow();
      return;
    }

    state = "playing";
    navigationStarted = false;
    const operation = ++generation;
    lastProgressTime = 0;
    activateOverlay();
    claimVideoBgm(videoElement, { owner: windowObject, volume: 1, force: true });

    try {
      videoElement.currentTime = 0;
    } catch {
      navigateNow();
      return;
    }

    scheduleTimer("hard", watchdogMs, navigateNow);
    startProgressWatchdog();

    let playResult;
    try {
      playResult = videoElement.play();
    } catch {
      navigateNow();
      return;
    }

    if (playResult?.catch) {
      playResult.catch(() => {
        if (generation === operation && state === "playing") navigateNow();
      });
    }
  }

  function handleLinkClick(event) {
    if (!isUnmodifiedPrimaryClick(event)) return;
    event.preventDefault();
    startPlayback();
  }

  function handleTimeUpdate() {
    if (state !== "playing") return;
    const duration = Number(videoElement.duration);
    const currentTime = Number(videoElement.currentTime);
    setProgress(duration > 0 ? currentTime / duration : 0);

    if (Number.isFinite(currentTime) && currentTime > lastProgressTime + 0.01) {
      lastProgressTime = currentTime;
      startProgressWatchdog();
    }
  }

  function handleEnded() {
    if (state !== "playing") return;
    state = "handoff";
    clearNamedTimer("hard");
    clearNamedTimer("progress");
    setProgress(1);
    setOverlayData("complete", true);
    documentObject.body.classList.add(COMPLETE_BODY_CLASS);
    overlayElement.classList.add(COMPLETE_OVERLAY_CLASS);

    const delay = prefersReducedMotion() ? 0 : Number(handoffDelayMs);
    if (!Number.isFinite(delay) || delay <= 0) navigateNow();
    else scheduleTimer("handoff", delay, navigateNow);
  }

  function handleSkip(event) {
    if (state !== "playing" && state !== "handoff") return;
    event?.preventDefault?.();
    navigateNow();
  }

  function handleKeydown(event) {
    if (event.key !== "Escape" || (state !== "playing" && state !== "handoff")) return;
    event.preventDefault?.();
    navigateNow();
  }

  function handleReducedMotionChange(event) {
    if (!event.matches || (state !== "playing" && state !== "handoff")) return;
    navigateNow();
  }

  function handleMediaError() {
    if (state !== "playing" && state !== "handoff") return;
    navigateNow();
  }

  function handlePageShow(event) {
    if (!event.persisted || state === "destroyed") return;
    generation += 1;
    clearTimers();
    navigationStarted = false;
    state = "idle";
    pauseVideo();
    try {
      videoElement.currentTime = 0;
    } catch {
      // A restored page remains usable even if the browser has discarded media state.
    }
    skipElement?.blur?.();
    resetVisualState();
  }

  linkElement.addEventListener("click", handleLinkClick);
  videoElement.addEventListener("timeupdate", handleTimeUpdate);
  videoElement.addEventListener("ended", handleEnded);
  videoElement.addEventListener("error", handleMediaError);
  skipElement?.addEventListener?.("click", handleSkip);
  documentObject.addEventListener("keydown", handleKeydown);
  windowObject.addEventListener("pageshow", handlePageShow);
  if (mediaQuery?.addEventListener) mediaQuery.addEventListener("change", handleReducedMotionChange);
  else mediaQuery?.addListener?.(handleReducedMotionChange);

  resetVisualState();
  enableVideoBgm(videoElement, 1);
  pauseVideo();
  try {
    videoElement.currentTime = 0;
  } catch {
    // Metadata may not be available yet; activation retries the seek.
  }

  return {
    getState: () => state,
    destroy() {
      if (state === "destroyed") return;
      generation += 1;
      state = "destroyed";
      navigationStarted = false;
      clearTimers();
      pauseVideo();
      try {
        videoElement.currentTime = 0;
      } catch {
        // Teardown must always continue.
      }
      skipElement?.blur?.();
      resetVisualState();
      linkElement.removeEventListener("click", handleLinkClick);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("ended", handleEnded);
      videoElement.removeEventListener("error", handleMediaError);
      skipElement?.removeEventListener?.("click", handleSkip);
      documentObject.removeEventListener("keydown", handleKeydown);
      windowObject.removeEventListener("pageshow", handlePageShow);
      if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener("change", handleReducedMotionChange);
      else mediaQuery?.removeListener?.(handleReducedMotionChange);
    },
  };
}
