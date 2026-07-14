import * as THREE from 'three';

// ---------------------------------------------------------------------
// Timeline (seconds)
// ---------------------------------------------------------------------
export const FPS = 30;
export const STAGES = {
  title:        [0.0, 3.0],
  binding:      [3.0, 9.0],
  gprotein:     [9.0, 15.0],
  ac:           [15.0, 20.0],
  atpcamp:      [20.0, 27.0],
  campaccum:    [27.0, 32.0],
  antifibrotic: [32.0, 38.5],
  outro:        [38.5, 42.5],
};
export const TOTAL_DURATION = STAGES.outro[1];
window.FPS = FPS;
window.TOTAL_DURATION = TOTAL_DURATION;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function progress(stageName, t) {
  const [a, b] = STAGES[stageName];
  return clamp01((t - a) / (b - a));
}
function smoothstep(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpV3(out, a, b, t) {
  out.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
  return out;
}
function inStage(name, t) {
  const [a, b] = STAGES[name];
  return t >= a && t < b;
}
function atOrAfter(name, t) {
  return t >= STAGES[name][0];
}

// ---------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(1920, 1080, false);
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1920 / 1080, 1, 60);

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(6, 10, 8);
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fd7e8, 0.5);
rim.position.set(-8, -4, -6);
scene.add(rim);

// ---------------------------------------------------------------------
// Labels (HTML overlay, positioned via projection each frame)
// ---------------------------------------------------------------------
const labelLayer = document.getElementById('labels');
const labels = [];
function makeLabel(text, opts = {}) {
  const el = document.createElement('div');
  el.className = 'obj-label' + (opts.sub ? ' sub' : '');
  el.textContent = text;
  if (opts.color) el.style.color = opts.color;
  labelLayer.appendChild(el);
  const entry = { el, anchor: opts.anchor || new THREE.Object3D(), offsetY: opts.offsetY || 0 };
  labels.push(entry);
  return entry;
}
function updateLabel(entry, opacity) {
  const v = new THREE.Vector3();
  entry.anchor.getWorldPosition(v);
  v.y += entry.offsetY;
  v.project(camera);
  const x = (v.x * 0.5 + 0.5) * 1920;
  const y = (-v.y * 0.5 + 0.5) * 1080;
  entry.el.style.left = x + 'px';
  entry.el.style.top = y + 'px';
  entry.el.style.opacity = String(clamp01(opacity));
}

const captionEl = document.getElementById('caption');
function setCaption(text, sub, opacity) {
  captionEl.innerHTML = text ? (text + (sub ? `<span class="small">${sub}</span>` : '')) : '';
  captionEl.style.opacity = String(clamp01(opacity));
}

const titlecard = document.getElementById('titlecard');
const outroEl = document.getElementById('outro');
const meterEl = document.getElementById('meter');
const meterFill = document.getElementById('meter-fill');
const meterLabel = document.getElementById('meter-label');
const tagExtra = document.getElementById('tag-extra');
const tagCyto = document.getElementById('tag-cyto');

// ---------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------
const COL = {
  receptorEP2: 0x5fb8c9,
  receptorIP: 0x6fd0a8,
  receptorDP1: 0xc9a3e0,
  ac: 0xf0955a,
  ligand: 0xffffff,
  galpha: 0xffd76a,
  gbg: 0x9fb8ff,
  atp: 0xd8d8d8,
  camp: 0xffd76a,
  fibroblastActive: 0xe0654f,
  fibroblastQuiet: 0x7fbf8f,
  collagen: 0xe0654f,
};

// ---------------------------------------------------------------------
// Membrane
// ---------------------------------------------------------------------
const membraneGroup = new THREE.Group();
scene.add(membraneGroup);

const membraneMat = new THREE.MeshPhysicalMaterial({
  color: 0x2c7e93, transparent: true, opacity: 0.28, roughness: 0.4, metalness: 0.0,
  side: THREE.DoubleSide,
});
const membraneSlab = new THREE.Mesh(new THREE.BoxGeometry(15.5, 1.5, 5.5), membraneMat);
membraneGroup.add(membraneSlab);

const leafletMat = new THREE.MeshBasicMaterial({ color: 0x9fe6f2, transparent: true, opacity: 0.22 });
const leafletTop = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 5.5), leafletMat);
leafletTop.rotation.x = -Math.PI / 2;
leafletTop.position.y = 0.76;
membraneGroup.add(leafletTop);
const leafletBottom = leafletTop.clone();
leafletBottom.position.y = -0.76;
membraneGroup.add(leafletBottom);

