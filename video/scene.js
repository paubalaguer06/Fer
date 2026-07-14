import * as THREE from 'three';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { BokehPass } from './vendor/postprocessing/BokehPass.js';

// ---------------------------------------------------------------------
// Timeline (seconds) — one linked story: Normal -> Fibrotic -> Treprostinil
// ---------------------------------------------------------------------
export const FPS = 30;
export const STAGES = {
  title:    [0.0, 3.0],
  normal:   [3.0, 32.0],
  fibrotic: [32.0, 47.0],
  treated:  [47.0, 70.0],
  outro:    [70.0, 74.0],
};
export const TOTAL_DURATION = STAGES.outro[1];
window.FPS = FPS;
window.TOTAL_DURATION = TOTAL_DURATION;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function smoothstep(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpV3(out, a, b, t) {
  out.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
  return out;
}
// Piecewise-smooth curve sampler: kfs = [[t0,v0],[t1,v1],...] sorted by t.
function sampleCurve(t, kfs) {
  if (t <= kfs[0][0]) return kfs[0][1];
  for (let i = 0; i < kfs.length - 1; i++) {
    const [ta, va] = kfs[i];
    const [tb, vb] = kfs[i + 1];
    if (t <= tb) return lerp(va, vb, smoothstep((t - ta) / (tb - ta)));
  }
  return kfs[kfs.length - 1][1];
}

// ---------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setSize(1920, 1080, false);
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1920 / 1080, 1, 60);

// Baked vertical gradient standing in for the old CSS backdrop — the canvas
// is opaque now so the depth-of-field pass has a real background to blur.
function buildBackgroundTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, '#bfe9f2');
  grad.addColorStop(0.08, '#8fd0e0');
  grad.addColorStop(0.42, '#2e6f86');
  grad.addColorStop(0.55, '#123a4d');
  grad.addColorStop(0.78, '#071e2b');
  grad.addColorStop(1.00, '#030f18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 512);
  return new THREE.CanvasTexture(c);
}
scene.background = buildBackgroundTexture();

const mainGroup = new THREE.Group();
scene.add(mainGroup);

scene.add(new THREE.AmbientLight(0xffffff, 0.68));
const key = new THREE.DirectionalLight(0xfff3e0, 1.1);
key.position.set(6, 10, 8);
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fd7e8, 0.55);
rim.position.set(-8, -4, -6);
scene.add(rim);

// Depth of field — keeps whatever the camera is looking at sharp while
// nearer/farther geometry softens, for a more cinematic macro-lens feel.
const composer = new EffectComposer(renderer);
composer.setSize(1920, 1080);
composer.addPass(new RenderPass(scene, camera));
const bokehPass = new BokehPass(scene, camera, { focus: 12, aperture: 0.0028, maxblur: 0.009 });
composer.addPass(bokehPass);

// ---------------------------------------------------------------------
// Labels (HTML overlay, positioned via projection each frame)
// ---------------------------------------------------------------------
const labelLayer = document.getElementById('labels');
function makeLabel(text, opts = {}) {
  const el = document.createElement('div');
  el.className = 'obj-label' + (opts.sub ? ' sub' : '');
  el.textContent = text;
  if (opts.color) el.style.color = opts.color;
  labelLayer.appendChild(el);
  return { el, anchor: opts.anchor || new THREE.Object3D(), offsetY: opts.offsetY || 0 };
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

const cardLayer = document.getElementById('cards');
function makeCard(opts = {}) {
  const el = document.createElement('div');
  el.className = 'info-card';
  cardLayer.appendChild(el);
  return { el, anchor: opts.anchor || new THREE.Object3D(), offsetY: opts.offsetY || 0 };
}
function updateCard(entry, title, lines, opacity) {
  const v = new THREE.Vector3();
  entry.anchor.getWorldPosition(v);
  v.y += entry.offsetY;
  v.project(camera);
  const x = (v.x * 0.5 + 0.5) * 1920;
  const y = (-v.y * 0.5 + 0.5) * 1080;
  entry.el.style.left = x + 'px';
  entry.el.style.top = y + 'px';
  entry.el.style.opacity = String(clamp01(opacity));
  entry.el.innerHTML = `<div class="title">${title}</div>` + lines.map((l) => `<div class="line">${l}</div>`).join('');
}

const captionEl = document.getElementById('caption');
function setCaption(text, sub, opacity) {
  captionEl.innerHTML = text ? (text + (sub ? `<span class="small">${sub}</span>` : '')) : '';
  captionEl.style.opacity = String(clamp01(opacity));
}

const titlecard = document.getElementById('titlecard');
const titlecardH1 = document.getElementById('titlecard-h1');
const titlecardH2 = document.getElementById('titlecard-h2');
const outroEl = document.getElementById('outro');
const meterEl = document.getElementById('meter');
const meterFill = document.getElementById('meter-fill');
const meterLabel = document.getElementById('meter-label');
const tagExtra = document.getElementById('tag-extra');
const tagCyto = document.getElementById('tag-cyto');
const legendEl = document.getElementById('legend');

// ---------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------
const COL = {
  receptor: 0xb79fd1,
  ac: 0x5fa8c9,
  ligand: 0xd6dde2,
  treprostinil: 0x6fc3f0,
  galpha: 0xffd76a,
  gbg: 0x9fb8ff,
  atp: 0xd8d8d8,
  camp: 0xffd76a,
};

// ---------------------------------------------------------------------
// Membrane
// ---------------------------------------------------------------------
const membraneGroup = new THREE.Group();
mainGroup.add(membraneGroup);
const membraneMat = new THREE.MeshPhysicalMaterial({ color: 0x2c7e93, transparent: true, opacity: 0.28, roughness: 0.4, side: THREE.DoubleSide });
const membraneSlab = new THREE.Mesh(new THREE.BoxGeometry(15.5, 1.4, 5), membraneMat);
membraneGroup.add(membraneSlab);
const leafletMat = new THREE.MeshBasicMaterial({ color: 0x9fe6f2, transparent: true, opacity: 0.22 });
const leafletTop = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 5), leafletMat);
leafletTop.rotation.x = -Math.PI / 2;
leafletTop.position.y = 0.72;
membraneGroup.add(leafletTop);
const leafletBottom = leafletTop.clone();
leafletBottom.position.y = -0.72;
membraneGroup.add(leafletBottom);

