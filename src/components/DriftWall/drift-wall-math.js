export function columnFactor(index, variance) {
  const safeIndex = Number.isFinite(index) ? index : 0;
  const safeVariance = Number.isFinite(variance) ? Math.max(0, variance) : 0;
  const pseudo = ((safeIndex * 0.6180339887 + 0.35) % 1) * 2 - 1;
  return 1 + safeVariance * pseudo;
}

export function distributeItems(items, columns) {
  const safeItems = Array.isArray(items) ? items : [];
  const count = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
  const distributed = Array.from({ length: count }, () => []);

  safeItems.forEach((item, index) => {
    distributed[index % count].push(item);
  });

  return distributed.map((column) => (
    column.length > 0 || safeItems.length === 0 ? column : [safeItems[0]]
  ));
}

export function getColumnMeta(itemCount, tileHeight, gap, containerHeight) {
  const unit = Math.max(1, Number(tileHeight) + Number(gap));
  const count = Math.max(0, Math.floor(Number(itemCount) || 0));
  const height = Math.max(0, Number(containerHeight) || 0);
  const copyHeight = Math.max(unit, count * unit);
  const copies = Math.max(2, Math.ceil((height * 1.6) / copyHeight) + 1);

  return { copyHeight, copies };
}

export function normalizeOffset(offset, copyHeight) {
  if (!Number.isFinite(copyHeight) || copyHeight <= 0) return 0;
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  return ((safeOffset % copyHeight) + copyHeight) % copyHeight;
}
