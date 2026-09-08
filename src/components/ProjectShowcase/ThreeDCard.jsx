function mergeClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}

function clampRotation(value) {
  return Math.max(-5, Math.min(5, value));
}

function resetRotation(event) {
  event.currentTarget.style.setProperty("--project-rotate-x", "0deg");
  event.currentTarget.style.setProperty("--project-rotate-y", "0deg");
}

export function CardContainer({
  children,
  className,
  onPointerMove: callerPointerMove,
  onPointerLeave: callerPointerLeave,
  onPointerCancel: callerPointerCancel,
  onBlurCapture: callerBlurCapture,
  ...props
}) {
  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const horizontal = rect.width ? (event.clientX - rect.left) / rect.width - 0.5 : 0;
    const vertical = rect.height ? (event.clientY - rect.top) / rect.height - 0.5 : 0;

    event.currentTarget.style.setProperty("--project-rotate-x", `${clampRotation(-vertical * 10)}deg`);
    event.currentTarget.style.setProperty("--project-rotate-y", `${clampRotation(horizontal * 10)}deg`);
    callerPointerMove?.(event);
  };

  return (
    <div
      className={mergeClasses("project-card-container", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={(event) => { resetRotation(event); callerPointerLeave?.(event); }}
      onPointerCancel={(event) => { resetRotation(event); callerPointerCancel?.(event); }}
      onBlurCapture={(event) => { resetRotation(event); callerBlurCapture?.(event); }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className, ...props }) {
  return (
    <div className={mergeClasses("project-card-body", className)} {...props}>
      {children}
    </div>
  );
}

export function CardItem({ as: Component = "div", translateZ = 0, children, className, style, ...props }) {
  const depth = Number.isFinite(translateZ) ? translateZ : 0;

  return (
    <Component
      className={mergeClasses("project-card-item", className)}
      style={{ ...style, "--project-depth": `${depth}px` }}
      {...props}
    >
      {children}
    </Component>
  );
}
