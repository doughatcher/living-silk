import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Living Silk — physically-based saree renderer (prototype)
// Takes a flat product photo and rebuilds it as a lit, draping cloth:
//   - silk sheen (anisotropic-ish soft specular)
//   - "zari" metalness derived from the bright/warm pixels of the photo itself
//   - dual-tone shot-silk: a view-angle hue shift driven by Fresnel
// Nothing here is generated. The real photo is the texture; we render light.
// ---------------------------------------------------------------------------

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = (() => {                 // soft studio gradient (kept below bloom threshold)
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ece7de'); g.addColorStop(0.55, '#e4ded3'); g.addColorStop(1, '#d6cfc3');
  x.fillStyle = g; x.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// soft fill + a moving key light that makes highlights sweep across the cloth
const hemi = new THREE.HemisphereLight(0xfff6e8, 0xd8d0c4, 0.5);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0d8, 1.55);
key.position.set(2.4, 1.6, 3.2);
scene.add(key);
const rim = new THREE.DirectionalLight(0xbfc8ff, 0.45);
rim.position.set(-3, 1, -2);
scene.add(rim);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 9;
controls.enablePan = false;
controls.target.set(0, 0, 0);

// post-processing: a thresholded bloom so only the brightest zari glints sparkle
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// --- cloth geometry: a tall hanging panel we displace into folds ---------
const SEG_X = 70, SEG_Y = 104;
let PLANE_W = 2.0, PLANE_H = 3.0;            // updated to match photo aspect
const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H, SEG_X, SEG_Y);
const base = geo.attributes.position.array.slice();   // rest positions

const mat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.55,
  metalness: 0.0,
  sheen: 0.85,
  sheenRoughness: 0.35,
  sheenColor: new THREE.Color(0xfff3da),
  anisotropy: 0.5,
  anisotropyRotation: Math.PI / 2,   // silk highlight streaks run with the fall of the cloth
  clearcoat: 0.18,
  clearcoatRoughness: 0.5,
  envMapIntensity: 0.9,
  vertexColors: true,
  side: THREE.DoubleSide,
});

