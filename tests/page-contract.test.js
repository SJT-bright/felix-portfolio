import test from "node:test";
import assert from "node:assert/strict";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const readOptional = async (path) => {
  try {
    return await read(path);
  } catch {
    return "";
  }
};

const normalizeText = (text) => text.replace(/\s+/g, "").trim();
const missingNormalizedCopy = (source, approvedCopy) => {
  const normalizedSource = normalizeText(source);
  return approvedCopy.filter((copy) => !normalizedSource.includes(normalizeText(copy)));
};
const collectDataText = (source, attribute) => {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tags = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\b${escapedAttribute}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
  return [...source.matchAll(tags)].map(([, , content]) => content.replace(/<[^>]+>/g, "").trim());
};
const findAriaHiddenWrapper = (source) => {
  const opening = /<([a-z][\w:-]*)\b[^>]*\baria-hidden="true"[^>]*>/i.exec(source);
  if (!opening) return "";
  const tagPattern = new RegExp(`<\\/?${opening[1]}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = opening.index;
  let depth = 0;
  for (let tag = tagPattern.exec(source); tag; tag = tagPattern.exec(source)) {
    if (/^<\//.test(tag[0])) depth -= 1;
    else if (!/\/>$/.test(tag[0])) depth += 1;
    if (depth === 0) return source.slice(opening.index, tagPattern.lastIndex);
  }
  return "";
};

const labTitlePropertyPattern = /\b(?:display|font-size|line-height|letter-spacing|word-break|overflow-wrap|text-wrap)\s*:/;
const parseCssRuleBlocks = (source) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
  selectors: selectors.trim(),
  declarations: declarations.trim(),
}));
const findUnscopedSharedLabTitleRules = (source) => parseCssRuleBlocks(source).filter(({ selectors, declarations }) => (
  labTitlePropertyPattern.test(declarations)
  && /\bh1\b/.test(selectors)
  && /\.(?:lab-page|lab-hero)\b/.test(selectors)
  && !/\[data-lab-page\]/.test(selectors)
));
const findUnscopedLabHierarchyRules = (source) => parseCssRuleBlocks(source).flatMap(({ selectors, declarations }) => (
  selectors.split(",").map((selector) => selector.trim()).filter((selector) => (
    !/\[data-lab-page\]/.test(selector)
    && (
      (/\.lab-hero\b/.test(selector) && /\bgrid-template-columns\s*:/.test(declarations))
      || (/\.lab-button(?:--primary|:hover)\b/.test(selector)
        && /\b(?:background(?:-color)?|border(?:-color)?)\s*:/.test(declarations))
    )
  )).map((selector) => ({ selector, declarations }))
));
const labGatewayScopedPropertyPattern = /\b(?:display|position|inset(?:-[a-z]+)?|inline-size|block-size|min-(?:inline|block)-size|max-(?:inline|block)-size|grid-template-columns|align-items|align-content|justify-content|justify-items|place-items|gap|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|border(?:-[a-z]+)?|background|color|font(?:-[a-z]+)?|letter-spacing|line-height|text-decoration|overflow(?:-[xy])?|overflow-wrap|outline(?:-[a-z]+)?|transform|animation|transition)\s*:/;
const findUnscopedLabGatewayRules = (source) => parseCssRuleBlocks(source).flatMap(({ selectors, declarations }) => {
  if (!labGatewayScopedPropertyPattern.test(declarations)) return [];
  return selectors.split(",").map((selector) => selector.trim()).filter((selector) => (
    /\.lab-gateway__/.test(selector) && !/\[data-lab-gateway\]/.test(selector)
  )).map((selector) => ({ selector, declarations }));
});

const parseProjectRecords = (source) => {
  const initializer = source.match(/export const projectItems = \[([\s\S]*?)\];/);
  assert.ok(initializer, "projectItems must remain a direct array literal");
  const objects = initializer[1].match(/^\s*\{[\s\S]*?^\s*\},?/gm) || [];
  const readField = (objectSource, field, index) => {
    const match = objectSource.match(new RegExp(`\\b${field}:\\s*"([^"]*)"`));
    assert.ok(match, `project item ${index + 1} must define ${field} as a string literal`);
    return match[1];
  };

  return objects.map((objectSource, index) => ({
    id: readField(objectSource, "id", index),
    number: readField(objectSource, "number", index),
    title: readField(objectSource, "title", index),
    description: readField(objectSource, "description", index),
    href: readField(objectSource, "href", index),
    image: /\bimage:\s*[A-Za-z][A-Za-z0-9]*Image\b/.test(objectSource),
    video: /\bvideo:\s*sailingVideo\b/.test(objectSource),
    poster: /\bposter:\s*sailingPoster\b/.test(objectSource),
  }));
};

const parseOklchToken = (source, tokenName) => {
  const escapedName = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(
    `${escapedName}:\\s*oklch\\(\\s*([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\s*\\)`,
  ));
  assert.ok(match, `${tokenName} must be a parseable OKLCH token`);
  return {
    lightness: Number(match[1]) / 100,
    chroma: Number(match[2]),
    hue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
};

const oklchToSrgb = ({ lightness, chroma, hue }) => {
  const hueRadians = hue * Math.PI / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.max(0, Math.min(1, channel)));
  return linear.map((channel) => (
    channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055
  ));
};

const compositeSrgb = (background, foreground, alpha) => (
  background.map((channel, index) => foreground[index] * alpha + channel * (1 - alpha))
);

const relativeLuminance = (srgb) => {
  const linear = srgb.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrastRatio = (first, second) => {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
};

test("Vite entry and scripts target the React production build", async () => {
  const [html, packageJsonText, vite, preview, runner] = await Promise.all([
    read("../index.html"),
    read("../package.json"),
    read("../vite.config.js"),
    read("../preview-server.mjs"),
    read("./run-browser-smoke.mjs"),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /aria-label="Felix 个人网站"/);
  assert.match(html, /<noscript>[\s\S]*?此网站需要启用 JavaScript 才能展示动态图片墙。[\s\S]*?<\/noscript>/);
  assert.match(html, /<div id="root">/);
  assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/);
  assert.match(html, /<link\s+(?=[^>]*rel="icon")(?=[^>]*href="data:,")/);
  assert.equal(packageJson.engines.node, ">=22.12.0");
  assert.equal(packageJson.scripts.build, "vite build");
  assert.equal(packageJson.scripts.dev, "vite --host 127.0.0.1 --port 52124");
  assert.equal(packageJson.scripts.preview, "npm run build && node preview-server.mjs");
  assert.match(packageJson.scripts["test:browser"], /^npm run build/);
  assert.match(vite, /plugin-react/);
  assert.match(vite, /sourcemap:\s*false/);
  assert.match(vite, /assetsInlineLimit:\s*0/);
  assert.match(preview, /new URL\("\.\/dist\/"/);
  assert.match(runner, /new URL\("\.\.\/dist\/"/);
});

test("React hero treats the wormhole as a prelude to an in-place personal landing", async () => {
  const [app, hero, profile, loaderHook, hook, controller, css, tokens, portraitAsset] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/components/OceanHero.jsx"),
    read("../src/components/ProfileLanding.jsx"),
    read("../src/hooks/useHomeLoader.js"),
    read("../src/hooks/useScrollVideo.js"),
    read("../scroll-controller.js"),
    read("../src/styles/global.css"),
    read("../tokens.css"),
    readFile(new URL("../src/assets/profile-felix-cat-background.jpg", import.meta.url)),
  ]);

  assert.match(app, /<OceanHero skipLoader=\{skipHomeLoader\}\s*\/>/);
  assert.doesNotMatch(app, /OceanTransition/);
  assert.match(hero, /id="wormhole-video"/);
  assert.doesNotMatch(hero, /\s+muted(?:\s|\/|>)/);
  assert.match(hero, /playsInline/);
  assert.match(hero, /preload="auto"/);
  assert.match(hero, /fetchPriority="high"/);
  assert.match(hero, /wormhole-home-poster\.jpg/);
  assert.match(hero, /wormhole-home-with-audio\.mp4/);
  assert.doesNotMatch(hero, /autoPlay|controls=|loop=/);
  assert.match(hero, /className="scroll-track"/);
  assert.match(hero, /<ProfileLanding onReplay=\{replay\}\s*\/>/);
  assert.match(hero, /className="prelude-layer" data-wormhole-prelude/);
  assert.doesNotMatch(hero, /准备好了吗|className="hero-intro"/);
  assert.doesNotMatch(hero, /和我一起，穿过这道入口/);
  assert.match(profile, />SJTbright-future</);
  assert.match(hero, /ref=\{triggerRef\}/);
  assert.match(hero, /className="scroll-cue hero-trigger"/);
  assert.doesNotMatch(hero, /hero-sound|开启声音|开启背景音乐/);
  assert.match(hero, /useHomeLoader\(\{ videoRef, skip: skipLoader \}\)/);
  assert.match(hero, /enabled: loaderReady/);
  assert.match(hook, /autoPlay: true/);
  assert.match(profile, /data-profile-landing/);
  assert.match(profile, /import profilePortrait from "\.\.\/assets\/profile-felix-cat-background\.jpg"/);
  assert.match(profile, /id="profile-title"[^>]*>我是 Felix。<\/h1>/);
  for (const copy of [
    "AI LEARNING &amp; CO-CREATION",
    "社群群主 · AI 创作者",
    "面向 AI 新手与进阶创作者，一起学习、拆解项目，也一起把视频、网站和视觉想法做出来。",
    "AI 入门 / 项目进阶 / 视频 / 网站 / 视觉共创",
    "已签约短剧公司 · 参与城市短剧项目制作",
    "美团 AI 原生社区「觅游」校园大使",
    "累计接单收入超过 7000 元",
    "5 个竞赛项目 PPT · 校园评分与课表小程序推进中",
    "以上均为 Felix 个人经历；社群由个人发起，非学校、美团或短剧公司官方项目，个人履历不构成机构背书。",
  ]) assert.ok(profile.includes(copy), `profile landing is missing ${copy}`);
  assert.match(profile, /data-profile-portrait/);
  assert.match(profile, /<img[\s\S]*?src=\{profilePortrait\}[\s\S]*?width="940"[\s\S]*?height="940"[\s\S]*?loading="eager"[\s\S]*?decoding="async"/);
  assert.match(profile, /SCROLL TO EXPLORE/);
  assert.equal(portraitAsset.byteLength, 56_219, "the supplied background portrait byte size changed");
  assert.equal(
    createHash("sha256").update(portraitAsset).digest("hex").toUpperCase(),
    "BD9123A9BA9951617464DD4556A74E9BFD1CCB953869A96E8264CAAD1A0ACB8C",
    "the supplied background portrait SHA-256 changed",
  );
  assert.deepEqual([...portraitAsset.subarray(0, 3)], [0xff, 0xd8, 0xff], "Felix portrait must remain a JPEG");
  assert.match(hook, /createScrollVideoController/);
  assert.match(hook, /if \(!enabled\) return undefined/);
  assert.match(hook, /const trackElement = trackRef\.current/);
  assert.match(hook, /const triggerElement = triggerRef\.current/);
  assert.match(hook, /trackElement,/);
  assert.match(hook, /triggerElement,/);
  assert.doesNotMatch(hook, /image-archive|nextElement/);
  assert.match(hook, /controller\.destroy\(\)/);
  assert.match(controller, /video\.addEventListener\("ended", revealLanding\)/);
  assert.match(controller, /doc\.body\.classList\.add\("video-complete"\)/);
  assert.match(controller, /claimVideoBgm\(video, \{ owner: win, volume: 1, force: true \}\)/);
  assert.match(controller, /video-audio-blocked/);
  assert.doesNotMatch(controller, /nextElement|scrollIntoView/);
  assert.match(loaderHook, /createHomeLoaderController/);
  assert.match(loaderHook, /document\.getElementById\("site-loader"\)/);
  assert.match(loaderHook, /onComplete: \(\) => setReady\(true\)/);
  assert.match(css, /\.scroll-track\s*\{[^}]*min-block-size:\s*100svh/s);
  assert.match(css, /@supports\s*\(height:\s*100dvh\)[\s\S]*?\.scroll-track\s*\{[^}]*min-block-size:\s*100dvh/s);
  assert.doesNotMatch(css, /\b(?:200|500)dvh\b/);
  assert.match(css, /\.presentation-stage\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.profile-landing\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.profile-landing__portrait\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/s);
  assert.match(css, /\.profile-landing__layout\s*\{[^}]*position:\s*relative[^}]*z-index:\s*2/s);
  assert.match(css, /\.profile-landing__portrait img\s*\{[^}]*object-fit:\s*cover[^}]*mask-image:/s);
  for (const token of ["--color-profile-accent", "--color-profile-accent-soft", "--color-profile-veil"]) {
    assert.match(tokens, new RegExp(`${token}:\\s*oklch\\(`));
  }
  assert.match(css, /\.scroll-cue\s*\{[^}]*inset-block-end:\s*max\(var\(--space-4\),\s*env\(safe-area-inset-bottom\)\)/s);
  assert.match(css, /\.stage-scrim\s*\{[^}]*linear-gradient\(to top,\s*var\(--color-ink\)\s*0%,\s*transparent\s*60%\)[^}]*var\(--color-ink-scrim\)/s);
  assert.match(css, /body\.video-complete \.prelude-layer\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/s);
  assert.match(css, /body\.video-complete \.profile-landing\s*\{[^}]*opacity:\s*1[^}]*visibility:\s*visible/s);
  assert.match(css, /\.gallery-section\s*\{[^}]*var\(--color-profile-surface\)/s);
  assert.doesNotMatch(css, /\.presentation-stage\s*\{[^}]*position:\s*fixed/s);
});

