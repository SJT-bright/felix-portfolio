/* ============================================================
   JUNTING ARCHIVE · 360° 影像穹顶(单页版)
   相机站在球心,60 张作品贴满内球面,广角镜头给球感。
   整站只有这一页:载入即自动"扫摆归位"入场,无需滚动;无前后额外页面。
   占位卡由浏览器 canvas 现画 —— 不依赖任何图片文件,永不空白。
   换真图:见文件末尾 phTexture / phFrame 注释。
   ============================================================ */
import * as THREE from "three";
import { collection } from "./collection.js";

/* ---------- 调参面板 ---------- */
const CONFIG = {
  radius: 42,            // 球壳半径(越小越"包裹")
  fovLandscape: 72,      // 横屏视角
  fovPortrait: 80,       // 竖屏视角
  latLandscape: 72,      // 纬度范围 ±72°
  latPortrait: 78,
  rowK: { landscape: 0.62, portrait: 0.72 },
  dragK: 0.0024,         // 拖拽灵敏度
  inertia: 0.93,         // 惯性衰减
  autoSpin: 0.0003,      // 常态自转(≈1°/s)
  tourSpin: 0.0012,      // 环游模式
  pitchMaxDeg: 66,
  maxTex: 256,           // 贴图长边(控显存)
  seed: 1337,
  brand: "JUNTING ARCHIVE",
  cats: {                // 分类(键 = 作品 id 首字母)
    a: { en: "VISUAL", zh: "视觉卷" },
    b: { en: "BUILD",  zh: "开发卷" },
  },
  counts: { a: 34, b: 16 },   // 各类占位卡数量,合计 = 作品总数(50)
};

/* ---------- DOM ---------- */
const stage = document.getElementById("stage");
const orb = document.getElementById("orb");
const orbLabel = document.getElementById("orb-label");
const ringText = document.getElementById("ringtext");
const hint = document.getElementById("hint");
const counterLine = document.getElementById("counter-line");
const viewer = document.getElementById("viewer");
const viewerBox = document.getElementById("viewer-box");
const capNo = document.getElementById("cap-no");
const capTag = document.getElementById("cap-tag");
const capIdx = document.getElementById("cap-idx");
const veil = document.getElementById("veil");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 渲染器 ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  document.getElementById("fallback").style.display = "flex";
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const isPortrait = () => innerHeight > innerWidth;
const FOV = () => (isPortrait() ? CONFIG.fovPortrait : CONFIG.fovLandscape);
const camera = new THREE.PerspectiveCamera(FOV(), innerWidth / innerHeight, 0.1, 400);
scene.add(camera);

const RADIUS = CONFIG.radius;
const view = { yaw: 0, pitch: 0 };
const vel = { yaw: 0, pitch: 0 };
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
const PITCH_MAX = THREE.MathUtils.degToRad(CONFIG.pitchMaxDeg);

let started = false, detailOpen = false, tourMode = false, autoRamp = 0;

/* ---------- 开场入场(载入自动播放,非滚动驱动) ---------- */
const entrance = { p: reducedMotion ? 1 : 0 };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function entranceOffsets() {
  const e = easeOut(THREE.MathUtils.clamp(entrance.p / 0.6, 0, 1));
  return { yaw: 0.9 * (1 - e), pitch: -0.34 * (1 - e), fov: 12 * (1 - e), settled: e >= 1 };
}
let lastFov = 0;
function applyCamera() {
  const off = entranceOffsets();
  camera.quaternion.setFromEuler(new THREE.Euler(
    view.pitch + off.pitch + parallax.y, view.yaw + off.yaw + parallax.x, 0, "YXZ"));
  const f = FOV() + off.fov;
  if (Math.abs(f - lastFov) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); lastFov = f; }
}

