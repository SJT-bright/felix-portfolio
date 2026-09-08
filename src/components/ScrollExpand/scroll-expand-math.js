const DEFAULTS = Object.freeze({
  startWidth: 42,
  startHeight: 58,
  startRadius: 24,
  endRadius: 13,
  mediaZoom: 1.35,
  scrollDistance: 1,
  holdDistance: 0.35,
  smoothing: 0.12,
  overlayScrim: 0.45,
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
const lerp = (start, end, progress) => start + ((end - start) * progress);

const smoothstep = (start, end, value) => {
  if (value <= start) return 0;
  if (value >= end) return 1;
  const progress = (value - start) / (end - start);
  return progress * progress * (3 - (2 * progress));
};

export function normaliseScrollExpandOptions(options = {}) {
  const startWidth = clamp(finiteOr(options.startWidth, DEFAULTS.startWidth), 0, 100);
  const startHeight = clamp(finiteOr(options.startHeight, DEFAULTS.startHeight), 0, 100);
  const startRadius = Math.max(0, finiteOr(options.startRadius, DEFAULTS.startRadius));
  const endRadius = Math.max(0, finiteOr(options.endRadius, DEFAULTS.endRadius));
  const rawZoom = finiteOr(options.mediaZoom, DEFAULTS.mediaZoom);
  const mediaZoom = rawZoom > 0 ? rawZoom : DEFAULTS.mediaZoom;
  const scrollDistance = Math.max(0.01, finiteOr(options.scrollDistance, DEFAULTS.scrollDistance));
  const holdDistance = Math.max(0, finiteOr(options.holdDistance, DEFAULTS.holdDistance));
  const smoothing = clamp(finiteOr(options.smoothing, DEFAULTS.smoothing), 0, 1);
  const overlayScrim = clamp(finiteOr(options.overlayScrim, DEFAULTS.overlayScrim), 0, 1);

  return {
    startWidth,
    startHeight,
    startRadius,
    endRadius,
    mediaZoom,
    scrollDistance,
    holdDistance,
    smoothing,
    overlayScrim,
    totalViewports: 1 + scrollDistance + holdDistance,
  };
}

export function getScrollExpandProgress({ scrollY, trackTop, viewportHeight, scrollDistance }) {
  const safeScrollY = finiteOr(scrollY, 0);
  const safeTrackTop = finiteOr(trackTop, 0);
  const safeViewport = Math.max(1, finiteOr(viewportHeight, 1));
  const safeDistance = Math.max(0.01, finiteOr(scrollDistance, DEFAULTS.scrollDistance));
  return clamp((safeScrollY - safeTrackTop) / (safeViewport * safeDistance), 0, 1);
}

export function getScrollExpandBlend(smoothing, elapsedMs) {
  const safeSmoothing = finiteOr(smoothing, DEFAULTS.smoothing);
  if (safeSmoothing <= 0) return 1;
  const safeElapsed = Math.max(0, finiteOr(elapsedMs, 0));
  return clamp(1 - Math.exp(-(safeElapsed / 1000) / safeSmoothing), 0, 1);
}

export function getScrollExpandFrame(progress, options) {
  const safeProgress = clamp(finiteOr(progress, 0), 0, 1);
  const insetBlockStart = (100 - options.startHeight) / 2;
  const insetInlineStart = (100 - options.startWidth) / 2;

  return {
    insetBlock: lerp(insetBlockStart, 0, safeProgress),
    insetInline: lerp(insetInlineStart, 0, safeProgress),
    radius: lerp(options.startRadius, options.endRadius, safeProgress),
    mediaScale: lerp(options.mediaZoom, 1, safeProgress),
    scrimOpacity: options.overlayScrim * smoothstep(0.5, 1, safeProgress),
    contentOpacity: smoothstep(0.68, 0.94, safeProgress),
    hintOpacity: 1 - smoothstep(0.05, 0.25, safeProgress),
  };
}