// ---------------------------------------------------------------------
// Transmembrane bundle builder (receptors + adenylate cyclase)
// ---------------------------------------------------------------------
function buildBundle(x, color, helixCount = 7, radius = 0.42, height = 2.5) {
  const g = new THREE.Group();
  g.position.set(x, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, emissive: 0x000000 });
  const helixGeo = new THREE.CylinderGeometry(0.11, 0.11, height, 10);
  for (let i = 0; i < helixCount; i++) {
    const a = (i / helixCount) * Math.PI * 2;
    const hx = Math.cos(a) * radius;
    const hz = Math.sin(a) * radius;
    const m = new THREE.Mesh(helixGeo, mat);
    m.position.set(hx, 0, hz);
    g.add(m);
  }
  g.userData.mat = mat;
  g.userData.baseColor = new THREE.Color(color);
  scene.add(g);
  return g;
}

const rEP2 = buildBundle(-5.2, COL.receptorEP2);
const rIP  = buildBundle(-1.9, COL.receptorIP);
const rDP1 = buildBundle(1.4, COL.receptorDP1);
const ac   = buildBundle(5.0, COL.ac, 9, 0.5, 2.7);

const receptors = [
  { g: rEP2, name: 'EP2', delay: 0.0 },
  { g: rIP,  name: 'IP',  delay: 0.35 },
  { g: rDP1, name: 'DP1', delay: 0.7 },
];

for (const r of receptors) {
  const anchor = new THREE.Object3D();
  anchor.position.set(r.g.position.x, 1.6, 0);
  scene.add(anchor);
  r.label = makeLabel(r.name, { anchor, color: '#ffffff' });
}
const acAnchor = new THREE.Object3D();
acAnchor.position.set(ac.position.x, 1.7, 0);
scene.add(acAnchor);
const acLabel = makeLabel('Adenylate cyclase', { anchor: acAnchor, sub: true, color: '#ffcaa3' });

// ---------------------------------------------------------------------
// Ligands (drug molecules) — descend from extracellular space and dock
// ---------------------------------------------------------------------
function buildLigand() {
  const geo = new THREE.IcosahedronGeometry(0.28, 0);
  const mat = new THREE.MeshStandardMaterial({ color: COL.ligand, emissive: 0x666666, roughness: 0.2, metalness: 0.3 });
  const m = new THREE.Mesh(geo, mat);
  scene.add(m);
  return m;
}
for (const r of receptors) {
  r.ligand = buildLigand();
  r.startPos = new THREE.Vector3(r.g.position.x + 0.6, 5.5, 0.9);
  r.dockPos = new THREE.Vector3(r.g.position.x, 1.05, 0);
}

// ---------------------------------------------------------------------
// G protein trimer (Galpha + Gbetagamma) per receptor
// ---------------------------------------------------------------------
function buildGProtein() {
  const g = new THREE.Group();
  const alphaMat = new THREE.MeshStandardMaterial({ color: COL.galpha, roughness: 0.35 });
  const bgMat = new THREE.MeshStandardMaterial({ color: COL.gbg, roughness: 0.35 });
  const alpha = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), alphaMat);
  const beta = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), bgMat);
  const gamma = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), bgMat);
  beta.position.set(0.4, -0.05, 0);
  gamma.position.set(0.62, -0.3, 0);
  const bg = new THREE.Group();
  bg.add(beta, gamma);
  g.add(alpha, bg);
  g.userData.alpha = alpha;
  g.userData.bg = bg;
  scene.add(g);
  return g;
}
for (const r of receptors) {
  r.gprotein = buildGProtein();
  r.gDockPos = new THREE.Vector3(r.g.position.x - 0.3, -1.35, 0);
}
const acActiveSite = new THREE.Vector3(ac.position.x - 0.5, -1.25, 0);

// ---------------------------------------------------------------------
// ATP -> cAMP conversion particles at the adenylate cyclase active site
// ---------------------------------------------------------------------
function buildATP() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshStandardMaterial({ color: COL.atp }));
  g.add(core);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), new THREE.MeshStandardMaterial({ color: 0xffb14a }));
    p.position.set(0.2 + i * 0.17, 0.05 * (i % 2 === 0 ? 1 : -1), 0);
    p.name = 'phosphate' + i;
    g.add(p);
  }
  scene.add(g);
  return g;
}
function buildCAMP() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.05, 10, 20),
    new THREE.MeshStandardMaterial({ color: COL.camp, emissive: 0x442e00, emissiveIntensity: 0.6 })
  );
  g.add(ring);
  scene.add(g);
  return g;
}