/* ============ 占位卡:canvas 现画,零图片依赖 ============ */
const PH_PALETTE = [
  ["#141414","#f2efe9"],["#1d1d1b","#c9c2b6"],["#23242a","#e6e3dc"],
  ["#84371f","#f2e9e0"],["#b5552a","#191512"],["#41503c","#e9e6da"],
  ["#2f3e4e","#e8e4da"],["#8c2f1b","#efe7da"],["#6b6258","#f0ece4"],
  ["#c7beb2","#1c1a17"],["#9a8f7f","#15130f"],["#32281f","#d9cfc0"],
];
const PH_RATIOS = [[3,4],[2,3],[4,5],[1,1],[5,7],[3,4]];
function phRng(seed){ let s = seed; return () => { s = (16807*s + 11) % 2147483647; return s / 2147483647; }; }
function genManifest(){
  const rnd = phRng(CONFIG.seed), items = [];
  for (const g of Object.keys(CONFIG.cats)) {
    const n = (CONFIG.counts && CONFIG.counts[g]) || 20;
    for (let i = 1; i <= n; i++) {
      const [rw, rh] = PH_RATIOS[Math.floor(rnd() * PH_RATIOS.length)];
      const id = `${g}-${String(i).padStart(3,"0")}`;
      items.push({ id, g, w: Math.round(420*rw/rh), h: 420, ...collection[id] });
    }
  }
  return items;
}
function phColors(id){ const num = parseInt(id.slice(2),10)||0; return PH_PALETTE[(num*7 + (id[0]==="a"?0:5)) % PH_PALETTE.length]; }
function drawCard(ctx, W, H, id){
  const g = id[0], num = parseInt(id.slice(2),10)||0, [bg,fg] = phColors(id);
  const label = (CONFIG.cats[g] && CONFIG.cats[g].en) || g.toUpperCase();
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
  const m = W*0.08;
  ctx.fillStyle = fg; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.font = `${Math.max(11,W/26)}px Menlo, Consolas, monospace`;
  ctx.fillText(("WORK "+label).split("").join(" "), m, m + W/26);
  ctx.textAlign = "center";
  ctx.font = `900 ${Math.round(W*0.46)}px Arial, sans-serif`;
  ctx.fillText(String(num).padStart(2,"0"), W/2, H*0.62);
  ctx.textAlign = "left";
  ctx.fillRect(m, H-m, W-2*m, Math.max(2,W/300));
  ctx.font = `${Math.max(10,W/32)}px Menlo, Consolas, monospace`;
  ctx.fillText("JUNTING ARCHIVE", m, H-m + Math.max(14,W/22));
}
function makeCardCanvas(item, pxW){
  const W = pxW, H = Math.round(pxW * item.h / item.w);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  drawCard(c.getContext("2d"), W, H, item.id);
  return c;
}
function phTexture(item){
  const c = makeCardCanvas(item, CONFIG.maxTex);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (item.src) {
    const image = new Image();
    item.imageStatus = "loading";
    image.onload = () => {
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(image, 0, 0, c.width, c.height);
      tex.needsUpdate = true;
      item.imageStatus = "loaded";
    };
    image.onerror = () => { item.imageStatus = "error"; };
    image.src = item.src;
  }
  return tex;
}

/* ---------- 纬度带布局 ---------- */
const tiles = [];
let activeFilter = "all";