// ---------------------------------------------------------------------
// Builders (transmembrane bundle, ligand, G protein, ATP/cAMP, DNA)
// ---------------------------------------------------------------------
function buildBundle(x, color, helixCount = 7, radius = 0.42, height = 2.5, parent = mainGroup) {
  const g = new THREE.Group();
  g.position.set(x, 0, 0);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.4, emissive: 0x000000 });
  const helixGeo = new THREE.CapsuleGeometry(0.11, height - 0.22, 4, 10);
  for (let i = 0; i < helixCount; i++) {
    const a = (i / helixCount) * Math.PI * 2;
    const m = new THREE.Mesh(helixGeo, mat);
    m.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    g.add(m);
  }
  g.userData.mat = mat;
  g.userData.baseColor = new THREE.Color(color);
  parent.add(g);
  return g;
}

function buildLigand(parent = mainGroup, color = COL.ligand, radius = 0.26) {
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
    const n = v.clone().normalize();
    const bump = 1 + (Math.sin(n.x * 7) * Math.sin(n.y * 6) * Math.sin(n.z * 5)) * 0.05;
    v.multiplyScalar(bump);
    posAttr.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color, emissive: 0x555555, roughness: 0.35, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.45 });
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}

function buildGProtein(parent = mainGroup) {
  const g = new THREE.Group();
  const alphaMat = new THREE.MeshPhysicalMaterial({ color: COL.galpha, roughness: 0.35, clearcoat: 0.2, clearcoatRoughness: 0.35 });
  const bgMat = new THREE.MeshPhysicalMaterial({ color: COL.gbg, roughness: 0.35, clearcoat: 0.2, clearcoatRoughness: 0.35 });
  const alpha = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 20), alphaMat);
  const beta = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), bgMat);
  const gamma = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), bgMat);
  beta.position.set(0.4, -0.05, 0);
  gamma.position.set(0.62, -0.3, 0);
  const bg = new THREE.Group();
  bg.add(beta, gamma);
  g.add(alpha, bg);
  g.userData.alpha = alpha;
  g.userData.bg = bg;
  g.userData.alphaMat = alphaMat;
  parent.add(g);
  return g;
}

// Small ball-and-stick molecule builders (stylized, not to scale) so ATP and
// cAMP read as actual molecules rather than generic glowing dots.
function buildBallStickRing(count, radius, atomColor, atomSize = 0.05) {
  const g = new THREE.Group();
  const atomMat = new THREE.MeshStandardMaterial({ color: atomColor, roughness: 0.3, metalness: 0.15 });
  const bondMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.55 });
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    pts.push(p);
    const s = new THREE.Mesh(new THREE.SphereGeometry(atomSize, 10, 10), atomMat);
    s.position.copy(p);
    g.add(s);
  }
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % count];
    const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, a.distanceTo(b), 6), bondMat);
    bond.position.copy(a.clone().lerp(b, 0.5));
    bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(bond);
  }
  g.userData.points = pts;
  g.userData.atomMat = atomMat;
  return g;
}
function addBond(parent, a, b, mat) {
  const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, a.distanceTo(b), 6), mat);
  bond.position.copy(a.clone().lerp(b, 0.5));
  bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  parent.add(bond);
}

