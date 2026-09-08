import DriftWall from "./DriftWall/DriftWall.jsx";
import { galleryItems } from "../data/galleryItems.js";

export default function DriftWallGallery() {
  return (
    <section
      id="image-archive"
      className="gallery-section"
      lang="en"
      aria-labelledby="gallery-title"
    >
      <header className="gallery-header">
        <h2 id="gallery-title">Image Archive</h2>
        <p id="gallery-note" lang="zh-CN">云上宫阙，星际幻境。十幅画面，十个想象中的世界。</p>
      </header>

      <div
        className="gallery-wall-frame"
        style={{ height: 600 }}
        aria-describedby="gallery-note"
      >
        <DriftWall
          items={galleryItems}
          columns={4}
          tileWidth={184}
          tileHeight={136}
          gap={12}
          tilt={16}
          turn={-14}
          perspective={1350}
          depth={120}
          speed={42}
          direction="up"
          variance={0.45}
          parallax={0.6}
          lift={64}
          fade={0.6}
          dim={0.9}
          overlayColor="var(--color-wall-overlay)"
          radius={15}
          roll={1}
        />
      </div>
    </section>
  );
}
