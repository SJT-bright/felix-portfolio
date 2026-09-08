import {
  claimVideoBgm,
  enableVideoBgm,
  isAudioPlaybackBlocked,
  releaseVideoBgm,
} from "./src/lib/video-bgm.js";

const NEXT_KEYS = new Set(["ArrowDown", "PageDown", "Enter", " "]);
const HOMEPAGE_TRANSITION_FADE_SECONDS = 1.05;
const HOMEPAGE_SITE_AMBIENT_VOLUME = 0.22;

export function createScrollVideoController({
  video,
  win,
  doc,
  root,
  statusElement,
  trackElement,
  triggerElement = null,
  autoPlay = false,
  ambientSrc = null,
  wheelIdleMs = 350,
  swipeThreshold = 24,
  stallTimeoutMs = 15000,
  revealDurationMs = 760,
}) {
  let state = "idle";
  let touchStart = null;
  let revealTimer = null;
  let settleTimer = null;
  let stallTimer = null;
  let generation = 0;
  let lastProgressTime = 0;
  let ambientLoop = null;
  let ambientStarted = false;
  let playbackFailed = false;
  let audioGestureRequired = false;
  const unavailableText = statusElement.textContent;
  const triggerText = triggerElement?.textContent;
  const triggerLabel = triggerElement?.getAttribute?.("aria-label");
  const setTimer = win.setTimeout?.bind(win) ?? globalThis.setTimeout;
  const clearTimer = win.clearTimeout?.bind(win) ?? globalThis.clearTimeout;
  const reducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  const transitionDuration = Number(HOMEPAGE_TRANSITION_FADE_SECONDS);

  function clampVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(1, Math.max(0, numeric));
  }

  function setAmbientVolume(value) {
    if (!ambientLoop) return;
    ambientLoop.volume = clampVolume(value);
  }

  function ensureAmbientLoop() {
    const source = ambientSrc || video.currentSrc;
    if (ambientLoop || !source || typeof win.Audio !== "function") return ambientLoop;
    const audio = new win.Audio(source);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    ambientLoop = audio;
    return ambientLoop;
  }

  function startAmbientLoop() {
    if (!ambientLoop || ambientStarted) return Promise.resolve(ambientStarted);
    const operation = generation;
    ambientStarted = true;
    try {
      ambientLoop.currentTime = 0;
      const result = ambientLoop.play();
      return Promise.resolve(result).then(() => generation === operation, () => {
        if (generation === operation) ambientStarted = false;
        return false;
      });
    } catch {
      // The first gesture may be denied by browser policy.
      ambientStarted = false;
      return Promise.resolve(false);
    }
  }

  function stopAmbientLoop() {
    ambientStarted = false;
    if (!ambientLoop) return;
    setAmbientVolume(0);
    try {
      ambientLoop.pause();
      ambientLoop.currentTime = 0;
    } catch {
      // A detached or unloaded audio element may not be seekable yet.
    }
  }

  function updateTransitionMix(currentTime, duration) {
    if (video.muted) return;
    if (!Number.isFinite(duration) || !Number.isFinite(currentTime) || transitionDuration <= 0 || transitionDuration >= duration) return;
    const remain = duration - currentTime;
    if (remain > transitionDuration || remain <= 0) return;

    const ratio = 1 - Math.max(0, Math.min(1, remain / transitionDuration));
    video.volume = clampVolume(1 - ratio);

    const ambient = ensureAmbientLoop();
    if (!ambient) return;
    startAmbientLoop();
    setAmbientVolume(ratio * HOMEPAGE_SITE_AMBIENT_VOLUME);
  }

  function setProgress(value) {
    const progress = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    root.style.setProperty("--scroll-progress", String(progress));
  }

  function clearNamedTimer(name) {
    const timer = name === "reveal"
      ? revealTimer
      : name === "settle"
        ? settleTimer
        : stallTimer;
    if (timer !== null) clearTimer(timer);
    if (name === "reveal") revealTimer = null;
    else if (name === "settle") settleTimer = null;
    else stallTimer = null;
  }

  function clearStatus() {
    doc.body.classList.remove("video-waiting", "video-failed", "video-audio-blocked");
    statusElement.textContent = unavailableText;
    statusElement.hidden = true;
    if (triggerElement && triggerText !== undefined) triggerElement.textContent = triggerText;
    if (triggerLabel) triggerElement?.setAttribute?.("aria-label", triggerLabel);
    if (autoPlay && triggerElement) triggerElement.hidden = true;
  }

  function setAudioRecovery(required) {
    if (audioGestureRequired === required) return;
    audioGestureRequired = required;
    if (required) {
      win.addEventListener("click", handleAudioGesture, true);
      win.addEventListener("keydown", handleAudioGesture, true);
    } else {
      win.removeEventListener("click", handleAudioGesture, true);
      win.removeEventListener("keydown", handleAudioGesture, true);
    }
  }

  function handleAudioGesture(event) {
    if (!event.isTrusted || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") return;
    // Let another video own its initiating click without restarting site ambience.
    if (event.target?.closest?.(".portfolio-entry, [data-portfolio-transition], .profile-landing__replay")) return;
    enableSound();
  }

  function showWaiting() {
    if (state !== "playing") return;
    doc.body.classList.add("video-waiting");
    statusElement.textContent = "视频正在加载，请稍候。";
    statusElement.hidden = false;
  }

  function failPlayback() {
    if (
      state === "revealing"
      || state === "settling"
      || state === "completed"
      || state === "destroyed"
    ) return;
    playbackFailed = true;
    setAudioRecovery(false);
    generation += 1;
    state = "failed";
    clearNamedTimer("stall");
    touchStart = null;
    pausePlayback();
    stopAmbientLoop();
    doc.body.classList.remove("video-playing", "video-waiting", "video-audio-blocked");
    doc.body.classList.add("video-failed", "home-intro-pending");
    statusElement.textContent = "序章暂时无法播放，请点击下方按钮重新加载。";
    statusElement.hidden = false;
    if (triggerElement) {
      triggerElement.hidden = false;
      triggerElement.textContent = "重新加载并播放序章 · BGM ON";
      triggerElement.setAttribute?.("aria-label", "重新加载并播放带音乐的虫洞穿越序章");
    }
  }

  function pausePlayback() {
    video.pause();
    releaseVideoBgm(video, { owner: win });
  }

  function waitForAudioGesture() {
    if (state !== "playing") return;
    state = "idle";
    clearNamedTimer("stall");
    doc.body.classList.remove("video-playing", "video-waiting");
    doc.body.classList.add("video-audio-blocked");
    statusElement.textContent = "请点击屏幕，开启音乐并播放序章。";
    statusElement.hidden = false;
    pausePlayback();
    enableVideoBgm(video, 1);
    setAudioRecovery(false);
    if (triggerElement) triggerElement.hidden = false;
    try {
      video.currentTime = 0;
    } catch {
      // A fresh click retries playback even if seeking is temporarily unavailable.
    }
    setProgress(0);
  }

  function handlePlayFailure(error, { allowMuted = false } = {}) {
    if (isAudioPlaybackBlocked(error) && allowMuted) playMuted();
    else if (isAudioPlaybackBlocked(error)) waitForAudioGesture();
    else failPlayback();
  }

  function playMuted() {
    if (state !== "playing") return;
    const operation = generation;
    video.muted = true;
    setAudioRecovery(true);
    try {
      const result = video.play();
      result?.catch?.((error) => {
        if (generation === operation && state === "playing") handlePlayFailure(error);
      });
    } catch (error) {
      handlePlayFailure(error);
    }
  }

  function enableSound() {
    if (!audioGestureRequired || state === "destroyed") return;
    const operation = generation;
    if (state === "playing") {
      // A normal page interaction restores sound without replaying the film.
      claimVideoBgm(video, { owner: win, volume: video.volume, force: true });
      try {
        Promise.resolve(video.play()).then(() => {
          if (generation === operation) setAudioRecovery(false);
        }, () => {
          if (generation === operation && state === "playing") playMuted();
        });
      } catch {
        playMuted();
      }
    } else if (["revealing", "settling", "completed"].includes(state)) {
      ensureAmbientLoop();
      setAmbientVolume(HOMEPAGE_SITE_AMBIENT_VOLUME);
      startAmbientLoop().then((started) => {
        if (started && generation === operation) setAudioRecovery(false);
      });
    }
  }

  function resetStallTimer() {
    clearNamedTimer("stall");
    if (state !== "playing" || !Number.isFinite(stallTimeoutMs) || stallTimeoutMs <= 0) return;
    stallTimer = setTimer(() => {
      stallTimer = null;
      failPlayback();
    }, stallTimeoutMs);
  }

  function heroIsActive() {
    const bounds = trackElement.getBoundingClientRect();
    return bounds.top <= 1 && bounds.bottom > Math.max(1, win.innerHeight * 0.5);
  }

  function prevent(event) {
    if (event.cancelable !== false) event.preventDefault();
  }

  function completeSettling() {
    settleTimer = null;
    if (state === "settling") {
      state = "completed";
      doc.body.classList.remove("home-intro-pending");
    }
  }

  function refreshSettlingLock() {
    clearNamedTimer("settle");
    settleTimer = setTimer(completeSettling, wheelIdleMs);
  }

  function finishReveal() {
    revealTimer = null;
    if (state !== "revealing") return;
    state = "settling";
    refreshSettlingLock();
  }

  function revealLanding({ immediate = false } = {}) {
    if (immediate && (state === "revealing" || state === "settling")) {
      clearNamedTimer("reveal");
      clearNamedTimer("settle");
      state = "completed";
      doc.body.classList.remove("home-intro-pending");
      return;
    }
    if (state !== "playing") return;
    state = "revealing";
    clearNamedTimer("stall");
    doc.body.classList.remove("video-playing", "video-waiting");
    doc.body.classList.add("video-complete");
    doc.body.classList.remove("video-failed");
    statusElement.hidden = true;
    const ambient = video.muted ? null : ensureAmbientLoop();
    if (ambient) {
      startAmbientLoop();
      setAmbientVolume(HOMEPAGE_SITE_AMBIENT_VOLUME);
    }
    video.volume = 0;
    pausePlayback();
    setProgress(1);

    if (immediate || reducedMotion?.matches) {
      state = "completed";
      doc.body.classList.remove("home-intro-pending");
      return;
    }

    const delay = Math.max(0, Number(revealDurationMs) || 0);
    if (delay === 0) finishReveal();
    else revealTimer = setTimer(finishReveal, delay);
  }

  function startPlayback({ explicit = false, automatic = false } = {}) {
    if (state !== "idle" || (!explicit && !heroIsActive())) return;

    const operation = ++generation;
    clearStatus();
    setAudioRecovery(false);
    claimVideoBgm(video, { owner: win, volume: 1, force: true });
    const bounds = trackElement.getBoundingClientRect();
    if (Math.abs(bounds.top) > 1 && win.scrollTo) {
      const targetTop = bounds.top + win.scrollY;
      try {
        win.scrollTo({ top: targetTop, behavior: "auto" });
      } catch {
        try {
          win.scrollTo(0, targetTop);
        } catch {
          // Alignment is only a visual correction; media playback must remain usable.
        }
      }
    }
    try {
      video.currentTime = 0;
    } catch {
      failPlayback();
      return;
    }

    state = "playing";
    doc.body.classList.add("video-playing");
    stopAmbientLoop();
    video.volume = 1;
    setProgress(0);
    lastProgressTime = 0;
    resetStallTimer();

    let playResult;
    try {
      playResult = video.play();
    } catch (error) {
      handlePlayFailure(error, { allowMuted: automatic });
      return;
    }
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch((error) => {
        if (generation === operation && state === "playing") handlePlayFailure(error, { allowMuted: automatic });
      });
    }
  }

  function replay() {
    if (state === "destroyed" || state === "playing") return;
    const reloadMedia = playbackFailed || Boolean(video.error);
    playbackFailed = false;
    generation += 1;
    clearNamedTimer("reveal");
    clearNamedTimer("settle");
    clearNamedTimer("stall");
    touchStart = null;
    pausePlayback();
    stopAmbientLoop();
    clearStatus();
    doc.body.classList.remove("video-complete", "video-playing");
    doc.body.classList.add("home-intro-pending");
    state = "idle";
    setProgress(0);
    if (reloadMedia) {
      try {
        video.load?.();
      } catch {
        // The play path below reports a persistent media failure normally.
      }
    }
    startPlayback({ explicit: true });
  }

  function handleWheel(event) {
    if (state === "failed" || state === "playing" || state === "revealing" || state === "settling") {
      prevent(event);
      if (state === "settling") refreshSettlingLock();
      return;
    }
    if (
      state !== "idle"
      || !Number.isFinite(event.deltaY)
      || event.deltaY <= 0
      || Math.abs(event.deltaY) <= Math.abs(Number(event.deltaX) || 0)
      || !heroIsActive()
    ) return;
    prevent(event);
    startPlayback();
  }

  function handleKeydown(event) {
    if (!NEXT_KEYS.has(event.key)) return;
    if (event.target?.matches?.("input, textarea, select, button, a, [contenteditable='true']")) return;
    if (state === "failed") {
      prevent(event);
      if (!event.repeat && (event.key === "Enter" || event.key === " ")) replay();
      return;
    }
    if (state === "playing" || state === "revealing" || state === "settling") {
      prevent(event);
      return;
    }
    if (state !== "idle" || event.repeat || !heroIsActive()) return;
    prevent(event);
    startPlayback();
  }

  function handleClick(event) {
    if (state === "failed") {
      prevent(event);
      replay();
      return;
    }
    if (state === "playing" || state === "revealing" || state === "settling") {
      prevent(event);
      return;
    }
    if (state !== "idle" || !heroIsActive()) return;
    prevent(event);
    startPlayback({ explicit: true });
  }

  function handleTouchStart(event) {
    if (event.touches?.length !== 1 || state !== "idle" || !heroIsActive()) {
      touchStart = null;
      return;
    }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchMove(event) {
    if (state === "failed" || state === "playing" || state === "revealing" || state === "settling") {
      prevent(event);
      if (state === "settling") refreshSettlingLock();
      return;
    }
    if (state !== "idle" || !touchStart || event.touches?.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touchStart.y - touch.clientY;
    if (deltaY <= 0 || deltaY <= Math.abs(deltaX)) return;
    prevent(event);
    if (deltaY < swipeThreshold) return;
    touchStart = null;
    startPlayback();
  }

  function clearTouch() {
    touchStart = null;
  }

  function handleTimeUpdate() {
    if (state !== "playing") return;
    const duration = Number(video.duration);
    const currentTime = Number(video.currentTime);
    setProgress(duration > 0 ? currentTime / duration : 0);
    updateTransitionMix(currentTime, duration);
    if (Number.isFinite(currentTime) && currentTime > lastProgressTime + 0.01) {
      lastProgressTime = currentTime;
      clearStatus();
      resetStallTimer();
    }
  }

  function handleWaiting() {
    showWaiting();
  }

  function handlePlaying() {
    if (state !== "playing") return;
    clearStatus();
  }

  function handleReducedMotionChange(event) {
    if (!event.matches || (state !== "revealing" && state !== "settling")) return;
    revealLanding({ immediate: true });
  }

  function initializeMedia() {
    if (state !== "idle") return;
    enableVideoBgm(video, 1);
    pausePlayback();
    try {
      video.currentTime = 0;
    } catch {
      failPlayback();
    }
  }

  const wheelOptions = { passive: false };
  const passive = { passive: true };
  win.addEventListener("wheel", handleWheel, wheelOptions);
  win.addEventListener("keydown", handleKeydown);
  win.addEventListener("touchstart", handleTouchStart, passive);
  win.addEventListener("touchmove", handleTouchMove, wheelOptions);
  win.addEventListener("touchend", clearTouch, passive);
  win.addEventListener("touchcancel", clearTouch, passive);
  triggerElement?.addEventListener("click", handleClick);
  video.addEventListener("loadedmetadata", initializeMedia);
  video.addEventListener("timeupdate", handleTimeUpdate);
  video.addEventListener("playing", handlePlaying);
  video.addEventListener("waiting", handleWaiting);
  video.addEventListener("stalled", handleWaiting);
  video.addEventListener("ended", revealLanding);
  video.addEventListener("error", failPlayback, true);
  if (reducedMotion?.addEventListener) reducedMotion.addEventListener("change", handleReducedMotionChange);
  else reducedMotion?.addListener?.(handleReducedMotionChange);

  clearStatus();
  setAudioRecovery(false);
  doc.body.classList.add("home-intro-pending");
  setProgress(0);
  enableVideoBgm(video, 1);
  pausePlayback();
  // Fetch the supplied soundtrack while the prelude plays, before its crossfade.
  if (ambientSrc) ensureAmbientLoop();
  if (video.readyState >= 1) {
    try {
      video.currentTime = 0;
    } catch {
      failPlayback();
    }
  }
  // A failed <source> can finish before the loader enables this controller,
  // leaving no MediaError but a settled NETWORK_NO_SOURCE state.
  if (video.error || Number(video.networkState) === 3) failPlayback();
  else if (autoPlay) startPlayback({ explicit: true, automatic: true });

  return {
    getState: () => state,
    replay,
    destroy() {
      if (state === "destroyed") return;
      generation += 1;
      state = "destroyed";
      clearNamedTimer("reveal");
      clearNamedTimer("settle");
      clearNamedTimer("stall");
      touchStart = null;
      pausePlayback();
      stopAmbientLoop();
      doc.body.classList.remove("video-playing", "video-complete", "home-intro-pending");
      clearStatus();
      setAudioRecovery(false);
      setProgress(0);
      win.removeEventListener("wheel", handleWheel);
      win.removeEventListener("keydown", handleKeydown);
      win.removeEventListener("touchstart", handleTouchStart);
      win.removeEventListener("touchmove", handleTouchMove);
      win.removeEventListener("touchend", clearTouch);
      win.removeEventListener("touchcancel", clearTouch);
      triggerElement?.removeEventListener("click", handleClick);
      video.removeEventListener("loadedmetadata", initializeMedia);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("ended", revealLanding);
      video.removeEventListener("error", failPlayback, true);
      if (reducedMotion?.removeEventListener) reducedMotion.removeEventListener("change", handleReducedMotionChange);
      else reducedMotion?.removeListener?.(handleReducedMotionChange);
    },
  };
}
