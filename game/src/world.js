// SANDLINE YARD — the map. A fenced industrial yard at dusk: two rusted silos
// and a pipe gantry frame the middle doors, shipping containers and crate
// stacks make the lanes, and two fenced bomb sites sit at the north end.
// The yard is 44 by 36 metres (x -22..22, z -18..18). SABLE spawns south,
// VIPER north; A is west, B is east. Bots navigate on a small node graph
// (waypoints.path) whose edges are all clear corridors, so a route never
// asks a bot to walk through a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Nav nodes: every junction a bot may route through. Edges join nodes whose
// straight line is a clear corridor (no wall, silo or crate on it).
const NODES = [
  { x: 0, z: 14 }, { x: -7, z: 14 }, { x: 7, z: 14 },
  { x: -16, z: 6 }, { x: 0, z: 6 }, { x: 16, z: 6 },
  { x: -16.5, z: 2 }, { x: 0, z: 2 }, { x: 16.5, z: 2 },
  { x: -16, z: -2 }, { x: 0, z: -2 }, { x: 16, z: -2 },
  { x: -8, z: -4 }, { x: -14, z: -6 }, { x: -14, z: -10 },
  { x: 8, z: -4 }, { x: 14, z: -6 }, { x: 14, z: -10 },
  { x: 0, z: -15 }, { x: -7, z: -15 }, { x: 7, z: -15 },
];
const EDGES = [
  [0, 4], [1, 4], [2, 4], [1, 3], [2, 5],
  [3, 6], [4, 7], [5, 8],
  [6, 9], [7, 10], [8, 11],
  [9, 13], [10, 12], [10, 15], [11, 16],
  [12, 13], [13, 14], [15, 16], [16, 17],
  [9, 19], [10, 18], [11, 20], [18, 19], [18, 20],
  [3, 4], [4, 5], [9, 10], [10, 11], [0, 1], [0, 2],
];

function buildWaypoints() {
  const neighbours = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    const dx = NODES[a].x - NODES[b].x;
    const dz = NODES[a].z - NODES[b].z;
    const cost = Math.hypot(dx, dz);
    neighbours[a].push({ to: b, cost });
    neighbours[b].push({ to: a, cost });
  }
  function nearest(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      const d = Math.hypot(NODES[i].x - x, NODES[i].z - z);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }
  // Dijkstra over the node graph. Returns the walk from (x0, z0) to (x1, z1)
  // as a list of points, start and end included, or a straight line when both
  // ends already share their nearest node.
  function path(x0, z0, x1, z1) {
    const start = nearest(x0, z0);
    const goal = nearest(x1, z1);
    if (start === goal) return [{ x: x0, z: z0 }, { x: x1, z: z1 }];
    const dist = new Array(NODES.length).fill(Infinity);
    const prev = new Array(NODES.length).fill(-1);
    const done = new Array(NODES.length).fill(false);
    dist[start] = 0;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < NODES.length; i += 1) {
        if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      }
      if (u === -1 || u === goal) break;
      done[u] = true;
      for (const edge of neighbours[u]) {
        const alt = dist[u] + edge.cost;
        if (alt < dist[edge.to]) { dist[edge.to] = alt; prev[edge.to] = u; }
      }
    }
    const chain = [];
    let node = goal;
    while (node !== -1) { chain.unshift(node); node = prev[node]; }
    if (chain.length === 0 || chain[0] !== start) return [{ x: x0, z: z0 }, { x: x1, z: z1 }];
    const points = [{ x: x0, z: z0 }];
    for (const n of chain) points.push({ x: NODES[n].x, z: NODES[n].z });
    points.push({ x: x1, z: z1 });
    return points;
  }
  return { path };
}

// --- canvas textures: the yard's look is painted, not modelled ---

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function groundTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, s, s);
    // Sand speckle.
    for (let i = 0; i < 2600; i += 1) {
      const shade = Math.random();
      ctx.fillStyle = shade < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,230,190,0.08)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    // Tyre arcs where trucks turn through the yard.
    ctx.strokeStyle = 'rgba(30,22,16,0.28)';
    ctx.lineWidth = 9;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.arc(60 + Math.random() * 390, 60 + Math.random() * 390, 40 + Math.random() * 90, Math.random() * 6.28, Math.random() * 2 + 0.6);
      ctx.stroke();
    }
    // Oil stains.
    for (let i = 0; i < 9; i += 1) {
      ctx.fillStyle = 'rgba(20,16,12,0.20)';
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 14 + Math.random() * 26, 8 + Math.random() * 16, Math.random() * 3, 0, 6.29);
      ctx.fill();
    }
  }, 3, 3);
}

function wallTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 0, s, s);
    // Corrugated ribs.
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, 0, 5, s);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + 8, 0, 4, s);
    }
    // Rust streaks running down from the top.
    for (let i = 0; i < 26; i += 1) {
      const x = Math.random() * s;
      const len = 30 + Math.random() * 120;
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(138,74,40,0.55)');
      grad.addColorStop(1, 'rgba(138,74,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 3 + Math.random() * 5, len);
    }
  }, 6, 1);
}

