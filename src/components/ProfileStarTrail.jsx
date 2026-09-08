import { useEffect, useRef } from "react";

const MAX_PARTICLES = 320;
const PARTICLE_SPACING = 5;

export default function ProfileStarTrail() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas?.closest("[data-profile-landing]");
    const context = canvas?.getContext("2d");
    if (!surface || !context) return undefined;

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(any-pointer: fine)");
    const palette = getComputedStyle(surface);
    const starlight = palette.getPropertyValue("--color-text").trim();
    const blue = palette.getPropertyValue("--color-profile-accent").trim();
    let particles = [];
    let previous = null;
    let frame = 0;
    let visible = false;
    let width = 0;
    let height = 0;
    let sample = 0;

    const enabled = () => visible && !document.hidden && !reducedMotion.matches
      && finePointer.matches && document.body.classList.contains("video-complete");

    function reset() {
      cancelAnimationFrame(frame);
      frame = 0;
      particles = [];
      previous = null;
      context.clearRect(0, 0, width, height);
    }

    function resize() {
      reset();
      width = surface.clientWidth;
      height = surface.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(now) {
      frame = 0;
      if (!enabled()) { reset(); return; }
      context.clearRect(0, 0, width, height);
      particles = particles.filter(particle => now - particle.born < particle.life);
      for (const particle of particles) {
        const age = (now - particle.born) / particle.life;
        const drift = age * particle.life / 1000;
        const x = particle.x + particle.vx * drift;
        const y = particle.y + particle.vy * drift + age * age * 9;
        const radius = particle.radius * (1 - age * 0.55);
        context.globalAlpha = Math.pow(1 - age, 1.6) * particle.alpha;
        context.fillStyle = particle.glint ? starlight : blue;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        if (particle.glint) {
          const reach = radius * 3.5;
          context.strokeStyle = starlight;
          context.lineWidth = 0.65;
          context.beginPath();
          context.moveTo(x - reach, y); context.lineTo(x + reach, y);
          context.moveTo(x, y - reach); context.lineTo(x, y + reach);
          context.stroke();
        }
      }
      context.globalAlpha = 1;
      if (particles.length) frame = requestAnimationFrame(draw);
    }

    function move(event) {
      if (event.pointerType === "touch" || !enabled()) { previous = null; return; }
      const bounds = surface.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      if (!previous) { previous = point; return; }
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (distance < PARTICLE_SPACING) return;
      const steps = Math.min(32, Math.ceil(distance / PARTICLE_SPACING));
      const now = performance.now();
      for (let step = 1; step <= steps; step += 1) {
        sample += 1;
        for (let dust = 0; dust < 3; dust += 1) {
          const angle = Math.random() * Math.PI * 2;
          const spread = Math.random() * 13;
          particles.push({
            x: previous.x + dx * step / steps + Math.cos(angle) * spread,
            y: previous.y + dy * step / steps + Math.sin(angle) * spread,
            vx: Math.cos(angle) * (6 + Math.random() * 12) - dx / distance * 8,
            vy: Math.sin(angle) * (6 + Math.random() * 12) - dy / distance * 8,
            radius: 0.4 + Math.random() * 1.1,
            alpha: 0.45 + Math.random() * 0.5,
            life: 550 + Math.random() * 650,
            born: now,
            glint: dust === 0 && sample % 6 === 0,
          });
        }
      }
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
      previous = point;
      if (!frame) frame = requestAnimationFrame(draw);
    }

    const leave = () => { previous = null; };
    const sync = () => { if (!enabled()) reset(); };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      sync();
    });
    const sizeObserver = new ResizeObserver(resize);
    const bodyObserver = new MutationObserver(sync);
    observer.observe(surface);
    sizeObserver.observe(surface);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    surface.addEventListener("pointermove", move, { passive: true });
    surface.addEventListener("pointerleave", leave, { passive: true });
    window.addEventListener("scroll", leave, { passive: true });
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);
    finePointer.addEventListener("change", sync);
    resize();

    return () => {
      reset();
      observer.disconnect(); sizeObserver.disconnect(); bodyObserver.disconnect();
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", leave);
      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
      finePointer.removeEventListener("change", sync);
    };
  }, []);

  return <canvas ref={canvasRef} className="profile-star-trail" aria-hidden="true" />;
}