const N_MOLECULES = 6;
const converters = [];
for (let i = 0; i < N_MOLECULES; i++) {
  converters.push({
    atp: buildATP(),
    camp: buildCAMP(),
    phase: i / N_MOLECULES,
    lane: (Math.random() - 0.5) * 1.6,
    driftSeed: Math.random() * 10,
  });
}

// ---------------------------------------------------------------------
// cAMP accumulation cloud (cytoplasm)
// ---------------------------------------------------------------------
const N_CLOUD = 40;
const cloudParticles = [];
const cloudMat = new THREE.MeshStandardMaterial({ color: COL.camp, emissive: 0x442e00, emissiveIntensity: 0.5 });
const cloudGeo = new THREE.SphereGeometry(0.09, 8, 8);
for (let i = 0; i < N_CLOUD; i++) {
  const m = new THREE.Mesh(cloudGeo, cloudMat);
  scene.add(m);
  cloudParticles.push({
    mesh: m,
    basePos: new THREE.Vector3(
      lerp(-4.5, 6.5, Math.random()),
      lerp(-4.8, -1.6, Math.random()),
      lerp(-2.2, 2.2, Math.random())
    ),
    seed: Math.random() * 20,
    order: i / N_CLOUD,
  });
}

// ---------------------------------------------------------------------
// Fibroblast (activated -> quiescent) deep in cytoplasm
// ---------------------------------------------------------------------
const fibroPos = new THREE.Vector3(1.0, -6.6, 0.5);
const fibroBaseGeo = new THREE.IcosahedronGeometry(0.7, 3);
const fibroPositions = fibroBaseGeo.attributes.position;
const fibroNormals = fibroBaseGeo.attributes.normal.clone();
const vertCount = fibroPositions.count;
const spikeNoise = new Float32Array(vertCount);
for (let i = 0; i < vertCount; i++) {
  spikeNoise[i] = 0.22 + Math.random() * 0.4;
}
const fibroMat = new THREE.MeshStandardMaterial({
  color: COL.fibroblastActive, roughness: 0.55, metalness: 0.05, flatShading: true,
});
const fibroMesh = new THREE.Mesh(fibroBaseGeo, fibroMat);
fibroMesh.position.copy(fibroPos);
scene.add(fibroMesh);

const nucleusMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a55 }));
nucleusMesh.position.copy(fibroPos);
scene.add(nucleusMesh);

const N_COLLAGEN = 14;
const collagenFibers = [];
const collagenMat = new THREE.MeshStandardMaterial({ color: COL.collagen, roughness: 0.6 });
for (let i = 0; i < N_COLLAGEN; i++) {
  const len = 1.1 + Math.random() * 0.9;
  const geo = new THREE.CylinderGeometry(0.035, 0.035, len, 6);
  const m = new THREE.Mesh(geo, collagenMat);
  const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const start = fibroPos.clone().addScaledVector(dir, 0.75);
  const mid = start.clone().addScaledVector(dir, len / 2);
  m.position.copy(mid);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  scene.add(m);
  collagenFibers.push({ mesh: m, baseLen: len, baseScale: 1 });
}

const fibroAnchor = new THREE.Object3D();
fibroAnchor.position.set(fibroPos.x, fibroPos.y + 1.5, fibroPos.z);
scene.add(fibroAnchor);
const fibroLabel = makeLabel('Fibroblast', { anchor: fibroAnchor, color: '#ffffff' });
const fibroSubAnchor = new THREE.Object3D();
fibroSubAnchor.position.set(fibroPos.x, fibroPos.y + 1.15, fibroPos.z);
scene.add(fibroSubAnchor);
const fibroSubLabel = makeLabel('activated', { anchor: fibroSubAnchor, sub: true, color: '#ffb3a3' });

