import {
  claimVideoBgm,
  enableVideoBgm,
  releaseVideoBgm,
  subscribeVideoBgmAvailability,
} from "../../lib/video-bgm.js";

const INTERSECTION_THRESHOLD = 0.35;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function createProjectVideoController({ root, video, win, doc }) {
  if (!root || !video?.pause || !video?.play || !video?.addEventListener || !video?.removeEventListener
    || !doc?.addEventListener || !doc?.removeEventListener) {
    return { destroy() {} };
  }

  let destroyed = false;
  let mediaFailed = false;
  let playBlocked = false;
  let isIntersecting = false;
  const mediaQuery = win?.matchMedia?.(REDUCED_MOTION_QUERY);

  const pause = () => {
    video.pause();
    releaseVideoBgm(video, { owner: win });
  };
  const eligibleToPlay = () => (
    isIntersecting
    && doc.visibilityState === "visible"
    && !mediaQuery?.matches
    && !mediaFailed
    && !playBlocked
  );
  const syncPlayback = ({ forceAudio = false } = {}) => {
    if (destroyed || !eligibleToPlay()) {
      pause();
      return;
    }
    if (!claimVideoBgm(video, { owner: win, volume: 0.65, force: forceAudio })) {
      video.pause();
      return;
    }

    try {
      const playResult = video.play();
      if (playResult?.then) {
        playResult.then(() => {
          if (destroyed || !eligibleToPlay()) pause();
        }).catch(() => {
          playBlocked = true;
          pause();
        });
      }
    } catch {
      playBlocked = true;
      pause();
    }
  };
  const onVisibilityChange = () => syncPlayback();
  const onReducedMotionChange = () => syncPlayback();
  const onMediaError = () => {
    mediaFailed = true;
    pause();
  };
  const onRootClick = () => {
    if (!isIntersecting || mediaFailed || mediaQuery?.matches) return;
    playBlocked = false;
    syncPlayback({ forceAudio: true });
  };

  enableVideoBgm(video, 0.65);
  pause();
  doc.addEventListener("visibilitychange", onVisibilityChange);
  video.addEventListener("error", onMediaError);
  root.addEventListener?.("click", onRootClick);
  const unsubscribeAudioAvailability = subscribeVideoBgmAvailability(
    () => {
      if (eligibleToPlay()) syncPlayback();
    },
    { owner: win },
  );

  if (mediaQuery?.addEventListener) {
    mediaQuery.addEventListener("change", onReducedMotionChange);
  } else {
    mediaQuery?.addListener?.(onReducedMotionChange);
  }

  let observer;
  if (win?.IntersectionObserver) {
    observer = new win.IntersectionObserver((entries) => {
      if (destroyed) return;
      let entry;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].target === root) {
          entry = entries[index];
          break;
        }
      }
      if (!entry) return;
      isIntersecting = entry.isIntersecting === true
        && Number.isFinite(entry.intersectionRatio)
        && entry.intersectionRatio >= INTERSECTION_THRESHOLD;
      syncPlayback();
    }, { threshold: INTERSECTION_THRESHOLD });
    observer.observe(root);
  }

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      video.removeEventListener("error", onMediaError);
      root.removeEventListener?.("click", onRootClick);
      unsubscribeAudioAvailability();
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener("change", onReducedMotionChange);
      } else {
        mediaQuery?.removeListener?.(onReducedMotionChange);
      }
      pause();
    },
  };
}