function computeLayout(count){
  const portrait = isPortrait();
  const latMax = THREE.MathUtils.degToRad(portrait ? CONFIG.latPortrait : CONFIG.latLandscape);
  const rows = Math.max(5, Math.round(Math.sqrt(count) * (portrait ? CONFIG.rowK.portrait : CONFIG.rowK.landscape)));
  const rowDefs = []; let weightSum = 0;
  for (let r = 0; r < rows; r++) {
    const lat = rows === 1 ? 0 : (2*latMax*r)/(rows-1) - latMax;
    const w = Math.max(Math.cos(lat), 0.16);
    rowDefs.push({ lat, w }); weightSum += w;
  }
  const counts = rowDefs.map(({ w }) => Math.max(1, Math.round((count*w)/weightSum)));
  let eq = 0;
  rowDefs.forEach(({ lat }, i) => { if (Math.abs(lat) < Math.abs(rowDefs[eq].lat)) eq = i; });
  counts[eq] += count - counts.reduce((a,b)=>a+b,0);
  if (counts[eq] < 1) counts[eq] = 1;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    const { lat } = rowDefs[r], n = counts[r], offset = (r % 2) * (Math.PI / n);
    for (let i = 0; i < n; i++) slots.push({ lat, lon: offset + (2*Math.PI*i)/n });
  }
  const base = THREE.MathUtils.clamp(0.52 * Math.sqrt((4*Math.PI*RADIUS*RADIUS)/count), 6, 11.5);
  return { slots, base };
}
function slotToPosition(slot, r){
  return new THREE.Vector3(
    r*Math.cos(slot.lat)*Math.sin(slot.lon), r*Math.sin(slot.lat), r*Math.cos(slot.lat)*Math.cos(slot.lon));
}
function seededShuffle(arr, seed = CONFIG.seed){
  const a = arr.slice(); let s = seed;
  for (let i = a.length-1; i > 0; i--) { s = (16807*s+11)%2147483647; const j = s%(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

/* ---------- 悬停光晕 ---------- */
function makeHaloTexture(){
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const ctx = c.getContext("2d"); ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.beginPath(); ctx.roundRect(8,8,240,240,26); ctx.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const halo = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
  new THREE.MeshBasicMaterial({ map: makeHaloTexture(), transparent: true, opacity: 0, depthWrite: false }));
halo.visible = false; scene.add(halo);

/* ---------- 建卡:现画贴图,直接就绪 ---------- */
let manifest = [];
function build(){
  manifest = seededShuffle(genManifest());
  const counts = {};
  for (const k of Object.keys(CONFIG.cats)) counts[k] = manifest.filter((it)=>it.g===k).length;
  document.getElementById("c-all").textContent = manifest.length;
  for (const k of Object.keys(CONFIG.cats)) { const el = document.getElementById("c-"+k); if (el) el.textContent = counts[k]; }
  counterLine.textContent = `${manifest.length} WORKS — ` +
    Object.keys(CONFIG.cats).map((k)=>`${counts[k]} ${CONFIG.cats[k].en}`).join(" / ");
  ringText.textContent = `${CONFIG.brand} · ${manifest.length} PORTFOLIO WORKS · DRAG TO ORBIT · CLICK TO VIEW · `;

  const geo = new THREE.PlaneGeometry(1,1);
  let rnd = 99;
  manifest.forEach((item, i) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: phTexture(item), transparent: true, opacity: 0 }));
    mesh.visible = false; mesh.userData.index = i; scene.add(mesh);
    rnd = (16807*rnd+11)%2147483647;
    tiles.push({
      mesh, item, basePos: new THREE.Vector3(), baseScale: new THREE.Vector3(1,1,1), radius: RADIUS,
      sizeJitter: 0.97 + (rnd%1000)/1000*0.09, radJitter: 0.975 + ((rnd>>3)%1000)/1000*0.05,
      bobPhase: (rnd%6283)/1000, bobSpeed: 0.35 + (rnd%600)/1000, hover: 0, onDome: false,
    });
  });
  // 现画即就绪:短暂计数动画后开演
  const prog = { v: 0 };
  if (reducedMotion) { orbLabel.textContent = "✦"; startArchive(); }
  else gsap.to(prog, { v: 100, duration: 0.9, ease: "power1.out",
    onUpdate: () => { if (!started) orbLabel.textContent = Math.round(prog.v) + "%"; },
    onComplete: () => { orbLabel.textContent = "✦"; startArchive(); } });
}

function visibleSet(){ return tiles.filter((t)=>activeFilter==="all"||t.item.g===activeFilter); }

function placeSet(set, mode){
  const { slots, base } = computeLayout(set.length);
  set.forEach((t, i) => {
    const slot = slots[i % slots.length];
    t.radius = RADIUS * t.radJitter;
    t.basePos = slotToPosition(slot, t.radius);
    const ar = THREE.MathUtils.clamp(t.item.w / t.item.h, 0.55, 1.5);
    const s = (base / Math.sqrt(ar)) * 0.92 * t.sizeJitter;
    t.baseScale.set(s*ar, s, 1);
    t.onDome = true; t.mesh.visible = true;
    const m = t.mesh;
    gsap.killTweensOf(m.position); gsap.killTweensOf(m.scale); gsap.killTweensOf(m.material);
    if (mode === "fly") {
      const from = t.basePos.clone().multiplyScalar(2.6);
      m.position.copy(from); m.scale.set(t.baseScale.x, t.baseScale.y, 1); m.material.opacity = 0;
      const delay = 0.2 + (i % 60) * 0.013;
      gsap.to(m.position, { x: t.basePos.x, y: t.basePos.y, z: t.basePos.z, duration: 1.7, delay, ease: "power3.out", onUpdate: () => m.lookAt(0,0,0) });
      gsap.to(m.material, { opacity: 1, duration: 0.9, delay, ease: "power1.out" });
    } else if (mode === "pack") {
      m.position.copy(t.basePos); m.lookAt(0,0,0);
      const delay = 0.1 + (i % 50) * 0.012;
      gsap.fromTo(m.scale, { x: 0.001*t.baseScale.x, y: 0.001*t.baseScale.y }, { x: t.baseScale.x, y: t.baseScale.y, duration: 0.9, delay, ease: "power3.inOut" });
      gsap.to(m.material, { opacity: 1, duration: 0.7, delay: delay+0.1 });
    } else {
      m.position.copy(t.basePos); m.lookAt(0,0,0); m.scale.set(t.baseScale.x, t.baseScale.y, 1); m.material.opacity = 1;
    }
  });
}