// ---------------------------------------------------------------------
// Camera rig — deterministic keyframes per stage
// ---------------------------------------------------------------------
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const P = {
  intro:  { pos: new THREE.Vector3(0.5, 1.6, 13.5), look: new THREE.Vector3(0, 0.3, 0) },
  wide:   { pos: new THREE.Vector3(0, 0.8, 12.5), look: new THREE.Vector3(0, -0.2, 0) },
  bind:   { pos: new THREE.Vector3(-1.9, 1.6, 10.5), look: new THREE.Vector3(-1.9, 0.6, 0) },
  gprot:  { pos: new THREE.Vector3(-1.9, -0.4, 10.5), look: new THREE.Vector3(-1.9, -1.1, 0) },
  acview: { pos: new THREE.Vector3(4.2, -0.2, 9.5), look: new THREE.Vector3(4.6, -1.0, 0) },
  react:  { pos: new THREE.Vector3(4.6, -2.4, 8.5), look: new THREE.Vector3(4.6, -2.6, 0) },
  cloud:  { pos: new THREE.Vector3(1.0, -3.6, 11.0), look: new THREE.Vector3(1.0, -3.6, 0) },
  fibro:  { pos: new THREE.Vector3(1.0, -5.8, 9.0), look: new THREE.Vector3(1.0, -6.5, 0) },
  fibro2: { pos: new THREE.Vector3(1.8, -6.0, 7.5), look: new THREE.Vector3(1.0, -6.5, 0) },
};

