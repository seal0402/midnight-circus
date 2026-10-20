import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildBlackHole, buildEffects } from './effects_first.js?v=50';
import { createSectionReader, sections } from './sections.js?v=59';

const host = document.getElementById('stage');
const loadingEl = document.getElementById('loading');
const barEl = document.getElementById('bar');
const pctEl = document.getElementById('pct');
const errEl = document.getElementById('err');
const tipEl = document.getElementById('tip');

const params = new URLSearchParams(location.search);
// 电脑和手机都使用完整 195.8 万面模型；只按设备调整贴图分辨率。
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
const MODEL_URL = isMobile && !params.has('full') ? './model_draco.glb' : './model_full_draco.glb';

const DEFAULT_ZOOM = 1.5;

const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);

scene.add(new THREE.HemisphereLight(0xffe6cf, 0x140d16, 1.5));
const key = new THREE.DirectionalLight(0xffe1bd, 2.8);
key.position.set(-1.4, 2.2, 1.8);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fa8ff, 1.3);
rim.position.set(1.6, 1.1, -1.9);
scene.add(rim);
const bounce = new THREE.DirectionalLight(0xffc98f, 0.5);
bounce.position.set(0, -1, 1.2);
scene.add(bounce);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.rotateSpeed = 0.85;
controls.enableRotate = false;   // 不允许转动
controls.enableZoom = false;     // 不允许缩放
controls.enablePan = false;      // 不允许平移
controls.zoomSpeed = 0.8;
controls.minPolarAngle = Math.PI / 2 - THREE.MathUtils.degToRad(20);   // 最多往下看 20°
controls.maxPolarAngle = Math.PI / 2;   // 不允许往上抬
controls.autoRotate = false;   // 不自动转
controls.autoRotateSpeed = isMobile ? 0.9 : 1.4;

let resumeTimer = null;
const stopAuto = () => { controls.autoRotate = false; clearTimeout(resumeTimer); tipEl.classList.add('hide'); };
const resumeAuto = () => { clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { controls.autoRotate = false; }, 700); };
renderer.domElement.addEventListener('pointerdown', stopAuto);
// 滑动切换：一次一格 60°，只转模型，不转相机
let swipeNext = 0, swipeNextY = 0, swipeNextDown = false;
renderer.domElement.addEventListener('pointerdown', (e) => { swipeNextDown = true; swipeNext = e.clientX; swipeNextY = e.clientY; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!swipeNextDown) return;
  swipeNextDown = false;
  if (focusState) return;
  const dx = e.clientX - swipeNext, dy = e.clientY - swipeNextY;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    pendingSection = null;
    yawTarget += (dx > 0 ? 1 : -1) * Math.PI / 3;   // 往右划 → 下一个
  }
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => renderer.domElement.addEventListener(ev, resumeAuto));
renderer.domElement.addEventListener('wheel', () => {
  clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { controls.autoRotate = false; }, 900);
}, { passive: true });

const clock = new THREE.Clock();
const swayers = [];
const flagUniform = { value: 0 };
let fx = null;
let portals = [];
let tentMeshes = [];
let paused = false;
let modelRoot = null;
let modelYaw = 0;
let yawTarget = 0;
let animTime = 0;
let pendingSection = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// 用户指定的部件编号（含镜像件）
// 按样例部件匹配出的成套部件（每组含左右/绕圈的同一款）
const SETS = [
  { name: 'pennant', ids: [54, 69, 169],        axis: 'z', amp: 0.22,  speed: 2.2 },  // 绳上三角旗
  { name: 'lantern', ids: [70, 77, 92, 124, 165], axis: 'x', amp: 0.110, speed: 1.2 },  // 吊灯
  { name: 'curtain', ids: [88, 100, 112, 121],  axis: 'z', amp: 0.120, speed: 0.9 },  // 门洞帘子
  { name: 'drape',   ids: [10, 13],             axis: 'z', amp: 0.100, speed: 0.8 },  // 垂帘
  { name: 'valance', ids: [32, 46],             axis: 'x', amp: 0.045, speed: 1.0 },  // 横幔
];
// 9 号等整根角柱+绳子的整件是结构件，不动
function cfgFor(n) { return SETS.find((s) => s.ids.includes(n)) || null; }

