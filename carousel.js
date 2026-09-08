function isValidCount(count) {
  return Number.isInteger(count) && count > 0;
}

export function wrapIndex(index, count) {
  if (!Number.isFinite(index) || !isValidCount(count)) {
    return 0;
  }

  const truncatedIndex = Math.trunc(index);
  return ((truncatedIndex % count) + count) % count;
}

export function signedCircularDistance(index, activeIndex, count) {
  if (!Number.isFinite(index) || !Number.isFinite(activeIndex) || !isValidCount(count)) {
    return 0;
  }

  let distance = wrapIndex(index, count) - wrapIndex(activeIndex, count);
  const half = count / 2;

  if (distance > half || (count % 2 === 0 && distance === half)) {
    distance -= count;
  } else if (distance < -half) {
    distance += count;
  }

  return distance;
}

const CARD_STEP_PERCENT = 58;
const CARD_SCALE_STEP = 0.07;
const CARD_SCALE_FLOOR = 0.72;
const CARD_ROTATE_DEGREES = 3;
const CARD_OPACITY_STEP = 0.2;
const CARD_OPACITY_FLOOR = 0.18;
const SWIPE_THRESHOLD = 36;
const WHEEL_THRESHOLD = 32;
const WHEEL_LOCK_MS = 180;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function formatCounter(value) {
  return String(value).padStart(2, "0");
}

function formatDecimal(value) {
  return String(Math.round(value * 100) / 100);
}