function startArchive(){
  if (started) return;
  started = true;
  placeSet(visibleSet(), "fly");
  // 开场自动"扫摆归位" + 面纱淡出(替代原来的滚动驱动)
  if (reducedMotion) { entrance.p = 1; veil.style.opacity = "0"; veil.style.visibility = "hidden"; hint.classList.add("show"); }
  else {
    gsap.to(entrance, { p: 1, duration: 1.9, ease: "power3.out" });
    gsap.to(veil, { opacity: 0, duration: 1.0, ease: "power1.inOut", onComplete: () => { veil.style.visibility = "hidden"; } });
    gsap.delayedCall(1.6, () => { hint.classList.add("show"); gsap.delayedCall(6, () => hint.classList.remove("show")); });
  }
}
build();

/* ---------- 黑球 = 环游开关 ---------- */
orb.addEventListener("click", () => {
  if (!started || detailOpen) return;
  tourMode = !tourMode; orbLabel.textContent = tourMode ? "❚❚" : "✦";
});

/* ---------- 筛选 ---------- */
document.querySelectorAll(".filters button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!started || detailOpen) return;
    const f = btn.dataset.f;
    if (f === activeFilter) return;
    activeFilter = f;
    document.querySelectorAll(".filters button").forEach((b)=>b.classList.toggle("on", b===btn));
    tiles.forEach((t) => {
      const keep = f === "all" || t.item.g === f;
      if (!keep && t.onDome) {
        t.onDome = false; const m = t.mesh;
        gsap.killTweensOf(m.position); gsap.killTweensOf(m.scale); gsap.killTweensOf(m.material);
        const out = t.basePos.clone().multiplyScalar(1.8);
        gsap.to(m.position, { x: out.x, y: out.y, z: out.z, duration: 0.65, ease: "power2.in" });
        gsap.to(m.material, { opacity: 0, duration: 0.5, ease: "power1.in", onComplete: () => { m.visible = false; } });
      }
    });
    placeSet(visibleSet(), "pack");
  });
});