function buildATP(parent = mainGroup) {
  const g = new THREE.Group();
  const bondMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.55 });
  const base = buildBallStickRing(6, 0.13, 0x6f9fe0, 0.05);
  base.position.set(-0.22, 0.06, 0);
  g.add(base);
  const ribose = buildBallStickRing(5, 0.09, 0xece6d6, 0.045);
  ribose.position.set(0.08, -0.06, 0);
  g.add(ribose);
  addBond(g, base.position, ribose.position, bondMat);

  const pMat = new THREE.MeshStandardMaterial({ color: 0xff9a3d, roughness: 0.3 });
  const oMat = new THREE.MeshStandardMaterial({ color: 0xe0574f, roughness: 0.3 });
  let prev = ribose.position.clone().add(new THREE.Vector3(0.12, -0.05, 0));
  addBond(g, ribose.position, prev, bondMat);
  for (let i = 0; i < 3; i++) {
    const p = prev.clone().add(new THREE.Vector3(0.15, 0.06 * (i % 2 === 0 ? 1 : -1), 0));
    const ps = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), pMat);
    ps.position.copy(p);
    g.add(ps);
    addBond(g, prev, p, bondMat);
    for (let k = 0; k < 2; k++) {
      const oa = (k / 2) * Math.PI * 2 + i;
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), oMat);
      o.position.copy(p).add(new THREE.Vector3(Math.cos(oa) * 0.085, Math.sin(oa) * 0.085, (k - 0.5) * 0.07));
      g.add(o);
    }
    prev = p;
  }
  g.userData.mats = [base.userData.atomMat, ribose.userData.atomMat, pMat, oMat];
  parent.add(g);
  return g;
}

function buildCAMP(parent = mainGroup) {
  const g = new THREE.Group();
  const bondMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.55 });
  const base = buildBallStickRing(6, 0.12, 0x6f9fe0, 0.048);
  base.position.set(-0.2, 0.05, 0);
  g.add(base);
  const ribose = buildBallStickRing(5, 0.085, 0xece6d6, 0.042);
  ribose.position.set(0.08, -0.05, 0);
  g.add(ribose);
  addBond(g, base.position, ribose.position, bondMat);

  const pMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.25, emissive: 0x442e00, emissiveIntensity: 0.5 });
  const p = ribose.position.clone().add(new THREE.Vector3(0.16, -0.12, 0));
  const ps = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), pMat);
  ps.position.copy(p);
  g.add(ps);
  const a1 = ribose.position.clone().add(ribose.userData.points[1]);
  const a2 = ribose.position.clone().add(ribose.userData.points[2]);
  addBond(g, a1, p, bondMat);
  addBond(g, a2, p, bondMat);
  g.userData.mats = [base.userData.atomMat, ribose.userData.atomMat, pMat];
  g.userData.mat = pMat;
  parent.add(g);
  return g;
}

function buildDNAHelix(parent, colorA = 0x8fd7ea, colorB = 0x5fa8c9) {
  const group = new THREE.Group();
  const radius = 0.34, height = 2.1, turns = 2.3, segments = 48;
  const pts1 = [], pts2 = [];
  for (let i = 0; i <= segments; i++) {
    const tt = i / segments;
    const angle = tt * turns * Math.PI * 2;
    const y = (tt - 0.5) * height;
    pts1.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    pts2.push(new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius));
  }
  const curve1 = new THREE.CatmullRomCurve3(pts1);
  const curve2 = new THREE.CatmullRomCurve3(pts2);
  const mat1 = new THREE.MeshStandardMaterial({ color: colorA, roughness: 0.3, emissive: 0x000000 });
  const mat2 = new THREE.MeshStandardMaterial({ color: colorB, roughness: 0.3, emissive: 0x000000 });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve1, segments, 0.045, 6, false), mat1));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve2, segments, 0.045, 6, false), mat2));
  const rungMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
  for (let i = 1; i < 9; i++) {
    const tt = i / 9;
    const p1 = curve1.getPointAt(tt), p2 = curve2.getPointAt(tt);
    const mid = p1.clone().lerp(p2, 0.5);
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, p1.distanceTo(p2), 6), rungMat);
    rung.position.copy(mid);
    rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
    group.add(rung);
  }
  group.userData.mats = [mat1, mat2];
  parent.add(group);
  return group;
}

// ---------------------------------------------------------------------
// The cell setup — three prostanoid receptors converging on one adenylate
// cyclase, reused across all three acts
// ---------------------------------------------------------------------
const ac = buildBundle(5.0, COL.ac, 9, 0.44, 2.4);
const acActiveSite = new THREE.Vector3(ac.position.x - 0.5, -1.3, 0);

