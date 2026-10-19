// 第一版网页的三套特效，代码原样照搬（仅把 portalScene 换成自己的 group），不改写内部实现。
// 来源：午夜马戏_网页第一版源码/dist/app.js 第 226–319 行。
import * as THREE from 'three';

const TAU = Math.PI * 2;
let seed = 20261018;
function rand() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const mobile = false;

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function mesh(geometry, material, position, parent) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.set(...position);
  parent.add(object);
  return object;
}

export function makeTheme(name, portalScene) {
  const group = new THREE.Group();
  portalScene.add(group);
  const theme = { group, update: () => {} };

  if (name === 'cards') {
    const suits = ['♠', '♥', '♣', '♦'];
    const batches = [];
    for (let variant = 0; variant < 8; variant++) {
      const suit = suits[variant % 4];
      const rank = ['A', '7', 'K', '3', 'Q', '9', 'J', '5'][variant];
      const texture = canvasTexture(256, 368, (c, w, h) => {
        c.fillStyle = '#e9dec5'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#cbbba2'; c.lineWidth = 5; c.strokeRect(7, 7, w - 14, h - 14);
        for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(80,55,35,${rand() * .06})`; c.fillRect(rand() * w, rand() * h, 1, 1); }
        c.fillStyle = variant % 2 ? '#9a2435' : '#24212b';
        c.textAlign = 'center';
        c.font = 'bold 45px Georgia'; c.fillText(rank, 36, 57);
        c.font = '35px Georgia'; c.fillText(suit, 36, 95);
        c.save(); c.translate(w, h); c.rotate(Math.PI);
        c.font = 'bold 45px Georgia'; c.fillText(rank, 36, 57);
        c.font = '35px Georgia'; c.fillText(suit, 36, 95);
        c.restore();
        c.font = `${rank === 'A' ? 145 : 117}px Georgia`; c.fillText(suit, w / 2, h / 2 + 40);
        if (['K', 'Q', 'J'].includes(rank)) {
          c.strokeStyle = c.fillStyle; c.lineWidth = 2;
          c.strokeRect(63, 110, 130, 150);
          c.font = 'bold 35px Georgia'; c.fillText(rank, w / 2, 146);
        }
      });
      const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: .7 });
      const count = mobile ? 4 : 6;
      const object = new THREE.InstancedMesh(new THREE.PlaneGeometry(.35, .50), material, count);
      object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      object.frustumCulled = false;
      group.add(object);
      const items = Array.from({ length: count }, () => ({
        depth: rand(), angle: rand() * TAU, speed: .035 + rand() * .03,
        spin: rand() * TAU, radius: .4 + rand() * 1.25,
      }));
      batches.push({ object, items });
    }
    const ringMaterial = new THREE.LineBasicMaterial({ color: 0x927047, transparent: true, opacity: .34 });
    for (let i = 0; i < 14; i++) {
      const pts = [];
      for (let j = 0; j <= 96; j++) { const a = j / 96 * TAU; pts.push(new THREE.Vector3(Math.cos(a) * 1.6, 1.18 + Math.sin(a) * 1.6, -i * 1.65)); }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(g, ringMaterial));
    }
    const dummy = new THREE.Object3D();
    theme.update = (time) => {
      for (const { object, items } of batches) {
        items.forEach((item, i) => {
          const p = (item.depth + time * item.speed) % 1, a = item.angle + time * .2 + p * 5.5;
          dummy.position.set(Math.cos(a) * item.radius + .10 * Math.sin(time * 1.8 + item.spin), 1.16 + Math.sin(a) * .86 + .18 * Math.sin(time * .8 + item.spin), 1.54 - p * 19);
          dummy.rotation.set(Math.sin(time * .7 + item.spin) * .72, time * .55 + item.spin, Math.sin(time * .9 + item.spin) * .7 + a * .18);
          dummy.scale.setScalar((.90 + .25 * (1 - p)) * Math.min(1, p * 18, (1 - p) * 22));
          dummy.updateMatrix();
          object.setMatrixAt(i, dummy.matrix);
        });
        object.instanceMatrix.needsUpdate = true;
      }
    };
    return theme;
  }

  if (name === 'film') {
    const filmTexture = canvasTexture(256, 1024, (c, w, h) => {
      c.fillStyle = '#d5d1d9'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { c.fillStyle = '#161420'; c.fillRect(8, y + 7, 15, 18); c.fillRect(w - 23, y + 7, 15, 18); }
      for (let f = 0; f < 5; f++) {
        const y = f * 205;
        c.fillStyle = f % 2 ? '#514b60' : '#66616f'; c.fillRect(35, y + 13, 186, 177);
        const g = c.createLinearGradient(0, y + 18, 0, y + 180);
        g.addColorStop(0, '#8c8396'); g.addColorStop(1, '#332c43');
        c.fillStyle = g; c.fillRect(40, y + 18, 176, 167);
        c.fillStyle = '#c3b4c5'; c.beginPath(); c.arc(170, y + 57, 14, 0, TAU); c.fill();
        c.fillStyle = '#3a3345'; c.beginPath(); c.moveTo(40, y + 185);
        for (let x = 40; x <= 216; x += 22) c.lineTo(x, y + 100 + rand() * 55);
        c.lineTo(216, y + 185); c.fill();
        c.strokeStyle = '#dfd8dd44'; c.strokeRect(40, y + 18, 176, 167);
      }
    });
    filmTexture.wrapT = THREE.RepeatWrapping;
    const ribbons = [];
    for (let n = 0; n < 3; n++) {
      const segments = 150, positions = new Float32Array((segments + 1) * 2 * 3), uvs = new Float32Array((segments + 1) * 4), indices = [];
      for (let j = 0; j <= segments; j++) {
        uvs[j * 4] = 0; uvs[j * 4 + 1] = j / segments * 3.4;
        uvs[j * 4 + 2] = 1; uvs[j * 4 + 3] = j / segments * 3.4;
        if (j < segments) { const i = j * 2; indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      g.setIndex(indices);
      const material = new THREE.MeshBasicMaterial({ map: filmTexture, side: THREE.DoubleSide, color: 0xcac0d8 });
      const ribbon = mesh(g, material, null, group);
      ribbon.frustumCulled = false;
      ribbons.push({ object: ribbon, segments, phase: n * TAU / 3 });
    }
    const fragments = [];
    for (let i = 0; i < (mobile ? 20 : 36); i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-.12, -.13, 0, .12, -.04, .01, .025, .17, 0], 3));
      g.computeVertexNormals();
      const m = mesh(g, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xc3b9d2 : 0xe8e0e8, transparent: true, opacity: .36, side: THREE.DoubleSide, depthWrite: false }), null, group);
      fragments.push({ object: m, phase: rand() * TAU, depth: rand(), size: .3 + rand() });
    }
    theme.update = (time) => {
      filmTexture.offset.y = -time * .075;
      for (const { object, segments, phase } of ribbons) {
        const p = object.geometry.attributes.position;
        for (let j = 0; j <= segments; j++) {
          const t = j / segments, a = phase + t * TAU * 2.0 + time * .18, r = 1.05 + .35 * Math.sin(t * TAU + phase + time * .15);
          for (let edge = 0; edge < 2; edge++) {
            const w = (edge - .5) * .50;
            p.setXYZ(j * 2 + edge, Math.cos(a) * (r + w), 1.15 + Math.sin(a) * (.89 + w), 1.52 - t * 20 + .20 * Math.sin(a * 2));
          }
        }
        p.needsUpdate = true;
        object.geometry.computeVertexNormals();
      }
      fragments.forEach(({ object, phase, depth, size }) => {
        const a = phase + time * .13;
        object.position.set(Math.cos(a) * 1.6, 1.2 + Math.sin(a) * 1.1, 1.1 - ((depth + time * .026) % 1) * 17);
        object.rotation.set(time * .3 + phase, time * .24, time * .1 + phase);
        object.scale.setScalar(size);
      });
    };
    return theme;
  }

  const clockTexture = canvasTexture(1024, 1024, (c, w, h) => {
    const center = w / 2;
    c.translate(center, center);
    c.strokeStyle = '#d7cfbf'; c.lineWidth = 3;
    for (const r of [475, 445, 340, 326]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU;
      c.save(); c.rotate(a);
      c.lineWidth = i % 5 ? 2 : 5;
      c.beginPath(); c.moveTo(0, -440); c.lineTo(0, i % 5 ? -426 : -413); c.stroke();
      c.restore();
    }
    const labels = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    c.fillStyle = '#e7e0d0'; c.font = 'bold 56px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    labels.forEach((text, i) => { c.save(); c.rotate(i / 12 * TAU); c.fillText(text, 0, -379); c.restore(); });
    c.strokeStyle = '#ad374d'; c.lineWidth = 8;
    c.beginPath(); c.arc(0, 0, 461, .2, .66); c.stroke();
    c.beginPath(); c.arc(0, 0, 333, 3.3, 3.7); c.stroke();
  });
  const clocks = [];
  for (let i = 0; i < 11; i++) {
    const material = new THREE.MeshBasicMaterial({
      map: clockTexture, transparent: true,
      opacity: Math.max(.18, 1 - i * .069),
      side: THREE.DoubleSide, depthWrite: false,
      color: i % 3 === 0 ? 0xd4b9b8 : 0xe0dae2,
    });
    const m = mesh(new THREE.PlaneGeometry(3.7, 3.7), material, [0, 1.12, 1.45 - i * 2.1], group);
    clocks.push(m);
  }
  theme.update = (time) => {
    clocks.forEach((clock, i) => {
      clock.rotation.z = time * (i % 2 ? -.075 : .11) + i * .38;
      clock.rotation.x = Math.sin(time * .2 + i * .35) * .18;
      clock.position.x = Math.sin(i * .5 + time * .15) * .12;
    });
  };
  return theme;
}

// 六洞：纸牌/胶片/时间 交错
export function buildEffectsV1(root, r, h) {
  const portals = [];
  const groups = [];
  const R = r * 1.02;
  const Y = h * 0.235;
  const names = ['film', 'time', 'film', 'time', 'film', 'time'];

  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 2;
    const px = Math.cos(a) * R;
    const pz = Math.sin(a) * R;
    const group = new THREE.Group();
    group.position.set(px, Y, pz);
    group.lookAt(px * 2, Y, pz * 2);
    groups.push(group);

    // 原版特效整组塞进洞口；只对容器缩放定位，内部实现一行没改
    const inner = new THREE.Group();
    inner.scale.setScalar(0.035);
    group.add(inner);
    const theme = makeTheme(names[i], inner);
    group.userData.update = theme.update;

    const black = new THREE.Mesh(
      new THREE.CircleGeometry(R * 0.42, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false, depthWrite: true })
    );
    black.position.z = -0.75;   // 放在特效纵深之后，不切断特效
    group.add(black);

    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 0.55, h * 0.20),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    hit.position.z = 0.02;
    hit.userData.portal = i;
    group.add(hit);
    portals.push(hit);

    root.add(group);
  }

  return {
    portals,
    update(t) { groups.forEach((g) => g.userData.update && g.userData.update(t)); },
    setVisible(v) { groups.forEach((g) => { g.visible = v; }); },
    setPaused() {},
  };
}
