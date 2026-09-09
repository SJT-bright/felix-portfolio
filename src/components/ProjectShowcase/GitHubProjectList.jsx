import { githubProjects } from "../../data/githubProjects.js";

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const pointerFrames = new WeakMap();
const pointerPositions = new WeakMap();

let finePointerMedia;
let reducedMotionMedia;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function supportsPointerMotion(event) {
  if (typeof window === "undefined" || event.pointerType === "touch") {
    return false;
  }

  finePointerMedia ??= window.matchMedia(FINE_POINTER_QUERY);
  reducedMotionMedia ??= window.matchMedia(REDUCED_MOTION_QUERY);

  return (
    finePointerMedia.matches
    && !reducedMotionMedia.matches
  );
}

function resetCardMotion(event) {
  const surface = event.currentTarget;
  const frame = pointerFrames.get(surface);

  if (frame !== undefined) {
    window.cancelAnimationFrame(frame);
    pointerFrames.delete(surface);
  }
  pointerPositions.delete(surface);

  surface.style.setProperty("--github-pointer-offset-x", "0px");
  surface.style.setProperty("--github-pointer-offset-y", "0px");
  surface.style.setProperty("--github-rotate-x", "0deg");
  surface.style.setProperty("--github-rotate-y", "0deg");
}

function handleCardPointerMove(event) {
  if (!supportsPointerMotion(event)) {
    return;
  }

  const surface = event.currentTarget;
  pointerPositions.set(surface, { clientX: event.clientX, clientY: event.clientY });

  if (pointerFrames.has(surface)) {
    return;
  }

  const frame = window.requestAnimationFrame(() => {
    pointerFrames.delete(surface);
    const pointer = pointerPositions.get(surface);

    if (!pointer) {
      return;
    }
    pointerPositions.delete(surface);

    applyCardMotion(surface, pointer.clientX, pointer.clientY);
  });
  pointerFrames.set(surface, frame);
}

function applyCardMotion(surface, clientX, clientY) {
  const rect = surface.getBoundingClientRect();
  const localX = clamp(clientX - rect.left, 0, rect.width);
  const localY = clamp(clientY - rect.top, 0, rect.height);
  const horizontal = rect.width ? localX / rect.width - 0.5 : 0;
  const vertical = rect.height ? localY / rect.height - 0.5 : 0;

  surface.style.setProperty("--github-pointer-offset-x", `${localX - rect.width / 2}px`);
  surface.style.setProperty("--github-pointer-offset-y", `${localY - rect.height / 2}px`);
  surface.style.setProperty("--github-rotate-x", `${clamp(-vertical * 5.2, -2.6, 2.6).toFixed(2)}deg`);
  surface.style.setProperty("--github-rotate-y", `${clamp(horizontal * 6.4, -3.2, 3.2).toFixed(2)}deg`);
}

function GitHubLogo({ decorative = false }) {
  return (
    <svg
      className="github-projects__logo"
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : "GitHub"}
      role={decorative ? undefined : "img"}
    >
      {decorative ? null : <title>GitHub</title>}
      <path d="M12 .7C5.63.7.45 5.88.45 12.25c0 5.1 3.3 9.43 7.9 10.96.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.97.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.71 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.44-2.71 5.41-5.29 5.7.42.36.79 1.06.79 2.15v3.19c0 .31.21.68.8.56 4.59-1.53 7.89-5.86 7.89-10.96C23.55 5.88 18.37.7 12 .7Z" />
    </svg>
  );
}

export default function GitHubProjectList({ projects = githubProjects }) {
  return (
    <section className="github-projects github-projects__section" aria-labelledby="github-projects-title">
      <header className="github-projects__header">
        <div className="github-projects__identity">
          <GitHubLogo />
          <div className="github-projects__heading-group">
            <p className="github-projects__eyebrow">GitHub · Open Source &amp; Builds</p>
            <h3 className="github-projects__title" id="github-projects-title">
              从代码走进我的创作现场
            </h3>
          </div>
        </div>
        <p className="github-projects__intro">
          这里收录网页之外的应用、实验与创作工具。公开仓库可直接浏览源码，私有项目保留作品记录。
        </p>
      </header>

      <div className="github-projects__grid">
        {projects.map((project, index) => {
          const isPrivate = project.visibility === "private";

          return (
            <article
              className="github-projects__card"
              key={project.name}
              style={{ "--github-project-delay": `${(index % 4) * 70}ms` }}
            >
              <a
                className="github-projects__link"
                href={project.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`${project.title}，${isPrivate ? "私有项目" : "公开项目"}，在新窗口打开 GitHub`}
                onPointerMove={handleCardPointerMove}
                onPointerLeave={resetCardMotion}
                onPointerCancel={resetCardMotion}
                onBlur={resetCardMotion}
              >
                <div className="github-projects__surface">
                  <span className="github-projects__spotlight" aria-hidden="true" />
                  <span className="github-projects__edge-glow" aria-hidden="true" />

                  <div className="github-projects__card-topline">
                    <GitHubLogo decorative />
                    <span className="github-projects__index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="github-projects__copy">
                    <div className="github-projects__name-row">
                      <h4 className="github-projects__project-title">{project.title}</h4>
                      <span
                        className={`github-projects__visibility github-projects__visibility--${project.visibility}`}
                      >
                        {isPrivate ? "私有" : "公开"}
                      </span>
                    </div>
                    <p className="github-projects__repo-name">SJT-bright / {project.name}</p>
                    <p className="github-projects__description">{project.description}</p>
                  </div>

                  <footer className="github-projects__meta">
                    <span className="github-projects__language">
                      <span className="github-projects__language-dot" aria-hidden="true" />
                      {project.language}
                    </span>
                    <span className="github-projects__open-cue" aria-hidden="true">
                      打开 GitHub ↗
                    </span>
                  </footer>
                </div>
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