function partNumber(name) {
  const m = /^tripo_part_(\d+)(_mir)?$/.exec(name);
  return m ? { n: parseInt(m[1], 10), mir: !!m[2] } : null;
}

function wrapSway(obj, cfg, seed) {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  const holder = new THREE.Group();
  holder.position.set(c.x, box.max.y, c.z);
  obj.parent.add(holder);
  holder.attach(obj);
  swayers.push({ holder, axis: cfg.axis, amp: cfg.amp, speed: cfg.speed, phase: seed });
}

function applyFlagWind(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlag = flagUniform;
    shader.vertexShader = 'uniform float uFlag;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'float w = smoothstep(0.0, 0.30, position.x);\n' +
      'transformed.y += sin(position.x * 13.0 + uFlag * 3.2) * 0.020 * w;\n' +
      'transformed.z += cos(position.x * 9.0 + uFlag * 2.1) * 0.014 * w;\n' +
      'transformed.y += sin(uFlag * 1.3) * 0.005 * w;\n'
    );
  };
  mat.needsUpdate = true;
}

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('./vendor/draco/');
loader.setDRACOLoader(draco);

loader.load(
  MODEL_URL,
  (gltf) => {
    const root = gltf.scene;
    const flagMats = new Set();

    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m) { m.side = THREE.DoubleSide; m.needsUpdate = true; } });
    });

    // 归一化
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root);
    root.position.y -= b2.min.y;
    root.updateMatrixWorld(true);

    scene.add(root);
    modelRoot = root;

    // 按编号挑选摆动件 + 找顶部大旗
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const flagBox = new THREE.Box3();
    const tmp = new THREE.Vector3();

    meshes.forEach((o, i) => {
      const info = partNumber(o.name);
      const cfg = info ? cfgFor(info.n) : null;
      if (cfg) {
        wrapSway(o, cfg, (info.mir ? Math.PI : 0) + info.n * 0.37);
        return;
      }
      // 顶部大旗：最高、横向展开的单件
      flagBox.setFromObject(o);
      flagBox.getSize(tmp);
      if (flagBox.max.y > 0.86 && tmp.x > 0.12) {
        // 所有部件共用一个材质，必须克隆，否则整顶帐篷都会被吹动
        if (Array.isArray(o.material)) {
          o.material = o.material.map((m) => { const c = m.clone(); applyFlagWind(c); return c; });
        } else if (o.material) {
          const c = o.material.clone();
          applyFlagWind(c);
          o.material = c;
        }
        flagMats.add(o.uuid);
      }
    });

    console.log('SWAY', swayers.length, 'FLAGMATS', flagMats.size);

    const bb = new THREE.Box3().setFromObject(root);
    const h = bb.getSize(new THREE.Vector3()).y;

    // 按包围球 + 实际宽高比取景，竖屏手机也能完整入画
    const sphere = bb.getBoundingSphere(new THREE.Sphere());
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = (host.clientWidth || window.innerWidth) / Math.max(1, host.clientHeight || window.innerHeight);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const dist = sphere.radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.05 / DEFAULT_ZOOM;
    fitSphere = sphere;
    fitPoints = meshes.flatMap((mesh) => {
      const vertices = mesh.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(vertices.count / 256));
      const points = [];
      for (let i = 0; i < vertices.count; i += stride) {
        points.push(new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld));
      }
      return points;
    });
    controls.target.copy(sphere.center);
    camera.position.set(controls.target.x, controls.target.y + 0.12, controls.target.z + 2.6);
    controls.minDistance = dist * 0.72;
    controls.maxDistance = dist * 3.3;
    controls.update();
    if (host.clientWidth <= 700) fitCamera();
    updateOpeningPosition();
    const radius = Math.max(bb.getSize(new THREE.Vector3()).x, bb.getSize(new THREE.Vector3()).z) / 2;
    const hole = buildBlackHole(root, radius, h);
    fx = buildEffects(root, hole.r, h, camera, isMobile);
    portals = fx.portals;
    tentMeshes = meshes;
    const initialSection = sections.findIndex(section => '#' + section.id === location.hash);
    if (initialSection >= 0) selectSection(initialSection);
    if (new URLSearchParams(location.search).get('testpanel') !== null && portals.length) {
      const index = Math.max(0, Math.min(5, Number(params.get('testpanel')) || 0));
      setTimeout(() => selectSection(index), 800);
    }


    loadingEl.classList.add('done');
    setTimeout(() => { loadingEl.hidden = true; }, 600);
    setTimeout(() => tipEl.classList.add('hide'), 6000);
  },
  (evt) => {
    if (evt.total) {
      const p = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
      barEl.style.width = p + '%';
      pctEl.textContent = p + '%';
    } else {
      pctEl.textContent = (evt.loaded / 1048576).toFixed(1) + ' MB';
    }
  },
  (err) => {
    console.error(err);
    loadingEl.hidden = true;
    errEl.style.display = 'flex';
  }
);

