import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildBlackHole, buildEffects } from './effects_first.js?v=50';

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
    if (new URLSearchParams(location.search).get('testpanel') !== null && portals.length) {
      setTimeout(() => openPanel(portals[0], { clientX: innerWidth / 2, clientY: innerHeight / 2 }), 800);
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
const focusLayer = document.createElement('div');
focusLayer.className = 'portal-focus';
focusLayer.innerHTML = '<button class="focus-back" type="button" aria-label="返回帐篷" title="返回帐篷"><span aria-hidden="true">&#8592;</span></button><div class="focus-copy"><h1></h1><p></p></div>';
document.body.appendChild(focusLayer);
focusLayer.querySelector('button').addEventListener('click', closePanel);
const STORIES = [
  { title: '纸牌的失重时刻', text: '当纸牌不再落地，故事便有了另一种可能。' },
  { title: '在记忆的背面相遇', text: '那些散落的画面，在黑暗中重新相逢。' },
  { title: '时间在这里绕了个圈', text: '如果时间也会迷路，下一刻，会通往哪里？' },
];
let downX = 0, downY = 0, dragged = false;

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
  focusState = {
    portal,
    position: camera.position.clone(),
    target: controls.target.clone(),
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (fx) fx.setFocus(portal);
  const story = STORIES[(portal.userData.portal || 0) % STORIES.length];
  focusLayer.querySelector('h1').textContent = story.title;
  focusLayer.querySelector('p').textContent = story.text;
  focusLayer.classList.add('active');
  focusLayer.querySelector('button').focus({ preventScroll: true });
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
  focusState = null;
  if (fx) fx.setFocus(null);
  renderer.setPixelRatio(overviewPixelRatio);
  focusLayer.classList.remove('active');
  document.body.classList.remove('portal-focused');
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  updateOpeningPosition();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && focusState) closePanel();
});

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
    modelYaw += (yawTarget - modelYaw) * 0.14;
    modelRoot.rotation.y = modelYaw;
  }
  updateFocus();
  controls.update();
  if (fx) fx.render(renderer, camera);
  renderer.render(scene, camera);
});