const acAnchor = new THREE.Object3D();
acAnchor.position.set(ac.position.x, 1.8, 0);
scene.add(acAnchor);
const acLabel = makeLabel('Adenylate cyclase', { anchor: acAnchor, color: '#ffcaa3' });

const RECEPTOR_DEFS = [
  { name: 'EP2', x: -5.2, color: 0x5fb8c9, delay: 0.0 },
  { name: 'IP', x: -1.9, color: 0x6fd0a8, delay: 0.35 },
  { name: 'DP1', x: 1.4, color: 0xc9a3e0, delay: 0.7 },
];

const receptors = RECEPTOR_DEFS.map((def) => {
  const g = buildBundle(def.x, def.color, 7, 0.38, 2.2);

  const anchor = new THREE.Object3D();
  anchor.position.set(def.x, 1.7, 0);
  scene.add(anchor);
  const label = makeLabel(def.name, { anchor, color: '#ffffff' });

  const dockPos = new THREE.Vector3(def.x, 1.15, 0);
  const ligandStartPos = new THREE.Vector3(def.x + 0.6, 5.5, 0.9);
  const ligandExitPos = new THREE.Vector3(def.x - 1.6, 4.4, -1.3);
  const ligandNormal = buildLigand(mainGroup, COL.ligand, 0.24);
  const ligandTreprostinil = buildLigand(mainGroup, COL.treprostinil, 0.22);

  const gprotein = buildGProtein();
  const gDockPos = new THREE.Vector3(def.x - 0.3, -1.4, 0);
  const alphaTargetOffset = new THREE.Vector3(0, 0.4 + 0.15 * Math.sin(def.delay * 10), (def.delay - 0.35) * 0.7);

  return { ...def, g, anchor, label, dockPos, ligandStartPos, ligandExitPos, ligandNormal, ligandTreprostinil, gprotein, gDockPos, alphaTargetOffset };
});

// Molecule labels — anchored directly to one representative instance so
// ATP, cAMP and the G protein subunits are identifiable, not just colored dots
const gAlphaLabel = makeLabel('Gα', { anchor: receptors[1].gprotein.userData.alpha, offsetY: 0.55, color: '#ffe9a8' });
const gBetaGammaLabel = makeLabel('Gβγ', { anchor: receptors[1].gprotein.userData.bg, offsetY: -0.35, color: '#c3cdf5' });

const N_MOLECULES = 6;
const converters = [];
for (let i = 0; i < N_MOLECULES; i++) {
  converters.push({ atp: buildATP(), camp: buildCAMP(), phase: i / N_MOLECULES, lane: (Math.random() - 0.5) * 1.6, driftSeed: Math.random() * 10 });
}
const atpLabel = makeLabel('ATP', { anchor: converters[0].atp, offsetY: 0.32, color: '#ffcf8a' });
const campMoleculeLabel = makeLabel('cAMP', { anchor: converters[0].camp, offsetY: 0.32, color: '#ffe9a8' });

const N_CLOUD = 40;
const cloudParticles = [];
const cloudMat = new THREE.MeshStandardMaterial({ color: COL.camp, emissive: 0x442e00, emissiveIntensity: 0.5 });
const cloudGeo = new THREE.SphereGeometry(0.09, 8, 8);
for (let i = 0; i < N_CLOUD; i++) {
  const m = new THREE.Mesh(cloudGeo, cloudMat);
  mainGroup.add(m);
  cloudParticles.push({
    mesh: m,
    basePos: new THREE.Vector3(lerp(-3.5, 5.0, Math.random()), lerp(-4.4, -1.7, Math.random()), lerp(-2.0, 2.0, Math.random())),
    seed: Math.random() * 20,
    order: i / N_CLOUD,
  });
}

const nucleusPos = new THREE.Vector3(0.3, -5.6, 0);
const nucleusMat = new THREE.MeshPhysicalMaterial({ color: 0x2c3a55, transparent: true, opacity: 0.35, roughness: 0.4 });
const nucleusShell = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 20), nucleusMat);
nucleusShell.position.copy(nucleusPos);
mainGroup.add(nucleusShell);
const dna = buildDNAHelix(mainGroup);
dna.position.copy(nucleusPos);
dna.scale.setScalar(1.2);

const nucleusAnchor = new THREE.Object3D();
nucleusAnchor.position.set(nucleusPos.x, nucleusPos.y - 1.75, nucleusPos.z);
scene.add(nucleusAnchor);
const nucleusLabel = makeLabel('', { anchor: nucleusAnchor, sub: true });

const downstreamAnchor = new THREE.Object3D();
downstreamAnchor.position.set(ac.position.x + 1.6, -2.6, 1.7);
scene.add(downstreamAnchor);
const downstreamCard = makeCard({ anchor: downstreamAnchor });

