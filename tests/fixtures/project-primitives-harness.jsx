import { createRoot } from "react-dom/client";
import DriftWall from "../../src/components/DriftWall/DriftWall.jsx";
import { BentoGrid, BentoGridItem } from "../../src/components/ProjectShowcase/BentoGrid.jsx";
import ProjectCard from "../../src/components/ProjectShowcase/ProjectCard.jsx";
import { CardBody, CardContainer, CardItem } from "../../src/components/ProjectShowcase/ThreeDCard.jsx";

let reactRoot = null;

const fixtureImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='3'%3E%3Cpath fill='%230b2d33' d='M0 0h4v3H0z'/%3E%3C/svg%3E";
const linkedGalleryItems = [
  { image: fixtureImage, title: "Linked image one", href: "https://portfolio.test/work/one" },
  { image: fixtureImage, title: "Linked image two", href: "https://portfolio.test/work/two" },
];
const pendingGalleryItems = [
  { image: fixtureImage, title: "Pending image one", href: "" },
  { image: fixtureImage, title: "Pending image two", href: "" },
];

function recordEvent(event) {
  window.__projectPrimitivesEvents.push({
    type: event.type,
    defaultPrevented: event.defaultPrevented,
    captured: event.currentTarget.hasPointerCapture(event.pointerId),
  });
}

function render({ depth = 12.5 } = {}) {
  if (!reactRoot) reactRoot = createRoot(document.querySelector("#root"));
  window.__projectPrimitivesEvents = [];
  window.__projectPrimitivesClicks = 0;
  reactRoot.render(
    <>
      <CardContainer
        data-testid="card-container"
        tabIndex={0}
        style={{ width: "200px", height: "100px" }}
        onPointerMove={recordEvent}
        onPointerLeave={recordEvent}
        onPointerCancel={recordEvent}
        onBlurCapture={recordEvent}
      >
        <CardBody>
          <CardItem
            as="a"
            data-testid="semantic-card"
            href="#semantic-card"
            translateZ={depth}
            style={{ color: "rgb(1, 2, 3)" }}
            onClick={() => { window.__projectPrimitivesClicks += 1; }}
          >
            Semantic card
          </CardItem>
        </CardBody>
      </CardContainer>
      <BentoGrid data-testid="bento-grid" className="custom-grid" aria-label="Project grid">
        <BentoGridItem data-testid="bento-grid-item" className="custom-item" data-project="one">
          <span data-testid="bento-child">Bento content</span>
        </BentoGridItem>
      </BentoGrid>
    </>,
  );
}

function renderLinkBranches() {
  if (!reactRoot) reactRoot = createRoot(document.querySelector("#root"));
  reactRoot.render(
    <>
      <section data-testid="project-card-pending">
        <ProjectCard
          number="01"
          title="Pending project"
          description="No destination has been supplied."
          href="   "
          video={undefined}
        />
      </section>
      <section data-testid="project-card-linked">
        <ProjectCard
          number="02"
          title="Linked project"
          description="A real destination has been supplied."
          href="  https://portfolio.test/project/demo  "
          video={undefined}
        />
      </section>
      <section data-testid="drift-wall-pending" style={{ height: 240 }}>
        <DriftWall
          items={pendingGalleryItems}
          columns={1}
          tileWidth={120}
          tileHeight={80}
          gap={8}
          speed={0}
          parallax={0}
        />
      </section>
      <section data-testid="drift-wall-linked" style={{ height: 240 }}>
        <DriftWall
          items={linkedGalleryItems}
          columns={1}
          tileWidth={120}
          tileHeight={80}
          gap={8}
          speed={0}
          parallax={0}
        />
      </section>
    </>,
  );
}

window.__projectPrimitivesHarness = { render, renderLinkBranches };
document.documentElement.dataset.harnessReady = "true";