/* ---------- 拖拽 / 惯性 / 悬停 ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let dragging = false, last = null, moved = 0, hovered = null;

function updateHover(){
  raycaster.setFromCamera(ndc, camera);
  const meshes = visibleSet().filter((t)=>t.onDome).map((t)=>t.mesh);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  const t = hit ? tiles[hit.object.userData.index] : null;
  if (t !== hovered) {
    if (hovered) setHover(hovered, false);
    hovered = t;
    if (hovered) setHover(hovered, true);
    stage.style.cursor = hovered ? "pointer" : dragging ? "grabbing" : "grab";
  }
}
function setHover(t, on){
  gsap.killTweensOf(t);
  gsap.to(t, { hover: on ? 1 : 0, duration: on ? 0.22 : 0.3, ease: "power2.out" });
  if (on) {
    halo.visible = true;
    halo.position.copy(t.basePos).multiplyScalar(1.012);
    halo.scale.set(t.baseScale.x*1.22, t.baseScale.y*1.18, 1);
    halo.lookAt(0,0,0);
    gsap.killTweensOf(halo.material); gsap.to(halo.material, { opacity: 1, duration: 0.2 });
  } else {
    gsap.killTweensOf(halo.material);
    gsap.to(halo.material, { opacity: 0, duration: 0.22, onComplete: () => { if (!hovered) halo.visible = false; } });
  }
}
stage.addEventListener("pointerdown", (e) => {
  if (!started || detailOpen) return;
  dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY };
  stage.classList.add("dragging"); stage.setPointerCapture(e.pointerId);
});
stage.addEventListener("pointermove", (e) => {
  parallax.tx = -(e.clientX/innerWidth - 0.5)*0.04;
  parallax.ty = -(e.clientY/innerHeight - 0.5)*0.03;
  if (dragging && last && started) {
    const dx = e.clientX-last.x, dy = e.clientY-last.y; last = { x: e.clientX, y: e.clientY };
    moved += Math.abs(dx)+Math.abs(dy);
    view.yaw += dx*CONFIG.dragK;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy*CONFIG.dragK, -PITCH_MAX, PITCH_MAX);
    vel.yaw = dx*CONFIG.dragK; vel.pitch = dy*CONFIG.dragK;
  } else if (started && !detailOpen) {
    ndc.set((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1); updateHover();
  }
});
stage.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false; stage.classList.remove("dragging");
  if (moved < 8 && started && !detailOpen) {
    ndc.set((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1);
    updateHover(); if (hovered) openDetail(hovered);
  }
});
stage.addEventListener("pointerleave", () => { parallax.tx = 0; parallax.ty = 0; });

/* ---------- 查看器(FLIP;大图=现画高清卡) ---------- */
let currentIdx = -1, frameEl = null;
function viewerList(){ return visibleSet().filter((t)=>t.onDome); }
function tileScreenRect(t){
  const corners = [new THREE.Vector3(-0.5,-0.5,0), new THREE.Vector3(0.5,-0.5,0), new THREE.Vector3(-0.5,0.5,0), new THREE.Vector3(0.5,0.5,0)];
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  corners.forEach((c) => {
    const v = c.clone(); t.mesh.localToWorld(v).project(camera);
    const sx = (v.x*0.5+0.5)*innerWidth, sy = (-v.y*0.5+0.5)*innerHeight;
    x0=Math.min(x0,sx); x1=Math.max(x1,sx); y0=Math.min(y0,sy); y1=Math.max(y1,sy);
  });
  return { x: x0, y: y0, w: Math.max(x1-x0,24), h: Math.max(y1-y0,24) };
}
function finalRect(ar){
  const hk = innerWidth < 720 ? 0.86 : 0.8;
  let h = innerHeight*hk, w = h*ar;
  if (w > innerWidth*0.88) { w = innerWidth*0.88; h = w/ar; }
  return { x: (innerWidth-w)/2, y: (innerHeight-h)/2 - 8, w, h };
}
function phFrame(item, rect){
  const box = document.createElement("div");
  box.className = "frame"; box.style.width = rect.w+"px"; box.style.height = rect.h+"px";
  const c = makeCardCanvas(item, Math.min(1400, Math.round(rect.w*2)));
  c.style.position = "absolute"; c.style.inset = "0"; c.style.width = "100%"; c.style.height = "100%";
  box.appendChild(c);
  if (item.src) {
    const image = document.createElement("img");
    image.alt = item.title || item.id;
    image.style.objectFit = "contain";
    image.onload = () => c.remove();
    image.onerror = () => image.remove();
    image.src = item.src;
    box.appendChild(image);
  }
  return box;
}
function setCaption(t){
  const list = viewerList();
  capNo.textContent = "NO. " + t.item.id.toUpperCase();
  const cat = CONFIG.cats[t.item.g];
  capTag.textContent = cat ? `${cat.en} · ${cat.zh}` : t.item.g;
  capIdx.textContent = String(currentIdx+1).padStart(3,"0") + " / " + String(list.length).padStart(3,"0");
}
function openDetail(t){
  detailOpen = true; tourMode = false; orbLabel.textContent = "✦";
  document.body.classList.add("locked");
  if (hovered) { setHover(hovered, false); hovered = null; }
  currentIdx = viewerList().indexOf(t);
  const from = tileScreenRect(t), to = finalRect(t.item.w/t.item.h);
  frameEl = phFrame(t.item, to);
  frameEl.style.transform = `translate(${from.x}px,${from.y}px) scale(${from.w/to.w},${from.h/to.h})`;
  frameEl.style.transformOrigin = "0 0";
  viewerBox.innerHTML = ""; viewerBox.appendChild(frameEl); setCaption(t);
  gsap.set(viewer, { visibility: "visible" });
  gsap.to(viewer, { opacity: 1, duration: 0.28, ease: "power1.out" });
  gsap.to(frameEl, { x: to.x, y: to.y, scaleX: 1, scaleY: 1, duration: 0.5, ease: "expo.out" });
}
function closeDetail(){
  if (!detailOpen || !frameEl) return;
  const t = viewerList()[currentIdx], to = finalRect(t.item.w/t.item.h), back = tileScreenRect(t);
  gsap.to(frameEl, { x: back.x, y: back.y, scaleX: back.w/to.w, scaleY: back.h/to.h, duration: 0.38, ease: "power3.in" });
  gsap.to(viewer, { opacity: 0, duration: 0.3, delay: 0.16, ease: "power1.in", onComplete: () => {
    gsap.set(viewer, { visibility: "hidden" }); viewerBox.innerHTML = ""; frameEl = null; detailOpen = false; document.body.classList.remove("locked");
  } });
}
function stepDetail(dir){
  if (!detailOpen) return;
  const list = viewerList();
  currentIdx = (currentIdx + dir + list.length) % list.length;
  const t = list[currentIdx];
  const n = t.basePos.clone().normalize();
  view.pitch = -Math.asin(THREE.MathUtils.clamp(n.y,-1,1));
  const TWO_PI = 2*Math.PI;
  let yaw = Math.atan2(-n.x,-n.z) + Math.PI; yaw -= entranceOffsets().yaw;
  view.yaw = yaw - TWO_PI*Math.round((yaw-view.yaw)/TWO_PI);
  const to = finalRect(t.item.w/t.item.h), old = frameEl;
  gsap.to(old, { opacity: 0, x: to.x + (dir>0?-70:70), duration: 0.26, ease: "power2.in", onComplete: () => old.remove() });
  frameEl = phFrame(t.item, to);
  frameEl.style.transform = `translate(${to.x + (dir>0?70:-70)}px,${to.y}px)`; frameEl.style.opacity = "0";
  viewerBox.appendChild(frameEl); setCaption(t);
  gsap.to(frameEl, { opacity: 1, x: to.x, y: to.y, duration: 0.38, delay: 0.05, ease: "expo.out" });
}
document.getElementById("viewer-x").addEventListener("click", closeDetail);
document.getElementById("viewer-prev").addEventListener("click", () => stepDetail(-1));
document.getElementById("viewer-next").addEventListener("click", () => stepDetail(1));
viewer.addEventListener("click", (e) => { if (e.target === viewer || e.target === viewerBox) closeDetail(); });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
  if (e.key === "ArrowLeft") stepDetail(-1);
  if (e.key === "ArrowRight") stepDetail(1);
});

