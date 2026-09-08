const MAX_LOADING_PROGRESS = 94;

export function clampLoaderProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

export function loaderProgressToAngle(value) {
  return clampLoaderProgress(value) * 3.6;
}

function bufferedRatio(video) {
  const duration = Number(video?.duration);
  const ranges = video?.buffered;
  if (!Number.isFinite(duration) || duration <= 0 || !ranges?.length) return 0;

  try {
    return Math.min(1, Math.max(0, Number(ranges.end(ranges.length - 1)) / duration));
  } catch {
    return 0;
  }
}

export function createHomeLoaderController({
  video,
  image,
  loaderElement,
  rootElement,
  progressElement,
  percentageElement,
  announcementElement,
  win,
  doc,
  minVisibleMs = 1000,
  completionMs = 420,
  completionHoldMs = 180,
  exitMs = 420,
  timeoutMs = 8000,
  onComplete = () => {},
}) {
  if (!video || !loaderElement || !progressElement || !percentageElement || !win || !doc) {
    throw new TypeError("Home loader requires its media, DOM elements, window, and document.");
  }

  let state = "loading";
  let progress = 0;
  let resourceFloor = 0;
  let imageReady = !image || Boolean(image.complete);
  let videoReady = Number(video.readyState) >= 3;
  let completionStartedAt = 0;
  let completionFrom = 0;
  let readyTimer = null;
  let holdTimer = null;
  let exitTimer = null;
  let timeoutTimer = null;
  let animationFrame = null;
  let completionSent = false;

  const setTimer = win.setTimeout?.bind(win) ?? globalThis.setTimeout;
  const clearTimer = win.clearTimeout?.bind(win) ?? globalThis.clearTimeout;
  const now = () => win.performance?.now?.() ?? Date.now();
  const requestFrame = win.requestAnimationFrame?.bind(win)
    ?? ((callback) => setTimer(() => callback(now()), 16));
  const cancelFrame = win.cancelAnimationFrame?.bind(win) ?? clearTimer;
  const startedAt = now();

  function updateProgress(nextValue) {
    const next = Math.max(progress, clampLoaderProgress(nextValue));
    if (next === progress && loaderElement.dataset.progress) return;

    progress = next;
    const rounded = Math.round(progress);
    const angle = loaderProgressToAngle(progress);
    loaderElement.dataset.progress = progress.toFixed(2);
    loaderElement.style.setProperty("--site-loader-angle", `${angle.toFixed(3)}deg`);
    loaderElement.style.setProperty("--site-loader-dashoffset", String(100 - progress));
    progressElement.setAttribute("aria-valuenow", String(rounded));
    percentageElement.textContent = `${String(rounded).padStart(3, "0")}%`;
  }

  function setResourceFloor(nextFloor) {
    resourceFloor = Math.max(resourceFloor, Math.min(MAX_LOADING_PROGRESS, nextFloor));
  }

  function clearTimers() {
    for (const timer of [readyTimer, holdTimer, exitTimer, timeoutTimer]) {
      if (timer !== null) clearTimer(timer);
    }
    readyTimer = null;
    holdTimer = null;
    exitTimer = null;
    timeoutTimer = null;
  }

  function finish() {
    if (state === "completed" || state === "destroyed") return;
    state = "completed";
    loaderElement.hidden = true;
    loaderElement.remove();
    doc.body.classList.remove("site-loading");
    rootElement?.removeAttribute("aria-busy");
    if (rootElement && "inert" in rootElement) rootElement.inert = false;
    if (!completionSent) {
      completionSent = true;
      onComplete();
    }
  }

  function beginExit() {
    if (state !== "holding") return;
    state = "exiting";
    loaderElement.dataset.state = "exiting";
    const duration = Math.max(0, Number(exitMs) || 0);
    if (duration === 0) finish();
    else exitTimer = setTimer(finish, duration);
  }

  function completeProgressFrame(timestamp) {
    const duration = Math.max(0, Number(completionMs) || 0);
    const elapsed = Math.max(0, timestamp - completionStartedAt);
    const t = duration === 0 ? 1 : Math.min(1, elapsed / duration);
    const eased = 1 - ((1 - t) ** 3);
    updateProgress(completionFrom + ((100 - completionFrom) * eased));

    if (t < 1) return;
    state = "holding";
    updateProgress(100);
    loaderElement.dataset.state = "complete";
    if (announcementElement) announcementElement.textContent = "加载完成。";
    const hold = Math.max(0, Number(completionHoldMs) || 0);
    if (hold === 0) beginExit();
    else holdTimer = setTimer(beginExit, hold);
  }

  function beginCompletion(reason = "ready") {
    if (state !== "loading") return;
    state = "completing";
    clearTimer(readyTimer);
    clearTimer(timeoutTimer);
    readyTimer = null;
    timeoutTimer = null;
    completionStartedAt = now();
    completionFrom = progress;
    loaderElement.dataset.outcome = reason;
    loaderElement.dataset.state = "completing";
  }

  function scheduleCompletion(reason = "ready") {
    if (state !== "loading") return;
    const remaining = Math.max(0, Number(minVisibleMs) - (now() - startedAt));
    if (remaining === 0) {
      beginCompletion(reason);
      return;
    }
    if (readyTimer !== null) return;
    readyTimer = setTimer(() => {
      readyTimer = null;
      beginCompletion(reason);
    }, remaining);
  }

  function maybeComplete() {
    if (imageReady && videoReady) scheduleCompletion("ready");
  }

  function handleImageLoad() {
    imageReady = true;
    setResourceFloor(15);
    maybeComplete();
  }

  function handleImageError() {
    imageReady = true;
    loaderElement.dataset.imageState = "failed";
    maybeComplete();
  }

  function handleMetadata() {
    setResourceFloor(40);
  }

  function handleProgress() {
    const ratio = bufferedRatio(video);
    setResourceFloor(40 + (ratio * 54));
  }

  function handleCanPlay() {
    videoReady = true;
    setResourceFloor(MAX_LOADING_PROGRESS);
    maybeComplete();
  }

  function handleVideoError() {
    videoReady = true;
    loaderElement.dataset.videoState = "failed";
    setResourceFloor(MAX_LOADING_PROGRESS);
    scheduleCompletion("media-failed-open");
  }

  function tick(timestamp) {
    animationFrame = null;
    if (state === "destroyed" || state === "completed") return;

    if (state === "loading") {
      const elapsed = Math.max(0, timestamp - startedAt);
      const syntheticTarget = MAX_LOADING_PROGRESS * (1 - Math.exp(-elapsed / 900));
      const pacedCeiling = Number(minVisibleMs) > 0
        ? MAX_LOADING_PROGRESS * Math.min(1, elapsed / Number(minVisibleMs))
        : MAX_LOADING_PROGRESS;
      const target = Math.min(pacedCeiling, Math.max(resourceFloor, syntheticTarget));
      const step = Math.max(0.08, (target - progress) * 0.1);
      updateProgress(Math.min(MAX_LOADING_PROGRESS, progress + step));
    } else if (state === "completing") {
      completeProgressFrame(timestamp);
    }

    if (state !== "holding" && state !== "exiting") {
      animationFrame = requestFrame(tick);
    }
  }

  doc.body.classList.add("site-loading");
  loaderElement.hidden = false;
  loaderElement.dataset.state = "loading";
  loaderElement.dataset.outcome = "pending";
  rootElement?.setAttribute("aria-busy", "true");
  if (rootElement && "inert" in rootElement) rootElement.inert = true;
  updateProgress(0);

  image?.addEventListener("load", handleImageLoad);
  image?.addEventListener("error", handleImageError);
  video.addEventListener("loadedmetadata", handleMetadata);
  video.addEventListener("progress", handleProgress);
  video.addEventListener("loadeddata", handleCanPlay);
  video.addEventListener("canplay", handleCanPlay);
  video.addEventListener("error", handleVideoError, true);

  if (imageReady) setResourceFloor(15);
  if (Number(video.readyState) >= 1) handleMetadata();
  if (video.error || Number(video.networkState) === 3) handleVideoError();
  else if (videoReady) handleCanPlay();
  else maybeComplete();

  const timeout = Math.max(0, Number(timeoutMs) || 0);
  if (timeout > 0) {
    timeoutTimer = setTimer(() => {
      timeoutTimer = null;
      beginCompletion("timeout-failed-open");
    }, timeout);
  }
  animationFrame = requestFrame(tick);

  return {
    getState: () => state,
    getProgress: () => progress,
    destroy() {
      if (state === "destroyed" || state === "completed") return;
      state = "destroyed";
      clearTimers();
      if (animationFrame !== null) cancelFrame(animationFrame);
      animationFrame = null;
      image?.removeEventListener("load", handleImageLoad);
      image?.removeEventListener("error", handleImageError);
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("loadeddata", handleCanPlay);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleVideoError, true);
    },
  };
}
