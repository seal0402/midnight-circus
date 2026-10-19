// Render the unchanged first-edition scenes through a camera inside each doorway.
import * as THREE from 'three';
import { buildBlackHole } from './effects.js';
import { makeTheme } from './effects_v1.js';

export { buildBlackHole };

export function buildEffects(root, r, h, camera, isMobile) {
  const portals = [];
  const groups = [];
  const names = ['cards', 'film', 'time', 'cards', 'film', 'time'];
  const R = r * 0.80;
  const Y = h * 0.19;
  const width = r * 0.95;
  const height = h * 0.30;
  const resolution = isMobile ? 384 : 768;
  const worlds = new Map();

  for (const name of new Set(names)) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03030a);
    scene.add(new THREE.AmbientLight(0xd7d7ee, 1.1));
    const light = new THREE.PointLight(0xffe4b4, 12, 20, 1.7);
    light.position.set(0, 2.3, 3);
    scene.add(light);
    const theme = makeTheme(name, scene);
    const portalCamera = new THREE.PerspectiveCamera(58, width / height, 0.03, 120);
    portalCamera.position.set(0, 1.18, 3.9);
    portalCamera.lookAt(0, 1.18, -8);
    const target = new THREE.WebGLRenderTarget(
      resolution, Math.round(resolution * height / width),
      { depthBuffer: true, stencilBuffer: false, samples: 2 }
    );
    worlds.set(name, { scene, theme, camera: portalCamera, target });
  }

  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 2;
    const px = Math.cos(a) * R;
    const pz = Math.sin(a) * R;

    const group = new THREE.Group();
    group.position.set(px, Y, pz);
    group.lookAt(px * 2, Y, pz * 2);
    groups.push(group);

    group.userData.theme = names[i];
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: worlds.get(names[i]).target.texture })
    );
    screen.userData.portal = i;
    group.add(screen);
    portals.push(screen);

    root.add(group);
  }

  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const towardCamera = new THREE.Vector3();
  const clearColor = new THREE.Color();
  const visibleThemes = new Set();
  const requestedSizes = new Map();
  const drawingSize = new THREE.Vector2();
  const projected = new THREE.Vector3();
  let focusedName = null;

  return {
    portals,
    update(t) { worlds.forEach(({ theme }) => theme.update(t)); },
    setFocus(portal) {
      focusedName = portal ? names[portal.userData.portal] : null;
    },
    render(renderer, outerCamera) {
      root.updateMatrixWorld(true);
      outerCamera.updateMatrixWorld(true);
      renderer.getDrawingBufferSize(drawingSize);
      visibleThemes.clear();
      requestedSizes.clear();
      for (const group of groups) {
        if (!group.visible) continue;
        group.getWorldPosition(position);
        group.getWorldDirection(normal);
        towardCamera.subVectors(outerCamera.position, position).normalize();
        if (normal.dot(towardCamera) <= 0) continue;
        const name = group.userData.theme;
        visibleThemes.add(name);
        let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
        for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) {
          projected.set(x, y, 0).applyMatrix4(group.matrixWorld).project(outerCamera);
          left = Math.min(left, projected.x); right = Math.max(right, projected.x);
          bottom = Math.min(bottom, projected.y); top = Math.max(top, projected.y);
        }
        const needed = Math.max((right - left) * drawingSize.x / 2, (top - bottom) * drawingSize.y / 2 * width / height);
        requestedSizes.set(name, Math.max(requestedSizes.get(name) || 0, needed));
      }
      const previousTarget = renderer.getRenderTarget();
      renderer.getClearColor(clearColor);
      const clearAlpha = renderer.getClearAlpha();
      try {
        for (const name of visibleThemes) {
          const world = worlds.get(name);
          // Size the live doorway image to its projected physical pixels, not its overview size.
          const maxEdge = Math.min(renderer.capabilities.maxTextureSize, isMobile ? 2048 : 3072);
          const maxWidth = Math.floor(Math.min(maxEdge, maxEdge * width / height) / 64) * 64;
          const focusPixels = name === focusedName ? Math.min(drawingSize.x, drawingSize.y * width / height) : 0;
          const needed = Math.max(requestedSizes.get(name), focusPixels);
          const pixels = Math.min(maxWidth, Math.max(resolution, Math.ceil(needed * 1.1 / 64) * 64));
          if (pixels > world.target.width || (name !== focusedName && pixels < world.target.width * 0.6)) {
            world.target.setSize(pixels, Math.round(pixels * height / width));
          }
          renderer.setRenderTarget(world.target);
          renderer.render(world.scene, world.camera);
        }
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(clearColor, clearAlpha);
      }
    },
    setVisible(v) { groups.forEach((g) => { g.visible = v; }); },
    setPaused() {},
  };
}
