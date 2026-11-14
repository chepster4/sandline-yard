// SANDLINE YARD: an original desert-industrial compound, 44 x 32 m. Two bomb sites
// (A west, B east), three lanes (mid, A-long, B-long) and a cross connector, built
// from boxes. Every box is a collider for players and bots and a surface a bullet
// stops on. Plain geometry only, no models and no textures loaded from files: the
// ground and wall detail is painted on canvas textures at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITE_A = { x: -15, z: -11, minX: -19, maxX: -11, minZ: -14, maxZ: -8 };
const SITE_B = { x: 15, z: -11, minX: 11, maxX: 19, minZ: -14, maxZ: -8 };

const NODES = [
  { id: 'sableSpawn', x: 0, z: 14 },
  { id: 'sableW', x: -10, z: 14 },
  { id: 'sableE', x: 10, z: 14 },
  { id: 'midS', x: 0, z: 10 },
  { id: 'mid1', x: 0, z: 6 },
  { id: 'midCross', x: 0, z: 2 },
  { id: 'midDoors', x: 0, z: -2 },
  { id: 'midN', x: 0, z: -6 },
  { id: 'midFork', x: 0, z: -10 },
  { id: 'aSite', x: -15, z: -11 },
  { id: 'bSite', x: 15, z: -11 },
  { id: 'aLongS', x: -16.5, z: 10 },
  { id: 'aLongM', x: -16.5, z: 2 },
  { id: 'aElbow', x: -13, z: -4 },
  { id: 'aApproach', x: -15, z: -7 },
  { id: 'bLongS', x: 16.5, z: 10 },
  { id: 'bLongM', x: 16.5, z: 2 },
  { id: 'bElbow', x: 13, z: -4 },
  { id: 'bApproach', x: 15, z: -7 },
  { id: 'crossW', x: -8, z: 2 },
  { id: 'crossE', x: 8, z: 2 },
  { id: 'viperSpawn', x: 0, z: -13 },
  { id: 'viperW', x: -6, z: -13 },
  { id: 'viperE', x: 6, z: -13 },
  { id: 'aHold', x: -12, z: -12 },
  { id: 'bHold', x: 12, z: -12 },
];

const EDGES = [
  ['sableSpawn', 'sableW'], ['sableSpawn', 'sableE'], ['sableSpawn', 'midS'],
  ['sableW', 'aLongS'], ['sableE', 'bLongS'],
  ['midS', 'mid1'], ['mid1', 'midCross'], ['midCross', 'midDoors'],
  ['midDoors', 'midN'], ['midN', 'midFork'],
  ['midCross', 'crossW'], ['midCross', 'crossE'],
  ['crossW', 'aLongM'], ['crossE', 'bLongM'],
  ['aLongS', 'aLongM'], ['bLongS', 'bLongM'],
  ['aLongM', 'aElbow'], ['bLongM', 'bElbow'],
  ['aElbow', 'aApproach'], ['bElbow', 'bApproach'],
  ['aApproach', 'aSite'], ['bApproach', 'bSite'],
  ['aApproach', 'aHold'], ['bApproach', 'bHold'],
  ['midFork', 'aApproach'], ['midFork', 'bApproach'],
  ['viperSpawn', 'viperW'], ['viperSpawn', 'viperE'], ['viperSpawn', 'midFork'],
  ['viperW', 'aHold'], ['viperE', 'bHold'],
  ['aHold', 'aSite'], ['bHold', 'bSite'],
];

