import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import portfolioTransitionPoster from "../../assets/portfolio-entry-transition-poster.jpg";
import portfolioTransitionVideo from "../../assets/portfolio-entry-transition-with-bgm.mp4";
import { createPortfolioTransitionController } from "../lib/portfolio-transition-controller.js";
import "./PortfolioEntryTransition.css";

const PORTFOLIO_HREF = "/portfolio/index.html";
const PORTFOLIO_VIDEO_ENTRY_HREF = `${PORTFOLIO_HREF}#entry-video`;
const PORTFOLIO_TRANSITION_TRAILS = [
  { top: "12%", left: "8%", delay: 0.06, duration: 4.2, length: 280, size: 1.04, deltaX: "112vw", deltaY: "14vh", angle: -28, opacity: 0.58 },
  { top: "22%", left: "62%", delay: 0.44, duration: 5.0, length: 290, size: 1.22, deltaX: "118vw", deltaY: "24vh", angle: -36, opacity: 0.66 },
  { top: "30%", left: "16%", delay: 0.9, duration: 4.6, length: 240, size: 0.93, deltaX: "108vw", deltaY: "8vh", angle: -42, opacity: 0.51 },
  { top: "45%", left: "74%", delay: 1.2, duration: 4.3, length: 230, size: 1.02, deltaX: "100vw", deltaY: "18vh", angle: -21, opacity: 0.45 },
  { top: "56%", left: "34%", delay: 1.68, duration: 5.4, length: 252, size: 1.08, deltaX: "106vw", deltaY: "-6vh", angle: -32, opacity: 0.55 },
  { top: "64%", left: "86%", delay: 2.03, duration: 4.9, length: 248, size: 1.16, deltaX: "96vw", deltaY: "-10vh", angle: -24, opacity: 0.47 },
  { top: "70%", left: "44%", delay: 2.41, duration: 5.2, length: 265, size: 0.96, deltaX: "122vw", deltaY: "20vh", angle: -35, opacity: 0.59 },
  { top: "80%", left: "18%", delay: 2.98, duration: 4.8, length: 255, size: 0.88, deltaX: "114vw", deltaY: "6vh", angle: -29, opacity: 0.44 },
  { top: "15%", left: "-6%", delay: 3.45, duration: 6.1, length: 340, size: 1.32, deltaX: "124vw", deltaY: "38vh", angle: -40, opacity: 0.62 },
  { top: "82%", left: "72%", delay: 3.9, duration: 5.6, length: 286, size: 1.15, deltaX: "120vw", deltaY: "-2vh", angle: -18, opacity: 0.6 },
  { top: "38%", left: "50%", delay: 4.3, duration: 5.9, length: 210, size: 0.82, deltaX: "108vw", deltaY: "-18vh", angle: -52, opacity: 0.42 },
  { top: "92%", left: "56%", delay: 4.9, duration: 4.5, length: 310, size: 0.75, deltaX: "132vw", deltaY: "2vh", angle: -24, opacity: 0.38 },
];

const PORTFOLIO_TRANSITION_SWEEPS = [
  { top: "14%", left: "-30%", delay: 0.3, duration: 8.6, length: 520, angle: -32, strength: 0.45 },
  { top: "38%", left: "-30%", delay: 1.5, duration: 9.4, length: 460, angle: -26, strength: 0.52 },
  { top: "56%", left: "-36%", delay: 2.1, duration: 7.8, length: 620, angle: -40, strength: 0.48 },
  { top: "74%", left: "-32%", delay: 3.3, duration: 8.2, length: 500, angle: -24, strength: 0.5 },
];

export default function PortfolioEntryTransition() {
  const linkRef = useRef(null);
  const overlayRef = useRef(null);
  const videoRef = useRef(null);
  const skipRef = useRef(null);

  useEffect(() => {
    if (!linkRef.current || !overlayRef.current || !videoRef.current || !skipRef.current) return undefined;

    const reducedMotion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const controller = createPortfolioTransitionController({
      linkElement: linkRef.current,
      overlayElement: overlayRef.current,
      videoElement: videoRef.current,
      skipElement: skipRef.current,
      reducedMotion,
      targetHref: PORTFOLIO_VIDEO_ENTRY_HREF,
      navigate: (href) => window.location.assign(href),
      windowObject: window,
      documentObject: document,
      watchdogMs: 8500,
      progressWatchdogMs: 3200,
      handoffDelayMs: 140,
    });

    return () => controller.destroy();
  }, []);

  const transition = (
      <div
        ref={overlayRef}
        className="portfolio-transition"
        data-portfolio-transition
        data-active="false"
        data-complete="false"
        role="dialog"
        aria-modal="true"
        aria-label="正在穿越照片长廊并进入作品影像馆"
        aria-hidden="true"
      >
        <div className="portfolio-transition__cosmos" aria-hidden="true">
          {PORTFOLIO_TRANSITION_TRAILS.map((star, index) => (
            <span
              key={`transition-star-${index}`}
              className="portfolio-transition__shooting-star"
              style={{
                "--shooting-star-top": star.top,
                "--shooting-star-left": star.left,
                "--shooting-star-delay": `${star.delay}s`,
                "--shooting-star-duration": `${star.duration}s`,
                "--shooting-star-length": `${star.length}px`,
                "--shooting-star-size": star.size,
                "--shooting-star-delta-x": star.deltaX,
                "--shooting-star-delta-y": star.deltaY,
                "--shooting-star-angle": `${star.angle}deg`,
                "--shooting-star-opacity": star.opacity,
              }}
            />
          ))}
          {PORTFOLIO_TRANSITION_SWEEPS.map((sweep, index) => (
            <span
              key={`transition-sweep-${index}`}
              className="portfolio-transition__sweep"
              style={{
                "--portfolio-transition-sweep-top": sweep.top,
                "--portfolio-transition-sweep-left": sweep.left,
                "--portfolio-transition-sweep-delay": `${sweep.delay}s`,
                "--portfolio-transition-sweep-duration": `${sweep.duration}s`,
                "--portfolio-transition-sweep-length": `${sweep.length}px`,
                "--portfolio-transition-sweep-angle": `${sweep.angle}deg`,
                "--portfolio-transition-sweep-strength": sweep.strength,
              }}
            />
          ))}
        </div>
        <video
          ref={videoRef}
          className="portfolio-transition__video"
        src={portfolioTransitionVideo}
        poster={portfolioTransitionPoster}
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <p className="portfolio-transition__status" aria-live="polite">正在穿越照片长廊并进入作品影像馆</p>
      <button ref={skipRef} className="portfolio-transition__skip" type="button" tabIndex={-1}>
        跳过动画
      </button>
      <span className="portfolio-transition__progress" aria-hidden="true">
        <span className="portfolio-transition__progress-fill" />
      </span>
    </div>
  );

  return (
    <>
      <a ref={linkRef} className="portfolio-entry" href={PORTFOLIO_HREF} aria-label="播放带音乐的转场并进入作品影像馆">
        <span className="portfolio-entry__inner">
          <span className="portfolio-entry__top-light" aria-hidden="true" />
          <span className="portfolio-entry__text">进入作品影像馆</span>
        </span>
      </a>
      {typeof document !== "undefined" ? createPortal(transition, document.body) : null}
    </>
  );
}
