import { useEffect, useState } from "react";
import { createHomeLoaderController } from "../lib/home-loader-controller.js";

export function useHomeLoader({ videoRef, skip = false }) {
  const [ready, setReady] = useState(() => skip || !document.getElementById("site-loader"));

  useEffect(() => {
    const loaderElement = document.getElementById("site-loader");
    if (skip || !loaderElement) {
      setReady(true);
      return undefined;
    }

    const video = videoRef.current;
    const image = loaderElement.querySelector("[data-site-loader-art]");
    const progressElement = loaderElement.querySelector("[role='progressbar']");
    const percentageElement = loaderElement.querySelector("[data-site-loader-percentage]");
    const announcementElement = loaderElement.querySelector("[data-site-loader-announcement]");
    const rootElement = document.getElementById("root");

    if (!video || !progressElement || !percentageElement) {
      loaderElement.remove();
      document.body.classList.remove("site-loading");
      rootElement?.removeAttribute("aria-busy");
      if (rootElement && "inert" in rootElement) rootElement.inert = false;
      setReady(true);
      return undefined;
    }

    const controller = createHomeLoaderController({
      video,
      image,
      loaderElement,
      rootElement,
      progressElement,
      percentageElement,
      announcementElement,
      win: window,
      doc: document,
      onComplete: () => setReady(true),
    });

    return () => controller.destroy();
  }, [skip, videoRef]);

  return ready;
}
