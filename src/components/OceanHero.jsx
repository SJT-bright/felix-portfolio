import { useRef } from "react";
import wormholePoster from "../../assets/wormhole-home-poster.jpg";
import wormholeVideo from "../../assets/wormhole-home-with-audio.mp4";
import { useHomeLoader } from "../hooks/useHomeLoader.js";
import { useScrollVideo } from "../hooks/useScrollVideo.js";
import ProfileLanding from "./ProfileLanding.jsx";

export default function OceanHero({ skipLoader = false }) {
  const trackRef = useRef(null);
  const videoRef = useRef(null);
  const statusRef = useRef(null);
  const triggerRef = useRef(null);
  const loaderReady = useHomeLoader({ videoRef, skip: skipLoader });
  const replay = useScrollVideo({ videoRef, statusRef, trackRef, triggerRef, enabled: loaderReady });

  return (
    <section ref={trackRef} className="scroll-track" aria-labelledby="profile-title">
      <div className="presentation-stage">
        <ProfileLanding onReplay={replay} />

        <div className="prelude-layer" data-wormhole-prelude>
          <video
            ref={videoRef}
            id="wormhole-video"
            playsInline
            preload="auto"
            poster={wormholePoster}
            fetchPriority="high"
            aria-hidden="true"
          >
            <source src={wormholeVideo} type="video/mp4" />
          </video>
          <div className="stage-scrim" aria-hidden="true" />
          <p ref={statusRef} id="video-status" role="status" hidden>
            序章暂时无法播放，请点击下方按钮重新加载。
          </p>
          <div className="progress" aria-hidden="true"><div className="progress__fill" /></div>
          <button
            ref={triggerRef}
            className="scroll-cue hero-trigger"
            type="button"
            aria-label="播放带音乐的虫洞穿越序章"
            hidden
          >
            播放序章
          </button>
        </div>
      </div>
    </section>
  );
}