// ---------------------------------------------------------------------
// Main deterministic update — called with an absolute time in seconds
// ---------------------------------------------------------------------
function setSceneTime(t) {
  t = Math.max(0, Math.min(t, TOTAL_DURATION));

  // ---- title card ----
  const pTitle = progress('title', t);
  const titleFade = t < STAGES.title[1] ? smoothstep(Math.min(pTitle * 3, 1)) * (t > STAGES.title[1] - 0.6 ? smoothstep((STAGES.title[1] - t) / 0.6) : 1) : 0;
  titlecard.style.opacity = String(t < STAGES.title[1] ? titleFade : 0);

  // ---- outro card ----
  const outroOpacity = atOrAfter('outro', t) ? smoothstep(progress('outro', t) * 4) : 0;
  outroEl.style.opacity = String(outroOpacity);

  const sceneHidden = outroOpacity > 0.98;
  membraneGroup.visible = !sceneHidden;

  // ---- camera ----
  let camA = P.intro, camB = P.intro, mix = 0;
  if (t < STAGES.binding[0]) {
    camA = P.intro; camB = P.wide; mix = smoothstep(pTitle);
  } else if (t < STAGES.gprotein[0]) {
    camA = P.wide; camB = P.bind; mix = smoothstep(progress('binding', t));
  } else if (t < STAGES.ac[0]) {
    camA = P.bind; camB = P.gprot; mix = smoothstep(progress('gprotein', t));
  } else if (t < STAGES.atpcamp[0]) {
    camA = P.gprot; camB = P.acview; mix = smoothstep(progress('ac', t));
  } else if (t < STAGES.campaccum[0]) {
    camA = P.acview; camB = P.react; mix = smoothstep(progress('atpcamp', t));
  } else if (t < STAGES.antifibrotic[0]) {
    camA = P.react; camB = P.cloud; mix = smoothstep(progress('campaccum', t));
  } else if (t < STAGES.outro[0]) {
    const p = progress('antifibrotic', t);
    if (p < 0.5) { camA = P.cloud; camB = P.fibro; mix = smoothstep(p * 2); }
    else { camA = P.fibro; camB = P.fibro2; mix = smoothstep((p - 0.5) * 2); }
  } else {
    camA = P.fibro2; camB = P.fibro2; mix = 0;
  }
  lerpV3(camPos, camA.pos, camB.pos, mix);
  lerpV3(camTarget, camA.look, camB.look, mix);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);

  // ---- zone tags ----
  const zoneOpacity = (t > 3.0 && t < STAGES.antifibrotic[0] + 0.8) ? 1 : (t <= 3.0 ? smoothstep((t - 2.4) / 0.6) : smoothstep((STAGES.antifibrotic[0] + 1.6 - t) / 0.8));
  tagExtra.style.opacity = String(clamp01(zoneOpacity));
  tagCyto.style.opacity = String(clamp01(zoneOpacity));

  // ---- receptor bundle glow ----
  for (const r of receptors) {
    const bp = progress('binding', t);
    const localP = clamp01((bp - r.delay) / (1 - r.delay));
    const dockT = smoothstep(Math.min(localP * 1.6, 1));
    lerpV3(r.ligand.position, r.startPos, r.dockPos, dockT);
    r.ligand.material.opacity = 1;
    r.ligand.visible = t >= STAGES.binding[0] - 0.2 && t < STAGES.antifibrotic[0];

    const bound = t >= STAGES.binding[0] + r.delay * 3 + 1.6;
    const activation = bound ? clamp01((t - (STAGES.binding[0] + r.delay * 3 + 1.6)) / 1.2) : 0;
    r.g.userData.mat.emissive.copy(r.g.userData.baseColor).multiplyScalar(0.55 * activation);
    r.g.userData.mat.emissiveIntensity = 1;

    updateLabel(r.label, t > STAGES.binding[0] - 0.5 && t < STAGES.antifibrotic[0] + 1.5 ? 1 : 0);
  }
  updateLabel(acLabel, t > STAGES.ac[0] - 1 && t < STAGES.antifibrotic[0] + 1.5 ? 1 : 0);

  // ---- G protein: assemble under receptor, split, Galpha travels to AC ----
  for (const r of receptors) {
    const startT = STAGES.gprotein[0] + r.delay;
    const gp = clamp01((t - startT) / 5.2);
    const assemble = smoothstep(Math.min(gp * 3, 1));
    r.gprotein.position.copy(r.gDockPos);
    r.gprotein.scale.setScalar(lerp(0.001, 1, assemble));

    const split = smoothstep(clamp01((gp - 0.4) / 0.3));
    r.gprotein.userData.bg.position.x = lerp(0, -0.55, split);

    const travel = smoothstep(clamp01((gp - 0.55) / 0.45));
    const alphaTarget = acActiveSite.clone().add(new THREE.Vector3(0, 0.4 + 0.15 * Math.sin(r.delay * 10), (r.delay - 0.35) * 0.6));
    const alphaPos = new THREE.Vector3();
    lerpV3(alphaPos, r.gDockPos, alphaTarget, travel);
    r.gprotein.userData.alpha.position.copy(alphaPos).sub(r.gprotein.position);

    r.gprotein.visible = t >= startT - 0.1 && t < STAGES.campaccum[0] + 1.5;
    r.gprotein.userData.bg.visible = travel < 0.98;
  }

  // ---- adenylate cyclase activation glow ----
  const acp = progress('ac', t);
  const acGlow = smoothstep(acp) * (1 - (t > STAGES.campaccum[0] ? clamp01((t - STAGES.campaccum[0]) / 3) * 0.4 : 0));
  ac.userData.mat.emissive.set(0xff8a3d).multiplyScalar(0.6 * clamp01(acGlow + (atOrAfter('ac', t) ? 0.35 : 0)));

  // ---- ATP -> cAMP conversion loop at active site ----
  const convActive = t >= STAGES.atpcamp[0] - 0.5 && t < STAGES.antifibrotic[0];
  const cycleLen = 2.6;
  for (const c of converters) {
    if (!convActive) { c.atp.visible = false; c.camp.visible = false; continue; }
    const localT = ((t - STAGES.atpcamp[0]) / cycleLen + c.phase) % 1;
    const risingFromCyto = localT < 0.35;
    const atStage = localT >= 0.35 && localT < 0.55;
    const leaving = localT >= 0.55;

    c.atp.visible = risingFromCyto || atStage;
    c.camp.visible = leaving;

    if (risingFromCyto) {
      const lp = localT / 0.35;
      const from = new THREE.Vector3(acActiveSite.x + c.lane, -4.4, (c.lane) * 0.6);
      const to = acActiveSite.clone().add(new THREE.Vector3(c.lane * 0.3, 0, 0));
      lerpV3(c.atp.position, from, to, smoothstep(lp));
      c.atp.scale.setScalar(1);
    } else if (atStage) {
      const lp = (localT - 0.35) / 0.2;
      c.atp.position.copy(acActiveSite).add(new THREE.Vector3(c.lane * 0.3, 0, 0));
      c.atp.scale.setScalar(1 - 0.3 * smoothstep(lp));
    }
    if (leaving) {
      const lp = (localT - 0.55) / 0.45;
      const from = acActiveSite.clone().add(new THREE.Vector3(c.lane * 0.3, 0, 0));
      const to = new THREE.Vector3(acActiveSite.x + c.lane * 2.2, -4.6 - lp * 1.2, c.lane * 1.4);
      lerpV3(c.camp.position, from, to, smoothstep(lp));
      c.camp.rotation.y = t * 1.5 + c.driftSeed;
      c.camp.material && (c.camp.children[0].material.opacity = 1);
    }
  }

  // ---- cAMP concentration meter ----
  const meterActive = t >= STAGES.atpcamp[0];
  const level = meterActive ? clamp01((t - STAGES.atpcamp[0]) / (STAGES.campaccum[1] - STAGES.atpcamp[0])) : 0;
  const meterFadeOut = atOrAfter('outro', t) ? 0 : 1;
  meterEl.style.opacity = String(meterActive ? meterFadeOut : 0);
  meterLabel.style.opacity = meterEl.style.opacity;
  meterFill.style.height = (level * 100).toFixed(1) + '%';

  // ---- cAMP cloud accumulation in cytoplasm ----
  const cloudStart = STAGES.campaccum[0] - 1.0;
  for (const p of cloudParticles) {
    const appear = clamp01((t - (cloudStart + p.order * 4.5)) / 1.2);
    p.mesh.visible = appear > 0.01 && t < STAGES.antifibrotic[1] - 0.5;
    const bob = Math.sin(t * 1.3 + p.seed) * 0.08;
    p.mesh.position.set(p.basePos.x, p.basePos.y + bob, p.basePos.z);
    p.mesh.scale.setScalar(0.4 + 0.6 * smoothstep(appear));
  }

  // ---- fibroblast morph: activated (spiky) -> quiescent (smooth) ----
  const fp = progress('antifibrotic', t);
  const morph = smoothstep(clamp01((fp - 0.15) / 0.7));
  const posAttr = fibroMesh.geometry.attributes.position;
  for (let i = 0; i < vertCount; i++) {
    const nx = fibroNormals.getX(i), ny = fibroNormals.getY(i), nz = fibroNormals.getZ(i);
    const spike = lerp(spikeNoise[i], 0.02, morph);
    posAttr.setXYZ(i, nx * (1 + spike), ny * (1 + spike), nz * (1 + spike));
  }
  posAttr.needsUpdate = true;
  fibroMesh.geometry.computeVertexNormals();
  fibroMat.color.set(COL.fibroblastActive).lerp(new THREE.Color(COL.fibroblastQuiet), morph);
  fibroMesh.visible = t >= STAGES.campaccum[0] - 0.5;
  nucleusMesh.visible = fibroMesh.visible;

  for (const cf of collagenFibers) {
    cf.mesh.visible = fibroMesh.visible;
    cf.mesh.scale.setScalar(lerp(1, 0.15, morph));
  }

  updateLabel(fibroLabel, fibroMesh.visible ? 1 : 0);
  fibroSubLabel.el.textContent = morph > 0.5 ? 'quiescent' : 'activated';
  fibroSubLabel.el.style.color = morph > 0.5 ? '#bdf2c9' : '#ffb3a3';
  updateLabel(fibroSubLabel, fibroMesh.visible ? 1 : 0);

  // ---- caption track ----
  if (inStage('binding', t)) {
    setCaption('Drug binds EP2, IP and DP1 receptors', 'G protein-coupled receptors on the cell membrane', smoothstep(progress('binding', t) * 4));
  } else if (inStage('gprotein', t)) {
    setCaption('Receptor activation triggers the Gs protein', 'The G&alpha; subunit dissociates from G&beta;&gamma;', smoothstep(progress('gprotein', t) * 4));
  } else if (inStage('ac', t)) {
    setCaption('Adenylate cyclase is activated', 'G&alpha;-GTP binds and activates the enzyme', smoothstep(progress('ac', t) * 4));
  } else if (inStage('atpcamp', t)) {
    setCaption('ATP is converted into cAMP', 'Adenylate cyclase catalyzes cyclic AMP formation', smoothstep(progress('atpcamp', t) * 4));
  } else if (inStage('campaccum', t)) {
    setCaption('Intracellular cAMP concentration rises', '', smoothstep(progress('campaccum', t) * 4));
  } else if (inStage('antifibrotic', t)) {
    setCaption('Antifibrotic effect', 'Reduced fibroblast activation and collagen deposition', smoothstep(progress('antifibrotic', t) * 4));
  } else {
    setCaption('', '', 0);
  }

  renderer.render(scene, camera);
}

// initialize once
setSceneTime(0);

window.setSceneTime = setSceneTime;
window.renderOnce = () => renderer.render(scene, camera);
window.sceneReady = true;

// interactive preview loop (ignored during frame capture, which drives time explicitly)
const params = new URLSearchParams(location.search);
if (!params.has('capture')) {
  const start = performance.now();
  function loop() {
    const t = ((performance.now() - start) / 1000) % (TOTAL_DURATION + 1.5);
    setSceneTime(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