let fitSphere = null;
let fitPoints = [];

// Keep the opening below the projected model without changing its framing.
function updateOpeningPosition() {
  if (focusState || !fitPoints.length) return;
  camera.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let bottom = 0;
  for (const vertex of fitPoints) {
    point.copy(vertex).project(camera);
    bottom = Math.max(bottom, (1 - point.y) * host.clientHeight / 2);
  }
  document.querySelector('.opening')?.style.setProperty('--overview-bottom', Math.ceil(bottom) + 'px');
}

function mobileOverviewFrame() {
  const view = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
  const target = fitSphere.center.clone();
  const direction = new THREE.Vector3(0, 0.12, 2.6).normalize();
  const tangent = Math.tan(THREE.MathUtils.degToRad(view.fov) / 2);
  let distance = fitSphere.radius / (tangent * view.aspect);
  const projected = new THREE.Vector3();
  function bounds() {
    view.position.copy(target).addScaledVector(direction, distance);
    view.lookAt(target);
    view.updateMatrixWorld(true);
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (const point of fitPoints) {
      projected.copy(point).project(view);
      left = Math.min(left, projected.x);
      right = Math.max(right, projected.x);
      bottom = Math.min(bottom, projected.y);
      top = Math.max(top, projected.y);
    }
    return { left, right, bottom, top };
  }
  for (let i = 0; i < 8; i++) {
    const box = bounds();
    distance *= (box.right - box.left) / 1.5;
  }
  // Align the projected bottom to the screen midpoint without tilting the view.
  for (let i = 0; i < 4; i++) {
    const box = bounds();
    const up = new THREE.Vector3().setFromMatrixColumn(view.matrixWorld, 1);
    target.addScaledVector(up, box.bottom * distance * tangent);
  }
  bounds();
  return { position: view.position.clone(), target, distance };
}

function fitCamera() {
  if (!fitSphere) return;
  if (focusState) {
    startFocusTransition(focusTransition?.entering !== false);
    return;
  }
  if (host.clientWidth <= 700 && fitPoints.length) {
    const frame = mobileOverviewFrame();
    camera.position.copy(frame.position);
    controls.target.copy(frame.target);
    controls.minDistance = frame.distance * 0.72;
    controls.maxDistance = frame.distance * 3.3;
    controls.update();
    return;
  }
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = (host.clientWidth || window.innerWidth) / Math.max(1, host.clientHeight || window.innerHeight);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const dist = fitSphere.radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.05 / DEFAULT_ZOOM;
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (dir.lengthSq() < 1e-8) dir.set(0.32, 0.09, 0.95);
  dir.normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.minDistance = dist * 0.72;
  controls.maxDistance = dist * 3.3;
  controls.update();
}

// Move the main camera into the selected doorway while its animation continues.
let focusState = null;
let focusTransition = null;
const overviewPixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
const reader = createSectionReader({ onSelect: selectSection, onClose: closePanel });
const focusLayer = reader.element;
const photoLayer = document.createElement('dialog');
photoLayer.className = 'image-page-overlay section-page';
photoLayer.setAttribute('aria-labelledby', 'image-page-title');
document.body.append(photoLayer);
const photoReader = createSectionReader({ standalone: true, mount: photoLayer,
  onSelect: selectSection, onClose: () => closePhotoPage() });
