import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getScrollExpandFrame,
  getScrollExpandBlend,
  getScrollExpandProgress,
  normaliseScrollExpandOptions,
} from "./scroll-expand-math.js";
import { claimVideoBgm, enableVideoBgm, releaseVideoBgm } from "../../lib/video-bgm.js";
import "./ScrollExpand.css";

const FRAME_EPSILON = 0.0005;
const BASE_FRAME_MS = 1000 / 60;

function setFrame(element, frame, progress) {
  if (!element) return;
  element.style.setProperty("--expand-inset-block", `${frame.insetBlock}%`);
  element.style.setProperty("--expand-inset-inline", `${frame.insetInline}%`);
  element.style.setProperty("--expand-radius", `${frame.radius}px`);
  element.style.setProperty("--expand-media-scale", frame.mediaScale);
  element.style.setProperty("--expand-scrim-opacity", frame.scrimOpacity);
  element.style.setProperty("--expand-content-opacity", frame.contentOpacity);
  element.style.setProperty("--expand-hint-opacity", frame.hintOpacity);
  element.dataset.progress = progress.toFixed(4);
}

export default function ScrollExpand({
  src,
  alt = "",
  mediaType = "image",
  poster = "",
  title = "",
  scrollHint = "Scroll",
  errorMessage = "媒体暂时无法加载，介绍内容仍可阅读。",
  children,
  useWindowScroll = false,
  startWidth = 42,
  startHeight = 58,
  startRadius = 24,
  endRadius = 13,
  mediaZoom = 1.35,
  scrollDistance = 1,
  holdDistance = 0.35,
  smoothing = 0.12,
  overlayScrim = 0.45,
  enabled = true,
  className = "",
  style = {},
  ...sectionProps
}) {
  const rootRef = useRef(null);
  const mediaRef = useRef(null);
  const [mediaState, setMediaState] = useState(src ? "loading" : "empty");
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const options = useMemo(
    () => normaliseScrollExpandOptions({
      startWidth,
      startHeight,
      startRadius,
      endRadius,
      mediaZoom,
      scrollDistance,
      holdDistance,
      smoothing,
      overlayScrim,
    }),
    [
      startWidth,
      startHeight,
      startRadius,
      endRadius,
      mediaZoom,
      scrollDistance,
      holdDistance,
      smoothing,
      overlayScrim,
    ],
  );
  const initialFrame = getScrollExpandFrame(reducedMotion || !enabled ? 1 : 0, options);
  const rootStyle = {
    "--expand-track-height": `${options.totalViewports * 100}dvh`,
    "--expand-distance": options.scrollDistance,
    "--expand-hold": options.holdDistance,
    "--expand-inset-block": `${initialFrame.insetBlock}%`,
    "--expand-inset-inline": `${initialFrame.insetInline}%`,
    "--expand-radius": `${initialFrame.radius}px`,
    "--expand-media-scale": initialFrame.mediaScale,
    "--expand-scrim-opacity": initialFrame.scrimOpacity,
    "--expand-content-opacity": initialFrame.contentOpacity,
    "--expand-hint-opacity": initialFrame.hintOpacity,
  };

  useLayoutEffect(() => {
    setMediaState(src ? "loading" : "empty");
  }, [src, mediaType]);

  useLayoutEffect(() => {
    const mediaQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const updatePreference = () => setReducedMotion(Boolean(mediaQuery?.matches));
    updatePreference();
    if (typeof mediaQuery?.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }
    mediaQuery?.addListener?.(updatePreference);
    return () => mediaQuery?.removeListener?.(updatePreference);
  }, []);

  useLayoutEffect(() => {
    const media = mediaRef.current;
    if (mediaType !== "video" || !media) return undefined;
    if (!enabled || reducedMotion) {
      media.pause();
      releaseVideoBgm(media, { owner: window });
      return undefined;
    }
    enableVideoBgm(media, 0.8);
    if (!claimVideoBgm(media, { owner: window, volume: 0.8 })) {
      media.pause();
      return undefined;
    }
    const playAttempt = media.play();
    playAttempt?.catch?.(() => {
      media.pause();
      releaseVideoBgm(media, { owner: window });
    });
    return () => {
      media.pause();
      releaseVideoBgm(media, { owner: window });
    };
  }, [enabled, mediaType, reducedMotion, src]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let frameId = 0;
    let lastTimestamp = 0;
    let currentProgress = reducedMotion || !enabled ? 1 : 0;
    let targetProgress = currentProgress;
    let trackTop = 0;
    let viewportHeight = 1;

    const scrollSource = useWindowScroll ? window : root;
    const getScrollY = () => useWindowScroll ? window.scrollY : root.scrollTop;
    const measure = () => {
      viewportHeight = useWindowScroll
        ? Math.max(1, window.visualViewport?.height || window.innerHeight)
        : Math.max(1, root.clientHeight);
      trackTop = useWindowScroll
        ? root.getBoundingClientRect().top + window.scrollY
        : 0;
      targetProgress = reducedMotion || !enabled
        ? 1
        : getScrollExpandProgress({
          scrollY: getScrollY(),
          trackTop,
          viewportHeight,
          scrollDistance: options.scrollDistance,
        });
    };

    const render = (timestamp) => {
      frameId = 0;
      measure();
      const elapsed = lastTimestamp > 0 ? Math.min(100, timestamp - lastTimestamp) : BASE_FRAME_MS;
      lastTimestamp = timestamp;
      const blend = reducedMotion || !enabled
        ? 1
        : getScrollExpandBlend(options.smoothing, elapsed);
      currentProgress += (targetProgress - currentProgress) * blend;

      if (Math.abs(targetProgress - currentProgress) <= FRAME_EPSILON) {
        currentProgress = targetProgress;
      }

      setFrame(root, getScrollExpandFrame(currentProgress, options), currentProgress);
      const running = Math.abs(targetProgress - currentProgress) > FRAME_EPSILON;
      root.dataset.running = running ? "true" : "false";
      if (running) frameId = requestAnimationFrame(render);
      if (!running) lastTimestamp = 0;
    };

    const schedule = () => {
      if (!frameId) frameId = requestAnimationFrame(render);
    };

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(schedule)
      : null;
    resizeObserver?.observe(root);
    scrollSource.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    schedule();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      scrollSource.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      root.dataset.running = "false";
    };
  }, [enabled, options, reducedMotion, useWindowScroll]);

  const classes = [
    "scroll-expand",
    useWindowScroll ? "scroll-expand--window" : "scroll-expand--local",
    className,
  ].filter(Boolean).join(" ");

  return (
    <section
      {...sectionProps}
      ref={rootRef}
      className={classes}
      style={{ ...style, ...rootStyle }}
      data-scroll-expand="true"
      data-progress="0.0000"
      data-running="false"
      data-enabled={enabled ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-media-state={mediaState}
    >
      <div className="scroll-expand__stage">
        <div className="scroll-expand__frame">
          <div className="scroll-expand__fallback" aria-hidden="true" />
          {src && mediaState !== "error" && mediaType === "video" ? (
            <video
              ref={mediaRef}
              className="scroll-expand__media"
              src={src}
              poster={poster}
              aria-label={alt || undefined}
              aria-hidden={alt === "" ? "true" : undefined}
              loop
              playsInline
              preload="metadata"
              onLoadedData={() => setMediaState("ready")}
              onError={() => setMediaState("error")}
            />
          ) : null}
          {src && mediaState !== "error" && mediaType !== "video" ? (
            <img
              className="scroll-expand__media"
              src={src}
              alt={alt}
              aria-hidden={alt === "" ? "true" : undefined}
              draggable="false"
              loading="lazy"
              decoding="async"
              onLoad={() => setMediaState("ready")}
              onError={() => setMediaState("error")}
            />
          ) : null}
          <div className="scroll-expand__grade" aria-hidden="true" />
          <div className="scroll-expand__scrim" aria-hidden="true" />
          {title ? <p className="scroll-expand__opening-title">{title}</p> : null}
          <div className="scroll-expand__content">{children}</div>
        </div>
        {scrollHint ? (
          <p className="scroll-expand__hint" aria-hidden="true">{scrollHint}</p>
        ) : null}
        <p className="scroll-expand__status" role="status" hidden={mediaState !== "error"}>
          {errorMessage}
        </p>
      </div>
      {!useWindowScroll && enabled ? (
        <div className="scroll-expand__local-spacer" aria-hidden="true" />
      ) : null}
    </section>
  );
}
