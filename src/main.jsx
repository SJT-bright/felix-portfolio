import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import CosmicBackground from "./components/CosmicBackground.jsx";
import { resolvePage } from "./lib/page-route.js";
import LabPage from "./pages/LabPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import "./styles/global.css";

const rootElement = document.querySelector("#root");
if (!rootElement) throw new Error("Felix root element is missing.");

const page = resolvePage(window.location.pathname);
const skipHomeLoader = page !== "home";

// A fresh home visit always begins with the loader and video, even from a deep link.
if (page === "home") {
  window.history.scrollRestoration = "manual";
  if (window.location.hash) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  document.body.classList.add("home-intro-pending");
  window.scrollTo(0, 0);
}

if (skipHomeLoader) {
  document.getElementById("site-loader")?.remove();
  document.body.classList.remove("site-loading", "home-intro-pending");
}

const pageElement = page === "home"
  ? <App skipHomeLoader={skipHomeLoader} />
  : page === "lab"
    ? <LabPage />
    : <NotFoundPage />;

createRoot(rootElement).render(
  <StrictMode>
    {pageElement}
    <CosmicBackground />
  </StrictMode>,
);