// dual-tone shot-silk injection ------------------------------------------------
const settings = { shotAmount: 0.0, shotColor: new THREE.Color(0xc9a24a) };
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uShotColor = { value: settings.shotColor };
  shader.uniforms.uShotAmount = { value: settings.shotAmount };
  shader.fragmentShader =
    'uniform vec3 uShotColor;\nuniform float uShotAmount;\n' +
    shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      {
        vec3 vDir = normalize( vViewPosition );
        float fres = pow( 1.0 - clamp( dot( normalize( normal ), vDir ), 0.0, 1.0 ), 2.5 );
        diffuseColor.rgb = mix( diffuseColor.rgb, uShotColor, fres * uShotAmount );
      }`
    );
  mat.userData.shader = shader;
};

function ensureColor(g) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
}
ensureColor(geo);

const cloth = new THREE.Mesh(geo, mat);
cloth.position.y = 0.24;            // lift so the hem clears the bottom dock
scene.add(cloth);

// soft contact shadow to ground the cloth on the light studio backdrop
function radialAlphaTex() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(40,32,26,0.5)'); g.addColorStop(0.55, 'rgba(40,32,26,0.2)'); g.addColorStop(1, 'rgba(40,32,26,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3.6),
  new THREE.MeshBasicMaterial({ map: radialAlphaTex(), transparent: true, depthWrite: false })
);
shadow.position.set(0.12, 0.06, -0.8);
shadow.scale.set(1.15, 1.2, 1);
scene.add(shadow);

// --- build albedo + a zari metalness map from a photo --------------------
const texLoader = new THREE.TextureLoader();
texLoader.crossOrigin = 'anonymous';

function buildFromImage(img, title) {
  // fit the plane to the photo's aspect ratio
  const aspect = img.naturalWidth / img.naturalHeight || 0.667;
  PLANE_H = 2.7;
  PLANE_W = PLANE_H * aspect;
  rebuildGeometry();

  // albedo
  const albedo = new THREE.Texture(img);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = renderer.capabilities.getMaxAnisotropy();
  albedo.needsUpdate = true;
  mat.map = albedo;

  // derive zari (metal) + roughness from pixel luminance & warmth
  try {
    const W = 512, H = Math.round(512 / aspect);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    const mCan = document.createElement('canvas'); mCan.width = W; mCan.height = H;
    const rCan = document.createElement('canvas'); rCan.width = W; rCan.height = H;
    const mCtx = mCan.getContext('2d'), rCtx = rCan.getContext('2d');
    const mImg = mCtx.createImageData(W, H), rImg = rCtx.createImageData(W, H);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const warmth = Math.max(0, (r - b) / 255);          // gold/zari is warm + bright
      // bright threads become metal; warmth pushes it harder
      let metal = smoothstep(0.55, 0.92, luma) * (0.45 + 1.1 * Math.min(1, warmth * 1.8));
      metal = Math.min(1, metal);
      const rough = lerp(0.62, 0.16, metal);              // metal threads are smoother
      const mv = Math.round(metal * 255), rv = Math.round(rough * 255);
      mImg.data[i] = mImg.data[i + 1] = mImg.data[i + 2] = mv; mImg.data[i + 3] = 255;
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = rv; rImg.data[i + 3] = 255;
    }
    mCtx.putImageData(mImg, 0, 0); rCtx.putImageData(rImg, 0, 0);

    const mTex = new THREE.CanvasTexture(mCan); mTex.colorSpace = THREE.NoColorSpace;
    const rTex = new THREE.CanvasTexture(rCan); rTex.colorSpace = THREE.NoColorSpace;
    mat.metalnessMap = mTex;
    mat.roughnessMap = rTex;

    // woven micro-relief: a normal map embossed from the photo's own weave + motifs,
    // so threads and zari catch light with real surface texture instead of looking printed
    const nCan = document.createElement('canvas'); nCan.width = W; nCan.height = H;
    const nCtx = nCan.getContext('2d'); const nImg = nCtx.createImageData(W, H);
    const lum = (idx) => { const j = idx * 4; return (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255; };
    const S = 2.4;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const xl = x > 0 ? x - 1 : x, xr = x < W - 1 ? x + 1 : x;
        const yt = y > 0 ? y - 1 : y, yb = y < H - 1 ? y + 1 : y;
        let nx = -(lum(y * W + xr) - lum(y * W + xl)) * S;
        let ny = -(lum(yb * W + x) - lum(yt * W + x)) * S;
        let nz = 1;
        const inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv;
        const o = (y * W + x) * 4;
        nImg.data[o] = (nx * 0.5 + 0.5) * 255;
        nImg.data[o + 1] = (ny * 0.5 + 0.5) * 255;
        nImg.data[o + 2] = (nz * 0.5 + 0.5) * 255;
        nImg.data[o + 3] = 255;
      }
    }
    nCtx.putImageData(nImg, 0, 0);
    const nTex = new THREE.CanvasTexture(nCan); nTex.colorSpace = THREE.NoColorSpace;
    mat.normalMap = nTex; mat.normalScale.set(0.45, 0.45);
  } catch (e) {
    // tainted canvas (non-CORS image): fall back to flat material, still looks good
    mat.metalnessMap = null; mat.roughnessMap = null; mat.normalMap = null;
    console.warn('zari/relief maps skipped (CORS):', e.message);
  }
  mat.needsUpdate = true;
  if (title) setCaption(title);
  loadingOff();
}

function loadSari(src, title) {
  loadingOn();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => buildFromImage(img, title);
  img.onerror = () => { loadingOff(); toast("Couldn't load that image. Try a different link, or pick a sample below."); };
  img.src = src;
}

let baseArr = base;
function rebuildGeometry() {
  const g = new THREE.PlaneGeometry(PLANE_W, PLANE_H, SEG_X, SEG_Y);
  ensureColor(g);
  cloth.geometry.dispose();
  cloth.geometry = g;
  baseArr = g.attributes.position.array.slice();
}

// --- helpers --------------------------------------------------------------
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// --- fold animation -------------------------------------------------------
let drape = 0.55, lightSpeed = 0.45, autoSpin = false;
let sheenBase = 0.85, metalBase = 0.0;
let flatTarget = 0, flatT = 0;          // compare-to-flat reveal
const clock = new THREE.Clock();

function animate() {
  const t = clock.getElapsedTime();
  flatT += (flatTarget - flatT) * 0.06;
  const drapeEff = drape * (1 - flatT);

  const pos = cloth.geometry.attributes.position;
  const colAttr = cloth.geometry.attributes.color;
  const arr = pos.array, col = colAttr.array, b = baseArr;
  const halfH = PLANE_H * 0.5, halfW = PLANE_W * 0.5;
  for (let i = 0; i < arr.length; i += 3) {
    const x = b[i], y = b[i + 1];
    const hang = (halfH - y) / PLANE_H;                 // 0 at top, ~1 at bottom
    const nx = x / halfW;
    const bow = (1 - nx * nx) * 0.10 * PLANE_W * (1 - flatT * 0.85);
    const fold =
      Math.sin(x * 3.1 + t * 0.9) * 0.5 +
      Math.sin(y * 2.0 - t * 0.7) * 0.3 +
      Math.sin((x + y) * 4.3 + t * 1.3) * 0.2 +
      Math.sin(x * 7.4 - t * 0.5) * 0.12;               // finer wrinkle octave
    const z = bow + fold * 0.15 * PLANE_W * drapeEff * (0.25 + hang);
    arr[i + 2] = z;
    // fake ambient occlusion: valleys/back darken, crests lift -> reads as heavy cloth
    const shade = Math.min(1.1, Math.max(0.6, 0.85 + z * 0.95));
    col[i] = col[i + 1] = col[i + 2] = shade;
  }
  pos.needsUpdate = true;
  colAttr.needsUpdate = true;
  cloth.geometry.computeVertexNormals();

  // sweep the key light so highlights travel across the zari (calms in flat mode)
  const a = t * lightSpeed * (1 - flatT * 0.9);
  key.position.set(Math.cos(a) * 3.2, 1.4 + Math.sin(a * 0.6) * 0.8, 3.0 + Math.sin(a) * 0.6);
  // slow drift of the studio reflections so the silk never looks static
  scene.environmentRotation.y = t * 0.04 * (1 - flatT);

  // ease material toward the raw photo when comparing
  if (mat.userData.shader) mat.userData.shader.uniforms.uShotAmount.value = settings.shotAmount * (1 - flatT);
  mat.sheen = sheenBase * (1 - flatT * 0.9);
  mat.metalness = metalBase * (1 - flatT * 0.85);
  shadow.material.opacity = 1 - flatT;

  if (flatTarget) cloth.rotation.y *= 0.92;             // face front for the comparison
  else if (autoSpin) cloth.rotation.y = Math.sin(t * 0.25) * 0.5;

  controls.update();
  composer.render();
  requestAnimationFrame(animate);
}

// --- UI -------------------------------------------------------------------
const capTitle = document.getElementById('capTitle');
const setCaption = (s) => capTitle.textContent = s;
const loadingEl = document.getElementById('loading');
const loadingOn = () => loadingEl.classList.add('on');
const loadingOff = () => loadingEl.classList.remove('on');
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = 'none', 4200);
}

const rail = document.getElementById('rail');
let SARIS = [];
function applyPreset(s) {
  cSheen.value = s.sheen; cMetal.value = s.metal; cShot.value = s.shot;
  cShotColor.value = s.shotColor || '#c9a24a';
  renderer.toneMappingExposure = s.exp || 1.05;   // per-fabric exposure (tame bright silks, lift dark)
  syncMaterialFromControls();
}
// neutral, faithful starting point for pasted / picked images (no inherited dual-tone)
const NEUTRAL = { sheen: 0.85, metal: 0.8, shot: 0, shotColor: '#c9a24a', exp: 1.05 };

fetch('./saris.json').then(r => r.json()).then(list => {
  SARIS = list;
  list.forEach((s, idx) => {
    const im = document.createElement('img');
    im.src = s.file; im.alt = s.title; im.title = s.title;
    im.addEventListener('click', () => {
      document.querySelectorAll('.rail img').forEach(n => n.classList.remove('active'));
      im.classList.add('active');
      applyPreset(s);
      loadSari(s.file, s.title);
    });
    if (idx === 0) im.classList.add('active');
    rail.appendChild(im);
  });
  // default
  applyPreset(list[0]);
  loadSari(list[0].file, list[0].title);
});

// controls
const cSheen = document.getElementById('cSheen'), vSheen = document.getElementById('vSheen');
const cMetal = document.getElementById('cMetal'), vMetal = document.getElementById('vMetal');
const cShot = document.getElementById('cShot'), vShot = document.getElementById('vShot');
const cShotColor = document.getElementById('cShotColor');
const cDrape = document.getElementById('cDrape'), vDrape = document.getElementById('vDrape');
const cLight = document.getElementById('cLight'), vLight = document.getElementById('vLight');
const cSpin = document.getElementById('cSpin');
cDrape.value = drape; cLight.value = lightSpeed;

function syncMaterialFromControls() {
  sheenBase = +cSheen.value; mat.sheen = sheenBase; vSheen.textContent = sheenBase.toFixed(2);
  metalBase = +cMetal.value; mat.metalness = metalBase; vMetal.textContent = metalBase.toFixed(2);
  settings.shotAmount = +cShot.value; vShot.textContent = (+cShot.value).toFixed(2);
  settings.shotColor.set(cShotColor.value);
  if (mat.userData.shader) {
    mat.userData.shader.uniforms.uShotAmount.value = settings.shotAmount;
    mat.userData.shader.uniforms.uShotColor.value = settings.shotColor;
  }
  drape = +cDrape.value; vDrape.textContent = (+cDrape.value).toFixed(2);
  lightSpeed = +cLight.value; vLight.textContent = (+cLight.value).toFixed(2);
}
[cSheen, cMetal, cShot, cShotColor, cDrape, cLight].forEach(el =>
  el.addEventListener('input', syncMaterialFromControls));
cSpin.addEventListener('change', () => { autoSpin = cSpin.checked; if (!autoSpin) cloth.rotation.y = 0; });

document.getElementById('gear').addEventListener('click', () =>
  document.getElementById('panel').classList.toggle('open'));
// start collapsed on small screens so the panel doesn't cover the silk
if (matchMedia('(max-width:560px)').matches) document.getElementById('panel').classList.remove('open');

// compare-to-original-photo reveal
const compareBtn = document.getElementById('compare');
compareBtn.addEventListener('click', () => {
  flatTarget = flatTarget ? 0 : 1;
  compareBtn.classList.toggle('on', !!flatTarget);
  compareBtn.textContent = flatTarget ? 'Back to living silk' : 'Compare to original photo';
});

// URL / product-link loader -----------------------------------------------
document.getElementById('urlform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = document.getElementById('urlinput').value.trim();
  if (!raw) return;
  document.querySelectorAll('.rail img').forEach(n => n.classList.remove('active'));

  if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(raw) || /cdn\.shopify\.com/i.test(raw)) {
    applyPreset(NEUTRAL);
    loadSari(raw, prettyTitleFromUrl(raw));
    return;
  }
  // treat as a product page URL -> resolve ALL images, let the user choose
  loadingOn();
  try {
    const { title, images } = await resolveProductImages(raw);
    loadingOff();
    showPicker(title, images);
  } catch (err) {
    loadingOff();
    toast('Could not read that product page. Paste a direct image address, or pick a sample.');
  }
});

// image chooser shown after a product link resolves
const picker = document.getElementById('picker');
const pickerGrid = document.getElementById('pickerGrid');
const pickerTitle = document.getElementById('pickerTitle');
function showPicker(title, images) {
  pickerTitle.textContent = title || 'Choose an image';
  pickerGrid.innerHTML = '';
  images.forEach((src) => {
    const im = document.createElement('img');
    im.src = src + (src.includes('?') ? '&' : '?') + 'width=240';
    im.loading = 'lazy';
    im.addEventListener('click', () => {
      hidePicker();
      document.querySelectorAll('.rail img').forEach(n => n.classList.remove('active'));
      applyPreset(NEUTRAL);
      loadSari(src, title);
    });
    pickerGrid.appendChild(im);
  });
  picker.classList.add('open');
}
function hidePicker() { picker.classList.remove('open'); }
document.getElementById('pickerClose').addEventListener('click', hidePicker);
picker.addEventListener('click', (e) => { if (e.target === picker) hidePicker(); });

function prettyTitleFromUrl(u) {
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean).pop() || 'Saree';
    return seg.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').replace(/\b\w/g, c => c.toUpperCase());
  } catch { return 'Saree'; }
}

// Order images so fabric/border close-ups come first, model shots last.
function sortImages(imgs) {
  const order = { C: 0, PB: 1, PP: 2, B: 3, M: 5 };
  const rank = (s) => {
    const m = s.match(/_([A-Z]{1,2})\.(?:jpg|jpeg|png|webp)/i);
    const k = m ? m[1].toUpperCase() : '';
    return k in order ? order[k] : 4;
  };
  return [...imgs].sort((a, b) => rank(a) - rank(b));
}

// Resolve a Shopify product URL -> all images (sorted). Our Cloudflare Worker
// first (no CORS limits, Shopify-host restricted), public proxies as fallback.
const RESOLVER = 'https://living-silk-resolver.doug-hatcher.workers.dev';
async function resolveProductImages(productUrl) {
  try {
    const res = await fetch(`${RESOLVER}/?url=${encodeURIComponent(productUrl)}`, { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (d.images && d.images.length) return { title: d.title || prettyTitleFromUrl(productUrl), images: sortImages(d.images) };
    }
  } catch (_) { /* fall through to proxies */ }

  const u = new URL(productUrl);
  const jsonUrl = `${u.origin}${u.pathname.replace(/\/$/, '')}.json`;
  const proxies = [
    t => `https://api.allorigins.win/raw?url=${encodeURIComponent(t)}`,
    t => `https://corsproxy.io/?url=${encodeURIComponent(t)}`,
  ];
  for (const p of proxies) {
    try {
      const res = await fetch(p(jsonUrl), { cache: 'no-store' });
      if (!res.ok) continue;
      const data = JSON.parse(await res.text());
      const prod = data.product || data;
      const imgs = (prod.images || []).map(i => i.src || i);
      if (imgs.length) return { title: prod.title || prettyTitleFromUrl(productUrl), images: sortImages(imgs) };
    } catch (_) { /* try next */ }
  }
  throw new Error('unresolved');
}

// --- resize + go ----------------------------------------------------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
animate();