function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i += 1) {
    const shade = 100 + Math.floor(Math.random() * 90);
    ctx.fillStyle = `rgb(${shade + 30},${shade},${shade - 30})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = 'rgba(40,28,16,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(11, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLetterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.2, 2.2, 1);
  return sprite;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const groundMaterial = new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95, metalness: 0 });
  const steelMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.45, metalness: 0.55 });
  const sandMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 0.9, metalness: 0.02 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Cylinders collide as their bounding box — close enough for a silo or a pipe
  // run, and cheaper than a cylinder collider the physics never needed.
  function cylinder(radius, height, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  const rustMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.25 });
  const hazardMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.7, metalness: 0.1 });

  // Floor and outer walls: 44 x 32 m, 5 m high, open sky so one sun reaches every corner.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(44.4, 0.4, 32.4), groundMaterial);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.4, 5, 32.4, -22.2, 2.5, 0, materials.surface);
  box(0.4, 5, 32.4, 22.2, 2.5, 0, materials.surface);
  box(44.4, 5, 0.4, 0, 2.5, -16.2, materials.surface);
  box(44.4, 5, 0.4, 0, 2.5, 16.2, materials.surface);

  // Mid doors: a wall across mid at z = 0 with a 2.4 m gap, the map's choke point.
  box(17.6, 5, 0.6, -12.8, 2.5, 0, materials.hairline);
  box(17.6, 5, 0.6, 12.8, 2.5, 0, materials.hairline);
  // Lane splitters: low walls that break sightlines without blocking movement around them.
  box(0.6, 2.2, 8, -6, 1.1, -6, materials.hairline);
  box(0.6, 2.2, 8, 6, 1.1, -6, materials.hairline);
  box(0.6, 2.2, 8, -6, 1.1, 6, materials.hairline);
  box(0.6, 2.2, 8, 6, 1.1, 6, materials.hairline);

  // Cover: crates to crouch behind, tall crates for full cover, containers at the sites.
  box(1.2, 1.1, 1.2, -4, 0.55, 4, sandMaterial);
  box(1.2, 1.1, 1.2, 4, 0.55, 4, sandMaterial);
  box(1.2, 2.2, 1.2, -4, 1.1, -8, sandMaterial);
  box(1.2, 2.2, 1.2, 4, 1.1, -8, sandMaterial);
  box(1.2, 1.1, 3.6, -16.5, 0.55, 6, sandMaterial);
  box(3.6, 1.1, 1.2, 16.5, 0.55, 6, sandMaterial);
  box(6, 2.6, 2.4, -17, 1.3, -12.5, steelMaterial);
  box(6, 2.6, 2.4, 17, 1.3, -12.5, steelMaterial);
  box(2.4, 0.9, 1.2, -10, 0.45, -11, sandMaterial);
  box(2.4, 0.9, 1.2, 10, 0.45, -11, sandMaterial);
  box(1.6, 0.7, 1.6, -7.5, 0.35, -13.5, sandMaterial);
  box(1.6, 0.7, 1.6, 7.5, 0.35, -13.5, sandMaterial);
  // B platform: a low deck to hold the B site from above (jumpable, 0.5 m).
  box(5, 0.5, 3, 15, 0.25, -8.5, materials.surface);
  // Sandbag lines at the site mouths.
  box(3.2, 0.9, 0.8, -13.5, 0.45, -7.6, sandMaterial);
  box(3.2, 0.9, 0.8, 13.5, 0.45, -7.6, sandMaterial);
  // Mid pillars flanking the doors.
  box(1.2, 3.4, 1.2, -3.4, 1.7, 0, materials.hairline);
  box(1.2, 3.4, 1.2, 3.4, 1.7, 0, materials.hairline);

  // Foundry dressing: a rusted silo pair flanking mid-north, joined by an
  // overhead pipe run high enough to walk under, so the middle of the map reads
  // industrial from either spawn. Both sit clear of the waypoint corridors.
  cylinder(1.5, 5, -8, 2.5, -3, rustMaterial);
  cylinder(1.5, 5, 8, 2.5, -3, rustMaterial);
  cylinder(0.55, 5, -8, 5.3, -3, steelMaterial);
  cylinder(0.55, 5, 8, 5.3, -3, steelMaterial);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 16, 12), steelMaterial);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 4.6, -3);
  pipe.castShadow = true;
  pipe.receiveShadow = true;
  group.add(pipe);
  shootables.push(pipe);
  // Hazard crates and tall cover flanking the south end of mid: the lane's centre
  // stays open, the edges gain somewhere to crouch.
  box(1.2, 1.1, 1.2, -2.5, 0.55, 8, hazardMaterial);
  box(1.2, 1.1, 1.2, 2.5, 0.55, 8, hazardMaterial);
  box(1.2, 2.2, 1.2, -9, 1.1, 10, sandMaterial);
  box(1.2, 2.2, 1.2, 9, 1.1, 10, sandMaterial);

  // Site markers: a painted ring on the floor and a floating letter, amber for A, teal for B.
  function siteMarker(site, letter, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const sprite = makeLetterSprite(letter, color);
    sprite.position.set(site.x, 4.2, site.z);
    group.add(sprite);
  }
  siteMarker(SITE_A, 'A', PALETTE.accent);
  siteMarker(SITE_B, 'B', PALETTE.sable);

  // Light: a low warm sun from the south-west, a cool fill, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#ffe6c0'), new THREE.Color('#4a3423'), 1.1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb46b'), 2.4);
  sun.position.set(-14, 18, 12);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(10, 10, -12);
  scene.add(fill);

  // Waypoint graph with breadth-first pathfinding over named nodes.
  const byId = new Map(NODES.map((node) => [node.id, node]));
  const neighbours = new Map(NODES.map((node) => [node.id, []]));
  for (const [a, b] of EDGES) {
    neighbours.get(a).push(b);
    neighbours.get(b).push(a);
  }

  function nearestNode(x, z) {
    let best = NODES[0];
    let bestDistance = Infinity;
    for (const node of NODES) {
      const d = (node.x - x) * (node.x - x) + (node.z - z) * (node.z - z);
      if (d < bestDistance) {
        bestDistance = d;
        best = node;
      }
    }
    return best;
  }

  function path(fromX, fromZ, toX, toZ) {
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    if (start.id === goal.id) return [{ x: toX, z: toZ }];
    const previous = new Map([[start.id, null]]);
    const queue = [start.id];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === goal.id) break;
      for (const next of neighbours.get(current)) {
        if (!previous.has(next)) {
          previous.set(next, current);
          queue.push(next);
        }
      }
    }
    if (!previous.has(goal.id)) return [{ x: toX, z: toZ }];
    const ids = [];
    let cursor = goal.id;
    while (cursor !== null) {
      ids.unshift(cursor);
      cursor = previous.get(cursor);
    }
    const points = ids.map((id) => ({ x: byId.get(id).x, z: byId.get(id).z }));
    points[points.length - 1] = { x: toX, z: toZ };
    return points;
  }

  return {
    colliders,
    shootables,
    group,
    sites: { A: SITE_A, B: SITE_B },
    waypoints: { nodes: NODES, nearestNode, path },
    spawns: {
      sable: [
        { x: 0, z: 14, yaw: 0 },
        { x: -2, z: 14.6, yaw: 0 },
        { x: 2, z: 14.6, yaw: 0 },
        { x: -1, z: 15.4, yaw: 0 },
        { x: 1, z: 15.4, yaw: 0 },
      ],
      viper: [
        { x: 0, z: -13, yaw: Math.PI },
        { x: -2, z: -13.6, yaw: Math.PI },
        { x: 2, z: -13.6, yaw: Math.PI },
        { x: -6, z: -13, yaw: Math.PI },
        { x: 6, z: -13, yaw: Math.PI },
      ],
    },
  };
}