// PPARbeta branch — parallel pathway shown only once treprostinil restores signaling
const pparGroup = new THREE.Group();
pparGroup.position.set(ac.position.x + 3.6, -1.9, 0);
mainGroup.add(pparGroup);
const pparAMat = new THREE.MeshStandardMaterial({ color: 0xd8a3e0, roughness: 0.35 });
const pparBMat = new THREE.MeshStandardMaterial({ color: 0x8fd0e0, roughness: 0.35 });
const pparA = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), pparAMat);
const pparB = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), pparBMat);
pparB.position.set(0.48, 0.02, 0);
pparGroup.add(pparA, pparB);
const pparArrowMat = new THREE.MeshBasicMaterial({ color: 0xd8a3e0, transparent: true, opacity: 0.5 });
const pparArrow1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.1, 6), pparArrowMat);
pparArrow1.position.set(ac.position.x + 2.5, -0.9, 0);
pparArrow1.rotation.z = -0.72;
mainGroup.add(pparArrow1);
const pparArrow2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6), pparArrowMat);
pparArrow2.position.set(ac.position.x + 3.6, -3.2, 0);
mainGroup.add(pparArrow2);
const pparLabelAnchor = new THREE.Object3D();
pparLabelAnchor.position.set(pparGroup.position.x, -1.15, 0);
scene.add(pparLabelAnchor);
const pparLabel = makeLabel('PPARβ activation ?', { anchor: pparLabelAnchor, sub: true, color: '#e0c3ee' });
const pparCardAnchor = new THREE.Object3D();
pparCardAnchor.position.set(pparGroup.position.x, -4.3, 0);
scene.add(pparCardAnchor);
const pparCard = makeCard({ anchor: pparCardAnchor });

// Persistent state header (top of frame)
const headerAnchor = new THREE.Object3D();
headerAnchor.position.set(0.3, 3.1, 0);
scene.add(headerAnchor);
const headerLabel = makeLabel('', { anchor: headerAnchor });
headerLabel.el.classList.add('panel-header');
const subAnchor = new THREE.Object3D();
subAnchor.position.set(0.3, 2.68, 0);
scene.add(subAnchor);
const subLabel = makeLabel('', { anchor: subAnchor });
subLabel.el.classList.add('panel-sub');

// ---------------------------------------------------------------------
// Camera rig
// ---------------------------------------------------------------------
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const P = {
  wide:    { pos: new THREE.Vector3(0, 0.8, 13.5), look: new THREE.Vector3(0, -0.2, 0) },
  bind:    { pos: new THREE.Vector3(-1.9, 1.6, 10.5), look: new THREE.Vector3(-1.9, 0.6, 0) },
  gprot:   { pos: new THREE.Vector3(-1.9, -0.4, 10.5), look: new THREE.Vector3(-1.9, -1.1, 0) },
  ac:      { pos: new THREE.Vector3(4.2, -0.2, 9.5), look: new THREE.Vector3(4.6, -1.0, 0) },
  react:   { pos: new THREE.Vector3(4.6, -2.4, 8.5), look: new THREE.Vector3(4.6, -2.6, 0) },
  cloud:   { pos: new THREE.Vector3(1.0, -3.6, 11.0), look: new THREE.Vector3(1.0, -3.6, 0) },
  nucleus: { pos: new THREE.Vector3(1.0, -5.6, 9.5), look: new THREE.Vector3(0.8, -5.6, 0) },
  blocked: { pos: new THREE.Vector3(0.2, 0.4, 13.5), look: new THREE.Vector3(0.2, -0.3, 0) },
  treatedWide: { pos: new THREE.Vector3(4.5, -2.4, 18.0), look: new THREE.Vector3(3.0, -2.6, 0) },
};

// Camera timeline: ordered list of [tEnd, fromKey, toKey, easeStart]
const CAM_TIMELINE = [
  [4.0, 'wide', 'wide'],
  [11.0, 'wide', 'bind'],
  [16.0, 'bind', 'gprot'],
  [20.0, 'gprot', 'ac'],
  [29.0, 'ac', 'react'],
  [30.5, 'react', 'cloud'],
  [32.0, 'cloud', 'nucleus'],
  [36.0, 'nucleus', 'blocked'],
  [47.0, 'blocked', 'blocked'],
  [53.0, 'blocked', 'bind'],
  [58.0, 'bind', 'gprot'],
  [62.0, 'gprot', 'ac'],
  [67.0, 'ac', 'react'],
  [70.0, 'react', 'treatedWide'],
  [74.0, 'treatedWide', 'treatedWide'],
];
function cameraForTime(t) {
  let segStart = 0;
  for (const [tEnd, fromKey, toKey] of CAM_TIMELINE) {
    if (t <= tEnd) {
      const mix = smoothstep((t - segStart) / Math.max(0.001, tEnd - segStart));
      return { a: P[fromKey], b: P[toKey], mix };
    }
    segStart = tEnd;
  }
  const last = CAM_TIMELINE[CAM_TIMELINE.length - 1];
  return { a: P[last[2]], b: P[last[2]], mix: 0 };
}

