// Shared by the home, community and standalone archive pages.
const SETTINGS = {
  starDensity: 950, // Smaller values make the fine star dust denser (pixels per star).
  maxStars: 1800,
  mobileMaxStars: 850,
  frameMs: 1000 / 30,
  crossingMs: 2200, // Larger values make chapter-entry trails travel more slowly.
  crossingCooldown: 1500,
  ambientInterval: 12500,
  chapters: '.scroll-track, #image-archive, .scroll-expand, #project-showcase, #portfolio-gallery, .lab-gateway, .lab-hero, .lab-results, .lab-exchange, .lab-contact, #dome-section',
  chapterTextSelectors: 'h1, h2, h3, h4, h5, h6, p, li, dt, dd, figcaption, strong, span, a[href], button, .lab-button, .lab-page__kicker',
  reveals: [
    '.identity',
    '.hero-lead',
    '.contact',
    '.hero-note',
    '.gallery-header',
    '.project-showcase__header',
    '.project-showcase__item',
    '.portfolio-gateway__copy',
    '.portfolio-gateway__action',
    '.project-card__content .project-card__number',
    '.project-card__content h3',
    '.project-card__description',
    '.project-card__cue',
  ].join(','),
};

export function mountCosmicScene() {
  const layer = document.createElement('div');
  layer.className = 'cosmic-scene';
  layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  layer.append(canvas);
  document.body.prepend(layer);
  document.body.classList.add('cosmic-site');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => { layer.remove(); document.body.classList.remove('cosmic-site'); };

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const still = document.createElement('canvas');
  const sky = still.getContext('2d');
  const palette = getComputedStyle(layer);
  const colors = ['--cosmos-star', '--cosmos-blue', '--cosmos-distant'].map(name => palette.getPropertyValue(name).trim());
  let width = 1, height = 1, dpr = 1, stars = [], trails = [];
  let raf = 0, lastFrame = 0, time = 0, lastBurst = -Infinity;
  let nextAmbient = SETTINGS.ambientInterval, scrollTarget = scrollY, scrollPosition = scrollY;
  let destroyed = false;
  const paused = () => document.hidden || document.body.matches('.site-loading, .video-playing, .portfolio-transition-active');

  function seededRandom() {
    let seed = 416873;
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    // Overscan makes the slow drift continuous at the viewport edges.
    still.width = Math.round((width + 100) * dpr);
    still.height = Math.round((height + 100) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    const random = seededRandom();
    const count = Math.min(width < 768 ? SETTINGS.mobileMaxStars : SETTINGS.maxStars, Math.max(600, width * height / SETTINGS.starDensity));
    for (let i = 0; i < count; i += 1) {
      const x = random() * (width + 100);
      // A broad, irregular diagonal band of tiny grains suggests a distant galaxy.
      const y = i % 3 === 0
        ? (0.88 - x / (width + 100) * 0.68 + (random() + random() - 1) * 0.38) * (height + 100)
        : random() * (height + 100);
      sky.globalAlpha = 0.2 + random() * 0.6;
      sky.fillStyle = colors[i % colors.length];
      const radius = 0.25 + random() * 0.7;
      sky.beginPath(); sky.arc(x, y, radius, 0, Math.PI * 2); sky.fill();
    }
    sky.globalAlpha = 1;
    stars = Array.from({ length: width < 768 ? 26 : 56 }, (_, i) => ({
      x: random(), y: random(), radius: 0.65 + random() * 0.6,
      phase: random() * Math.PI * 2, speed: 0.35 + random() * 0.45,
      twinkle: random() * Math.PI * 2,
      twinkleSpeed: 0.7 + random() * 1.8,
      glow: i % 7 === 0,
    }));
    render();
    observeChapters();
  }

  function cross(count = 3) {
    if (motion.matches || paused()) return;
    const now = performance.now();
    if (now - lastBurst < SETTINGS.crossingCooldown) return;
    lastBurst = now;
    for (let i = 0; i < count; i += 1) {
      trails.push({ born: time + i * 320, y: 0.12 + i * 0.23, x: 0.1 + i * 0.16, length: Math.min(width * 0.22, 240) });
    }
    nextAmbient = time + SETTINGS.ambientInterval;
    layer.dataset.crossing = String(Number(layer.dataset.crossing || 0) + 1);
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    const drift = motion.matches ? 0 : Math.sin(time / 45000) * 16;
    const parallax = motion.matches ? 0 : Math.sin(scrollPosition / 2100) * 15;
    ctx.drawImage(still, -50 + drift, -50 - parallax, width + 100, height + 100);
    for (const star of stars) {
      const x = star.x * width + drift * 0.45;
      const y = star.y * height - parallax * 0.5;
      const twinkle = motion.matches
        ? 0.65
        : 0.48 + Math.sin(time / 1000 * star.speed + star.phase) * 0.26 + Math.sin(time / 1200 * star.twinkleSpeed + star.twinkle) * 0.2;
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = colors[0];
      ctx.beginPath(); ctx.arc(x, y, star.radius, 0, Math.PI * 2); ctx.fill();
      if (star.glow) {
        ctx.globalAlpha *= 0.18;
        ctx.fillStyle = colors[1];
        ctx.beginPath(); ctx.arc(x, y, star.radius * 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const trail of trails) {
      const p = (time - trail.born) / SETTINGS.crossingMs;
      if (p < 0 || p > 1) continue;
      const x = trail.x * width + p * width * 0.95;
      const y = trail.y * height + p * width * 0.23;
      const tailX = x - trail.length, tailY = y - trail.length * 0.24;
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
      const gradient = ctx.createLinearGradient(tailX, tailY, x, y);
      gradient.addColorStop(0, palette.getPropertyValue('--cosmos-clear').trim());
      gradient.addColorStop(0.75, colors[1]);
      gradient.addColorStop(1, colors[0]);
      ctx.strokeStyle = gradient; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = colors[0];
      ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    raf = 0;
    if (destroyed || motion.matches || paused()) return;
    const elapsed = now - lastFrame;
    if (elapsed >= SETTINGS.frameMs) {
      time += Math.min(elapsed, 64);
      lastFrame = now;
      scrollPosition += (scrollTarget - scrollPosition) * 0.07;
      trails = trails.filter(trail => time - trail.born < SETTINGS.crossingMs);
      if (time > nextAmbient) cross(1);
      render();
    }
    raf = requestAnimationFrame(tick);
  }

  function syncAnimation() {
    cancelAnimationFrame(raf); raf = 0;
    layer.dataset.paused = String(paused() || motion.matches);
    if (motion.matches) { trails = []; render(); }
    if (!paused() && !motion.matches && !destroyed) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  let chapterObserver, revealObserver;
  const chapters = [...document.querySelectorAll(SETTINGS.chapters)];
  const isRevealCandidate = (node) => (
    node instanceof HTMLElement &&
    !node.closest('[data-profile-landing], [data-wormhole-prelude]') &&
    // Reveal controls as a unit: translated labels can stay outside a clipped
    // button forever and never become visible to IntersectionObserver.
    !node.parentElement?.closest('a[href], button, [role="button"]') &&
    !node.hidden &&
    !node.matches('[aria-hidden="true"]') &&
    !node.closest('[aria-hidden="true"]') &&
    node.textContent?.trim()
  );
  const getRevealTargets = () => {
    const seen = new Set();
    const grouped = [];

    for (const chapter of chapters) {
      const chapterNodes = [...chapter.querySelectorAll(SETTINGS.chapterTextSelectors)]
        .filter(isRevealCandidate);
      chapterNodes.forEach((node, index) => {
        if (seen.has(node)) return;
        seen.add(node);
        node.style.setProperty('--text-rhythm-delay', `${Math.min(index, 10) * 55}ms`);
        grouped.push(node);
      });
    }

    [...document.querySelectorAll(SETTINGS.reveals)].forEach((node) => {
      if (!isRevealCandidate(node) || seen.has(node)) return;
      seen.add(node);
      node.style.setProperty('--text-rhythm-delay', '0ms');
      grouped.push(node);
    });

    return grouped;
  };

  function observeChapters() {
    if (!('IntersectionObserver' in window)) return;
    chapterObserver?.disconnect();
    const activeChapters = new Set();
    chapterObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.classList.toggle('cosmic-chapter-active', entry.isIntersecting);
        if (entry.isIntersecting) {
          if (!activeChapters.has(entry.target)) {
            activeChapters.add(entry.target);
            cross();
          }
        } else {
          activeChapters.delete(entry.target);
        }
      }
      layer.classList.toggle('cosmic-chapter-active', activeChapters.size > 0);
    // Pixel margins follow viewport height; percentage margins follow width and
    // can collapse the observation area on an ultrawide display.
    }, { rootMargin: `-${Math.round(innerHeight * 0.2)}px 0px -${Math.round(innerHeight * 0.3)}px 0px`, threshold: 0 });
    chapters.forEach(chapter => chapterObserver.observe(chapter));
  }
  if ('IntersectionObserver' in window) {
    if (!motion.matches) {
      revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('cosmic-revealed');
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.08 });
      const reveals = getRevealTargets();
      reveals.forEach((node) => {
        node.classList.add('cosmic-reveal');
        revealObserver.observe(node);
      });
    }
  }
  let completed = document.body.classList.contains('video-complete');
  const bodyObserver = new MutationObserver(() => {
    const nextCompleted = document.body.classList.contains('video-complete');
    if (nextCompleted && !completed) cross();
    completed = nextCompleted;
    syncAnimation();
  });
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const onScroll = () => { scrollTarget = scrollY; };
  const onPageShow = () => { syncAnimation(); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', resize, { passive: true });
  addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', syncAnimation);
  motion.addEventListener('change', syncAnimation);
  resize(); syncAnimation();

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    chapterObserver?.disconnect(); revealObserver?.disconnect(); bodyObserver.disconnect();
    removeEventListener('scroll', onScroll); removeEventListener('resize', resize); removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', syncAnimation);
    motion.removeEventListener('change', syncAnimation);
    const reveals = getRevealTargets();
    reveals.forEach(node => {
      node.classList.remove('cosmic-reveal', 'cosmic-revealed');
      node.style.removeProperty('--text-rhythm-delay');
    });
    chapters.forEach(node => node.classList.remove('cosmic-chapter-active'));
    layer.remove(); document.body.classList.remove('cosmic-site');
  };
}
