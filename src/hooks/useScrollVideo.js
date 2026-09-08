import { useCallback, useEffect, useRef } from "react";
import { createScrollVideoController } from "../../scroll-controller.js";
import siteBackgroundMusic from "../../assets/site-background-music.mp3";

export function useScrollVideo({ videoRef, statusRef, trackRef, triggerRef, enabled = true }) {
  const controllerRef = useRef(null);
  const replay = useCallback(() => controllerRef.current?.replay(), []);

  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    const statusElement = statusRef.current;
    const trackElement = trackRef.current;
    const triggerElement = triggerRef.current;
    if (!video || !statusElement || !trackElement || !triggerElement) return undefined;

    const controller = createScrollVideoController({
      video,
      win: window,
      doc: document,
      root: document.documentElement,
      statusElement,
      trackElement,
      triggerElement,
      autoPlay: true,
      ambientSrc: siteBackgroundMusic,
    });
    controllerRef.current = controller;

    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      controller.destroy();
    };
  }, [enabled, videoRef, statusRef, trackRef, triggerRef]);

  return replay;
}