/* ---------- resize ---------- */
let resizeTimer = null;
window.addEventListener("resize", () => {
  camera.aspect = innerWidth/innerHeight; renderer.setSize(innerWidth, innerHeight); lastFov = 0;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (started && !detailOpen) placeSet(visibleSet(), "none"); }, 350);
});

/* ---------- 主循环 ---------- */
const clock = new THREE.Clock();
function tick(){
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  if (!dragging && started && !detailOpen) {
    view.yaw += vel.yaw;
    view.pitch = THREE.MathUtils.clamp(view.pitch + vel.pitch, -PITCH_MAX, PITCH_MAX);
    vel.yaw *= CONFIG.inertia; vel.pitch *= CONFIG.inertia;
    const settled = entranceOffsets().settled;
    const target = reducedMotion ? 0 : (tourMode || (settled && !hovered) ? 1 : 0);
    autoRamp += (target - autoRamp) * 0.025;
    view.yaw += (tourMode ? CONFIG.tourSpin : CONFIG.autoSpin) * autoRamp;
  }
  parallax.x += (parallax.tx - parallax.x) * 0.04;
  parallax.y += (parallax.ty - parallax.y) * 0.04;
  if (started && !detailOpen) {
    for (const tile of tiles) {
      if (!tile.onDome || gsap.isTweening(tile.mesh.position)) continue;
      const bob = 0.22 * Math.sin(t*tile.bobSpeed + tile.bobPhase);
      const k = 1 - 0.05*tile.hover + bob/tile.radius;
      tile.mesh.position.set(tile.basePos.x*k, tile.basePos.y*k, tile.basePos.z*k);
      if (tile.hover > 0.001) {
        const s = 1 + 0.06*tile.hover;
        tile.mesh.scale.set(tile.baseScale.x*s, tile.baseScale.y*s, 1);
      } else if (!gsap.isTweening(tile.mesh.scale)) {
        tile.mesh.scale.set(tile.baseScale.x, tile.baseScale.y, 1);
      }
      tile.mesh.lookAt(0,0,0);
    }
  }
  applyCamera();
  renderer.render(scene, camera);
}
tick();

/* ---------- 调试 API ---------- */
window.__app = {
  view, tiles, entrance, CONFIG,
  get started(){ return started; },
  open(i){ openDetail(viewerList()[i]); },
  close(){ closeDetail(); },
  filter(f){ document.querySelector(`.filters button[data-f="${f}"]`)?.click(); },
};

/* ============================================================
   分批换真图:将文件放入 images/，在 collection.js 按 a-001 等固定编号
   登记 src、w、h、title。未登记的位置保留占位，球面与大图共用同一原图。
   ============================================================ */