test("the homepage owns a real planetary 0–100 loader before the Hero video", async () => {
  const [html, main, route, controller, asset] = await Promise.all([
    read("../index.html"),
    read("../src/main.jsx"),
    read("../src/lib/page-route.js"),
    read("../src/lib/home-loader-controller.js"),
    readFile(new URL("../public/loader/planet-loader-art.png", import.meta.url)),
  ]);

  assert.match(html, /<body class="site-loading">/);
  assert.match(html, /<div[\s\S]*?id="site-loader"[\s\S]*?<div id="root">/);
  assert.match(html, /src="\/loader\/planet-loader-art\.png"/);
  assert.match(html, /data-site-loader-art/);
  assert.match(html, />DIGITAL EXPERIENCE</);
  assert.match(html, />BY 司钧霆 FELIX</);
  assert.equal((html.match(/BY 司钧霆 FELIX/g) ?? []).length, 1);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /data-site-loader-percentage>000%/);
  assert.match(html, /class="site-loader__visual" aria-hidden="true"/);
  assert.match(html, /alt=""/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /\.site-loader\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/s);
  assert.match(html, /inline-size:\s*min\(74vmin, 42rem\)/);
  assert.doesNotMatch(html, /100vw|transition:\s*all/);

  assert.equal(asset.subarray(1, 4).toString(), "PNG");
  assert.equal(asset.readUInt32BE(16), 864);
  assert.equal(asset.readUInt32BE(20), 864);
  assert.equal(asset[25], 6, "planet loader PNG must retain RGBA transparency");

  assert.match(controller, /loaderProgressToAngle\(value\)/);
  assert.match(controller, /clampLoaderProgress\(value\) \* 3\.6/);
  assert.match(controller, /--site-loader-angle/);
  assert.match(controller, /--site-loader-dashoffset/);
  assert.match(controller, /timeout-failed-open/);
  assert.match(controller, /rootElement\.inert = true/);
  assert.match(controller, /rootElement\.inert = false/);
  assert.match(main, /const skipHomeLoader = page !== "home";/);
  assert.doesNotMatch(main, /isHomeSectionHash/);
  assert.match(main, /window\.history\.scrollRestoration = "manual"/);
  assert.match(main, /window\.history\.replaceState\(window\.history\.state, "", window\.location\.pathname \+ window\.location\.search\)/);
  assert.match(main, /document\.body\.classList\.add\("home-intro-pending"\)/);
  assert.match(main, /document\.getElementById\("site-loader"\)\?\.remove\(\)/);
  assert.match(route, /#image-archive/);
  assert.match(route, /#project-showcase/);
  assert.match(route, /#portfolio-gallery/);
});

test("Lab title CSS rejects unscoped selectors that can style the shared Not Found heading", async () => {
  const labCss = await readOptional("../src/pages/LabPage.css");
  const mutatedRule = ".lab-page .lab-hero > h1 { font-size: 4rem; line-height: 0.9; }";

  assert.equal(
    findUnscopedSharedLabTitleRules(mutatedRule).length,
    1,
    "the CSS rule parser must catch a nested shared Lab/Not Found heading selector",
  );
  assert.deepEqual(
    findUnscopedSharedLabTitleRules(labCss),
    [],
    "Lab title typography must not use an unscoped shared .lab-page/.lab-hero/h1 rule",
  );
});

test("Lab Task 2 hierarchy styles cannot leak into the shared Not Found structure", async () => {
  const labCss = await readOptional("../src/pages/LabPage.css");
  assert.deepEqual(
    findUnscopedLabHierarchyRules(labCss),
    [],
    "Lab desktop columns and primary CTA state must be rooted under [data-lab-page]",
  );
});

test("visual title wrapper parsing keeps same-tag child lines inside the hidden wrapper", () => {
  const fixture = '<span aria-hidden="true"><span data-lab-title-line>one</span><span data-lab-title-line>two</span><span data-lab-title-line>three</span></span>';
  const outsideLineFixture = '<span aria-hidden="true"><span data-lab-title-line>one</span><span data-lab-title-line>two</span></span><span data-lab-title-line>three</span>';

  assert.deepEqual(
    collectDataText(findAriaHiddenWrapper(fixture), "data-lab-title-line"),
    ["one", "two", "three"],
    "same-tag child spans must not make the visual wrapper parser stop at the first child closing tag",
  );
  assert.equal(
    collectDataText(findAriaHiddenWrapper(outsideLineFixture), "data-lab-title-line").length,
    2,
    "a title line outside the aria-hidden wrapper must be excluded",
  );
  assert.notDeepEqual(
    collectDataText(findAriaHiddenWrapper(outsideLineFixture), "data-lab-title-line"),
    ["one", "two", "three"],
    "a fixture with a title line outside the wrapper must fail the three-line wrapper contract",
  );
});

test("Lab gateway typography is editorial, scoped, and browser-measured", async () => {
  const [gateway, gatewayCss, browserSmoke] = await Promise.all([
    readOptional("../src/components/LabGateway.jsx"),
    readOptional("../src/components/LabGateway.css"),
    read("./browser-smoke.mjs"),
  ]);

  assert.match(gateway, /<h2 id="lab-gateway-title">欢迎加入 AI 社群<\/h2>/);
  assert.match(gateway, /href="\/lab"/);
  assert.match(gateway, />进群福利</);
  assert.match(
    gatewayCss,
    /\[data-lab-gateway\][^{]*#lab-gateway-title\s*\{/,
    "gateway title typography must be rooted under [data-lab-gateway]",
  );
  assert.match(
    gatewayCss,
    /\[data-lab-gateway\][^{]*\.lab-gateway__account\s*\{/,
    "gateway account measure must be rooted under [data-lab-gateway]",
  );
  assert.doesNotMatch(
    gatewayCss,
    /\[data-lab-gateway\][^{]*#lab-gateway-title\s*\{[^}]*text-wrap\s*:\s*balance/s,
    "critical gateway title breaking must not rely on text-wrap: balance",
  );
  assert.deepEqual(
    findUnscopedLabGatewayRules(gatewayCss),
    [],
    "all gateway-specific typography, layout, spacing, interaction, and transition rules must be rooted under [data-lab-gateway]",
  );
  assert.deepEqual(
    findUnscopedLabGatewayRules("[data-lab-gateway] .safe, .lab-gateway__link:hover { color: var(--color-focus); }"),
    [{ selector: ".lab-gateway__link:hover", declarations: "color: var(--color-focus);" }],
    "the gateway scope guard must inspect each selector in a comma-separated interaction rule",
  );
  assert.deepEqual(
    findUnscopedLabGatewayRules("@media (min-width: 48rem) { .lab-gateway__inner { grid-template-columns: 1fr 1fr; } }"),
    [{ selector: ".lab-gateway__inner", declarations: "grid-template-columns: 1fr 1fr;" }],
    "the gateway scope guard must inspect conventional rules nested in media blocks",
  );
  assert.match(browserSmoke, /async function verifyLabGateway\(run, viewport\)[\s\S]*?document\.fonts\.ready/);
  assert.match(browserSmoke, /document\.createRange\(\)/, "gateway title lines must use DOM Range line boxes");
  assert.match(browserSmoke, /range\.getClientRects\(\)/, "gateway title lines must measure the text Range");
  assert.match(
    browserSmoke,
    /geometry\.titleFontSize\s*<=\s*geometry\.projectTitleFontSize\s*\+\s*1/,
    "gateway title must remain subordinate to the preceding Project Showcase title",
  );
  assert.doesNotMatch(
    browserSmoke,
    /gatewayTitle[^\n]*\.getClientRects\(\)/,
    "gateway title orphan checks must not use block getClientRects",
  );
});

test("Creative Lab editorial typesetting preserves every approved copy block", async () => {
  const [gateway, lab] = await Promise.all([
    readOptional("../src/components/LabGateway.jsx"),
    readOptional("../src/pages/LabPage.jsx"),
  ]);
  const approvedGatewayCopy = [
    "AI COMMUNITY",
    "欢迎加入 AI 社群",
    "进群福利",
    "SJTbright-future",
    "复制微信号",
    "已复制微信号",
    "无法自动复制，请手动复制上方微信号。",
  ];
  const approvedLabCopy = [
    "← 返回 Felix 首页",
    "FELIX CREATIVE LAB",
    "先看作品，再决定是否继续交流。",
    "我是 Felix。这里展示的都是真实作品——结构、画面、节奏，欢迎细看。",
    "直接看作品",
    "看完再聊",
    "CURRENT INDEX",
    "从这三个入口开始看。",
    "三个入口都能直接打开；看完想聊，随时回到页面底部找我。",
    "站点与交互",
    "已上线的页面：看结构、组件与动效如何协同落地。",
    "视觉实验",
    "排版的节奏、画面的关系，还有细节的质感。",
    "影像空间",
    "点开沉浸页，体验一体化的作品展示空间。",
    "交流方式",
    "觉得对味，我们可以这样聊。",
    "围绕你看中的作品聊。",
    "你点出在意的作品，我基于自己的制作过程给出建议。",
    "你可以带来",
    "一个问题就够了。",
    "一张截图、一个链接，或一个问题，任选其一；其余看完再补。",
    "CONTACT",
    "看完作品，随时来聊。",
    "复制联系方式",
    "附上作品编号和你的想法，我能更快对上话。",
    "由 Felix 自主发起，与学校官方机构无隶属关系。",
  ];

  assert.deepEqual(missingNormalizedCopy(gateway, approvedGatewayCopy), []);
  assert.deepEqual(missingNormalizedCopy(lab, approvedLabCopy), []);

  const alteredLab = lab.replace("随时回到页面底部找我。", "随时找我。");
  assert.deepEqual(
    missingNormalizedCopy(alteredLab, approvedLabCopy),
    ["三个入口都能直接打开；看完想聊，随时回到页面底部找我。"],
    "the copy contract must reject a plausible factual wording mutation even when the layout markup is unchanged",
  );
});

test("Creative Lab is a conservative, native-link community gateway", async () => {
  const [app, route, gateway, gatewayCss, lab, labCss, showcase, html, browserSmoke] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/lib/page-route.js"),
    readOptional("../src/components/LabGateway.jsx"),
    readOptional("../src/components/LabGateway.css"),
    readOptional("../src/pages/LabPage.jsx"),
    readOptional("../src/pages/LabPage.css"),
    read("../src/components/ProjectShowcase.jsx"),
    read("../index.html"),
    read("./browser-smoke.mjs"),
  ]);
  const labSource = `${gateway}\n${lab}`;
  const labStyles = `${gatewayCss}\n${labCss}`;

  assert.match(app, /import \{ useLayoutEffect \} from "react"/);
  assert.match(app, /import LabGateway from "\.\/components\/LabGateway\.jsx"/);
  assert.match(app, /<ProjectShowcase\s*\/>[\s\S]*?<LabGateway\s*\/>/);
  assert.match(route, /new Set\(\["#image-archive", "#project-showcase", "#portfolio-gallery"\]\)/);
  assert.match(app, /window\.location\.hash\.slice\(1\)/);
  assert.match(app, /isHomeSectionHash\(window\.location\.hash\)/);
  assert.match(app, /target\.tabIndex\s*=\s*-1/);
  assert.match(app, /target\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(app, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(app, /behavior:\s*"smooth"/);
  assert.doesNotMatch(showcase, /useLayoutEffect|window\.location\.hash|scrollIntoView/);
  assert.match(showcase, /<section[^>]*id="project-showcase"[^>]*tabIndex=\{-1\}/);
  assert.match(showcase, /<aside[^>]*id="portfolio-gallery"[^>]*tabIndex=\{-1\}/);
  assert.match(gatewayCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(gatewayCss, /\.project-showcase:focus-visible,\s*\.portfolio-gateway:focus-visible\s*\{[^}]*outline:[^;]*var\(--color-focus\)[^}]*outline-offset:\s*calc\(var\(--space-2\) \* -1\)/s);

  assert.match(gateway, /data-lab-gateway/);
  assert.match(gateway, />AI COMMUNITY</);
  assert.match(gateway, />欢迎加入 AI 社群</);
  assert.match(gateway, /href="\/lab"/);
  assert.match(gateway, />进群福利</);
  assert.match(gateway, /data-gateway-copy/);
  assert.match(gateway, /data-gateway-status/);

  assert.match(lab, /data-lab-page/);
  const labTitle = "先看作品，再决定是否继续交流。";
  const desktopTitleLines = ["先看作品，", "再决定是否", "继续交流。"];
  assert.match(
    lab,
    /<h1\s+id="lab-title"[^>]*\baria-label="先看作品，再决定是否继续交流。"[^>]*>/,
    "#lab-title must expose the complete title as one accessible name",
  );
  const labTitleMarkup = lab.match(/<h1\b(?=[^>]*\bid="lab-title")[^>]*>([\s\S]*?)<\/h1>/);
  assert.ok(labTitleMarkup, "#lab-title markup must remain available for semantic inspection");
  assert.doesNotMatch(
    labTitleMarkup[0],
    /<h1\b[^>]*\baria-hidden="true"/,
    "#lab-title itself must remain exposed to assistive technology",
  );
  const visualTitleWrapper = findAriaHiddenWrapper(labTitleMarkup[1]);
  assert.ok(visualTitleWrapper, "#lab-title needs an independent aria-hidden visual wrapper");
  assert.deepEqual(
    collectDataText(visualTitleWrapper, "data-lab-title-line"),
    desktopTitleLines,
    "the aria-hidden visual title wrapper must contain all three visual lines",
  );
  const titleLines = collectDataText(lab, "data-lab-title-line");
  assert.deepEqual(titleLines, desktopTitleLines, "Lab title must define exactly three ordered desktop visual lines");
  assert.equal(
    normalizeText(titleLines.join("")),
    normalizeText(labTitle),
    "the collected visual title lines must reconstruct the accessible title",
  );
  assert.match(
    labCss,
    /\[data-lab-page\][^{]*\[data-lab-title-line\]\s*\{/,
    "title-line styling must be rooted in the Lab page scope",
  );
  assert.deepEqual(
    findUnscopedSharedLabTitleRules(labCss),
    [],
    "Lab title CSS must not leak key title properties through shared .lab-page/.lab-hero/h1 selectors",
  );
  assert.doesNotMatch(
    labCss,
    /\[data-lab-page\][^{]*\[data-lab-title-line\]\s*\{[^}]*text-wrap\s*:\s*balance/s,
    "critical Chinese title breaking must not depend on text-wrap: balance",
  );
  assert.match(lab, /<div className="lab-hero__heading">[\s\S]*?<p className="lab-page__kicker">FELIX CREATIVE LAB<\/p>[\s\S]*?<h1[^>]*id="lab-title"[^>]*>[\s\S]*?<\/h1>[\s\S]*?<\/div>[\s\S]*?<div className="lab-hero__intro">/);
  /* Superseded by the accessible title and visual-line contract below.
  // Superseded by the accessible title and visual-line contract below.
  */
  assert.match(lab, /href="#lab-contact"/);
  assert.match(lab, /href="#lab-results"/);
  assert.match(lab, /id="lab-results"[^>]*tabIndex=\{-1\}/);
  assert.match(lab, /id="lab-contact"[^>]*tabIndex=\{-1\}/);
  assert.equal((lab.match(/\bnumber:\s*"0[1-3]"/g) || []).length, 3);
  assert.equal((lab.match(/data-lab-result/g) || []).length, 1, "one mapped result anchor renders all three entries");
  for (const [label, href] of [
    ["站点与交互", "/#project-showcase"],
    ["视觉实验", "/#image-archive"],
    ["影像空间", "/portfolio/index.html"],
  ]) {
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(lab, new RegExp(`title:\\s*"${label}"[^}]*href:\\s*"${escapedHref}"`));
  }
  assert.match(lab, /const CONTACT = "SJTbright-future"/);
  assert.match(lab, /className="lab-contact__account"[^>]*>\{CONTACT\}<\/p>/);
  assert.match(lab, /data-copy-contact/);
  assert.match(lab, /data-copy-status/);
  assert.match(lab, /if \(copyState === "copying"\) return;/);
  assert.match(lab, /aria-disabled=\{copyState === "copying"\}/);
  assert.doesNotMatch(lab, /\sdisabled=\{copyState === "copying"\}/);
  assert.match(labCss, /\.lab-contact__copy\[aria-disabled="true"\]/);
  assert.doesNotMatch(labCss, /\.lab-contact__copy:disabled/);
  assert.match(lab, /已复制/);
  assert.match(lab, /无法自动复制，请手动复制上方账号。/);
  assert.match(lab, /附上作品编号和你的想法，我能更快对上话。/);
  assert.match(lab, /由 Felix 自主发起，与学校官方机构无隶属关系。/);
  assert.doesNotMatch(labSource, /免费|收费|课程|报名|申请|二维码|\bQR\b/i);
  assert.doesNotMatch(labSource, /https?:\/\//);
  assert.doesNotMatch(labSource, /<form\b|<video\b|autoPlay|three|rotate[XYZ]/i);
  assert.doesNotMatch(labStyles, /transition:\s*all\b|#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i);
  assert.match(labCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  assert.match(html, /<a href="\/">返回首页<\/a>/);
  assert.match(html, /<a href="\/lab">Felix 创作实验室<\/a>/);
  const noScriptMarkup = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
  assert.match(noScriptMarkup, /此网站需要启用 JavaScript 才能展示动态图片墙。/);
  assert.doesNotMatch(noScriptMarkup, /<a\b|<nav\b|href=/);
  assert.match(browserSmoke, /const labLink = noScriptRun\.page\.locator\('a\[href="\/lab"\]'\);/);
  assert.match(browserSmoke, /const homeLink = noScriptRun\.page\.locator\('a\[href="\/"\]'\);/);
  assert.match(browserSmoke, /async function verifyLabTypography\(page, viewport\)/);
  assert.match(
    browserSmoke,
    /async function verifyCreativeLab\(browser, viewport\) \{[\s\S]*?await verifyLabTypography\(run\.page, viewport\);/,
    "every regular Lab viewport must invoke the typography geometry gate",
  );
  assert.match(browserSmoke, /\{ width: 1280, height: 900, label: "desktop-1280" \}/);
});

test("DriftWall gallery uses the supplied collection in the original scrolling layout", async () => {
  const [app, gallery, data, wall, tokens] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/components/DriftWallGallery.jsx"),
    read("../src/data/galleryItems.js"),
    read("../src/components/DriftWall/DriftWall.jsx"),
    read("../tokens.css"),
  ]);

  assert.doesNotMatch(app, /OceanTransition/);
  assert.match(app, /<DriftWallGallery\s*\/>/);
  assert.match(gallery, /style=\{\{ height: 600 \}\}/);
  assert.doesNotMatch(gallery, /gallery-wall-frame--curated|repeat=\{false\}/);
  assert.match(gallery, /items=\{galleryItems\}/);
  for (const [prop, value] of [
    ["columns", "4"], ["tileWidth", "184"], ["tileHeight", "136"],
    ["gap", "12"], ["tilt", "16"], ["turn", "-14"],
    ["perspective", "1350"], ["depth", "120"], ["speed", "42"],
    ["variance", "0.45"], ["parallax", "0.6"], ["lift", "64"],
    ["fade", "0.6"], ["dim", "0.9"], ["radius", "15"], ["roll", "1"],
  ]) {
    assert.match(gallery, new RegExp(`${prop}=\\{${value}\\}`));
  }
  assert.match(gallery, /direction="up"/);
  assert.match(gallery, /overlayColor="var\(--color-wall-overlay\)"/);
  assert.match(tokens, /--color-wall-overlay:\s*oklch\(0% 0\.005 250\)/);
  assert.doesNotMatch(`${gallery}\n${wall}`, /#[\da-f]{3,8}\b/i);
  assert.match(gallery, /<h2[^>]*>Image Archive<\/h2>/);
  assert.match(gallery, /<p id="gallery-note" lang="zh-CN">云上宫阙，星际幻境。十幅画面，十个想象中的世界。<\/p>/);
  assert.doesNotMatch(gallery, />Images by Felix\.</);
  assert.match(gallery, /className="gallery-section"[\s\S]*lang="en"/);
  for (let index = 1; index <= 10; index += 1) {
    const id = String(index).padStart(2, "0");
    assert.match(data, new RegExp(`archive-${id}\\.(jpg|png)`));
    assert.match(data, new RegExp(`image: archive${id}, title:`));
  }
  assert.equal((data.match(/image: archive\d+/g) || []).length, 10);
  assert.doesNotMatch(data, /picsum\.photos|\bhref:/);
  assert.match(wall, /columnItems\.map/);
  assert.doesNotMatch(data, /https?:\/\/example\.com\//);
});

test("DriftWall lifecycle is viewport-aware, reduced-motion safe, and honest", async () => {
  const wall = await read("../src/components/DriftWall/DriftWall.jsx");

  assert.match(wall, /ResizeObserver/);
  assert.match(wall, /IntersectionObserver/);
  assert.match(wall, /rootMargin:\s*"120px"/);
  assert.match(wall, /visibilitychange/);
  assert.match(wall, /containerHeight\s*>\s*0/);
  assert.match(wall, /data-running=\{shouldAnimate\s*\?/);
  assert.match(wall, /requestAnimationFrame\(animate\)/);
  assert.match(wall, /cancelAnimationFrame/);
  assert.match(wall, /prefers-reduced-motion:\s*reduce/);
  assert.match(wall, /referrerPolicy="no-referrer"/);
  assert.match(wall, /const \[loaded, setLoaded\] = useState\(false\)/);
  assert.match(wall, /onLoad=\{\(\) => setLoaded\(true\)\}/);
  assert.match(wall, /onError=\{\(\) => \{[\s\S]*?setLoaded\(false\);[\s\S]*?setFailed\(true\);[\s\S]*?\}\}/);
  assert.match(wall, /useEffect\(\(\) => \{[\s\S]*?setFailed\(false\);[\s\S]*?setLoaded\(Boolean\(imageRef\.current\?\.complete && imageRef\.current\.naturalWidth > 0\)\);[\s\S]*?\}, \[item\?\.image\]\)/);
  assert.match(wall, /draggable=\{false\}/);
  assert.match(wall, /if \(item\?\.href\)/);
  assert.match(wall, /className="drift-wall__links"/);
  assert.match(wall, /aria-label="Image links"/);
  assert.match(wall, /className="drift-wall__plane" aria-hidden="true"/);
  assert.doesNotMatch(wall, /role="button"|tabIndex=\{0\}/);
});

test("the new production graph excludes the retired carousel", async () => {
  const [main, app, gallery, packageJson] = await Promise.all([
    read("../src/main.jsx"),
    read("../src/App.jsx"),
    read("../src/components/DriftWallGallery.jsx"),
    read("../package.json"),
  ]);
  const graph = `${main}\n${app}\n${gallery}\n${packageJson}`;

  assert.doesNotMatch(graph, /carousel\.js|script\.js|styles\.css/);
  assert.match(graph, /DriftWall/);
});

test("ocean visual system remains token-driven and responsive", async () => {
  const [css, wallCss, tokens] = await Promise.all([
    read("../src/styles/global.css"),
    read("../src/components/DriftWall/DriftWall.css"),
    read("../tokens.css"),
  ]);
  const styles = `${css}\n${wallCss}`;

  const hallmarkStamp = css.split(/\r?\n/, 1)[0];
  assert.match(hallmarkStamp, /macrostructure: Marquee Hero/);
  assert.match(hallmarkStamp, /pre-emit critique: P5 H5 E5 S5 R5 V5/);
  assert.match(hallmarkStamp, /contrast: pass \(40–41\)/);
  assert.match(hallmarkStamp, /slop: pass \(42–49\)/);
  assert.match(hallmarkStamp, /mobile: pass \(34, 49, 50–57\)/);
  assert.match(css, /@import url\("\.\.\/\.\.\/tokens\.css"\)/);
  assert.match(css, /\.profile-landing/);
  assert.match(css, /\.prelude-layer/);
  assert.match(css, /\.gallery-wall-frame/);
  assert.match(wallCss, /\.drift-wall\[data-running="true"\]/);
  assert.match(wallCss, /will-change:\s*transform/);
  assert.doesNotMatch(styles, /transition:\s*all\b/);
  assert.doesNotMatch(styles, /(?:inline-)?width:\s*100vw/);
  assert.doesNotMatch(styles, /@media[^\{]*\bmax-width\s*:/);
  assert.doesNotMatch(styles, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /\b(?:rgb|hsl)a?\(/i);
  assert.match(tokens, /--font-display:\s*Didot, "Bodoni MT", "Bodoni 72"/);
  assert.match(tokens, /--color-gallery-surface:\s*oklch\(/);
  assert.match(tokens, /--color-mask-solid:\s*oklch\(/);
});

test("local wormhole prelude assets exist and remain external media", async () => {
  const [video, poster] = await Promise.all([
    stat(new URL("../assets/wormhole-home-with-audio.mp4", import.meta.url)),
    stat(new URL("../assets/wormhole-home-poster.jpg", import.meta.url)),
  ]);
  assert.ok(video.size > 1_000_000);
  assert.ok(poster.size > 10_000);
});

test("portfolio entry owns a local photo-vortex white-tail transition and a native-link fallback", async () => {
  const [showcase, component, css, tokens, video, poster, endFrame] = await Promise.all([
    read("../src/components/ProjectShowcase.jsx"),
    read("../src/components/PortfolioEntryTransition.jsx"),
    read("../src/components/PortfolioEntryTransition.css"),
    read("../tokens.css"),
    readFile(new URL("../assets/portfolio-entry-transition-with-bgm.mp4", import.meta.url)),
    readFile(new URL("../assets/portfolio-entry-transition-poster.jpg", import.meta.url)),
    readFile(new URL("../assets/portfolio-entry-transition-end.png", import.meta.url)),
  ]);

  assert.match(showcase, /import PortfolioEntryTransition from "\.\/PortfolioEntryTransition\.jsx"/);
  assert.equal((showcase.match(/<PortfolioEntryTransition\s*\/>/g) || []).length, 1);
  assert.match(component, /href=\{PORTFOLIO_HREF\}/);
  assert.match(component, /PORTFOLIO_HREF\s*=\s*"\/portfolio\/index\.html"/);
  assert.match(component, /PORTFOLIO_VIDEO_ENTRY_HREF\s*=\s*`\$\{PORTFOLIO_HREF\}#entry-video`/);
  assert.match(component, /createPortfolioTransitionController/);
  assert.match(component, /createPortal\(transition, document\.body\)/);
  assert.match(component, /data-portfolio-transition/);
  assert.match(component, /className="portfolio-transition__video"/);
  assert.match(component, /portfolio-entry-transition-with-bgm\.mp4/);
  assert.match(component, /portfolio-entry-transition-poster\.jpg/);
  assert.match(component, /正在穿越照片长廊并进入作品影像馆/);
  assert.doesNotMatch(component, /\s+muted(?:\s|\/|>)/);
  assert.match(component, /playsInline/);
  assert.match(component, /preload="metadata"/);
  assert.doesNotMatch(component, /autoPlay|controls=|loop=/);
  assert.match(component, /className="portfolio-transition__skip"/);
  assert.match(component, />\s*跳过动画\s*</);
  assert.match(css, /\.portfolio-transition\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*var\(--z-portfolio-transition\)[^}]*inset:\s*0/s);
  assert.match(css, /\.portfolio-transition__video\s*\{[^}]*object-fit:\s*cover/s);
  assert.match(css, /data-complete="true"[^}]*var\(--color-archive-paper\)/s);
  assert.match(css, /body\.portfolio-transition-active\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(tokens, /--color-archive-paper:\s*oklch\(100% 0 0\)/);
  assert.match(tokens, /--z-portfolio-transition:\s*100/);

  for (const [name, bytes, size, hash] of [
    ["video", video, 5_137_722, "3E9BBA77E66214088F0E62041A6FC654B5CA7A102DE4ED97E44233A77121E02C"],
    ["poster", poster, 12_959, "733FC82E41F44A026FBDB08BFC81D799E4A6E7F62A01205EE43D109637716BCE"],
    ["white end frame", endFrame, 4_427, "5622F7F2B696C0993FC150B2751FFF38868DF0A79F2DD791B18E0C5EDF32C158"],
  ]) {
    assert.equal(bytes.byteLength, size, `${name} has the approved byte size`);
    assert.equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(), hash, `${name} has the approved SHA-256`);
  }
});

test("browser smoke verification keeps portable runtime and Range coverage", async () => {
  const smoke = await read("./browser-smoke.mjs");
  assert.match(smoke, /PLAYWRIGHT_MODULE_PATH/);
  assert.match(smoke, /PLAYWRIGHT_EXECUTABLE_PATH/);
  assert.match(smoke, /Range:\s*"bytes=0-0"/);
  assert.match(smoke, /Content-Range/);
  assert.match(smoke, /bytes 0-0\/4727355/);
  assert.match(
    smoke,
    /const response = await fetch\(new URL\(mediaPath, baseUrl\), \{\s*headers:\s*\{ Range: "bytes=0-0" \},\s*\}\);/s,
  );
  assert.match(smoke, /check\(response\.status === 206,/);
  assert.match(smoke, /check\(contentRange === "bytes 0-0\/4727355",/);
  assert.match(
    smoke,
    /check\(\/wormhole-home-with-audio-\[A-Za-z0-9_-\]\+\\\.mp4\(\?:\$\|\\\?\)\/\.test\(initial\.currentSrc\)/,
  );
  assert.match(smoke, /page\.mouse\.wheel\(0, 120\)/);
  assert.match(smoke, /!video\.paused && video\.currentTime > 0\.05/);
  assert.match(smoke, /Math\.abs\(end\.scrollY - beforeScrollY\) <= 1/);
  assert.match(smoke, /end\.profileOpacity > 0\.99/);
  assert.match(smoke, /end\.archiveTop >= end\.viewportHeight - 2/);
  assert.doesNotMatch(smoke, /scrollHeroTo/);
  assert.match(smoke, /async function verifyHero\(page, viewport\)/);
  assert.match(
    smoke,
    /for \(const viewport of viewports\) \{[\s\S]*?await verifyHero\(run\.page, viewport\);[\s\S]*?await verifyGallery\(run\.page, viewport\);/,
  );
  assert.doesNotMatch(smoke, /if \(viewport\.label === "desktop"\) await verifyHero\(/);
  assert.match(smoke, /mobile-320/);
  assert.match(smoke, /tablet-768/);
  assert.match(smoke, /desktop/);
  assert.match(smoke, /FELIX_WRITE_DRIFTWALL_SCREENSHOTS/);
  assert.match(smoke, /felix-driftwall-desktop\.png/);
  assert.doesNotMatch(smoke, /C:\\\\Users\\\\matebook|C:\\\\Program Files/);
});

test("the fourth chapter is a full-bleed static handoff while its final video is pending", async () => {
  const [app, section] = await Promise.all([
    read("../src/App.jsx"),
    readOptional("../src/components/ScrollExpandSection.jsx"),
  ]);

  assert.match(app, /import ScrollExpandSection from "\.\/components\/ScrollExpandSection\.jsx"/);
  const galleryIndex = app.indexOf("<DriftWallGallery />");
  const expandIndex = app.indexOf("<ScrollExpandSection />");
  assert.ok(galleryIndex >= 0 && expandIndex > galleryIndex, "ScrollExpand must follow DriftWall");

  assert.match(section, /useWindowScroll/);
  assert.match(section, /scrollHint=""/);
  assert.match(section, /enabled=\{false\}/);
  assert.match(section, /endRadius=\{0\}/);
  assert.match(section, /mediaZoom=\{1\}/);
  assert.equal((section.match(/mediaZoom=/g) || []).length, 1);
  assert.doesNotMatch(section, /startWidth=|startHeight=|startRadius=|scrollDistance=|smoothing=/);
  assert.match(section, /在这里，做自己的创世主/);
  assert.match(section, /思路打开，/);
  assert.match(section, /把重复交给 AI，把想法留给自己。/);
  assert.match(section, /lang="zh-CN"/);
  assert.equal((section.match(/className="scroll-expand__copy-line"/g) || []).length, 2);
  assert.doesNotMatch(section, /height:\s*["']?520|height:\s*520/);
});

test("ScrollExpand lifecycle, fallback, and visual layer are production-safe", async () => {
  const [component, css, tokens] = await Promise.all([
    readOptional("../src/components/ScrollExpand/ScrollExpand.jsx"),
    readOptional("../src/components/ScrollExpand/ScrollExpand.css"),
    read("../tokens.css"),
  ]);

  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /cancelAnimationFrame/);
  assert.match(component, /passive:\s*true/);
  assert.match(component, /typeof ResizeObserver/);
  assert.match(component, /prefers-reduced-motion:\s*reduce/);
  assert.match(component, /addEventListener\("change"/);
  assert.match(component, /removeEventListener\("change"/);
  assert.match(component, /addListener\?\./);
  assert.match(component, /removeListener\?\./);
  assert.match(component, /mediaType\s*=\s*"image"/);
  assert.match(component, /poster\s*=\s*""/);
  assert.match(component, /mediaType\s*===\s*"video"/);
  assert.match(component, /const mediaRef = useRef\(null\)/);
  assert.match(component, /ref=\{mediaRef\}/);
  assert.match(component, /media\.pause\(\)/);
  assert.match(component, /media\.play\(\)/);
  assert.match(component, /playAttempt\?\.catch/);
  assert.match(component, /\}, \[enabled, mediaType, reducedMotion, src\]\)/);
  assert.match(component, /\}, \[src, mediaType\]\)/);
  assert.match(component, /if \(!running\) lastTimestamp = 0/);
  assert.match(component, /<video/);
  assert.doesNotMatch(component, /\s+muted(?:\s|\/|>)/);
  assert.doesNotMatch(component, /\bautoPlay=/);
  assert.match(component, /playsInline/);
  assert.match(component, /loop/);
  assert.match(component, /style=\{\{\s*\.\.\.style,\s*\.\.\.rootStyle\s*\}\}/);
  assert.match(component, /data-media-state/);
  assert.match(component, /onError/);
  assert.match(component, /errorMessage\s*=\s*"媒体暂时无法加载，介绍内容仍可阅读。"/);
  assert.match(component, /\{errorMessage\}/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /className="scroll-expand__grade"/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /clip-path:\s*inset\(/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /env\(safe-area-inset-/);
  assert.match(css, /\.scroll-expand__copy-line\s*\{[^}]*display:\s*block/s);
  assert.match(css, /@supports\s*\(height:\s*100dvh\)[\s\S]*data-enabled="false"[\s\S]*block-size:\s*100dvh/);
  assert.match(css, /@media\s*\(min-width:\s*48rem\)[\s\S]*\.scroll-expand__copy-line\s*\{[^}]*display:\s*inline/s);
  assert.match(css, /\.scroll-expand__content h2\s*\{[^}]*min-inline-size:\s*0/s);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /(?:inline-)?width:\s*100vw/);
  assert.doesNotMatch(css, /@media[^\{]*\bmax-width\s*:/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\b(?:rgb|hsl)a?\(/i);
  assert.match(tokens, /--color-expand-surface:\s*oklch\(/);
  assert.match(tokens, /--color-expand-scrim:\s*oklch\(/);
  assert.match(tokens, /--color-expand-grade:\s*oklch\(/);
  assert.match(css, /\.scroll-expand__grade\s*\{[^}]*mix-blend-mode:\s*color/s);
});

test("every display heading has an intrinsic-size escape hatch", async () => {
  const [globalCss, expandCss] = await Promise.all([
    read("../src/styles/global.css"),
    read("../src/components/ScrollExpand/ScrollExpand.css"),
  ]);

  assert.match(globalCss, /\.identity\s*\{[^}]*min-inline-size:\s*0/s);
  assert.match(globalCss, /\.gallery-header h2\s*\{[^}]*min-inline-size:\s*0/s);
  assert.match(expandCss, /\.scroll-expand__content h2\s*\{[^}]*min-inline-size:\s*0/s);
});

test("wormhole prelude media is local, exact, and paired with its poster", async () => {
  const hero = await read("../src/components/OceanHero.jsx");
  assert.match(hero, /wormhole-home-poster\.jpg/);
  assert.match(hero, /wormhole-home-with-audio\.mp4/);

  let video;
  let poster;
  try {
    [video, poster] = await Promise.all([
      readFile(new URL("../assets/wormhole-home-with-audio.mp4", import.meta.url)),
      readFile(new URL("../assets/wormhole-home-poster.jpg", import.meta.url)),
    ]);
  } catch {
    assert.fail("Wormhole prelude video and poster must exist");
  }

  assert.equal(video.byteLength, 4_727_355);
  assert.equal(
    createHash("sha256").update(video).digest("hex").toUpperCase(),
    "7746A54F09D4F42F1463165D507BA4A3825207834829D2EAC764983306D29D2D",
  );
  assert.equal(poster.byteLength, 165_368);
});

test("Hallmark history is newest-first and preserves Lab plus ScrollExpand records", async () => {
  const [rawLog, globalCss] = await Promise.all([
    read("../.hallmark/log.json"),
    read("../src/styles/global.css"),
  ]);
  const entries = JSON.parse(rawLog);
  const timestamps = entries.map(({ date }) => Date.parse(`${date}T00:00:00Z`));

  assert.ok(timestamps.every((value, index) => index === 0 || timestamps[index - 1] >= value));
  assert.equal(entries[0].date, "2026-08-13");
  assert.equal(entries[0].macrostructure, "Long Document");
  assert.match(entries[0].brief, /Felix Creative Lab/);
  const scrollExpandEntry = entries.find(
    (entry) => entry.date === "2026-08-10" && /ScrollExpand/.test(entry.enrichment),
  );
  assert.ok(scrollExpandEntry, "the earlier ScrollExpand Hallmark record must remain in history");
  assert.ok(entries.indexOf(scrollExpandEntry) > 0, "the ScrollExpand record must follow the newer Lab record");
  assert.match(globalCss, /variation:\s*30%-portal-to-full-bleed/);
});

test("project primitives preserve Aceternity boundaries without framework dependencies", async () => {
  const [bento, card, packageJsonText] = await Promise.all([
    read("../src/components/ProjectShowcase/BentoGrid.jsx"),
    read("../src/components/ProjectShowcase/ThreeDCard.jsx"),
    read("../package.json"),
  ]);

  const source = `${bento}\n${card}`;
  const packageJson = JSON.parse(packageJsonText);

  for (const exportedName of ["BentoGrid", "BentoGridItem", "CardContainer", "CardBody", "CardItem"]) {
    assert.match(source, new RegExp(`export\\s+(?:function|const)\\s+${exportedName}\\b`));
  }
  assert.match(bento, /function mergeClasses/);
  assert.match(card, /function mergeClasses/);
  assert.match(card, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(card, /--project-rotate-x/);
  assert.match(card, /--project-rotate-y/);
  assert.match(card, /Math\.max\(-5,\s*Math\.min\(5,/);
  assert.match(card, /onPointerLeave=.*resetRotation/);
  assert.match(card, /onPointerCancel=.*resetRotation/);
  assert.match(card, /onBlurCapture=.*resetRotation/);
  assert.match(card, /onPointerMove:\s*callerPointerMove/);
  assert.match(card, /callerPointerMove\?\.\(event\)/);
  assert.match(card, /callerPointerLeave\?\.\(event\)/);
  assert.match(card, /callerPointerCancel\?\.\(event\)/);
  assert.match(card, /callerBlurCapture\?\.\(event\)/);
  assert.match(card, /translateZ\s*=\s*0/);
  assert.match(card, /Number\.isFinite/);
  assert.match(card, /--project-depth/);
  assert.match(card, /style=\{\{\s*\.\.\.style,/);
  assert.doesNotMatch(source, /setPointerCapture|preventDefault|stopPropagation|useState|addEventListener/);
  assert.doesNotMatch(source, /(?:tailwind|shadcn|framer-motion|motion\/react)/i);
  assert.equal(packageJson.dependencies["framer-motion"], undefined);
  assert.equal(packageJson.dependencies.tailwindcss, undefined);
});

test("Project Showcase is the fifth chapter with eight safe mixed-media cards", async () => {
  const [app, data, showcase, portfolioEntryComponent, card, videoController, css, tokens, packageJsonText, gatewayAsset, ...projectAssets] = await Promise.all([
    read("../src/App.jsx"),
    readOptional("../src/data/projectItems.js"),
    readOptional("../src/components/ProjectShowcase.jsx"),
    readOptional("../src/components/PortfolioEntryTransition.jsx"),
    readOptional("../src/components/ProjectShowcase/ProjectCard.jsx"),
    readOptional("../src/components/ProjectShowcase/project-video-controller.js"),
    readOptional("../src/components/ProjectShowcase/ProjectShowcase.css"),
    read("../tokens.css"),
    read("../package.json"),
    readFile(new URL("../src/assets/portfolio-gallery-backdrop.jpg", import.meta.url)),
    readFile(new URL("../assets/project-01-mufeng-fragrance.jpg", import.meta.url)),
    readFile(new URL("../assets/project-02-fox26-portfolio.jpg", import.meta.url)),
    readFile(new URL("../assets/project-03-poetry-universe.jpg", import.meta.url)),
    readFile(new URL("../assets/project-04-world-love-letter.jpg", import.meta.url)),
    readFile(new URL("../assets/project-05-moon-whisper-tarot.jpg", import.meta.url)),
    readFile(new URL("../assets/project-06-mercedes-cinematic.jpg", import.meta.url)),
  ]);
  const packageJson = JSON.parse(packageJsonText);
  const source = `${data}\n${showcase}\n${portfolioEntryComponent}\n${card}\n${css}`;
  const expectedItems = [
    ["project-01", "01", "沐风香氛", "以风与四季为线索，构建沉浸式东方香氛品牌首页。", "https://mufeng-fragrance.pages.dev/"],
    ["project-02", "02", "FOX26 数字作品集", "以高对比排版与影像网格，呈现多方向视觉与互动作品。", "https://nick-fox.pages.dev/1/"],
    ["project-03", "03", "星笺 · 诗歌宇宙", "以诗人、朝代与星系结构，组织古典诗歌的交互探索。", "https://hhh416873-gif.github.io/"],
    ["project-04", "04", "写给世界的情书", "以海岸、文字与呼吸交互，构建沉浸式情绪叙事体验。", "https://0ef20201a59546889a9bd4bc4bc87642.app.workbuddy.link/"],
    ["project-05", "05", "月语塔罗", "以梦幻插画与萤光意象，呈现月光主题的塔罗体验。", "https://lxl12138com-cyber.github.io/moon-whisper-tarot/"],
    ["project-06", "06", "Mercedes-Benz 电影式体验", "以全屏影像与章节叙事，呈现豪华汽车品牌的数字体验。", "https://9bd684df375b4bd29a9f49a6e7ac5fd6.app.workbuddy.link"],
    ["project-07", "07", "万物联网志", "跟随一次跨洲信息传递，探索网络如何连接远方。", "https://network-wonders-after.pages.dev/#why"],
    ["project-08", "08", "写给世界的情书 · 正午的海", "让海浪、诗句与呼吸交互，构成片刻安静的数字空间。", "https://0ef20201a59546889a9bd4bc4bc87642.app.workbuddy.link/"],
  ];
  const expectedRecords = expectedItems.map(([id, number, title, description, href], index) => ({
    id,
    number,
    title,
    description,
    href,
    image: true,
    video: false,
    poster: false,
  }));

  assert.match(app, /import ProjectShowcase from "\.\/components\/ProjectShowcase\.jsx"/);
  const expandIndex = app.indexOf("<ScrollExpandSection />");
  const projectIndex = app.indexOf("<ProjectShowcase />");
  assert.ok(expandIndex >= 0 && projectIndex > expandIndex, "ProjectShowcase must follow ScrollExpandSection once");
  assert.equal((app.match(/<ProjectShowcase\s*\/>/g) || []).length, 1);

  assert.match(data, /import mufengFragranceImage from "\.\.\/\.\.\/assets\/project-01-mufeng-fragrance\.jpg"/);
  assert.match(data, /import fox26PortfolioImage from "\.\.\/\.\.\/assets\/project-02-fox26-portfolio\.jpg"/);
  assert.match(data, /import poetryUniverseImage from "\.\.\/\.\.\/assets\/project-03-poetry-universe\.jpg"/);
  assert.match(data, /import worldLoveLetterImage from "\.\.\/\.\.\/assets\/project-04-world-love-letter\.jpg"/);
  assert.match(data, /import moonWhisperTarotImage from "\.\.\/\.\.\/assets\/project-05-moon-whisper-tarot\.jpg"/);
  assert.match(data, /import mercedesCinematicImage from "\.\.\/\.\.\/assets\/project-06-mercedes-cinematic\.jpg"/);
  assert.match(data, /import networkWondersImage from "\.\.\/\.\.\/assets\/project-07-network-wonders\.png"/);
  assert.match(data, /import worldLoveLetterSeaImage from "\.\.\/\.\.\/assets\/project-08-world-love-letter-sea\.png"/);
  assert.equal((data.match(/\bid:\s*"project-\d{2}"/g) || []).length, 8);
  assert.deepEqual(
    [...data.matchAll(/\bid:\s*"(project-\d{2})"/g)].map((match) => match[1]).sort(),
    expectedItems.map(([id]) => id),
    "project ids must be the unique ordered set project-01 through project-08",
  );
  assert.deepEqual(
    [...data.matchAll(/\bnumber:\s*"(\d{2})"/g)].map((match) => match[1]).sort(),
    expectedItems.map(([, number]) => number),
    "project numbers must be the unique ordered set 01 through 08",
  );
  for (const [id, number, title, description] of expectedItems) {
    for (const value of [id, number, title, description]) assert.ok(data.includes(value));
  }
  assert.deepEqual(
    parseProjectRecords(data),
    expectedRecords,
    "project items must keep 01-08 in order with every field bound to the correct object",
  );

  const legacyFlatGuard = (sourceToCheck) => {
    assert.deepEqual(
      [...sourceToCheck.matchAll(/\bid:\s*"(project-\d{2})"/g)].map((match) => match[1]).sort(),
      expectedItems.map(([id]) => id),
    );
    assert.deepEqual(
      [...sourceToCheck.matchAll(/\bnumber:\s*"(\d{2})"/g)].map((match) => match[1]).sort(),
      expectedItems.map(([, number]) => number),
    );
    for (const item of expectedItems) {
      for (const value of item) assert.ok(sourceToCheck.includes(value));
    }
  };
  const titleSentinel = "__project_title_swap__";
  const crossWiredData = data
    .replace(`title: "${expectedRecords[0].title}"`, `title: "${titleSentinel}"`)
    .replace(`title: "${expectedRecords[1].title}"`, `title: "${expectedRecords[0].title}"`)
    .replace(`title: "${titleSentinel}"`, `title: "${expectedRecords[1].title}"`);
  legacyFlatGuard(crossWiredData);
  assert.notDeepEqual(
    parseProjectRecords(crossWiredData),
    expectedRecords,
    "the record-level guard must catch cross-wired fields that the legacy flat guard misses",
  );
  assert.equal((data.match(/\bimage:\s*[A-Za-z][A-Za-z0-9]*Image/g) || []).length, 8);
  assert.equal((data.match(/\bvideo:\s*sailingVideo/g) || []).length, 0);
  assert.equal((data.match(/\bposter:\s*sailingPoster/g) || []).length, 0);
  assert.equal((data.match(/\bhref:\s*"https:\/\//g) || []).length, 8);
  assert.equal((data.match(/\bhref:\s*""/g) || []).length, 0);
  assert.match(data, /\bimageAlt:\s*"沐风香氛官网首页，米白色背景与香水瓶主视觉"/);
  assert.match(data, /\bimageWidth:\s*3208\b/);
  assert.match(data, /\bimageHeight:\s*1730\b/);
  assert.doesNotMatch(data, /https?:\/\/example\.com\/project-/);
  const projectItemsInitializer = data.match(/export const projectItems = \[([\s\S]*?)\];/);
  assert.ok(projectItemsInitializer, "projectItems must remain a direct array literal");
  const directProjectItems = projectItemsInitializer[1].match(/^\s*\{[\s\S]*?^\s*\},?/gm) || [];
  assert.equal(directProjectItems.length, 8, "projectItems must contain exactly eight direct objects");
  assert.equal(
    projectItemsInitializer[1].replace(/^\s*\{[\s\S]*?^\s*\},?/gm, "").trim(),
    "",
    "projectItems must not include spread or computed extra entries",
  );
  assert.equal(
    (data.match(/\bprojectItems\b/g) || []).length,
    1,
    "projectItems must not be mutated after its declaration",
  );
  assert.notEqual(
    (`${data}\nprojectItems.push(projectItems[0]);`.match(/\bprojectItems\b/g) || []).length,
    1,
    "the eight-card guard must detect a push mutation",
  );

  const galleryTitle = "影像馆";
  const galleryButtonCopy = "进入作品影像馆";
  const gallerySupportingCopy = "把网站之外的图像、片段与灵感，收进另一片海域。";

  assert.match(showcase, /import "\.\/ProjectShowcase\/ProjectShowcase\.css"/);
  assert.match(showcase, /import portfolioGatewayImage from "\.\.\/assets\/portfolio-gallery-backdrop\.jpg"/);
  assert.match(showcase, /const portfolioGatewayMedia = \{\s*src:\s*portfolioGatewayImage,\s*width:\s*1672,\s*height:\s*941,\s*\};/s);
  assert.match(showcase, /<section[^>]*data-project-showcase[^>]*lang="zh-CN"[^>]*aria-labelledby="project-showcase-title"/);
  assert.match(showcase, />Selected Works</);
  assert.match(showcase, /<h2 id="project-showcase-title">我的数字作品<\/h2>/);
  assert.match(showcase, />八个网站与交互方向：前六项已上线，可直接访问；第七、八项将随素材补充。</);
  assert.match(showcase, /projectItems\.map/);
  assert.match(showcase, /<BentoGrid/);
  assert.match(showcase, /<BentoGridItem/);
  assert.match(showcase, /<ProjectCard/);
  assert.match(
    showcase,
    /<aside id="portfolio-gallery" tabIndex=\{-1\} className="portfolio-gateway" aria-label="Felix 影像馆入口">/,
  );

  assert.match(showcase, /<PortfolioEntryTransition\s*\/>/);
  const portfolioEntryMatch = portfolioEntryComponent.match(/<a ref=\{linkRef\} className="portfolio-entry" href=\{PORTFOLIO_HREF\}[\s\S]*?<\/a>/);
  assert.ok(portfolioEntryMatch, "Project Showcase must expose the semantic portfolio entry");
  assert.equal(
    (portfolioEntryComponent.match(/<a ref=\{linkRef\} className="portfolio-entry" href=\{PORTFOLIO_HREF\}/g) || []).length,
    1,
    "Project Showcase must contain exactly one standalone portfolio entry",
  );
  const portfolioEntry = portfolioEntryMatch[0];
  assert.ok(portfolioEntry.includes(galleryButtonCopy));
  assert.doesNotMatch(portfolioEntry, /target="_blank"/);
  assert.equal((showcase.match(/projectItems\.map/g) || []).length, 1);
  assert.equal((showcase.match(/<ProjectCard\b/g) || []).length, 1);
  const headerIndex = showcase.indexOf("<header");
  const portfolioEntryIndex = showcase.indexOf("<PortfolioEntryTransition />");
  const headerEndIndex = showcase.indexOf("</header>");
  const bentoIndex = showcase.indexOf("<BentoGrid>");
  const gatewayIndex = showcase.indexOf('className="portfolio-gateway"');
  assert.ok(
    headerIndex >= 0
      && headerEndIndex > headerIndex
      && bentoIndex > headerEndIndex
      && gatewayIndex > bentoIndex
      && portfolioEntryIndex > gatewayIndex,
    "DOM order must be header, eight-card BentoGrid, then the portfolio gateway",
  );
  assert.ok(showcase.includes(galleryTitle));
  assert.ok(showcase.includes(gallerySupportingCopy));
  assert.match(showcase, />Felix · Visual Archive</);
  assert.doesNotMatch(showcase, /Felix 路 Visual Archive/);
  assert.match(showcase, />A PRIVATE</);
  assert.match(showcase, />VISUAL SPACE</);
  assert.match(showcase, /<figure className="portfolio-gateway__photo" aria-hidden="true">/);
  assert.match(showcase, /<img[^>]*className="portfolio-gateway__image"[^>]*src=\{portfolioGatewayMedia\.src\}[^>]*alt=""[^>]*width=\{portfolioGatewayMedia\.width\}[^>]*height=\{portfolioGatewayMedia\.height\}[^>]*loading="eager"[^>]*decoding="async"/s);
  assert.match(showcase, /<span className="portfolio-gateway__photo-fallback">影像馆人物写真背景<\/span>/);
  assert.doesNotMatch(showcase, /portfolio-gateway__photo-caption|05 \/ ARCHIVE/);
  assert.equal(gatewayAsset.byteLength, 275_623, "the approved gallery backdrop byte size changed");
  assert.equal(
    createHash("sha256").update(gatewayAsset).digest("hex").toUpperCase(),
    "26436E71EB34595204D7FC00011AF9EFAFB323B77064EF863EF329CB64DE2A53",
    "the approved gallery backdrop SHA-256 changed",
  );
  assert.deepEqual([...gatewayAsset.subarray(0, 3)], [0xff, 0xd8, 0xff], "gallery backdrop must remain a JPEG");
  const approvedProjectAssets = [
    ["Mufeng", 669_029, "C4BBE331DC3D964EA38292C1E9494BA03892528ADDE265853DCDE843F0F50450"],
    ["FOX26", 564_965, "14AE3C0C8BD3EEC373DF238AC82A751F389D9FC60AA7D6A77DC70102AE7D4F96"],
    ["Poetry Universe", 430_402, "9AE455987F3FC5BDCA13F892BFBA19D00AAA305009DEA2283CB80FBD5B01AB1A"],
    ["World Love Letter", 539_536, "571FB6C318FD25C79DB2FF0B6F4FA6401B93473D34CCF2F40C0C126193462859"],
    ["Moon Whisper Tarot", 652_793, "01D3694FEE4307379C85946507726451908D7765BB5158F9CE8BCC2C11923AF0"],
    ["Mercedes Cinematic", 317_387, "D7000D12265BD2C2244FEFA08D835B119CD5E664C7CA5F4BAF6CA075A61639E3"],
  ];
  for (const [asset, [label, byteLength, hash]] of projectAssets.map((asset, index) => [asset, approvedProjectAssets[index]])) {
    assert.equal(asset.byteLength, byteLength, `the approved ${label} project preview byte size changed`);
    assert.equal(
      createHash("sha256").update(asset).digest("hex").toUpperCase(),
      hash,
      `the approved ${label} project preview SHA-256 changed`,
    );
    assert.deepEqual([...asset.subarray(0, 3)], [0xff, 0xd8, 0xff], `${label} project preview must remain a JPEG`);
  }

  assert.match(card, /<article[^>]*ref=\{rootRef\}/);
  for (const primitive of ["CardContainer", "CardBody", "CardItem"]) assert.match(card, new RegExp(`<${primitive}`));
  assert.match(card, /useViewportVideo\(\{ rootRef, videoRef, failed \}\)/);
  assert.match(card, /setFailed\(false\)/);
  assert.match(card, /\}, \[image, video\]\)/);
  assert.match(card, /const hasLink = typeof href === "string" && href\.trim\(\)\.length > 0/);
  assert.match(card, /const hasImage = typeof image === "string" && image\.length > 0/);
  assert.match(card, /const hasVideo = typeof video === "string" && video\.length > 0/);
  assert.match(card, /const ProjectSurface = hasLink \? "a" : "div"/);
  assert.match(card, /data-link-state=\{hasLink \? "ready" : "pending"\}/);
  assert.match(card, /hasLink[\s\S]*target:\s*"_blank"[\s\S]*rel:\s*"noreferrer noopener"/);
  assert.match(card, /"aria-label":\s*`\$\{title\} 在新窗口打开网站演示`/);
  assert.match(card, /className="project-card__video"/);
  assert.match(card, /data-media-kind=\{hasImage \? "image" : hasVideo \? "video" : "empty"\}/);
  assert.match(card, /data-image-fit=\{hasImage \? imageFit \|\| "cover" : undefined\}/);
  assert.match(card, /data-image-position=\{hasImage \? imagePosition \|\| "center" : undefined\}/);
  assert.match(card, /hasImage \? \(/);
  assert.match(card, /<img[\s\S]*?className="project-card__image"[\s\S]*?src=\{image\}[\s\S]*?alt=\{imageAlt \|\| `\$\{title\} 网站首页预览`\}[\s\S]*?width=\{imageWidth\}[\s\S]*?height=\{imageHeight\}[\s\S]*?loading="lazy"[\s\S]*?decoding="async"[\s\S]*?onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(card, /ref=\{videoRef\}/);
  assert.match(
    card,
    /<video[^>]*\bsrc=\{video\}/s,
    "direct src must update media selection without replacing the controller-bound video node",
  );
  assert.doesNotMatch(card, /key=\{video\}|<source\b/);
  for (const attribute of ["loop", "playsInline", 'preload="metadata"', "poster", 'aria-hidden="true"']) {
    assert.ok(card.includes(attribute));
  }
  assert.doesNotMatch(card, /\s+muted(?:\s|\/|>)/);
  assert.doesNotMatch(card, /autoPlay|controls/);
  assert.match(videoController, /enableVideoBgm\(video, 0\.65\)/);
  assert.match(videoController, /claimVideoBgm\(video, \{ owner: win, volume: 0\.65, force: forceAudio \}\)/);
  assert.match(videoController, /releaseVideoBgm\(video, \{ owner: win \}\)/);
  assert.match(card, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(card, /failed \? \(/);
  assert.match(card, /作品预览暂时无法加载/);
  assert.match(card, /<h3>/);
  assert.match(card, /hasLink \? "访问网站 ↗" : "演示链接待补充"/);

  assert.match(css, /\.project-bento-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.project-showcase\s*\{[^}]*padding-block:\s*clamp\(var\(--space-12\), 10vw, 8rem\)[^}]*padding-inline-start:\s*max\(var\(--space-4\), env\(safe-area-inset-left\)\)[^}]*padding-inline-end:\s*max\(var\(--space-4\), env\(safe-area-inset-right\)\)/s);
  assert.match(css, /@media\s*\(min-width:\s*48rem\)[\s\S]*\.project-bento-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media\s*\(min-width:\s*48rem\)[\s\S]*\.project-showcase\s*\{[^}]*padding-inline-start:\s*max\(var\(--space-8\), env\(safe-area-inset-left\)\)[^}]*padding-inline-end:\s*max\(var\(--space-8\), env\(safe-area-inset-right\)\)/);
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*10/);
  assert.match(css, /object-fit:\s*cover/);
  assert.match(css, /\.project-card__media\[data-media-kind="image"\]\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.match(css, /\.project-card__image\s*\{[^}]*object-fit:\s*cover/s);
  assert.match(css, /\.project-card__media\[data-image-fit="contain"\]\s+\.project-card__image\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.project-card__media\[data-image-position="top"\]\s+\.project-card__image\s*\{[^}]*object-position:\s*center top/s);
  assert.match(css, /\.project-card__media\[data-media-kind="image"\]::after\s*\{[^}]*display:\s*none/s);
  assert.match(css, /min-inline-size:\s*0/);
  assert.match(css, /--project-rotate-x/);
  assert.match(css, /--project-rotate-y/);
  assert.match(css, /--project-depth/);
  assert.match(css, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  assert.match(css, /:focus-within/);
  assert.match(css, /:focus-visible[^}]*outline:[^;]*var\(--color-focus\)/s);
  const readCssRule = (selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `Project Showcase CSS is missing the ${selector} rule`);
    return match[1];
  };
  assert.match(css, /\.portfolio-gateway\s*\{[^}]*position:\s*relative[^}]*isolation:\s*isolate[^}]*grid-template-columns:\s*1fr[^}]*grid-template-rows:\s*auto 1fr auto[^}]*min-inline-size:\s*0[^}]*min-block-size:\s*clamp\(34rem, 150vw, 40rem\)[^}]*overflow:\s*clip/s);
  assert.match(css, /\.portfolio-gateway\s*\{[^}]*box-sizing:\s*border-box/s);
  const gatewayScrimRule = readCssRule(".portfolio-gateway::before");
  assert.match(gatewayScrimRule, /z-index:\s*1/);
  assert.match(gatewayScrimRule, /var\(--color-portfolio-backdrop-scrim-top\)[\s\S]*var\(--color-portfolio-backdrop-scrim-clear\)[\s\S]*var\(--color-portfolio-backdrop-scrim-bottom\)/);
  assert.match(css, /\.portfolio-gateway__copy,\s*\.portfolio-gateway__action\s*\{[^}]*position:\s*relative[^}]*z-index:\s*2/s);
  assert.match(css, /\.portfolio-gateway__photo\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*0[^}]*inset:\s*0[^}]*border-radius:\s*inherit/s);
  assert.match(css, /\.portfolio-gateway__photo-fallback\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/s);
  const gatewayImageRule = readCssRule(".portfolio-gateway__image");
  assert.match(gatewayImageRule, /position:\s*absolute/);
  assert.match(gatewayImageRule, /inset:\s*0/);
  assert.match(gatewayImageRule, /inline-size:\s*100%/);
  assert.match(gatewayImageRule, /block-size:\s*100%/);
  assert.match(gatewayImageRule, /object-fit:\s*cover/);
  assert.match(gatewayImageRule, /object-position:\s*center/);
  assert.doesNotMatch(css, /\.portfolio-gateway__photo::after\s*\{/);
  assert.doesNotMatch(css, /\.portfolio-gateway__photo-caption\s*\{/);
  assert.match(css, /\.portfolio-gateway__action\s*\{[^}]*grid-row:\s*3[^}]*align-self:\s*end/s);
  assert.match(css, /\.portfolio-gateway__action \.portfolio-entry\s*\{[^}]*margin-block-start:\s*0/s);
  assert.match(css, /\.portfolio-gateway__title\s*\{[^}]*font-size:\s*min\(var\(--text-project-title\), 6rem\)[^}]*letter-spacing:\s*-0\.04em/s);
  assert.match(css, /@media\s*\(min-width:\s*48rem\)[\s\S]*\.portfolio-gateway\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto[^}]*grid-template-rows:\s*auto 1fr[^}]*min-block-size:\s*clamp\(32rem, 56vw, 48rem\)/);
  assert.match(css, /@media\s*\(min-width:\s*48rem\)[\s\S]*\.portfolio-gateway__action\s*\{[^}]*grid-row:\s*1[^}]*grid-column:\s*2[^}]*align-self:\s*start[^}]*justify-items:\s*end/s);
  assert.doesNotMatch(css, /\.portfolio-gateway__photo\s*\{[^}]*\btransform\s*:/s);
  assert.doesNotMatch(css, /repeating-(?:linear|radial|conic)-gradient/i);
  for (const selector of [
    ".portfolio-entry",
    ".portfolio-entry__inner",
    ".portfolio-entry__top-light",
    ".portfolio-entry__text",
  ]) {
    assert.ok(css.includes(selector), `Project Showcase CSS is missing ${selector}`);
  }
  const portfolioEntryRule = readCssRule(".portfolio-entry");
  const portfolioInnerRule = readCssRule(".portfolio-entry__inner");
  const portfolioShineRule = readCssRule(".portfolio-entry__inner::before");
  const portfolioTopLightRule = readCssRule(".portfolio-entry__top-light");
  const portfolioFocusRule = readCssRule(".portfolio-entry:focus-visible");
  assert.match(portfolioEntryRule, /color:\s*var\(--color-text\)/);
  assert.match(
    portfolioEntryRule,
    /background:\s*linear-gradient\([\s\S]*?var\(--color-portfolio-entry-edge-deep\)[\s\S]*?var\(--color-portfolio-entry-edge-bright\)[\s\S]*?\)/,
  );
  assert.match(
    portfolioInnerRule,
    /background:[\s\S]*?radial-gradient\([\s\S]*?var\(--color-portfolio-entry-glow\)[\s\S]*?var\(--color-portfolio-entry-glow-clear\)[\s\S]*?linear-gradient\([\s\S]*?var\(--color-portfolio-entry-surface-deep\)[\s\S]*?var\(--color-portfolio-entry-surface-blue\)/,
  );
  assert.match(
    portfolioShineRule,
    /background:\s*linear-gradient\([\s\S]*?var\(--color-portfolio-entry-shine-clear\)[\s\S]*?var\(--color-portfolio-entry-shine\)[\s\S]*?var\(--color-portfolio-entry-shine-clear\)/,
  );
  assert.match(
    portfolioTopLightRule,
    /background:\s*radial-gradient\([\s\S]*?var\(--color-portfolio-entry-highlight\)[\s\S]*?var\(--color-portfolio-entry-highlight-soft\)[\s\S]*?var\(--color-portfolio-entry-highlight-clear\)/,
  );
  assert.match(portfolioFocusRule, /outline:[^;]*var\(--color-focus\)/);
  assert.match(
    portfolioFocusRule,
    /outline-offset:\s*var\(--space-1\)/,
    "the gateway focus ring must remain visible at the tablet viewport edge",
  );
  assert.match(css, /@keyframes\s+portfolio-entry-shine\b/);
  assert.match(portfolioShineRule, /animation:\s*portfolio-entry-shine\s+3s\s+var\(--ease-in-out\)\s+infinite/);
  assert.match(
    css,
    /@keyframes\s+portfolio-entry-shine\s*\{[\s\S]*?transform:\s*translateX\(-120%\)[\s\S]*?transform:\s*translateX\(120%\)[\s\S]*?\}/,
  );
  assert.match(css, /\.portfolio-entry:hover\s*\{/);
  assert.match(css, /\.portfolio-entry:active\s*\{/);
  assert.match(css, /\.portfolio-entry:focus-visible\s*\{[^}]*var\(--color-focus\)/s);
  const reducedMotionCss = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reducedMotionCss, /\.portfolio-entry[\s\S]*animation:\s*none/);
  assert.match(reducedMotionCss, /\.portfolio-entry[\s\S]*transition:\s*none/);
  const reducedShinePattern = /\.portfolio-entry__inner::before\s*\{[^}]*animation:\s*none/s;
  assert.match(reducedMotionCss, reducedShinePattern);
  assert.doesNotMatch(
    reducedMotionCss.replace(".portfolio-entry__inner::before", ""),
    reducedShinePattern,
    "the reduced-motion guard must fail if the animated shine selector is removed",
  );
  assert.doesNotMatch(css, /(^|[},]\s*)\.(?:inner|text|top-white)(?=[\s:{.#>+~\[])/m);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transform:\s*none/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /(?:inline-)?width:\s*100vw/);
  assert.doesNotMatch(css, /@media[^\{]*\bmax-width\s*:/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\b(?:rgb|hsl)a?\(/i);
  assert.doesNotMatch(css, /\boklch\(/i, "component CSS must consume color tokens instead of direct OKLCH");
  assert.doesNotMatch(css, /font-family\s*:(?!\s*var\()/);
  assert.match(css, /\.project-card h3\s*\{[^}]*font-size:\s*var\(--text-project-card-title\)/s);
  for (const token of ["--color-project-surface", "--color-project-card", "--color-project-border", "--color-project-glow", "--color-project-glow-fade", "--color-project-fallback", "--color-project-media-grade", "--text-project-title", "--text-project-card-title", "--measure-project", "--radius-project", "--shadow-project-rest", "--shadow-project-active"]) {
    assert.match(tokens, new RegExp(`${token}:`));
  }
  assert.match(css, /\.project-card__media::after\s*\{[^}]*var\(--color-project-media-grade\)[^}]*mix-blend-mode:\s*color/s);
  const portfolioColorTokens = [
    "--color-portfolio-entry-edge-deep",
    "--color-portfolio-entry-edge-bright",
    "--color-portfolio-entry-surface-deep",
    "--color-portfolio-entry-surface-blue",
    "--color-portfolio-entry-glow",
    "--color-portfolio-entry-glow-clear",
    "--color-portfolio-entry-highlight",
    "--color-portfolio-entry-highlight-soft",
    "--color-portfolio-entry-highlight-clear",
    "--color-portfolio-entry-shine",
    "--color-portfolio-entry-shine-clear",
    "--color-portfolio-backdrop-scrim-top",
    "--color-portfolio-backdrop-scrim-clear",
    "--color-portfolio-backdrop-scrim-bottom",
  ];
  for (const token of portfolioColorTokens) {
    assert.match(tokens, new RegExp(`${token}:\\s*oklch\\(`));
  }
  // Lock the approved wormhole-blue palette anchors, not merely their color syntax.
  for (const [token, value] of [
    ["--color-portfolio-entry-edge-deep", "oklch(60% 0.105 258)"],
    ["--color-portfolio-entry-edge-bright", "oklch(72% 0.12 228)"],
    ["--color-portfolio-entry-surface-deep", "oklch(22% 0.06 255)"],
    ["--color-portfolio-entry-surface-blue", "oklch(34% 0.095 248)"],
  ]) {
    assert.match(tokens, new RegExp(`${token}:\\s*${value.replace(/[().]/g, "\\$&")}\\s*;`));
  }
  for (const token of [
    "--shadow-portfolio-entry-rest",
    "--shadow-portfolio-entry-hover",
    "--shadow-portfolio-entry-active",
  ]) {
    assert.match(tokens, new RegExp(`${token}:[^;]*oklch\\(`));
  }
  const portfolioTokenDeclarations = [...tokens.matchAll(/--(?:color|shadow)-portfolio-entry-[\w-]+:\s*([^;]+);/g)];
  assert.ok(portfolioTokenDeclarations.length >= 14);
  for (const [, value] of portfolioTokenDeclarations) {
    assert.match(value, /oklch\(/);
    assert.doesNotMatch(value, /\btransparent\b|#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i);
  }
  const findNamedColorLiterals = (stylesheet) => {
    const namedColors = new Set(`
      aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
      burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
      darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred
      darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
      dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray
      green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen
      lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
      lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen
      linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
      mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy
      oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip
      peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
      seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle
      tomato turquoise violet wheat white whitesmoke yellow yellowgreen
    `.trim().split(/\s+/));
    return [...stylesheet.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=\s*}))/g)].flatMap(([, , value]) => {
      const withoutTokens = value.replace(/var\([^)]*\)/g, "");
      return (withoutTokens.match(/[a-z][a-z-]*/gi) || [])
        .map((word) => word.toLowerCase())
        .filter((word) => namedColors.has(word));
    });
  };
  assert.deepEqual(findNamedColorLiterals(css), []);
  assert.deepEqual(
    findNamedColorLiterals(`${css}\n.portfolio-entry { border-block-start: 1px solid red; background: white; }`),
    ["red", "white"],
    "the color-literal guard must reject named-color mutations",
  );
  assert.deepEqual(
    findNamedColorLiterals(`${css}\n.portfolio-entry { color: red }`),
    ["red"],
    "the color-literal guard must inspect a final declaration without a semicolon",
  );

  const tokenColor = (name) => {
    const token = parseOklchToken(tokens, name);
    return { ...token, srgb: oklchToSrgb(token) };
  };
  const projectSurface = tokenColor("--color-project-surface");
  const edgeDeep = tokenColor("--color-portfolio-entry-edge-deep");
  const textColor = tokenColor("--color-text");
  const focusColor = tokenColor("--color-focus");
  assert.ok(contrastRatio(edgeDeep.srgb, projectSurface.srgb) >= 3);
  assert.ok(contrastRatio(focusColor.srgb, projectSurface.srgb) >= 3);
  for (const surfaceName of [
    "--color-portfolio-entry-surface-deep",
    "--color-portfolio-entry-surface-blue",
  ]) {
    let layeredSurface = tokenColor(surfaceName).srgb;
    for (const layerName of [
      "--color-portfolio-entry-glow",
      "--color-portfolio-entry-highlight",
      "--color-portfolio-entry-shine",
    ]) {
      const layer = tokenColor(layerName);
      layeredSurface = compositeSrgb(layeredSurface, layer.srgb, layer.alpha);
    }
    assert.ok(
      contrastRatio(textColor.srgb, layeredSurface) >= 4.5,
      `${surfaceName} plus all maximum decorative layers must keep text at 4.5:1`,
    );
  }
  assert.doesNotMatch(css, /\btransparent\b/);
  assert.doesNotMatch(source, /(?:tailwind|shadcn|framer-motion|motion\/react)/i);
  assert.equal(packageJson.dependencies["framer-motion"], undefined);
});

test("browser smoke covers the Project Showcase", async () => {
  const smoke = await read("./browser-smoke.mjs");

  for (const helperOrSelector of [
    "verifyProjectShowcase",
    "verifyPortfolioGateway",
    "verifyPortfolioRoute",
    "[data-project-showcase]",
    ".project-card",
    ".project-card__video",
    ".project-card__image",
    ".portfolio-entry",
    ".portfolio-gateway",
    ".portfolio-gateway__photo",
    ".portfolio-gateway__image",
    ".portfolio-gateway__photo-fallback",
    "/portfolio/index.html",
    "window.__app",
    "#stage canvas",
    "#viewer",
  ]) {
    assert.ok(smoke.includes(helperOrSelector), `browser smoke is missing ${helperOrSelector}`);
  }
  for (const dimension of ["320", "375", "414", "768", "1440"]) {
    assert.match(smoke, new RegExp(`width:\\s*${dimension}\\b`));
  }
  assert.match(smoke, /const projectMediaFallbackText = "作品预览暂时无法加载";/);
  assert.match(smoke, /failedCard\.fallback === projectMediaFallbackText/);
  assert.match(smoke, /pendingSurfaces/);
  assert.match(smoke, /querySelectorAll\("a\.project-card__link"\)/);
  assert.match(smoke, /layout\.links\s*===\s*8/);
  assert.match(smoke, /layout\.readyLinks\s*===\s*8/);
  assert.match(smoke, /layout\.pendingSurfaces\s*===\s*0/);
  assert.match(smoke, /layout\.videos\s*===\s*0/);
  assert.match(smoke, /layout\.images\s*===\s*8/);
  assert.match(smoke, /expectedProjectLinks/);
  assert.match(smoke, /https:\/\/mufeng-fragrance\.pages\.dev\//);
  assert.match(smoke, /https:\/\/nick-fox\.pages\.dev\/1\//);
  assert.match(smoke, /relTokens\.has\("noopener"\)/);
  assert.match(smoke, /relTokens\.has\("noreferrer"\)/);
  assert.match(smoke, /previewImage\.naturalWidth\s*===\s*expected\.width/);
  assert.match(smoke, /previewImage\.naturalHeight\s*===\s*expected\.height/);
  assert.match(smoke, /project-01-mufeng-fragrance/);
  assert.doesNotMatch(smoke, /lastProjectLink/);
  assert.match(smoke, /geometry\.links\s*===\s*0/);
  assert.match(smoke, /geometry\.interactiveTiles\s*===\s*0/);
  assert.doesNotMatch(smoke, /const firstLink = page\.locator\("\.drift-wall__links a"\)/);
  assert.match(smoke, /addInitScript/);
  assert.match(smoke, /__felixProjectVideoPlayProbe/);
  for (const probeState of ["invoked", "resolved", "rejected", "threw", "playingEvents"]) {
    assert.ok(smoke.includes(probeState), `browser smoke is missing play probe state ${probeState}`);
  }
  assert.match(smoke, /reducedMotion/);
  assert.match(smoke, /paused/);
  assert.match(smoke, /transform/);
  assert.match(smoke, /focus-visible|focusVisible/);
  assert.match(smoke, /outlineOffset/);
  assert.match(smoke, /scrollWidth/);
  assert.match(smoke, /visibility/);
  assert.match(smoke, /opacity/);
  assert.match(smoke, /FELIX_WRITE_PROJECT_SHOWCASE_SCREENSHOTS/);
  assert.match(smoke, /felix-project-showcase-desktop\.png/);
  assert.match(smoke, /felix-project-showcase-mobile-320\.png/);
  assert.match(smoke, /async function openProjectShowcaseScreenshotPage/);
  assert.match(smoke, /projectShowcaseScreenshotOnly/);
  assert.match(smoke, /if\s*\(writeDriftWallScreenshots\)\s*\{\s*await captureScreenshots\(browser\)/s);
  assert.match(smoke, /if\s*\(writeProjectShowcaseScreenshots\)\s*\{\s*await captureProjectShowcaseScreenshots\(browser\)/s);
  assert.match(smoke, /if\s*\(!writeDriftWallScreenshots && !writeProjectShowcaseScreenshots\)/);
  assert.match(smoke, /HAVE_METADATA/);
  assert.match(smoke, /\.pause\(\)/);
  assert.match(smoke, /currentTime/);
  assert.match(smoke, /seeking/);
  assert.match(smoke, /project-showcase-title/);
  assert.match(smoke, /portfolioEntries:\s*portfolioEntries\.length/);
  assert.match(smoke, /portfolioEntry\.getAttribute\("href"\)/);
  assert.match(smoke, /layout\.portfolioEntries\s*===\s*1/);
  assert.match(smoke, /layout\.portfolioEntry\.href\s*===\s*"\/portfolio\/index\.html"/);
  assert.match(smoke, /layout\.portfolioEntry\.bounds\.left\s*>=\s*0/);
  assert.match(smoke, /portfolioGateways:\s*portfolioGateways\.length/);
  assert.match(smoke, /gateway\.title\s*===\s*"影像馆"/);
  assert.match(smoke, /gateway\.cta\s*===\s*"进入作品影像馆"/);
  assert.match(smoke, /gateway\.image\.currentSrc/);
  assert.match(smoke, /gateway\.columns\s*===\s*\(viewport\.width\s*<\s*768\s*\?\s*1\s*:\s*2\)/);
  assert.match(smoke, /gateway\.image\.objectFit\s*===\s*"cover"/);
  assert.match(smoke, /gateway\.image\.objectPosition\s*===\s*"50% 50%"/);
  assert.match(smoke, /gateway\.coverage\.portal/);
  assert.match(smoke, /gateway\.coverage\[layer\]/);
  assert.match(smoke, /gateway\.overflow\s*<=\s*1/);
  assert.match(smoke, /grid:\s*\{\s*bottom:/s);
  assert.match(smoke, /gateway\.top\s*>=\s*layout\.grid\.bottom\s*-\s*1/);
  assert.match(smoke, /gateway\.bounds\.portal/);
  assert.match(smoke, /gateway\.bounds\.photo/);
  assert.match(smoke, /gateway\.bounds\.cta/);
  assert.match(smoke, /document\.activeElement\s*===\s*document\.querySelector\("\.portfolio-entry"\)/);
  assert.match(smoke, /invalid-gateway-photo\.svg/);
  assert.match(smoke, /initialGatewayImage\.complete\s*&&\s*initialGatewayImage\.naturalWidth\s*>\s*0\s*&&\s*initialGatewayImage\.naturalHeight\s*>\s*0/);
  assert.match(smoke, /gateway image did not load before error probe.*currentSrc/s);
  assert.match(smoke, /invalidGatewayPhoto404\.received\s*===\s*1/);
  assert.match(smoke, /invalidGatewayPhoto404\.received\s*>\s*invalidGatewayPhoto404\.consumed/);
  assert.match(smoke, /invalidGatewayPhoto404\.consumed\s*\+=\s*1/);
  assert.match(smoke, /gateway backdrop fallback/);
  assert.match(smoke, /gateway\.photo\.transform\s*===\s*"none"/);
  assert.match(smoke, /gateway\.photo\.transitionDuration/);
  assert.match(smoke, /await portfolioEntry\.click\(\{ trial:\s*true \}\)/);
  assert.match(smoke, /document\.activeElement\s*===\s*document\.querySelector\("\.portfolio-entry"\)/);
  assert.match(smoke, /entryFocus\.outlineWidth\s*>\s*0/);
  assert.match(smoke, /entryFocus\.outlineOffset\s*>\s*0/);
  assert.match(smoke, /probe\.style\.color\s*=\s*"var\(--color-text\)"/);
  assert.match(smoke, /entryFocus\.color\s*===\s*entryFocus\.expectedColor/);
  assert.match(smoke, /const entryOutlineExtent\s*=\s*entryFocus\.outlineWidth\s*\+\s*Math\.max\(0,\s*entryFocus\.outlineOffset\)/);
  assert.match(smoke, /entryFocus\.left\s*-\s*entryOutlineExtent\s*>=\s*-1/);
  assert.match(smoke, /entryFocus\.right\s*\+\s*entryOutlineExtent\s*<=\s*viewport\.width\s*\+\s*1/);
  assert.match(smoke, /entryFocus\.top\s*-\s*entryOutlineExtent\s*>=\s*-1/);
  assert.match(smoke, /entryFocus\.bottom\s*\+\s*entryOutlineExtent\s*<=\s*viewport\.height\s*\+\s*1/);
  assert.match(smoke, /entryTransitionProperty/);
  assert.match(smoke, /entryTransitionDuration/);
  assert.match(smoke, /getComputedStyle\(inner,\s*"::before"\)\.animationName/);
  assert.match(smoke, /shineAnimationName\s*===\s*"none"/);
  assert.equal(
    (smoke.match(/await verifyPortfolioRoute\(browser\)/g) || []).length,
    1,
    "browser smoke must verify the standalone portfolio route exactly once",
  );
});

test("standalone portfolio preserves its vendors and exposes scoped site integrations", async () => {
  const immutableFiles = [
    ["../public/portfolio/vendor/three.module.js", 1314681, "CE1FA418DE16A19495A9F72495580E3015D7745C296D3CE0485897F902DDEDFB"],
    ["../public/portfolio/vendor/gsap.min.js", 72214, "28033E449A31EBCC396E5BE8B13B63152BF03094288FB5867034321927BCE087"],
  ];

  await Promise.all(
    immutableFiles.map(async ([path, size, hash]) => {
      const metadata = await lstat(new URL(path, import.meta.url));
      assert.ok(metadata.isFile(), `${path} must be a regular file`);
      assert.equal(metadata.isSymbolicLink(), false, `${path} must not be a symbolic link`);
      const bytes = await readFile(new URL(path, import.meta.url));
      assert.equal(bytes.byteLength, size, `${path} has the approved byte size`);
      assert.equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(), hash, `${path} has the approved SHA-256`);
    }),
  );

  const exitStyles = `
  /* Site integration: explicit exit; keep outside the render loop. */
  .portfolio-exit {
    position: absolute;
    inset-block-start: calc(max(28px, env(safe-area-inset-top)) + 52px);
    inset-inline-start: max(32px, env(safe-area-inset-left));
    min-block-size: 44px;
    display: inline-flex;
    align-items: center;
    padding-inline: 16px;
    border: 1px solid var(--black);
    border-radius: 4px;
    background: var(--white);
    color: var(--black);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .16em;
    text-decoration: none;
    transition: background-color .2s, color .2s, transform .2s;
  }
  .portfolio-exit:hover { background: var(--black); color: var(--white); transform: translateY(-1px); }
  .portfolio-exit:active { transform: translateY(0); }
  .portfolio-exit:focus-visible { outline: 2px solid var(--black); outline-offset: 4px; }

  @media (max-width: 720px) {
    .portfolio-exit {
      inset-block-start: calc(max(18px, env(safe-area-inset-top)) + 48px);
      inset-inline-start: max(18px, env(safe-area-inset-left));
      padding-inline: 14px;
      font-size: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .portfolio-exit { transition: none; }
    .portfolio-exit:hover, .portfolio-exit:active { transform: none; }
  }
`;
  const exitMarkup = `
      <a class="portfolio-exit hot" href="/#portfolio-gallery" aria-label="返回影像馆入口">← 返回影像馆入口</a>
`;
  const integrationHead = `<link rel="icon" href="data:,">
`;
  const videoEntryHead = `<!-- Site integration: preserve the white entry-video tail through first paint. -->
<meta name="theme-color" content="#ffffff">
<script>
  (() => {
    const entryMarker = "#entry-video";
    if (window.location.hash !== entryMarker) return;
    document.documentElement.classList.add("from-video-entry");
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.hash = "";
      window.history.replaceState(window.history.state, "", cleanUrl);
    } catch {}
  })();
</script>
<style>
  .from-video-entry #veil { background: var(--white); }
</style>
`;
  const portableFallback = "    请在完整项目根目录运行「npm run dev」,再访问 /portfolio/index.html;若浏览器不支持 WebGL 也会看到本提示。";
  const legacyFallback = "    请双击「①双击我-打开网站.bat」启动;若浏览器不支持 WebGL 也会看到本提示。";
  const indexBytes = await readFile(new URL("../public/portfolio/index.html", import.meta.url));
  const indexHtml = indexBytes.toString("utf8");

  assert.equal((indexHtml.match(/class="portfolio-exit hot"/g) || []).length, 1);
  assert.ok(indexHtml.includes(exitStyles), "portfolio exit styles must match the approved scoped block");
  assert.ok(indexHtml.includes(exitMarkup), "portfolio exit must target the main-site gallery gateway");
  assert.ok(indexHtml.includes(integrationHead), "portfolio direct route must suppress an implicit favicon request");
  assert.ok(indexHtml.includes(videoEntryHead), "portfolio video entry must use the approved first-paint integration block");
  assert.match(indexHtml, /#veil\s*\{[^}]*background:\s*var\(--black\)/s, "direct visits must retain the original black veil");
  assert.match(indexHtml, /\.from-video-entry #veil\s*\{\s*background:\s*var\(--white\);\s*\}/, "video entries must switch the veil to white");
  assert.match(indexHtml, /<meta name="theme-color" content="#ffffff">/, "video handoff must keep browser chrome white");
  assert.match(indexHtml, /const entryMarker\s*=\s*"#entry-video";/);
  assert.match(indexHtml, /if \(window\.location\.hash !== entryMarker\) return;/, "only the video marker may activate the white veil");
  assert.match(indexHtml, /document\.documentElement\.classList\.add\("from-video-entry"\);/);
  assert.match(indexHtml, /const cleanUrl = new URL\(window\.location\.href\);[\s\S]*?cleanUrl\.hash = "";[\s\S]*?window\.history\.replaceState\(window\.history\.state, "", cleanUrl\);/, "the marker hash must be removed without a navigation");
  const headEnd = indexHtml.indexOf("</head>");
  const markerScript = indexHtml.indexOf("const entryMarker = \"#entry-video\";");
  const portfolioRuntime = indexHtml.indexOf('<script type="module" src="./app.js"></script>');
  assert.ok(markerScript > 0 && markerScript < headEnd, "the marker script must run synchronously in head before first paint");
  assert.ok(headEnd < portfolioRuntime, "the first-paint marker must run before the portfolio runtime");
  assert.match(indexHtml, /\.portfolio-exit:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--black\)/s);
  assert.match(indexHtml, /\.portfolio-exit\s*\{[^}]*min-block-size:\s*44px/s);
  assert.match(indexHtml, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.portfolio-exit \{ transition: none; \}/);

  const preservedIndex = indexHtml
    .replace('<link rel="stylesheet" href="/cosmic-scene.css">\n', "")
    .replace('  <script type="module" src="../cosmic-archive.js"></script>\n', "")
    .replace('<body class="cosmic-archive">', '<body>')
    .replace(exitStyles, "")
    .replace(exitMarkup, "")
    .replace(integrationHead, "")
    .replace(videoEntryHead, "")
    .replace(portableFallback, legacyFallback);
  assert.equal(Buffer.byteLength(preservedIndex), 8709, "the cosmic skin and scoped entry/exit integrations must preserve the archive document");
  assert.equal(
    createHash("sha256").update(preservedIndex).digest("hex").toUpperCase(),
    "BB8E79CF1D994F6778784D0A48630C14E372AB262A92034BEE4C195507103848",
    "the original portfolio index must remain byte-identical after removing the approved exit blocks",
  );

  assert.match(indexHtml, /<script src="\.\/vendor\/gsap\.min\.js"><\/script>/);
  assert.match(indexHtml, /<script type="importmap">\{ "imports": \{ "three": "\.\/vendor\/three\.module\.js" \} \}<\/script>/);
  assert.match(indexHtml, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(indexHtml, /https?:\/\//);

  const listTree = async (directory, relativePath = "") => {
    const directoryMetadata = await lstat(directory);
    assert.ok(directoryMetadata.isDirectory(), `${relativePath || "portfolio"} must be a directory`);
    assert.equal(directoryMetadata.isSymbolicLink(), false, `${relativePath || "portfolio"} must not be a symbolic link`);
    const entries = await readdir(directory, { withFileTypes: true });
    const paths = await Promise.all(entries.map(async (entry) => {
      const entryPath = `${relativePath}/${entry.name}`.replace(/^\//, "");
      assert.equal(entry.isSymbolicLink(), false, `${entryPath} must not be a symbolic link`);
      if (!entry.isDirectory()) return [entryPath];
      return [entryPath, ...(await listTree(new URL(`${entry.name}/`, directory), entryPath))];
    }));
    return paths.flat();
  };
  const portfolioTree = (await listTree(new URL("../public/portfolio/", import.meta.url))).sort();

  assert.deepEqual(portfolioTree, [
    "README.md",
    "app.js",
    "collection.js",
    "images",
    "images/visual-001.png",
    "images/visual-002.png",
    "images/visual-003.png",
    "images/visual-004.png",
    "images/visual-005.png",
    "index.html",
    "vendor",
    "vendor/gsap.min.js",
    "vendor/three.module.js",
  ]);
});
