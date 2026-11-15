// world.js — the DUSTLINE map: a dusty desert industrial yard, 64 x 44 m.
// Site A is a warehouse yard (crates + raised platform) in the north-west,
// Site B a fuel depot (tanks + pipes) in the south-east, and a double-door
// choke guards the middle lane. Colliders are axis-aligned boxes; movement
// slides along them. Waypoints form the graph bots navigate on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { segmentHitsBox2D } from './util.js';

const WALL_H = 4;
const BOUND = { minX: -32, maxX: 32, minZ: -22, maxZ: 22 };

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,16,10,0.55)';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = color;
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = [];
    this.sites = {
      A: { x: -20, z: -14, r: 6.5 },
      B: { x: 20, z: 14, r: 6.5 },
    };
    this.spawns = {
      ember: [[-27, 15], [-25, 17], [-29, 13], [-24, 14], [-27, 18]],
      sable: [[27, -15], [25, -17], [29, -13], [24, -14], [27, -18]],
    };
    // Waypoint graph: nodes across lanes, sites and spawns.
    this.waypoints = [
      { x: -27, z: 15 }, { x: -18, z: 18 }, { x: -6, z: 17 }, { x: 12, z: 16 },
      { x: 20, z: 14 }, { x: -12, z: 4 }, { x: -2, z: 0 }, { x: 8, z: -2 },
      { x: 18, z: -16 }, { x: 27, z: -15 }, { x: -14, z: -8 }, { x: -20, z: -14 },
      { x: -20, z: -18 }, { x: 0, z: -18 }, { x: 4, z: 10 }, { x: -16, z: -4 },
      { x: 10, z: 10 }, { x: 0, z: 6 }, { x: -20, z: 8 }, { x: 16, z: -8 },
      { x: -8, z: -12 }, { x: 8, z: 12 },
    ];
    this.links = [
      [0, 1], [0, 18], [1, 2], [2, 3], [3, 4], [3, 16], [4, 16], [5, 6],
      [5, 18], [5, 10], [6, 7], [6, 17], [7, 8], [7, 19], [8, 9], [9, 19],
      [10, 11], [10, 15], [11, 12], [12, 13], [13, 7], [13, 20], [14, 17],
      [14, 21], [15, 20], [16, 21], [17, 14], [18, 5], [19, 13], [20, 10],
      [21, 3], [2, 17], [1, 18], [6, 20],
    ];
    this.adj = this.waypoints.map(() => []);
    for (const [a, b] of this.links) { this.adj[a].push(b); this.adj[b].push(a); }
    this.dust = null;
    this.dustVel = null;
  }

  mat(color, rough = 0.95) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
  }

  box(x, z, w, d, h, color, y0 = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, this.mat(color));
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = h > 0.8;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y0 + h });
    return mesh;
  }

  cyl(x, z, r, h, color, y0 = 0, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), this.mat(color, 0.7));
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: y0 + h });
    return mesh;
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color(PALETTE.skyHorizon);
    s.fog = new THREE.Fog(PALETTE.fog, 45, 110);
    const hemi = new THREE.HemisphereLight(PALETTE.skyTop, PALETTE.groundDark, 0.85);
    s.add(hemi);
    const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
    sun.position.set(28, 42, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 120;
    s.add(sun);
    // Sun disc in the sky.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false }));
    disc.position.set(55, 38, -70);
    disc.lookAt(0, 2, 0);
    s.add(disc);

    // Ground: big sand plane with a darker yard strip down the middle.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 110), this.mat(PALETTE.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), this.mat(PALETTE.groundDark));
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = 0.02;
    yard.receiveShadow = true;
    s.add(yard);

    // Perimeter walls with a rust trim.
    this.box(0, -22.8, 66, 1.6, WALL_H, PALETTE.wall);
    this.box(0, 22.8, 66, 1.6, WALL_H, PALETTE.wall);
    this.box(-32.8, 0, 1.6, 46, WALL_H, PALETTE.wall);
    this.box(32.8, 0, 1.6, 46, WALL_H, PALETTE.wall);
    this.box(0, -22.8, 66, 1.8, 0.35, PALETTE.rust, WALL_H);
    this.box(0, 22.8, 66, 1.8, 0.35, PALETTE.rust, WALL_H);

    // --- Site A: warehouse yard (north-west) ---
    this.box(-20, -19.5, 12, 1.2, 3.2, PALETTE.concrete); // back wall of warehouse
    this.box(-26, -14, 1.2, 10, 3.2, PALETTE.concrete);
    // Stacked crates.
    this.box(-22, -12, 2.4, 2.4, 2.4, PALETTE.crate);
    this.box(-22, -12, 1.8, 1.8, 1.6, PALETTE.crateDark, 2.4);
    this.box(-18, -16, 2.4, 2.4, 1.2, PALETTE.crate);
    this.box(-15.5, -12.5, 2, 2, 2.4, PALETTE.crateDark);
    this.box(-24, -17, 3, 2, 1.2, PALETTE.crate);
    // Raised platform with a step.
    this.box(-17, -18.5, 6, 3, 1.2, PALETTE.metalDark);
    this.box(-14, -17, 1.4, 1.4, 0.6, PALETTE.metal);
    // Barrels.
    this.cyl(-25.5, -10.5, 0.7, 1.4, PALETTE.rust);
    this.cyl(-24, -10.8, 0.7, 1.4, PALETTE.tealDark);

    // --- Site B: fuel depot (south-east) ---
    this.cyl(22, 12, 2.6, 3.4, PALETTE.tank);
    this.cyl(16.5, 17, 2.2, 2.8, PALETTE.tankRust);
    this.cyl(24.5, 17.5, 1.4, 2.2, PALETTE.tealDark);
    // Horizontal pipes on trestles.
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 10), this.mat(PALETTE.metal, 0.5));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(19, 1.6, 10.5);
    pipe.castShadow = true;
    s.add(pipe);
    this.box(15.5, 10.5, 0.5, 0.5, 1.6, PALETTE.metalDark);
    this.box(22.5, 10.5, 0.5, 0.5, 1.6, PALETTE.metalDark);
    this.box(18, 18.5, 2.4, 2.4, 1.2, PALETTE.crate);
    this.box(25, 11, 2, 2, 2.2, PALETTE.crateDark);

    // --- Mid: double-door choke ---
    this.box(-3.5, -6, 1.4, 12, 3.4, PALETTE.concrete);
    this.box(-3.5, 6, 1.4, 12, 3.4, PALETTE.concrete);
    this.box(3.5, -6, 1.4, 12, 3.4, PALETTE.concrete);
    this.box(3.5, 6, 1.4, 12, 3.4, PALETTE.concrete);
    // Door frames over the gap.
    this.box(0, -3.4, 8.4, 1, 3.4, PALETTE.door);
    this.box(0, 3.4, 8.4, 1, 3.4, PALETTE.door);
    this.box(0, 0, 8.4, 1, 1, PALETTE.rust, 3.4);

    // --- Lane cover: crates, barrels and low walls down each lane ---
    this.box(-10, -18, 3, 1.6, 1.4, PALETTE.crate);
    this.box(6, -18, 2.4, 2.4, 1.2, PALETTE.crateDark);
    this.box(12, -8, 1.6, 4, 1.3, PALETTE.concrete);
    this.box(-8, 12, 3, 1.6, 1.4, PALETTE.crate);
    this.box(2, 17, 2.4, 2.4, 1.2, PALETTE.crateDark);
    this.box(-14, 6, 1.6, 4, 1.3, PALETTE.concrete);
    this.box(10, 2, 2.4, 2.4, 2.4, PALETTE.crate);
    this.box(-6, -6, 2, 2, 1.2, PALETTE.crate);
    this.cyl(-2, -14, 0.7, 1.4, PALETTE.rust);
    this.cyl(14, 6, 0.7, 1.4, PALETTE.tealDark);
    this.cyl(-26, 4, 0.7, 1.4, PALETTE.rust);

    // Site markers: floating A / B signs and ground rings.
    for (const [letter, site, color] of [['A', this.sites.A, '#ff8c3a'], ['B', this.sites.B, '#4fb3a8']]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshBasicMaterial({ map: letterTexture(letter, color), transparent: true, side: THREE.DoubleSide }));
      sign.position.set(site.x, 5.2, site.z);
      s.add(sign);
      const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.35, site.r, 40),
        new THREE.MeshBasicMaterial({ color: letter === 'A' ? PALETTE.ember : PALETTE.tealBright, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(site.x, 0.05, site.z);
      s.add(ring);
    }

    // Drifting dust: one Points cloud, positions recycled in update().
    const count = 420;
    const pos = new Float32Array(count * 3);
    this.dustVel = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = this.rng.range(-32, 32);
      pos[i * 3 + 1] = this.rng.range(0.2, 7);
      pos[i * 3 + 2] = this.rng.range(-22, 22);
      this.dustVel[i] = this.rng.range(0.4, 1.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xe8d3a8, size: 0.14, transparent: true, opacity: 0.55, sizeAttenuation: true,
    }));
    s.add(this.dust);
  }

  update(dt) {
    if (!this.dust) return;
    const pos = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < this.dustVel.length; i += 1) {
      pos[i * 3] += this.dustVel[i] * dt;
      pos[i * 3 + 1] += Math.sin(performance.now() * 0.0004 + i) * 0.002;
      if (pos[i * 3] > 33) pos[i * 3] = -33;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  // Push a circle (x,z,r) out of every collider it overlaps. Mutates pos.
  collideCircle(pos, r, height = 1.7) {
    for (const b of this.colliders) {
      if (height > b.top + 0.01) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        // Centre inside the box: push out along the smallest penetration axis.
        const pushL = pos.x - b.minX + r, pushR = b.maxX - pos.x + r;
        const pushT = pos.z - b.minZ + r, pushB = b.maxZ - pos.z + r;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) pos.x = b.minX - r;
        else if (m === pushR) pos.x = b.maxX + r;
        else if (m === pushT) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
      } else {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      }
    }
    pos.x = Math.max(BOUND.minX + 0.5, Math.min(BOUND.maxX - 0.5, pos.x));
    pos.z = Math.max(BOUND.minZ + 0.5, Math.min(BOUND.maxZ - 0.5, pos.z));
  }

  // True when a wall taller than eye level blocks the straight line.
  losBlocked(ax, az, bx, bz) {
    for (const b of this.colliders) {
      if (b.top < 1.3) continue;
      if (segmentHitsBox2D(ax, az, bx, bz, b)) return true;
    }
    return false;
  }

  siteAt(x, z) {
    for (const [name, s] of Object.entries(this.sites)) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz <= s.r * s.r) return name;
    }
    return null;
  }

  nearestWaypoint(x, z) {
    let best = 0, bd = Infinity;
    this.waypoints.forEach((w, i) => {
      const d = (w.x - x) ** 2 + (w.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // Breadth-first path of waypoint indices from a to b (inclusive).
  findPath(a, b) {
    if (a === b) return [a];
    const prev = new Array(this.waypoints.length).fill(-1);
    const queue = [a];
    prev[a] = a;
    while (queue.length) {
      const cur = queue.shift();
      for (const n of this.adj[cur]) {
        if (prev[n] !== -1) continue;
        prev[n] = cur;
        if (n === b) {
          const path = [b];
          let p = b;
          while (p !== a) { p = prev[p]; path.unshift(p); }
          return path;
        }
        queue.push(n);
      }
    }
    return [a, b];
  }
}
