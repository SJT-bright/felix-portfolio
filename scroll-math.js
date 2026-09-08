export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getScrollProgress(scrollTop, scrollHeight, viewportHeight) {
  const maximum = Number(scrollHeight) - Number(viewportHeight);
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;
  return clamp01(Number(scrollTop) / maximum);
}

export function progressToTime(progress, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return clamp01(progress) * duration;
}
