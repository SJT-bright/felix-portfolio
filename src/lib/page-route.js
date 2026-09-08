const HOME_SECTION_HASHES = new Set(["#image-archive", "#project-showcase", "#portfolio-gallery"]);

export function normalizePathname(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0 || !pathname.startsWith("/")) {
    return null;
  }
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") && !pathname.endsWith("//") ? pathname.slice(0, -1) : pathname;
}

export function resolvePage(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === "/") return "home";
  if (normalized === "/lab") return "lab";
  return "not-found";
}

export function isHomeSectionHash(hash) {
  return typeof hash === "string" && HOME_SECTION_HASHES.has(hash);
}
