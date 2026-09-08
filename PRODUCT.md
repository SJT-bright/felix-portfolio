# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary audience is Felix's school peers and, later, friends introduced by those peers. They visit to understand what Felix makes, learn how he approaches AI-assisted creative work, and decide whether to join an informal exchange group.

## Product Purpose

This is Felix's personal showcase and a trust-building entry point for an AI creative exchange group. It presents work already visible on the site, shares practical experience with websites, AI images, video, components, and digital tools, and gives interested visitors a direct way to contact Felix.

## Positioning

The site leads with Felix's own working process and current experiments. Felix expects to teach and share more than most members, while the group remains an open exchange where people can ask questions, show work, and share useful tools without a fixed program.

## Operating Context

Visitors usually arrive through Felix or a peer, browse the public portfolio on mobile or desktop, open the full-screen image archive when interested, and contact Felix through `SJTbright-future`. The Creative Lab page must remain useful without forms, QR codes, account creation, or a blog system.

## Capabilities and Constraints

- Every fresh home visit, refresh, and restored home document begins with the planetary 0–100 loader, then automatically plays the six-second video prelude without a welcome or click-to-enter screen. Incoming section hashes and restored scroll positions cannot bypass this order. The personal introduction appears in place after the video ends, then section navigation is unlocked. Reduced-motion preferences simplify decoration but keep this entry order. Failed video loading stays on the first screen with an explicit retry.
- The main React/Vite site includes the wormhole-to-blue hero, Image Archive, ScrollExpand section, eight project presentation cards, a photo-vortex white-tail video gateway, and a standalone 360-degree portfolio at `/portfolio/index.html`.
- Every currently playable site video retains BGM. The homepage first attempts audible autoplay and has no enable-sound button. If browser policy rejects sound, the film keeps playing muted; the next trusted page click or key press automatically restores audio at the current frame, or starts site ambience if the film has already ended. Browser restrictions are respected, not bypassed. If even muted playback is blocked, an explicit playback control provides recovery.
- After the homepage prelude, the supplied `个人网站bgm.mp3` (`assets/site-background-music.mp3`) provides the looping site soundtrack. It preloads during the prelude and fades in over its final 1.05 seconds at the existing background volume; the original video audio remains intact.
- The Hero preserves the user's original wormhole BGM. The portfolio gateway keeps its near-silent source track as a secondary audio stream and uses a cinematic BGM as the default stream. All eight project cards use supplied static covers and destinations. Card 07 is 万物联网志; card 08 is 写给世界的情书 · 正午的海 and intentionally shares card 04's destination, as requested by Felix.
- `/lab` is a standalone route inside the React application and indexes only content already exposed by the current site.
- The standalone portfolio remains self-contained and continues to load local Three.js and GSAP vendor files.
- Public copy must not name the school or imply an official school affiliation.
- The product does not promise a course, curriculum, check-in system, application process, pricing, form, or QR-code workflow.
- The existing wormhole-blue visual language and accessibility behavior must be preserved.

## Brand Commitments

- Name: Felix.
- Contact: `SJTbright-future`.
- Voice: direct, personal, curious, and grounded in actual making.
- Visual identity: midnight wormhole-blue surfaces, restrained ice-blue detail, Didot/Bodoni display type, Aptos/Segoe body type, thin rules, compact radii, and purposeful motion.

## Evidence on Hand

- Local audible wormhole Hero media (`wormhole-home-with-audio.mp4`), the audible photo-vortex white-tail portfolio transition (`portfolio-entry-transition-with-bgm.mp4`), their boundary frames, eight supplied website covers, the supplied Felix-and-cat community portrait, and retained AAC-equipped sailing media under `assets/`.
- Current interactive sections and their implementation in `src/components/`.
- The standalone portfolio in `public/portfolio/` retains its original dome layout and local vendor libraries. Its `collection.js` now maps the first five supplied portraits to a-001 through a-005; 55 of the 60 slots remain placeholders (29 visual, 26 build).
- The homepage Image Archive uses ten distinct supplied fantasy-architecture images in the original four-column tilted, continuously scrolling wall. Preserve its original format, speed, hover interaction and seamless track looping; do not replace it with a static or floating grid. Website cards 01–08 use supplied static screenshots and destinations; user-provided work must not be used to imply verified client relationships or stronger claims.
- Felix supplied the homepage statements about his AI learning and co-creation community, short-drama participation, Meituan AI-native community ambassador role, website income exceeding RMB 7,000, five competition PPT projects, and campus mini-program practice. These are presented as personal experience with an explicit non-endorsement statement.
- No testimonials, customer logos, member counts, outcome metrics, or official school endorsement have been supplied; future pages must not fabricate them.

## Product Principles

1. Show current work before making claims.
2. Keep the path from curiosity to conversation short and understandable.
3. Teach from real process while leaving room for peer exchange.
4. Preserve honest attribution and clearly separate personal initiative from school institutions.
5. Prefer small, maintainable page additions over speculative systems.

## Accessibility & Inclusion

Primary navigation and contact actions must work by keyboard, expose visible focus, and retain plain selectable contact text when automatic copying fails. Motion respects `prefers-reduced-motion`. Layouts must remain usable from 320 CSS pixels upward, and hash navigation must move both the viewport and keyboard focus to the destination.