// ---------------------------------------------------------------------
// Curves driving the pathway's visual state over the whole story
// ---------------------------------------------------------------------
// Receptor / Gs protein / adenylate cyclase keep functioning normally throughout —
// the fibrotic act only lowers cAMP itself; the upstream cause is not asserted.
const receptorGlow = (t) => sampleCurve(t, [[4, 0.15], [11, 1], [74, 1]]);
const gSplitLevel = (t) => sampleCurve(t, [[11, 0], [15, 1], [74, 1]]);
const gTravelLevel = (t) => sampleCurve(t, [[13, 0], [19, 1], [74, 1]]);
const acGlow = (t) => sampleCurve(t, [[16, 0], [20, 1], [74, 1]]);
const campLevel = (t) => sampleCurve(t, [[20, 0], [29, 1], [35, 0.06], [62, 0.06], [69, 1], [74, 1]]);
const pparOpacity = (t) => sampleCurve(t, [[65, 0], [69, 1], [74, 1]]);
const convActive = (t) => (t >= 19 && t < 32.5) || (t >= 61.5 && t < 70);

// ---------------------------------------------------------------------
// Caption track
// ---------------------------------------------------------------------
const CAPTIONS = [
  [4, 11, 'A ligand binds the EP2, IP and DP1 receptors', 'G protein-coupled receptors on the cell membrane'],
  [11, 16, 'The Gs protein is activated', 'Gα dissociates from Gβγ and moves to adenylate cyclase'],
  [16, 20, 'Adenylate cyclase is activated', 'Gα-GTP binds and activates the enzyme'],
  [20, 29, 'ATP is converted into cAMP', 'Adenylate cyclase catalyzes cyclic AMP formation'],
  [29, 32, 'cAMP rises — downstream effects follow', 'Vasodilation, antiproliferation, anti-inflammation'],
  [32, 37, 'In fibrotic disease, intracellular cAMP concentration falls', 'The exact upstream cause is not fully defined'],
  [37, 50, 'cAMP levels remain low', 'Downstream effects are reduced as a result'],
  [47, 60, 'Treprostinil binds the EP2, IP and DP1 receptors', 'Restoring receptor engagement'],
  [60, 65, 'Intracellular cAMP concentration increases', 'cAMP production resumes'],
  [65, 70, 'A parallel PPARβ pathway may also contribute', 'Hypothesized mechanism'],
];
function updateCaptionTrack(t) {
  const entry = CAPTIONS.find(([a, b]) => t >= a && t < b);
  if (entry) {
    const [a, b, title, sub] = entry;
    setCaption(title, sub, smoothstep((t - a) / 1.0) * smoothstep((b - t) / 0.6));
  } else {
    setCaption('', '', 0);
  }
}