photoReader.element.classList.add('active', 'ready');
let photoIndex = null;
let photoReturnUrl = null;
let photoReturnFocus = null;
let photoNextSection = null;
photoLayer.addEventListener('cancel', event => { event.preventDefault(); closePhotoPage(); });

function openPhotoPage(index, fromHistory = false) {
  if (photoLayer.open && photoIndex === index) return;
  if (!photoLayer.open) {
    photoReturnFocus = document.activeElement;
    const url = new URL(location.href);
    if (sections.some(section => section.page && '#' + section.id === url.hash)) {
      url.hash = focusState ? sections[focusState.portal.userData.portal].id : '';
    }
    photoReturnUrl = fromHistory && history.state?.photoReturnUrl ? history.state.photoReturnUrl : url.href;
    if (!fromHistory) history.replaceState(history.state, '', photoReturnUrl);
  }
  if (!fromHistory) {
    const url = new URL(location.href);
    url.hash = sections[index].id;
    const state = { photoPage: true, photoReturnUrl };
    if (photoLayer.open) history.replaceState(state, '', url);
    else history.pushState(state, '', url);
  }
  pendingSection = null;
  photoIndex = index;
  photoReader.show(index);
  document.body.classList.add('photo-page-open');
  if (!photoLayer.open) photoLayer.showModal();
  photoLayer.scrollTop = 0;
  photoReader.focusBack();
}

function dismissPhotoPage() {
  if (photoReader.isImageOpen()) photoReader.closeImage();
  photoLayer.close();
  photoIndex = null;
  document.body.classList.remove('photo-page-open');
  photoReturnFocus?.focus({ preventScroll: true });
}

function closePhotoPage(nextIndex = null) {
  if (photoReader.isImageOpen()) { photoReader.closeImage(); return; }
  if (!photoLayer.open) return;
  photoNextSection = nextIndex;
  if (history.state?.photoPage) history.back();
  else {
    dismissPhotoPage();
    history.replaceState(null, '', photoReturnUrl);
    if (nextIndex !== null) selectSection(nextIndex);
  }
}
let downX = 0, downY = 0, dragged = false;

const readerPoint = new THREE.Vector3();
function updateReaderPosition() {
  if (!focusState) return;
  const portal = focusState.portal;
  portal.updateWorldMatrix(true, false);
  camera.updateMatrixWorld(true);
  const { width, height } = portal.geometry.parameters;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) {
    readerPoint.set(x, y, 0).applyMatrix4(portal.matrixWorld).project(camera);
    const px = (readerPoint.x + 1) * host.clientWidth / 2;
    const py = (1 - readerPoint.y) * host.clientHeight / 2;
    left = Math.min(left, px); right = Math.max(right, px);
    top = Math.min(top, py); bottom = Math.max(bottom, py);
  }
  // Keep the transparent reader within the opening, clear of the curtains.
  const readerWidth = Math.min((right - left) * .70, 680);
  const readerTop = Math.max(12, top + (bottom - top) * .13);
  const readerBottom = Math.min(host.clientHeight - 12, bottom - (bottom - top) * .10);
  const style = focusLayer.style;
  style.setProperty('--reader-left', ((left + right - readerWidth) / 2).toFixed(2) + 'px');
  style.setProperty('--reader-top', readerTop.toFixed(2) + 'px');
  style.setProperty('--reader-width', readerWidth.toFixed(2) + 'px');
  style.setProperty('--reader-height', Math.max(80, readerBottom - readerTop).toFixed(2) + 'px');
}

function setSectionHash(index) {
  const url = new URL(location.href);
  url.hash = sections[index].id;
  history.replaceState(null, '', url);
}

function selectSection(index) {
  if (!Number.isInteger(index) || !sections[index] || focusTransition) return;
  if (sections[index].page) { openPhotoPage(index); return; }
  if (photoLayer.open) { closePhotoPage(index); return; }
  if (!modelRoot || !portals.length) { pendingSection = index; return; }
  if (focusState) {
    if (reader.isImageOpen()) reader.closeImage();
    // Rotate the next physical doorway into the same focused position.
    modelYaw += (index - focusState.portal.userData.portal) * Math.PI / 3;
    yawTarget = modelYaw;
    modelRoot.rotation.y = modelYaw;
    modelRoot.updateMatrixWorld(true);
    focusState.portal = portals[index];
    if (fx) fx.setFocus(portals[index]);
    reader.show(index);
    setSectionHash(index);
    return;
  }
  const desired = index * Math.PI / 3;
  yawTarget = desired + Math.round((modelYaw - desired) / (Math.PI * 2)) * Math.PI * 2;
  pendingSection = index;
}

