import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ScrollExpand from "../../src/components/ScrollExpand/ScrollExpand.jsx";

let reactRoot = null;

const defaultProps = {
  src: "",
  alt: "Harness media",
  scrollHint: "SCROLL",
  useWindowScroll: true,
  startWidth: 30,
  startHeight: 30,
  startRadius: 43,
  endRadius: 13,
  mediaZoom: 1.54,
  scrollDistance: 1,
  smoothing: 0,
};

function render(props = {}) {
  if (!reactRoot) reactRoot = createRoot(document.querySelector("#root"));
  reactRoot.render(
    <StrictMode>
      <ScrollExpand {...defaultProps} {...props}>
        <h2>Harness heading</h2>
        <p>Harness copy</p>
      </ScrollExpand>
    </StrictMode>,
  );
}

function unmount() {
  reactRoot?.unmount();
  reactRoot = null;
}

window.__scrollExpandHarness = { render, unmount };
document.documentElement.dataset.harnessReady = "true";
