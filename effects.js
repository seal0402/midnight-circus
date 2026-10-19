// 五个开口的"黑洞"内景 + 五种简单特效
import * as THREE from 'three';

const TAU = Math.PI * 2;

function cardTexture(suit, red) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f2e6'; g.fillRect(0, 0, 128, 180);
  g.strokeStyle = '#d9cfb8'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 176);
  g.fillStyle = red ? '#c0392b' : '#16120f';
  g.font = 'bold 96px serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(suit, 64, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 纯黑内壁：从任何开口看进去都是绝对的黑
export function buildBlackHole(root, radius, height) {
  const r = radius * 0.80;          // 下口半径
  const rTop = radius * 0.60;       // 上口收窄，贴住顶棚内侧
  const y0 = height * 0.092;
  const wallH = height * 0.47;      // 一路通到顶棚，正面孔望不到对面孔

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, r, wallH, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, toneMapped: false })
  );
  wall.position.y = y0 + wallH / 2;
  root.add(wall);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(r, 64),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y0 + 0.002;
  root.add(floor);

  return { r, y0, wallH };
}

// 五种特效，每种挂在对应开口内侧
export function buildEffects(root, r, h) {
  const portals = [];
  const groups = [];
  const R = r * 0.88;
  const Y = h * 0.235;

  // 1 飞牌
  {
    const g = new THREE.Group();
    const suits = ['♠', '♥', '♦', '♣'];
    const texRed = cardTexture('♥', true);
    const texBlk = cardTexture('♠', false);
    const cards = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.032, 0.045),
        new THREE.MeshBasicMaterial({
          map: i % 2 ? texRed : texBlk, transparent: true, side: THREE.DoubleSide,
          toneMapped: false, depthWrite: false,
        })
      );
      cards.push({ m, a: i * 0.9, dy: Math.random() * 0.1, sp: 0.5 + Math.random() * 0.5 });
      g.add(m);
    }
    groups.push({ g, update: (t) => {
      cards.forEach((c, i) => {
        const a = c.a + t * c.sp;
        c.m.position.set(Math.cos(a) * 0.09, Math.sin(t * 0.9 + i) * 0.03 + c.dy - 0.05, Math.sin(a) * 0.06);
        c.m.rotation.set(t * 0.8 + i, a, t * 0.5);
      });
    }});
  }

  // 2 胶片
  {
    const g = new THREE.Group();
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.05, 0.028),
        new THREE.MeshBasicMaterial({ color: 0xf5e6c8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
      );
      cells.push({ m, i });
      g.add(m);
    }
    groups.push({ g, update: (t) => {
      cells.forEach((c) => {
        const y = ((c.i / 9 + t * 0.08) % 1) - 0.5;
        c.m.position.set(Math.sin(y * 6) * 0.02, y * 0.16, 0);
        c.m.rotation.z = y * 0.5;
      });
    }});
  }

  // 3 星点漩涡
  {
    const g = new THREE.Group();
    const N = 90;
    const pos = new Float32Array(N * 3);
    const seeds = [];
    for (let i = 0; i < N; i++) seeds.push({ a: Math.random() * TAU, r: 0.03 + Math.random() * 0.09, s: 0.4 + Math.random() });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.006, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    g.add(pts);
    groups.push({ g, update: (t) => {
      seeds.forEach((s, i) => {
        const a = s.a + t * s.s;
        const rr = s.r * (0.7 + 0.3 * Math.sin(t + i));
        pos[i * 3] = Math.cos(a) * rr;
        pos[i * 3 + 1] = Math.sin(a * 1.3 + t) * 0.05;
        pos[i * 3 + 2] = Math.sin(a) * rr;
      });
      geo.attributes.position.needsUpdate = true;
    }});
  }

  // 4 时钟漩涡
  {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8c27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.04 + i * 0.025, 0.0022, 6, 40), ringMat);
      rings.push(m); g.add(m);
    }
    const handMat = new THREE.MeshBasicMaterial({ color: 0xfff0cf, toneMapped: false, depthWrite: false });
    const hand1 = new THREE.Mesh(new THREE.PlaneGeometry(0.0025, 0.05), handMat);
    const hand2 = new THREE.Mesh(new THREE.PlaneGeometry(0.002, 0.035), handMat);
    hand1.position.y = 0.025; hand2.position.y = 0.0175;
    g.add(hand1, hand2);
    groups.push({ g, update: (t) => {
      rings.forEach((m, i) => { m.rotation.z = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1); m.rotation.x = t * 0.2 * i; });
      hand1.rotation.z = -t * 0.6;
      hand2.rotation.z = -t * 1.4;
    }});
  }

  // 5 镜面碎片
  {
    const g = new THREE.Group();
    const shards = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.016, 0), mat);
      shards.push({ m, a: Math.random() * TAU, rr: 0.03 + Math.random() * 0.07, s: 0.5 + Math.random() });
      g.add(m);
    }
    groups.push({ g, update: (t) => {
      shards.forEach((s) => {
        const a = s.a + t * s.s * 0.6;
        s.m.position.set(Math.cos(a) * s.rr, Math.sin(t * 1.2 + s.a) * 0.05, Math.sin(a) * s.rr);
        s.m.rotation.set(t * s.s, a, t * 0.8);
      });
    }});
  }

  // 6 烬火上升（第六个开口）
  {
    const g = new THREE.Group();
    const N = 60;
    const pos = new Float32Array(N * 3);
    const seeds = [];
    for (let i = 0; i < N; i++) seeds.push({ a: Math.random() * TAU, r: 0.02 + Math.random() * 0.08, s: 0.3 + Math.random() * 0.7, ph: Math.random() });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff9a4d, size: 0.0055, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    g.add(pts);
    groups.push({ g, update: (t) => {
      seeds.forEach((s, i) => {
        const a = s.a + t * 0.3;
        const lift = ((s.ph + t * s.s * 0.25) % 1) - 0.5;
        pos[i * 3] = Math.cos(a) * s.r * (1 - Math.abs(lift));
        pos[i * 3 + 1] = lift * 0.16;
        pos[i * 3 + 2] = Math.sin(a) * s.r * (1 - Math.abs(lift));
      });
      geo.attributes.position.needsUpdate = true;
    }});
  }

  // 六个开口，每 60°：洞口 → 特效 → 黑板（朝外、不透明，彻底封死）
  groups.forEach((grp, i) => {
    const a = (i / groups.length) * TAU + Math.PI / 2;
    const px = Math.cos(a) * R;
    const pz = Math.sin(a) * R;
    grp.g.position.set(px, Y, pz);
    // 朝外，让黑板正对观众
    grp.g.lookAt(px * 2, Y, pz * 2);

    // 特效整体放大，黑板不跟着放大
    const inner = new THREE.Group();
    while (grp.g.children.length) inner.add(grp.g.children[0]);
    inner.scale.setScalar(1.9);
    grp.g.add(inner);

    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 0.95, h * 0.235),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false, depthWrite: true })
    );
    back.position.z = -0.010;   // 局部 +z 朝外，负值即在特效后面
    back.userData.portal = i;
    portals.push(back);
    grp.g.add(back);

    root.add(grp.g);
  });

  return {
    portals,
    update: (t) => groups.forEach((grp) => grp.update(t)),
  };
}
