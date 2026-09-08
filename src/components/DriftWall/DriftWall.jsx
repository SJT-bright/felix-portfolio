import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  columnFactor,
  distributeItems,
  getColumnMeta,
  normalizeOffset,
} from "./drift-wall-math.js";
import "./DriftWall.css";

const DEFAULT_ITEMS = [
  { image: "https://picsum.photos/id/1015/600/400", title: "Peaks" },
  { image: "https://picsum.photos/id/1025/600/400", title: "Pup" },
  { image: "https://picsum.photos/id/1039/600/400", title: "Falls" },
];

function motionPreference() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function DriftTile({ item, id, column, active, preload = false }) {
  const imageRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const title = item?.title || "Untitled image";

  useEffect(() => {
    setFailed(false);
    // Cached loop copies can finish loading before this effect runs.
    setLoaded(Boolean(imageRef.current?.complete && imageRef.current.naturalWidth > 0));
  }, [item?.image]);
  const commonProps = {
    className: `drift-wall__tile${active ? " is-active" : ""}`,
    "data-tile-id": id,
    "data-col": column,
  };
  const content = (
    <span className="drift-wall__inner">
      <span
        className={`drift-wall__fallback${loaded ? " is-hidden" : ""}`}
        role="img"
        aria-label={title}
        aria-hidden={loaded ? "true" : undefined}
      >
        <span className="drift-wall__monogram" aria-hidden="true">F</span>
        <span className="drift-wall__fallback-title">{title}</span>
      </span>
      {!failed && item?.image && (
        <img
          ref={imageRef}
          className={loaded ? "is-loaded" : ""}
          src={item.image}
          alt={title}
          loading={preload ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      )}
      <span className="drift-wall__overlay" aria-hidden="true" />
    </span>
  );

  if (item?.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer noopener"
        tabIndex={-1}
        aria-hidden="true"
        {...commonProps}
      >
        {content}
      </a>
    );
  }

  return (
    <div aria-hidden="true" {...commonProps}>
      {content}
    </div>
  );
}

