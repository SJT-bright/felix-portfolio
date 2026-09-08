import { useLayoutEffect } from "react";

import OceanHero from "./components/OceanHero.jsx";
import DriftWallGallery from "./components/DriftWallGallery.jsx";
import ScrollExpandSection from "./components/ScrollExpandSection.jsx";
import ProjectShowcase from "./components/ProjectShowcase.jsx";
import LabGateway from "./components/LabGateway.jsx";
import { isHomeSectionHash } from "./lib/page-route.js";

export default function App({ skipHomeLoader = false }) {
  useLayoutEffect(() => {
    const keepPreludeFirst = () => {
      if (!document.body.classList.contains("home-intro-pending")) return;
      if (window.location.hash) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };
    const onHashChange = () => {
      if (document.body.classList.contains("home-intro-pending")) {
        keepPreludeFirst();
        return;
      }
      if (!isHomeSectionHash(window.location.hash)) return;
      const targetId = window.location.hash.slice(1);
      const target = document.getElementById(targetId);
      if (!target) return;
      if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    };
    const onPageShow = (event) => {
      if (event.persisted) {
        // A restored document has no loader DOM; reload it to restart the full entry sequence.
        window.location.reload();
        return;
      }
      keepPreludeFirst();
    };
    keepPreludeFirst();
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("scroll", keepPreludeFirst, { passive: true });
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("scroll", keepPreludeFirst);
    };
  }, []);

  return (
    <main>
      <OceanHero skipLoader={skipHomeLoader} />
      <DriftWallGallery />
      <ScrollExpandSection />
      <ProjectShowcase />
      <LabGateway />
    </main>
  );
}
