import { useEffect } from "react";

import { createProjectVideoController } from "./project-video-controller.js";

export function useViewportVideo({ rootRef, videoRef, failed }) {
  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return undefined;

    if (failed) {
      video.pause();
      return undefined;
    }

    const controller = createProjectVideoController({
      root,
      video,
      win: window,
      doc: document,
    });
    return () => controller.destroy();
  }, [failed, rootRef, videoRef]);
}