// ---------------------------------------------------------------------
// Main deterministic update
// ---------------------------------------------------------------------
function setSceneTime(t) {
  t = Math.max(0, Math.min(t, TOTAL_DURATION));

  // ---- title card ----
  let titleOpacity = 0;
  if (t < STAGES.title[1]) {
    titlecardH1.textContent = 'Three Cellular States';
    titlecardH2.textContent = 'Normal → fibrotic → fibrotic with treprostinil';
    const p = clamp01(t / STAGES.title[1]);
    titleOpacity = smoothstep(Math.min(p * 3, 1)) * (t > STAGES.title[1] - 0.6 ? smoothstep((STAGES.title[1] - t) / 0.6) : 1);
  }
  titlecard.style.opacity = String(titleOpacity);

  // ---- outro card ----
  const outroOpacity = t >= STAGES.outro[0] ? smoothstep((t - STAGES.outro[0]) / (STAGES.outro[1] - STAGES.outro[0]) * 4) : 0;
  outroEl.style.opacity = String(outroOpacity);
  mainGroup.visible = outroOpacity < 0.98;

  // ---- camera ----
  const { a, b, mix } = cameraForTime(t);
  lerpV3(camPos, a.pos, b.pos, mix);
  lerpV3(camTarget, a.look, b.look, mix);
  // Subtle continuous drift on top of the keyframed blocking, for a
  // handheld/cinematic feel rather than a perfectly locked-off camera.
  const driftX = Math.sin(t * 0.35) * 0.10 + Math.sin(t * 0.13 + 1.7) * 0.05;
  const driftY = Math.cos(t * 0.27 + 0.6) * 0.06;
  camPos.x += driftX; camPos.y += driftY;
  camTarget.x += driftX * 0.4; camTarget.y += driftY * 0.4;
  camera.position.copy(camPos);
  camera.lookAt(camTarget);

  // ---- zone tags ----
  const zoneOpacity = t < 3 ? 0 : (t < 3.6 ? smoothstep((t - 3) / 0.6) : (t > STAGES.outro[0] - 1 ? smoothstep((STAGES.outro[0] - t) / 1) : 1));
  tagExtra.style.opacity = String(clamp01(zoneOpacity));
  tagCyto.style.opacity = String(clamp01(zoneOpacity));

  // ---- legend (brief, during the intro) ----
  const legendOpacity = sampleCurve(t, [[3.5, 0], [5, 1], [9, 1], [10.5, 0]]);
  legendEl.style.opacity = String(legendOpacity);

  // ---- header ----
  let headerText, headerColor, subText;
  if (t < STAGES.fibrotic[0]) { headerText = '1. NORMAL STATE'; headerColor = '#7fe0a0'; subText = 'Functional cAMP signaling'; }
  else if (t < STAGES.treated[0]) { headerText = '2. FIBROTIC STATE'; headerColor = '#ff9a8a'; subText = 'Reduced cAMP concentration — cause not fully defined'; }
  else { headerText = '3. FIBROTIC WITH TREPROSTINIL'; headerColor = '#7fd7e8'; subText = 'Treprostinil increases intracellular cAMP'; }
  headerLabel.el.textContent = headerText;
  headerLabel.el.style.color = headerColor;
  subLabel.el.textContent = subText;
  const headerOpacity = sampleCurve(t, [[3, 0], [3.8, 1]]);
  updateLabel(headerLabel, headerOpacity);
  updateLabel(subLabel, headerOpacity);

  // ---- receptors / AC glow ----
  const rGlow = receptorGlow(t);
  const gSplit = gSplitLevel(t);
  const gTravel = gTravelLevel(t);
  const acGlowNow = acGlow(t);
  ac.userData.mat.emissive.copy(ac.userData.baseColor).multiplyScalar(0.5 * acGlowNow);
  updateLabel(acLabel, headerOpacity);

  for (const r of receptors) {
    r.g.userData.mat.emissive.copy(r.g.userData.baseColor).multiplyScalar(0.5 * rGlow);
    updateLabel(r.label, headerOpacity);

    // normal ligand: staggered binding, then staggered detach into the fibrotic act
    const bindStart = 4 + r.delay * 3;
    const leaveStart = STAGES.fibrotic[0] + r.delay * 2;
    if (t < bindStart) {
      r.ligandNormal.visible = false;
    } else if (t < leaveStart) {
      r.ligandNormal.visible = true;
      lerpV3(r.ligandNormal.position, r.ligandStartPos, r.dockPos, smoothstep((t - bindStart) / 5));
    } else if (t < leaveStart + 4) {
      const leaveT = smoothstep((t - leaveStart) / 4);
      lerpV3(r.ligandNormal.position, r.dockPos, r.ligandExitPos, leaveT);
      r.ligandNormal.visible = leaveT < 0.98;
    } else {
      r.ligandNormal.visible = false;
    }

    // treprostinil ligand: staggered rebinding during the treated act
    const tBindStart = STAGES.treated[0] + r.delay * 3;
    if (t < tBindStart) {
      r.ligandTreprostinil.visible = false;
    } else {
      r.ligandTreprostinil.visible = true;
      lerpV3(r.ligandTreprostinil.position, r.ligandStartPos, r.dockPos, smoothstep((t - tBindStart) / 5));
    }

    // G protein: split near the receptor, then Gα travels to the adenylate cyclase
    r.gprotein.position.copy(r.gDockPos);
    r.gprotein.visible = t >= 8;
    r.gprotein.userData.bg.position.x = lerp(0, -0.55, gSplit);
    const alphaTarget = acActiveSite.clone().add(r.alphaTargetOffset).sub(r.gprotein.position);
    lerpV3(r.gprotein.userData.alpha.position, new THREE.Vector3(0, 0, 0), alphaTarget, gTravel);
    r.gprotein.userData.bg.visible = gTravel < 0.98;
    r.gprotein.userData.alphaMat.emissive.set(COL.galpha).multiplyScalar(0.4 * gSplit);
  }

  // ---- ATP -> cAMP conversion loop ----
  const cActive = convActive(t);
  const cycleLen = 2.6;
  const cycleStartT = t < 42 ? 19 : 61.5;
  for (const c of converters) {
    if (!cActive) { c.atp.visible = false; c.camp.visible = false; continue; }
    const localT = ((t - cycleStartT) / cycleLen + c.phase) % 1;
    const rising = localT < 0.35, atStage = localT >= 0.35 && localT < 0.55, leaving = localT >= 0.55;
    c.atp.visible = rising || atStage;
    c.camp.visible = leaving;
    if (rising) {
      const lp = smoothstep(localT / 0.35);
      const from = new THREE.Vector3(acActiveSite.x + c.lane, -4.2, c.lane * 0.6);
      const to = acActiveSite.clone().add(new THREE.Vector3(c.lane * 0.3, 0, 0));
      lerpV3(c.atp.position, from, to, lp);
    } else if (atStage) {
      c.atp.position.copy(acActiveSite).add(new THREE.Vector3(c.lane * 0.3, 0, 0));
      c.atp.scale.setScalar(1 - 0.3 * smoothstep((localT - 0.35) / 0.2));
    }
    if (leaving) {
      const lp = smoothstep((localT - 0.55) / 0.45);
      const from = acActiveSite.clone().add(new THREE.Vector3(c.lane * 0.3, 0, 0));
      const to = new THREE.Vector3(acActiveSite.x + c.lane * 2.2, -4.4 - lp * 1.2, c.lane * 1.4);
      lerpV3(c.camp.position, from, to, lp);
      c.camp.rotation.y = t * 1.5 + c.driftSeed;
    }
  }
  updateLabel(atpLabel, cActive ? 1 : 0);
  updateLabel(campMoleculeLabel, cActive ? 1 : 0);

  // ---- G protein subunit labels (shown once, during the first activation) ----
  const gLabelOpacity = sampleCurve(t, [[10, 0], [12, 1], [19, 1], [21, 0]]);
  updateLabel(gAlphaLabel, gLabelOpacity);
  updateLabel(gBetaGammaLabel, gLabelOpacity);

  // ---- cAMP meter + cloud ----
  const level = campLevel(t);
  meterEl.style.opacity = String(t > 10 && t < STAGES.outro[0] ? 1 : 0);
  meterLabel.style.opacity = meterEl.style.opacity;
  meterFill.style.height = (level * 100).toFixed(1) + '%';
  for (const p of cloudParticles) {
    const on = level > p.order;
    p.mesh.visible = on;
    const bob = Math.sin(t * 1.3 + p.seed) * 0.08;
    p.mesh.position.set(p.basePos.x, p.basePos.y + bob, p.basePos.z);
    p.mesh.scale.setScalar(0.4 + 0.6 * smoothstep((level - p.order) / 0.06));
  }

  // ---- nucleus / DNA ----
  nucleusMat.opacity = 0.2 + 0.28 * level;
  dna.rotation.y = t * 0.22;
  for (const m of dna.userData.mats) m.emissive.copy(m.color).multiplyScalar(0.28 * level);
  const nucleusText = t < STAGES.fibrotic[0] ? 'Antifibrotic effect — active' : t < 59 ? 'Antifibrotic effect — reduced' : 'Antifibrotic effect — increases';
  nucleusLabel.el.textContent = nucleusText;
  updateLabel(nucleusLabel, headerOpacity);

  // ---- downstream effects card ----
  let dsTitle, dsLines;
  if (t < STAGES.fibrotic[0]) { dsTitle = 'DOWNSTREAM EFFECTS'; dsLines = ['Vasodilation', 'Antiproliferation', 'Anti-inflammation']; }
  else if (t < 59) { dsTitle = 'DOWNSTREAM EFFECTS (REDUCED)'; dsLines = ['↓ Vasodilation', '↓ Antiproliferation', '↓ Anti-inflammation']; }
  else { dsTitle = 'DOWNSTREAM EFFECTS (INCREASED)'; dsLines = ['↑ Vasodilation', '↑ Antiproliferation', '↑ Anti-inflammation']; }
  const cardOpacity = sampleCurve(t, [[28, 0], [31, 1]]);
  updateCard(downstreamCard, dsTitle, dsLines, cardOpacity);

  // ---- PPARbeta branch ----
  const ppOp = pparOpacity(t);
  updateLabel(pparLabel, ppOp);
  updateCard(pparCard, 'TARGET GENE REGULATION', [
    '↓ Fibroblast proliferation', '↓ Profibrotic gene expression', '↓ ECM synthesis', '↓ Pulmonary inflammation / fibrosis',
  ], ppOp);
  pparArrowMat.opacity = 0.5 * ppOp;
  pparGroup.visible = ppOp > 0.02;
  pparArrow1.visible = ppOp > 0.02;
  pparArrow2.visible = ppOp > 0.02;

  // ---- captions ----
  updateCaptionTrack(t);

  bokehPass.uniforms['focus'].value = camPos.distanceTo(camTarget);
  composer.render();
}

// initialize once
setSceneTime(0);

window.setSceneTime = setSceneTime;
window.renderOnce = () => composer.render();
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