export default function DriftWall({
  items = DEFAULT_ITEMS,
  columns = 5,
  tileWidth = 200,
  tileHeight = 132,
  gap = 18,
  radius = 14,
  tilt = 16,
  turn = -14,
  roll = 0,
  perspective = 1200,
  depth = 120,
  speed = 42,
  direction = "up",
  variance = 0.45,
  parallax = 0.6,
  pauseOnHover = false,
  lift = 64,
  fade = 0.6,
  dim = 0.55,
  grayscale = false,
  overlayColor = "var(--color-ink)",
  className = "",
  style,
}) {
  const containerRef = useRef(null);
  const planeRef = useRef(null);
  const trackRefs = useRef([]);
  const rafRef = useRef(null);
  const offsetsRef = useRef([]);
  const velocitiesRef = useRef([]);
  const hoveredColumnRef = useRef(-1);
  const wallHoveredRef = useRef(false);
  const keyboardPausedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const dampedPointerRef = useRef({ x: 0, y: 0 });
  const lastTimestampRef = useRef(null);
  const activeIdRef = useRef(null);

  const [containerHeight, setContainerHeight] = useState(0);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [reduced, setReduced] = useState(motionPreference);
  const [inViewport, setInViewport] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  const columnItems = useMemo(
    () => distributeItems(items, columns),
    [items, columns],
  );
  const linkItems = useMemo(
    () => (Array.isArray(items) ? items.filter((item) => item?.href) : []),
    [items],
  );
  const columnMeta = useMemo(
    () => columnItems.map((column) => (
      getColumnMeta(column.length, tileHeight, gap, containerHeight)
    )),
    [columnItems, tileHeight, gap, containerHeight],
  );
  const baseVelocities = useMemo(() => {
    const directionSign = direction === "down" ? -1 : 1;
    return columnItems.map((_, column) => {
      const alternatingSign = column % 2 === 0 ? 1 : -1;
      return speed * columnFactor(column, variance) * directionSign * alternatingSign;
    });
  }, [columnItems, direction, speed, variance]);

  const applyPlaneTransform = useCallback((pointerX, pointerY) => {
    if (!planeRef.current) return;
    planeRef.current.style.transform = [
      "translate(-50%, -50%)",
      "scale(1.18)",
      `rotateX(${tilt + pointerY}deg)`,
      `rotateY(${turn + pointerX}deg)`,
      `rotateZ(${roll}deg)`,
      `translateZ(${-depth}px)`,
    ].join(" ");
  }, [depth, roll, tilt, turn]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event) => setReduced(event.matches);
    setReduced(query.matches);
    if (query.addEventListener) query.addEventListener("change", onChange);
    else query.addListener(onChange);
    return () => {
      if (query.removeEventListener) query.removeEventListener("change", onChange);
      else query.removeListener(onChange);
    };
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const measure = (height) => {
      setContainerHeight(Math.max(0, height));
      setHasMeasured(true);
    };
    if (typeof ResizeObserver === "undefined") {
      measure(container.getBoundingClientRect().height);
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.height));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry.isIntersecting),
      { rootMargin: "120px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    offsetsRef.current = columnMeta.map(
      (meta, column) => meta.copyHeight * ((column * 0.37) % 1),
    );
    velocitiesRef.current = columnMeta.map(() => 0);
    trackRefs.current.forEach((track, column) => {
      const offset = offsetsRef.current[column] ?? 0;
      if (track) track.style.transform = `translate3d(0, ${-offset}px, 0)`;
    });
  }, [columnMeta]);

  const shouldAnimate = hasMeasured
    && containerHeight > 0
    && inViewport
    && documentVisible
    && !reduced;

  useEffect(() => {
    applyPlaneTransform(0, 0);
    if (!shouldAnimate) {
      lastTimestampRef.current = null;
      return undefined;
    }

    const animate = (timestamp) => {
      if (lastTimestampRef.current === null) lastTimestampRef.current = timestamp;
      const delta = Math.min(0.05, Math.max(0, timestamp - lastTimestampRef.current) / 1000);
      lastTimestampRef.current = timestamp;

      const maxTilt = parallax * 8;
      const targetX = pointerRef.current.x * maxTilt;
      const targetY = -pointerRef.current.y * maxTilt;
      const damping = 1 - Math.exp(-delta / 0.12);
      dampedPointerRef.current.x += (targetX - dampedPointerRef.current.x) * damping;
      dampedPointerRef.current.y += (targetY - dampedPointerRef.current.y) * damping;
      applyPlaneTransform(dampedPointerRef.current.x, dampedPointerRef.current.y);

      trackRefs.current.forEach((track, column) => {
        const meta = columnMeta[column];
        if (!track || !meta) return;
        const paused = keyboardPausedRef.current
          || (wallHoveredRef.current && pauseOnHover)
          || hoveredColumnRef.current === column;
        const targetVelocity = paused ? 0 : baseVelocities[column];
        const easing = 1 - Math.exp(-delta / (targetVelocity === 0 ? 0.16 : 0.28));
        velocitiesRef.current[column] += (
          targetVelocity - velocitiesRef.current[column]
        ) * easing;
        const nextOffset = normalizeOffset(
          (offsetsRef.current[column] ?? 0) + velocitiesRef.current[column] * delta,
          meta.copyHeight,
        );
        offsetsRef.current[column] = nextOffset;
        track.style.transform = `translate3d(0, ${-nextOffset}px, 0)`;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimestampRef.current = null;
    };
  }, [applyPlaneTransform, baseVelocities, columnMeta, parallax, pauseOnHover, shouldAnimate]);

  const activate = useCallback((id, column) => {
    activeIdRef.current = id;
    hoveredColumnRef.current = column;
    setActiveId(id);
  }, []);
  const release = useCallback(() => {
    activeIdRef.current = null;
    hoveredColumnRef.current = -1;
    setActiveId(null);
  }, []);
  const onPointerMove = useCallback((event) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    if (parallax > 0 && !reduced) {
      pointerRef.current = {
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
    }
    const tile = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest?.("[data-tile-id]");
    if (!tile) {
      release();
      return;
    }
    if (tile.dataset.tileId === activeIdRef.current) return;
    activate(tile.dataset.tileId, Number(tile.dataset.col));
  }, [activate, parallax, reduced, release]);
  const onPointerLeave = useCallback(() => {
    wallHoveredRef.current = false;
    pointerRef.current = { x: 0, y: 0 };
    release();
  }, [release]);

  const cssVariables = useMemo(() => ({
    "--dw-tile-w": `${tileWidth}px`,
    "--dw-tile-h": `${tileHeight}px`,
    "--dw-gap": `${gap}px`,
    "--dw-radius": `${radius}px`,
    "--dw-perspective": `${perspective}px`,
    "--dw-lift": `${lift}px`,
    "--dw-dim": dim,
    "--dw-gray": grayscale ? 1 : 0,
    "--dw-overlay": overlayColor,
    "--dw-edge": `${Math.max(0, (1 - fade) * 100)}%`,
    ...style,
  }), [dim, fade, gap, grayscale, lift, overlayColor, perspective, radius, style, tileHeight, tileWidth]);
  const rootClassName = ["drift-wall", reduced ? "drift-wall--reduced" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      style={cssVariables}
      data-running={shouldAnimate ? "true" : "false"}
      onPointerMove={onPointerMove}
      onPointerEnter={() => { wallHoveredRef.current = true; }}
      onPointerLeave={onPointerLeave}
      role="group"
      aria-label="Felix image wall"
    >
      <div className="drift-wall__viewport">
        <div className="drift-wall__plane" aria-hidden="true" ref={planeRef}>
          {columnItems.map((columnItemsForTrack, column) => {
            const meta = columnMeta[column];
            return (
              <div className="drift-wall__col" key={`column-${column}`} data-column={column}>
                <div
                  className="drift-wall__track"
                  ref={(element) => { trackRefs.current[column] = element; }}
                >
                  {Array.from({ length: meta.copies }, (_, copyIndex) => (
                    <div
                      className="drift-wall__copy"
                      key={`copy-${column}-${copyIndex}`}
                      aria-hidden="true"
                    >
                      {columnItemsForTrack.map((item, itemIndex) => {
                        const id = `${column}-${copyIndex}-${itemIndex}`;
                        return (
                          <DriftTile
                            key={id}
                            item={item}
                            id={id}
                            column={column}
                            active={activeId === id}
                            preload={inViewport}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {linkItems.length > 0 && (
        <nav
          className="drift-wall__links"
          aria-label="Image links"
          onFocus={() => { keyboardPausedRef.current = true; }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              keyboardPausedRef.current = false;
            }
          }}
        >
          {linkItems.map((item, index) => (
            <a
              key={`${item.href}-${index}`}
              href={item.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {item.title || `Image ${index + 1}`}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
