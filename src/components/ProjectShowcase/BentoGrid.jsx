function mergeClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function BentoGrid({ children, className, ...props }) {
  return (
    <div className={mergeClasses("project-bento-grid", className)} {...props}>
      {children}
    </div>
  );
}

export function BentoGridItem({ children, className, ...props }) {
  return (
    <div className={mergeClasses("project-bento-grid__item", className)} {...props}>
      {children}
    </div>
  );
}
