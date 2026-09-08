import { useEffect, useRef, useState } from "react";

import { CardBody, CardContainer, CardItem } from "./ThreeDCard.jsx";
import { useViewportVideo } from "./useViewportVideo.js";

export default function ProjectCard({
  number,
  title,
  description,
  href,
  image,
  imageAlt,
  imageWidth,
  imageHeight,
  imageFit,
  imagePosition,
  video,
  poster,
}) {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const hasLink = typeof href === "string" && href.trim().length > 0;
  const hasImage = typeof image === "string" && image.length > 0;
  const hasVideo = typeof video === "string" && video.length > 0;
  const ProjectSurface = hasLink ? "a" : "div";
  const surfaceProps = hasLink
    ? {
        href: href.trim(),
        target: "_blank",
        rel: "noreferrer noopener",
        "aria-label": `${title} 在新窗口打开网站演示`,
      }
    : {};

  useEffect(() => {
    setFailed(false);
  }, [image, video]);

  useViewportVideo({ rootRef, videoRef, failed });

  return (
    <article ref={rootRef} className="project-card">
      <CardContainer>
        <CardBody>
          <CardItem className="project-card__interactive">
            <ProjectSurface
              className="project-card__link"
              data-link-state={hasLink ? "ready" : "pending"}
              {...surfaceProps}
            >
              <CardItem
                className="project-card__media"
                data-media-kind={hasImage ? "image" : hasVideo ? "video" : "empty"}
                data-image-fit={hasImage ? imageFit || "cover" : undefined}
                data-image-position={hasImage ? imagePosition || "center" : undefined}
                translateZ={18}
              >
                {failed ? (
                  <p className="project-card__fallback">作品预览暂时无法加载</p>
                ) : hasImage ? (
                  <img
                    className="project-card__image"
                    src={image}
                    alt={imageAlt || `${title} 网站首页预览`}
                    width={imageWidth}
                    height={imageHeight}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onError={() => setFailed(true)}
                  />
                ) : hasVideo ? (
                  <video
                    ref={videoRef}
                    className="project-card__video"
                    src={video}
                    loop
                    playsInline
                    preload="metadata"
                    poster={poster}
                    aria-hidden="true"
                    onError={() => setFailed(true)}
                  />
                ) : (
                  <p className="project-card__fallback">作品素材待补充</p>
                )}
              </CardItem>
              <CardItem className="project-card__content" translateZ={34}>
                <p className="project-card__number">{number}</p>
                <h3>{title}</h3>
                <p className="project-card__description">{description}</p>
                <span className="project-card__cue">{hasLink ? "访问网站 ↗" : "演示链接待补充"}</span>
              </CardItem>
            </ProjectSurface>
          </CardItem>
        </CardBody>
      </CardContainer>
    </article>
  );
}