function hazardTexture(letter) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#3a332c';
    ctx.fillRect(0, 0, s, s);
    // Hazard border.
    ctx.save();
    ctx.beginPath();
    ctx.rect(10, 10, s - 20, s - 20);
    ctx.clip();
    for (let x = -s; x < s * 2; x += 32) {
      ctx.fillStyle = (Math.floor(x / 32) % 2 === 0) ? PALETTE.hazard : '#1c1712';
      ctx.beginPath();
      ctx.moveTo(x, s - 10);
      ctx.lineTo(x + 32, s - 10);
      ctx.lineTo(x + 32 + 22, 10);
      ctx.lineTo(x + 22, 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(28, 28, s - 56, s - 56);
    ctx.fillStyle = PALETTE.sandLight;
    ctx.font = `bold ${s * 0.52}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 + 6);
  });
}

function signTexture(letter) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = PALETTE.hazard;
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    ctx.fillStyle = PALETTE.hazard;
    ctx.font = `bold ${s * 0.58}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 + 8);
  });
}

export function createWorld(scene) {
  const colliders = [];
  const shootables = [];

  // Lights: a low warm sun and a dusk-coloured sky fill.
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.4);
  sun.position.set(20, 28, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(new THREE.Color('#8a6a4a'), new THREE.Color('#3a2f26'), 0.85));

  function addCollider(x, z, halfW, halfD, height = 4) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - halfW, 0, z - halfD),
      new THREE.Vector3(x + halfW, height, z + halfD),
    ));
  }

  function solid(mesh, collide = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    shootables.push(mesh);
    if (collide) {
      const box = new THREE.Box3().setFromObject(mesh);
      colliders.push(new THREE.Box3(
        new THREE.Vector3(box.min.x, 0, box.min.z),
        new THREE.Vector3(box.max.x, Math.max(1, box.max.y), box.max.z),
      ));
    }
    return mesh;
  }

  // Ground: sand with tyre arcs and oil stains, plus a darker apron at mid.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 38),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.8, metalness: 0.25 });
  const wallDarkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.wallDark), roughness: 0.85 });
  const rustMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.7, metalness: 0.35 });
  const steelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.45, metalness: 0.6 });

  function wall(x, z, w, d, h = 4) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(x, h / 2, z);
    solid(mesh);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w === d ? w : w + 0.1, 0.18, d === w ? d : d + 0.1), wallDarkMat);
    trim.position.set(x, h + 0.09, z);
    trim.castShadow = true;
    scene.add(trim);
    shootables.push(trim);
  }

  // Perimeter fence.
  wall(0, -18.4, 45.6, 0.8);
  wall(0, 18.4, 45.6, 0.8);
  wall(-22.4, 0, 0.8, 37.6);
  wall(22.4, 0, 0.8, 37.6);
  // Mid cross-wall at z = 2 with three door gaps: centre, west lane, east lane.
  wall(-20, 2, 4, 1, 3.5);
  wall(-8.5, 2, 13, 1, 3.5);
  wall(8.5, 2, 13, 1, 3.5);
  wall(20, 2, 4, 1, 3.5);
  // Site fences: A and B are walled on the north and outer sides, open south.
  wall(-14, -14.4, 8.8, 0.8, 3.2);
  wall(-18.4, -10, 0.8, 8.8, 3.2);
  wall(14, -14.4, 8.8, 0.8, 3.2);
  wall(18.4, -10, 0.8, 8.8, 3.2);

  // Door frames on the mid gaps: posts and a lintel, so the gaps read as doors.
  for (const gx of [-2.1, 2.1, -18.1, -14.9, 14.9, 18.1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 0.5), steelMat);
    post.position.set(gx, 1.7, 2);
    solid(post);
  }
  for (const [cx, w] of [[0, 4.6], [-16.5, 3.6], [16.5, 3.6]]) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, 0.7), rustMat);
    lintel.position.set(cx, 3.5, 2);
    solid(lintel, false);
  }

  // The silo pair flanking the centre doors, with banding and cone roofs.
  for (const sx of [-4.5, 4.5]) {
    const silo = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 7, 20),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rustLight), roughness: 0.55, metalness: 0.45 }),
    );
    silo.position.set(sx, 3.5, 0.5);
    solid(silo);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.75, 1.2, 20),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.6 }),
    );
    roof.position.set(sx, 8.1, 0.5);
    solid(roof, false);
    for (const by of [1.6, 3.8, 6]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.07, 8, 28), steelMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(sx, by, 0.5);
      scene.add(band);
    }
  }

  // Pipe gantry over the middle: two fat pipes on columns, a valve wheel, and
  // a hanging lamp that glows over the doors.
  for (const py of [4.6, 5.4]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 16, 12), steelMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, py, 1);
    solid(pipe, false);
  }
  for (const cx of [-7, 7]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.4, 0.5), rustMat);
    column.position.set(cx, 2.7, 1);
    solid(column);
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 24), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.4, metalness: 0.5 }));
  wheel.position.set(7, 2.2, 0.8);
  wheel.castShadow = true;
  scene.add(wheel);
  const gantryLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.18, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.lamp), emissive: new THREE.Color(PALETTE.lamp), emissiveIntensity: 1.6 }),
  );
  gantryLamp.position.set(0, 4.35, 1);
  scene.add(gantryLamp);

  // Shipping containers: teal and rust, ribbed, with stencilled numbers.
  function container(x, z, color, label, rotY = 0) {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.5, 2.2), mat);
    body.position.set(x, 1.25, z);
    body.rotation.y = rotY;
    solid(body);
    for (let i = -1; i <= 1; i += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 2.26), wallDarkMat);
      rib.position.set(x + i * 1.4, 1.25, z);
      rib.rotation.y = rotY;
      scene.add(rib);
    }
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.9),
      new THREE.MeshBasicMaterial({ map: canvasTexture(256, (ctx, s) => {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.clearRect(0, 0, s, s);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `bold ${s * 0.22}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(label, s / 2, s / 2);
      }), transparent: true }),
    );
    // The stencil sits on the container's outward face, whichever way the
    // container is turned: offset along its facing direction, not always +z.
    face.position.set(x + Math.sin(rotY) * 1.12, 1.7, z + Math.cos(rotY) * 1.12);
    face.rotation.y = rotY;
    scene.add(face);
  }
  container(-20, 8, PALETTE.containerA, 'SND-07');
  container(20, 8, PALETTE.containerB, 'SND-11', Math.PI);
  container(-20, -12, PALETTE.containerB, 'SND-03', Math.PI / 2);
  container(20, -12, PALETTE.containerA, 'SND-09', -Math.PI / 2);

  // Crates: the lane cover. Each is a box with a darker lid so it reads as
  // stacked timber and steel from any angle. yBase stacks one crate on
  // another (the collider follows the mesh, so the stack blocks movement).
  function crate(x, z, size, rotY = 0, yBase = 0) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.9 }),
    );
    body.position.set(x, yBase + size / 2, z);
    body.rotation.y = rotY;
    solid(body);
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.08, 0.1, size + 0.08),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crateDark), roughness: 0.9 }),
    );
    lid.position.set(x, yBase + size + 0.05, z);
    lid.rotation.y = rotY;
    scene.add(lid);
  }
  crate(-10, 8, 1.5, 0.3);
  crate(-10, 8, 1.0, 0.3, 1.5);
  crate(10, 8, 1.5, -0.2);
  crate(-11, -5, 1.3, 0.5);
  crate(11, -5, 1.3, -0.4);
  crate(-19, -3, 1.4, 0.2);
  crate(19, -3, 1.4, -0.3);
  crate(-17, -12, 1.2, 0.1);
  crate(-11, -13, 1.2, 0.6);
  crate(17, -12, 1.2, -0.2);
  crate(11, -13, 1.2, 0.4);

  // Barrels tucked against the fences.
  for (const [bx, bz] of [[-20, 12], [20, -12], [-21, -6]]) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.4 }),
    );
    barrel.position.set(bx, 0.55, bz);
    solid(barrel);
  }

  // Lamp posts: poles with warm glowing heads over the lanes.
  for (const [lx, lz] of [[-10, 9], [10, 9], [-10, -8], [10, -8]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8), steelMat);
    pole.position.set(lx, 2.2, lz);
    solid(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.lamp), emissive: new THREE.Color(PALETTE.lamp), emissiveIntensity: 1.4 }),
    );
    head.position.set(lx, 4.45, lz);
    scene.add(head);
  }

  // Bomb sites: hazard pads on the ground and big letter boards at the door.
  const sites = {
    A: { x: -14, z: -10, minX: -18, maxX: -10, minZ: -14, maxZ: -6 },
    B: { x: 14, z: -10, minX: 10, maxX: 18, minZ: -14, maxZ: -6 },
  };
  for (const [name, site] of Object.entries(sites)) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ map: hazardTexture(name), roughness: 0.9 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = name === 'A' ? 0 : Math.PI;
    pad.position.set(site.x, 0.02, site.z);
    pad.receiveShadow = true;
    scene.add(pad);
    const postX = name === 'A' ? -17.5 : 17.5;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3, 0.18), steelMat);
    post.position.set(postX, 1.5, -6);
    solid(post);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: signTexture(name) }),
    );
    board.position.set(postX, 3.4, -6);
    board.rotation.y = name === 'A' ? Math.PI / 4 : -Math.PI / 4;
    scene.add(board);
  }

  const spawns = {
    sable: [
      { x: 0, z: 14, yaw: 0 }, { x: -7, z: 14, yaw: 0 }, { x: 7, z: 14, yaw: 0 },
      { x: -13, z: 15, yaw: 0 }, { x: 13, z: 15, yaw: 0 },
    ],
    viper: [
      { x: 0, z: -15, yaw: Math.PI }, { x: -7, z: -15, yaw: Math.PI }, { x: 7, z: -15, yaw: Math.PI },
      { x: -13, z: -16, yaw: Math.PI }, { x: 13, z: -16, yaw: Math.PI },
    ],
  };

  return { colliders, shootables, sites, spawns, waypoints: buildWaypoints() };
}