function hasModifier(event) {
  return Boolean(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
}

function directChildByClass(item, className) {
  return Array.from(item?.children ?? []).find((child) => child.classList?.contains(className));
}

function directChildImages(item) {
  return Array.from(item?.children ?? []).filter((child) => child.tagName?.toUpperCase() === "IMG");
}

export function createCarouselController({
  root,
  items,
  previousButton,
  nextButton,
  indicator,
  win,
  doc,
  intervalMs = 4000,
  initialIndex = 0,
}) {
  const carouselItems = Array.from(items ?? []);
  const count = carouselItems.length;
  const pauseReasons = new Set();
  const cleanups = [];
  const originalIndicatorLive = indicator?.getAttribute?.("aria-live") ?? null;
  let activeIndex = wrapIndex(initialIndex, count);
  let intervalId = null;
  let wheelTimeoutId = null;
  let pointer = null;
  let destroyed = false;
  let reducedMotionQuery = null;
  let reducedMotion = false;

  const listen = (target, type, listener, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };

  const setIndicatorLive = (value) => {
    indicator?.setAttribute?.("aria-live", value);
  };

  const render = () => {
    for (const [index, item] of carouselItems.entries()) {
      const distance = signedCircularDistance(index, activeIndex, count);
      const magnitude = Math.abs(distance);
      item.setAttribute("aria-current", String(index === activeIndex));
      item.style.setProperty("--card-x", `${distance * CARD_STEP_PERCENT}%`);
      item.style.setProperty(
        "--card-scale",
        formatDecimal(Math.max(CARD_SCALE_FLOOR, 1 - magnitude * CARD_SCALE_STEP)),
      );
      item.style.setProperty("--card-rotate", `${distance * CARD_ROTATE_DEGREES}deg`);
      item.style.setProperty(
        "--card-opacity",
        formatDecimal(Math.max(CARD_OPACITY_FLOOR, 1 - magnitude * CARD_OPACITY_STEP)),
      );
      item.style.setProperty(
        "--card-layer",
        distance === 0 ? "var(--z-gallery-active)" : "var(--z-gallery-card)",
      );
    }

    if (indicator) {
      indicator.textContent = count === 0
        ? "00 / 00"
        : `${formatCounter(activeIndex + 1)} / ${formatCounter(count)}`;
    }
  };

  const canAutoAdvance = () => (
    !destroyed
    && count > 1
    && Number.isFinite(intervalMs)
    && intervalMs > 0
    && !reducedMotion
    && pauseReasons.size === 0
  );

  const clearAutoAdvance = () => {
    if (intervalId !== null) {
      win?.clearInterval?.(intervalId);
      intervalId = null;
    }
    setIndicatorLive("polite");
  };

  const setIndex = (index, manual) => {
    if (destroyed || count === 0) return;
    if (manual) setIndicatorLive("polite");
    activeIndex = wrapIndex(index, count);
    render();
    if (manual && canAutoAdvance()) {
      clearAutoAdvance();
      startAutoAdvance();
    }
  };

  const startAutoAdvance = () => {
    if (!canAutoAdvance()) {
      setIndicatorLive("polite");
      return;
    }
    if (intervalId === null) {
      intervalId = win?.setInterval?.(() => setIndex(activeIndex + 1, false), intervalMs) ?? null;
    }
    setIndicatorLive(intervalId === null ? "polite" : "off");
  };

  const syncAutoAdvance = () => {
    if (canAutoAdvance()) {
      startAutoAdvance();
    } else {
      clearAutoAdvance();
    }
  };

  const addPauseReason = (reason) => {
    pauseReasons.add(reason);
    syncAutoAdvance();
  };

  const removePauseReason = (reason) => {
    pauseReasons.delete(reason);
    syncAutoAdvance();
  };

  const moveBy = (delta) => setIndex(activeIndex + delta, true);
  const goTo = (index) => setIndex(index, true);

  const finishPointer = (event, shouldMove) => {
    const activePointer = pointer;
    if (!activePointer || event.pointerId !== activePointer.id) return;
    pointer = null;

    if (shouldMove) {
      const deltaX = event.clientX - activePointer.x;
      if (Math.abs(deltaX) >= SWIPE_THRESHOLD) moveBy(deltaX < 0 ? 1 : -1);
    }

    try {
      root?.releasePointerCapture?.(activePointer.id);
    } catch {
      // Capture can already be gone after cancellation or lostpointercapture.
    }
    removePauseReason("pointer");
  };

  const setupImageFallbacks = () => {
    for (const item of carouselItems) {
      const placeholder = directChildByClass(item, "gallery-card__placeholder");
      for (const image of directChildImages(item)) {
        const showImage = () => {
          image.hidden = false;
          if (placeholder) placeholder.hidden = true;
        };
        const showPlaceholder = () => {
          image.hidden = true;
          if (placeholder) placeholder.hidden = false;
        };
        listen(image, "load", showImage);
        listen(image, "error", showPlaceholder);
        listen(image, "dragstart", (event) => event.preventDefault());
        if (image.complete) {
          if (image.naturalWidth > 0) showImage();
          else showPlaceholder();
        } else {
          showPlaceholder();
        }
      }
    }
  };

  if (previousButton) previousButton.disabled = count <= 1;
  if (nextButton) nextButton.disabled = count <= 1;
  if (doc?.visibilityState === "hidden") pauseReasons.add("hidden");

  if (win?.matchMedia) {
    reducedMotionQuery = win.matchMedia(REDUCED_MOTION_QUERY);
    reducedMotion = Boolean(reducedMotionQuery?.matches);
    const onReducedMotionChange = (event) => {
      reducedMotion = Boolean(event?.matches ?? reducedMotionQuery.matches);
      syncAutoAdvance();
    };
    if (reducedMotionQuery?.addEventListener) {
      reducedMotionQuery.addEventListener("change", onReducedMotionChange);
      cleanups.push(() => reducedMotionQuery.removeEventListener("change", onReducedMotionChange));
    } else if (reducedMotionQuery?.addListener) {
      reducedMotionQuery.addListener(onReducedMotionChange);
      cleanups.push(() => reducedMotionQuery.removeListener?.(onReducedMotionChange));
    }
  }

  setupImageFallbacks();
  setIndicatorLive("polite");
  render();
  if (root && count > 0) root.setAttribute("data-carousel-ready", "true");
  else root?.removeAttribute?.("data-carousel-ready");

  listen(previousButton, "click", () => moveBy(-1));
  listen(nextButton, "click", () => moveBy(1));
  listen(root, "pointerenter", () => addPauseReason("hover"));
  listen(root, "pointerleave", () => removePauseReason("hover"));
  listen(root, "focusin", () => addPauseReason("focus"));
  listen(root, "focusout", (event) => {
    if (!root.contains(event.relatedTarget)) removePauseReason("focus");
  });
  listen(doc, "visibilitychange", () => {
    if (doc.visibilityState === "hidden") addPauseReason("hidden");
    else removePauseReason("hidden");
  });
  listen(root, "keydown", (event) => {
    if (hasModifier(event)) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveBy(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveBy(1);
    }
  });
  listen(root, "pointerdown", (event) => {
    if (event.isPrimary !== true || event.button !== 0) return;
    if (pointer) return;
    if (
      event.target === previousButton
      || event.target === nextButton
      || previousButton?.contains?.(event.target)
      || nextButton?.contains?.(event.target)
    ) return;
    pointer = { id: event.pointerId, x: event.clientX };
    try {
      root.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture is an enhancement; gesture state still remains deterministic.
    }
    addPauseReason("pointer");
  });
  listen(root, "pointerup", (event) => finishPointer(event, true));
  listen(root, "pointercancel", (event) => finishPointer(event, false));
  listen(root, "lostpointercapture", (event) => finishPointer(event, false));
  listen(root, "wheel", (event) => {
    const horizontal = Math.abs(event.deltaX) >= WHEEL_THRESHOLD
      && Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!event.cancelable || hasModifier(event) || !horizontal) return;
    event.preventDefault();
    if (wheelTimeoutId !== null) win?.clearTimeout?.(wheelTimeoutId);
    const wasLocked = wheelTimeoutId !== null;
    wheelTimeoutId = win?.setTimeout?.(() => {
      wheelTimeoutId = null;
    }, WHEEL_LOCK_MS) ?? null;
    if (!wasLocked) moveBy(event.deltaX > 0 ? 1 : -1);
  }, { passive: false });

  syncAutoAdvance();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    clearAutoAdvance();
    if (wheelTimeoutId !== null) {
      win?.clearTimeout?.(wheelTimeoutId);
      wheelTimeoutId = null;
    }
    if (pointer) {
      try {
        root?.releasePointerCapture?.(pointer.id);
      } catch {
        // The browser may already have released capture.
      }
      pointer = null;
    }
    while (cleanups.length > 0) cleanups.pop()();
    root?.removeAttribute?.("data-carousel-ready");
    if (indicator) {
      if (originalIndicatorLive === null) indicator.removeAttribute?.("aria-live");
      else setIndicatorLive(originalIndicatorLive);
    }
  };

  return {
    moveBy,
    goTo,
    destroy,
    get activeIndex() {
      return activeIndex;
    },
  };
}