function syncLocation() {
  const index = sections.findIndex(section => '#' + section.id === location.hash);
  if (sections[index]?.page) { openPhotoPage(index, true); return; }
  if (photoLayer.open) {
    dismissPhotoPage();
    if (photoNextSection !== null) {
      const next = photoNextSection;
      photoNextSection = null;
      selectSection(next);
      return;
    }
  }
  if (index >= 0 && focusState?.portal.userData.portal !== index) selectSection(index);
  else if (!location.hash) closePanel();
}
window.addEventListener('hashchange', syncLocation);
window.addEventListener('popstate', syncLocation);

renderer.domElement.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; dragged = false; });
renderer.domElement.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragged = true; });
renderer.domElement.addEventListener('pointerup', (e) => { if (!dragged) pickPortal(e); });

function pickPortal(e) {
  if (focusState) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(portals.concat(tentMeshes), false);
  if (!hits.length) return;
  if (portals.includes(hits[0].object)) openPanel(hits[0].object, e);
}

function openPanel(portal) {
  if (focusState) return;
  if (sections[portal.userData.portal].page) {
    openPhotoPage(portal.userData.portal);
    return;
  }
  pendingSection = null;
  focusState = {
    portal,
    position: camera.position.clone(),
    target: controls.target.clone(),
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (fx) fx.setFocus(portal);
  reader.show(portal.userData.portal);
  setSectionHash(portal.userData.portal);
  focusLayer.classList.add('active');
  reader.focusBack();
  document.body.classList.add('portal-focused');
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  controls.minDistance = 0.01;
  controls.maxDistance = Infinity;
  yawTarget = modelYaw;
  startFocusTransition(true);
}

function startFocusTransition(entering) {
  const state = focusState;
  if (!state) return;
  let position = state.position.clone();
  let target = state.target.clone();
  if (entering) {
    modelRoot.updateMatrixWorld(true);
    target = state.portal.getWorldPosition(new THREE.Vector3());
    const normal = state.portal.getWorldDirection(new THREE.Vector3());
    const scale = state.portal.getWorldScale(new THREE.Vector3());
    const { width, height } = state.portal.geometry.parameters;
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distance = Math.max(height * scale.y / (2 * tangent), width * scale.x / (2 * tangent * camera.aspect)) * 1.04;
    position = target.clone().addScaledVector(normal, distance);
  } else if (fitSphere) {
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfFov = Math.min(Math.atan(tangent), Math.atan(tangent * camera.aspect));
    const distance = fitSphere.radius / Math.sin(halfFov) * 1.05 / DEFAULT_ZOOM;
    // Preserve the original framing unless the viewport changed during focus.
    if (state.aspect !== undefined && state.aspect !== camera.aspect) {
      if (host.clientWidth <= 700) {
        const frame = mobileOverviewFrame();
        position.copy(frame.position);
        target.copy(frame.target);
        state.minDistance = frame.distance * 0.72;
        state.maxDistance = frame.distance * 3.3;
      } else {
        target.copy(fitSphere.center);
        position.set(0, 0.12, 2.6).normalize().multiplyScalar(distance).add(target);
        state.minDistance = distance * 0.72;
        state.maxDistance = distance * 3.3;
      }
    }
  }
  focusTransition = {
    entering, start: performance.now(),
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100,
    fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
    position, target,
  };
  if (state.aspect === undefined) state.aspect = camera.aspect;
}

function closePanel() {
  if (reader.isImageOpen()) { reader.closeImage(); return; }
  if (!focusState || focusTransition?.entering === false) return;
  focusLayer.classList.remove('ready');
  startFocusTransition(false);
}

function updateFocus() {
  if (!focusTransition) return;
  const transition = focusTransition;
  const progress = transition.duration ? Math.min(1, (performance.now() - transition.start) / transition.duration) : 1;
  const eased = progress * progress * (3 - 2 * progress);
  camera.position.lerpVectors(transition.fromPosition, transition.position, eased);
  controls.target.lerpVectors(transition.fromTarget, transition.target, eased);
  if (progress < 1) return;
  focusTransition = null;
  if (transition.entering) {
    focusLayer.classList.add('ready');
    return;
  }
  controls.minDistance = focusState.minDistance;
  controls.maxDistance = focusState.maxDistance;
  const lastSection = focusState.portal.userData.portal;
  focusState = null;
  if (fx) fx.setFocus(null);
  renderer.setPixelRatio(overviewPixelRatio);
  focusLayer.classList.remove('active');
  document.body.classList.remove('portal-focused');
  document.querySelector('.chapter-menu [data-section-index="' + lastSection + '"]')?.focus({ preventScroll: true });
  focusLayer.classList.remove('expanded');
  const url = new URL(location.href);
  url.hash = '';
  history.replaceState(null, '', url);
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  updateOpeningPosition();
}

window.addEventListener('keydown', (e) => {
  if (photoLayer.open) {
    if (e.key === 'Escape') { e.preventDefault(); closePhotoPage(); }
    return;
  }
  if (e.key === 'Escape' && reader.isImageOpen()) { e.preventDefault(); reader.closeImage(); return; }
  if (e.key === 'Escape' && focusState) closePanel();
});

let exitGesture = null;
document.addEventListener('pointerdown', event => {
  exitGesture = null;
  if (photoLayer.open || !focusState || !focusLayer.classList.contains('ready') || reader.isImageOpen() ||
      !event.isPrimary || event.button !== 0 || event.target.closest('a, button, summary, dialog')) return;
  exitGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, vertical: false };
}, true);
document.addEventListener('pointermove', event => {
  if (!exitGesture || exitGesture.id !== event.pointerId) return;
  const dx = Math.abs(event.clientX - exitGesture.x);
  const dy = Math.abs(event.clientY - exitGesture.y);
  if (dy > 16 && dy > dx) exitGesture.vertical = true;
}, true);
document.addEventListener('pointercancel', () => { exitGesture = null; }, true);
document.addEventListener('pointerup', event => {
  const gesture = exitGesture;
  exitGesture = null;
  if (!gesture || gesture.id !== event.pointerId || !focusState || reader.isImageOpen()) return;
  const dx = Math.abs(event.clientX - gesture.x);
  const dy = Math.abs(event.clientY - gesture.y);
  if (!gesture.vertical && dx >= 60 && dx > dy * 1.5) { closePanel(); return; }
  if (Math.hypot(dx, dy) > 8 || event.target.closest('.focus-copy, .focus-back')) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  ndc.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
    -(event.clientY - bounds.top) / bounds.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects([focusState.portal, ...tentMeshes], false)[0];
  if (hit?.object !== focusState.portal) closePanel();
}, true);

function resize() {
  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  fitCamera();
  updateOpeningPosition();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (!paused) animTime += dt;
  // The opaque photo page hides the scene; retain it without rendering behind the dialog.
  if (photoLayer.open) return;
  const t = animTime;
  flagUniform.value = t;
  if (fx) fx.update(t);
  for (const s of swayers) {
    const v = Math.sin(t * s.speed + s.phase) * s.amp;
    if (s.axis === 'x') s.holder.rotation.x = v;
    else if (s.axis === 'y') s.holder.rotation.y = v;
    else s.holder.rotation.z = v;
  }
  if (modelRoot) {
    modelYaw += (yawTarget - modelYaw) * (1 - Math.exp(-9 * dt));
    modelRoot.rotation.y = modelYaw;
    if (pendingSection !== null && portals.length && !focusState && Math.abs(yawTarget - modelYaw) < 0.002) {
      const index = pendingSection;
      pendingSection = null;
      modelYaw = yawTarget;
      modelRoot.rotation.y = modelYaw;
      openPanel(portals[index]);
    }
  }
  updateFocus();
  controls.update();
  updateReaderPosition();
  if (fx) fx.render(renderer, camera);
  renderer.render(scene, camera);
});
