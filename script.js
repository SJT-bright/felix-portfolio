import { createScrollVideoController } from "./scroll-controller.js";
import { createCarouselController } from "./carousel.js";

const video = document.querySelector("#wormhole-video");
const statusElement = document.querySelector("#video-status");
const trackElement = document.querySelector(".scroll-track");
const triggerElement = document.querySelector(".hero-trigger");

if (video && statusElement && trackElement && triggerElement) {
  createScrollVideoController({
    video,
    win: window,
    doc: document,
    root: document.documentElement,
    statusElement,
    trackElement,
    triggerElement,
  });
}

const carouselRoot = document.querySelector("[data-carousel]");

if (carouselRoot) {
  createCarouselController({
    root: carouselRoot,
    items: carouselRoot.querySelectorAll("[data-carousel-item]"),
    previousButton: carouselRoot.querySelector("[data-carousel-prev]"),
    nextButton: carouselRoot.querySelector("[data-carousel-next]"),
    indicator: carouselRoot.querySelector("[data-carousel-indicator]"),
    win: window,
    doc: document,
    intervalMs: 4000,
    initialIndex: 0,
  });
}
