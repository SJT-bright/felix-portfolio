const AUDIO_FOCUS_KEY = Symbol.for("felix.video-bgm-focus");

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1, Math.max(0, numeric));
}

function getAudioFocus(owner) {
  const target = owner && (typeof owner === "object" || typeof owner === "function")
    ? owner
    : globalThis;
  if (!target[AUDIO_FOCUS_KEY]) {
    target[AUDIO_FOCUS_KEY] = { activeVideo: null, listeners: new Set() };
  }
  return target[AUDIO_FOCUS_KEY];
}

export function enableVideoBgm(video, volume = 1) {
  if (!video) return;
  try {
    video.defaultMuted = false;
    video.muted = false;
    video.volume = clampVolume(volume);
  } catch {
    // A video that cannot expose audio properties will fail through its normal play path.
  }
}

export function claimVideoBgm(video, { owner = globalThis, volume = 1, force = false } = {}) {
  if (!video) return false;
  const focus = getAudioFocus(owner);
  const previous = focus.activeVideo;
  if (previous && previous !== video) {
    if (!force) return false;
    try {
      previous.pause?.();
    } catch {
      // Sound focus still moves to the explicitly requested video.
    }
  }
  focus.activeVideo = video;
  enableVideoBgm(video, volume);
  return true;
}

export function releaseVideoBgm(video, { owner = globalThis } = {}) {
  const focus = getAudioFocus(owner);
  if (focus.activeVideo !== video) return;
  focus.activeVideo = null;
  for (const listener of [...focus.listeners]) listener();
}

export function subscribeVideoBgmAvailability(listener, { owner = globalThis } = {}) {
  if (typeof listener !== "function") return () => {};
  const focus = getAudioFocus(owner);
  focus.listeners.add(listener);
  return () => focus.listeners.delete(listener);
}

export function isAudioPlaybackBlocked(error) {
  return error?.name === "NotAllowedError";
}
