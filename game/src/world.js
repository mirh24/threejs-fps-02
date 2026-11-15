// The map: DUSTLINE YARD, a freight yard at dusk, built from boxes and
// cylinders. Two bomb sites (A: warehouse north-west, B: fuel depot
// north-east), three lanes from the attacker spawn in the south (Long A west,
// Mid centre, Long B east), and a wall with two doors separating mid from the
// sites. Every box is a collider for players and bots and a surface a bullet
// stops on. Plain geometry only — no models, no textures, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 4.6;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  function material(name) {
    if (!materials[name]) {
      materials[name] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE[name]),
        roughness: 0.9,
        metalness: 0.02,
      });
    }
    return materials[name];
  }
  const siteMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  // Each row: [width, height, depth, x, y, z, palette colour].
  const boxes = [
    // Ground and perimeter.
    [44.4, 0.4, 36.4, 0, -0.2, 0, 'surface'],
    [0.4, WALL_H, 36.4, -22.2, WALL_H / 2, 0, 'hairline'],
    [0.4, WALL_H, 36.4, 22.2, WALL_H / 2, 0, 'hairline'],
    [44.4, WALL_H, 0.4, 0, WALL_H / 2, -18.2, 'hairline'],
    [44.4, WALL_H, 0.4, 0, WALL_H / 2, 18.2, 'hairline'],
    // Mid divider wall (z = -6) with two 2 m doors at x -4..-2 and x 2..4.
    [18, WALL_H, 0.4, -13, WALL_H / 2, -6, 'hairline'],
    [4, WALL_H, 0.4, 0, WALL_H / 2, -6, 'hairline'],
    [18, WALL_H, 0.4, 13, WALL_H / 2, -6, 'hairline'],
    // Long A corridor wall (x = -10) with a 4 m gap at z -2..2.
    [0.4, WALL_H, 12, -10, WALL_H / 2, 8, 'hairline'],
    [0.4, WALL_H, 4, -10, WALL_H / 2, -4, 'hairline'],
    // Long B corridor wall (x = 10), mirrored.
    [0.4, WALL_H, 12, 10, WALL_H / 2, 8, 'hairline'],
    [0.4, WALL_H, 4, 10, WALL_H / 2, -4, 'hairline'],
    // Site A warehouse shell, open to the south.
    [8, WALL_H, 0.4, -14, WALL_H / 2, -16, 'hairline'],
    [0.4, WALL_H, 8, -18, WALL_H / 2, -12, 'hairline'],
    [0.4, WALL_H, 8, -10, WALL_H / 2, -12, 'hairline'],
    // Site B depot shell, open to the south.
    [8, WALL_H, 0.4, 14, WALL_H / 2, -16, 'hairline'],
    [0.4, WALL_H, 8, 10, WALL_H / 2, -12, 'hairline'],
    [0.4, WALL_H, 8, 18, WALL_H / 2, -12, 'hairline'],
    // Containers (cover, rust red).
    [6, 2.4, 2.4, -4, 1.2, 4, 'rust'],
    [6, 2.4, 2.4, 4, 1.2, 4, 'rust'],
    [2.4, 2.4, 6, -6, 1.2, -2, 'rust'],
    [2.4, 2.4, 6, 6, 1.2, -2, 'rust'],
    [4, 2.4, 2.4, -16, 1.2, -4, 'rust'],
    [4, 2.4, 2.4, 16, 1.2, -4, 'rust'],
    // Crates (cover, hairline).
    [1.2, 1.2, 1.2, -2, 0.6, 8, 'hairline'],
    [1.2, 1.2, 1.2, 2, 0.6, 8, 'hairline'],
    [1.2, 1.2, 1.2, -1.5, 0.6, -1, 'hairline'],
    [1.2, 1.2, 1.2, 1.5, 0.6, -1, 'hairline'],
    [1.2, 1.2, 1.2, -12, 0.6, -8, 'hairline'],
    [1.2, 1.2, 1.2, 12, 0.6, -8, 'hairline'],
    [1.2, 1.2, 1.2, -16, 0.6, -14, 'hairline'],
    [1.2, 1.2, 1.2, 16, 0.6, -14, 'hairline'],
    // Low platforms (0.5 m, jumpable vantage) in front of each site.
    [4, 0.5, 2, -14, 0.25, -6, 'sand'],
    [4, 0.5, 2, 14, 0.25, -6, 'sand'],
  ];
  const colliders = [];
  const meshes = [];
  for (const [w, h, d, x, y, z, mat] of boxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(mat));
    mesh.position.set(x, y, z);
    group.add(mesh);
    meshes.push(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }

  // Fuel tanks at site B (cylinders; the collider is their axis-aligned box).
  const tankMat = material('rust');
  for (const [x, z] of [[12, -13.5], [16, -13.5]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 20), tankMat);
    tank.position.set(x, 1.2, z);
    group.add(tank);
    meshes.push(tank);
    colliders.push(new THREE.Box3().setFromObject(tank));
  }

  // Barrels (0.9 wide, 1.1 tall) scattered as cover.
  const barrelMat = material('sand');
  for (const [x, z] of [[-8, 10], [8, 10], [-4, -10], [4, -10], [-20, 0], [20, 0]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), barrelMat);
    barrel.position.set(x, 0.55, z);
    group.add(barrel);
    meshes.push(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
  }

  // Site zones: a glowing floor square so the objective reads at a glance.
  const sites = {
    A: { x: -14, z: -12, r: 4 },
    B: { x: 14, z: -12, r: 4 },
  };
  for (const site of Object.values(sites)) {
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(site.r * 2, site.r * 2), siteMat);
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(site.x, 0.02, site.z);
    group.add(zone);
  }

  // Dusk lighting: a low warm sun from the west, cool blue sky fill, warm
  // bounce, and a soft eastern fill so no corner of the yard goes pitch black.
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 2.8);
  sun.position.set(-30, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a8ab0'), 0.55);
  fill.position.set(30, 12, -6);
  scene.add(fill);
  const southFill = new THREE.DirectionalLight(new THREE.Color('#8a7a9a'), 0.5);
  southFill.position.set(0, 10, 30);
  scene.add(southFill);
  const hemi = new THREE.HemisphereLight(
    new THREE.Color('#5a6a8a'),
    new THREE.Color(PALETTE.surface),
    1.25,
  );
  scene.add(hemi);
  const warm = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 18);
  warm.position.set(0, 3, -12);
  scene.add(warm);

  return {
    group,
    colliders,
    meshes,
    sites,
    attackerSpawns: [
      { x: 0, z: 14 },
      { x: -3, z: 15 },
      { x: 3, z: 15 },
      { x: -6, z: 13 },
    ],
    defenderSpawns: [
      { x: -14, z: -10, site: 'A' },
      { x: -10, z: -14, site: 'A' },
      { x: 14, z: -10, site: 'B' },
      { x: 10, z: -14, site: 'B' },
    ],
    // Waypoint graph for bot navigation: id -> {x, z, links}.
    waypoints: {
      spawn: { x: 0, z: 14, links: ['s1', 's2', 'mid1'] },
      s1: { x: -8, z: 12, links: ['spawn', 'longA1', 'mid1'] },
      s2: { x: 8, z: 12, links: ['spawn', 'longB1', 'mid1'] },
      mid1: { x: 0, z: 8, links: ['spawn', 's1', 's2', 'mid2'] },
      mid2: { x: 0, z: 2, links: ['mid1', 'mid3', 'coverW', 'coverE', 'longA2', 'longB2'] },
      mid3: { x: 0, z: -2, links: ['mid2', 'doorW', 'doorE'] },
      doorW: { x: -3, z: -6, links: ['mid3', 'siteA2', 'longA3'] },
      doorE: { x: 3, z: -6, links: ['mid3', 'siteB2', 'longB3'] },
      coverW: { x: -6, z: 2, links: ['mid2', 'longA2'] },
      coverE: { x: 6, z: 2, links: ['mid2', 'longB2'] },
      longA1: { x: -16, z: 8, links: ['s1', 'longA2'] },
      longA2: { x: -16, z: 0, links: ['longA1', 'longA3', 'coverW', 'mid2'] },
      longA3: { x: -14, z: -8, links: ['longA2', 'siteA', 'doorW'] },
      longB1: { x: 16, z: 8, links: ['s2', 'longB2'] },
      longB2: { x: 16, z: 0, links: ['longB1', 'longB3', 'coverE', 'mid2'] },
      longB3: { x: 14, z: -8, links: ['longB2', 'siteB', 'doorE'] },
      siteA: { x: -14, z: -12, links: ['longA3', 'siteA2', 'backA'] },
      siteA2: { x: -8, z: -10, links: ['siteA', 'doorW'] },
      siteB: { x: 14, z: -12, links: ['longB2', 'siteB2', 'backB'] },
      siteB2: { x: 8, z: -10, links: ['siteB', 'doorE'] },
      backA: { x: -18, z: -14, links: ['siteA'] },
      backB: { x: 18, z: -14, links: ['siteB'] },
    },
  };
}
