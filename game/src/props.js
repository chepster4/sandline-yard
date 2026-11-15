// SANDLINE YARD — yard dressing. The compound's clutter: sandbag lines, cable
// spools, pallets, floodlight towers, site beacons and painted ground
// chevrons, so the lanes read as a worked freight yard instead of an empty
// lot. Everything is static, placed off the bot corridors (the waypoint
// graph), and every solid piece registers a collider and a shootable mesh
// with the world, exactly like world.js does. A fixed local seed keeps the
// scatter deterministic in every run, shot or not.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';

export function addProps(scene, world) {
  const rng = mulberry32(1337);
  const { colliders, shootables } = world;
  const sandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a7a5a'), roughness: 0.95 });
  const sandDarkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b5c42'), roughness: 0.95 });
  const steelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.6 });
  const rustMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.65, metalness: 0.4 });
  const crateMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.9 });
  const tireMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e1c1a'), roughness: 0.95 });

  // Register a mesh that is already placed in the scene graph (directly or
  // inside a group): shadows on, shootable, and a ground-anchored collider
  // from its world bounds. The mesh keeps its parent; only its registration
  // happens here, so grouped props keep their group transform.
  function solid(mesh, height = 4) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shootables.push(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(box.min.x, 0, box.min.z),
      new THREE.Vector3(box.max.x, Math.max(0.6, box.max.y), box.max.z),
    ));
    return mesh;
  }

  // Sandbag lines: two staggered rows of sacks, low enough to shoot over,
  // solid enough to stop a bot. One collider covers the whole line.
  function sandbags(x, z, rotY, length) {
    const group = new THREE.Group();
    const bagGeo = new THREE.BoxGeometry(0.62, 0.26, 0.36);
    const rows = 2;
    const perRow = Math.max(2, Math.round(length / 0.6));
    for (let r = 0; r < rows; r += 1) {
      for (let i = 0; i < perRow; i += 1) {
        const bag = new THREE.Mesh(bagGeo, r === 0 ? sandMat : sandDarkMat);
        bag.position.set((i - (perRow - 1) / 2) * 0.58 + (r === 1 ? 0.29 : 0), 0.13 + r * 0.24, (rng() - 0.5) * 0.08);
        bag.rotation.y = (rng() - 0.5) * 0.25;
        bag.castShadow = true;
        bag.receiveShadow = true;
        group.add(bag);
      }
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);
    const half = length / 2;
    const w = rotY === 0 ? half : 0.35;
    const d = rotY === 0 ? 0.35 : half;
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w, 0, z - d),
      new THREE.Vector3(x + w, 0.55, z + d),
    ));
    group.traverse((m) => { if (m.isMesh) shootables.push(m); });
  }

  // Cable spools: a drum on its side with two disc cheeks.
  function spool(x, z, rotY) {
    const group = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14), rustMat);
    drum.rotation.z = Math.PI / 2;
    const cheekGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.08, 14);
    const cheekA = new THREE.Mesh(cheekGeo, sandDarkMat);
    cheekA.rotation.z = Math.PI / 2;
    cheekA.position.x = -0.28;
    const cheekB = new THREE.Mesh(cheekGeo, sandDarkMat);
    cheekB.rotation.z = Math.PI / 2;
    cheekB.position.x = 0.28;
    group.add(drum, cheekA, cheekB);
    group.position.set(x, 0.62, z);
    group.rotation.y = rotY;
    scene.add(group);
    for (const m of [drum, cheekA, cheekB]) solid(m);
  }

  // Pallets with sacks: a flat timber pallet, three lumpy sacks on top.
  function pallet(x, z, rotY) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.1), crateMat);
    base.position.y = 0.06;
    group.add(base);
    const sacks = [];
    for (let i = 0; i < 3; i += 1) {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), sandMat);
      sack.scale.set(1, 0.62, 0.85);
      sack.position.set(-0.32 + i * 0.32, 0.32, (rng() - 0.5) * 0.3);
      sack.rotation.y = rng() * 3;
      group.add(sack);
      sacks.push(sack);
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);
    for (const m of [base, ...sacks]) solid(m, 1);
  }

  // Floodlight towers: a tall pole, a glowing head, and a cone of light
  // (a transparent additive cone, no real light — cheap and shot-stable).
  function floodlight(x, z, faceYaw) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8), steelMat);
    pole.position.set(x, 3.1, z);
    scene.add(pole);
    solid(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.3), steelMat);
    head.position.set(x, 6.25, z);
    head.rotation.y = faceYaw;
    head.castShadow = true;
    scene.add(head);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.22),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.lamp), emissive: new THREE.Color(PALETTE.lamp), emissiveIntensity: 2.2 }),
    );
    lamp.position.set(x, 6.18, z);
    lamp.rotation.y = faceYaw;
    scene.add(lamp);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 6, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    );
    cone.position.set(x - Math.sin(faceYaw) * 1.2, 3.1, z - Math.cos(faceYaw) * 1.2);
    cone.rotation.x = Math.PI;
    cone.rotation.y = faceYaw;
    scene.add(cone);
  }

  // Site beacons: a vertical column of light over each bomb site, so A and B
  // read from across the yard even through the dusk haze.
  function siteBeacon(x, z) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.9, 15, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.hazard), transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    );
    beam.position.set(x, 7.5, z);
    scene.add(beam);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.05, 8, 28),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), emissive: new THREE.Color(PALETTE.hazard), emissiveIntensity: 1.2 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.06, z);
    scene.add(ring);
  }

  // Painted ground chevrons: yellow arrows on the dirt pointing up the lanes
  // toward the sites, so the attack direction reads at a glance.
  function chevron(x, z, rotY) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(242,194,48,0.75)';
    for (let i = 0; i < 2; i += 1) {
      const y = 28 + i * 42;
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(108, y + 34);
      ctx.lineTo(64, y + 20);
      ctx.lineTo(20, y + 34);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = rotY;
    decal.position.set(x, 0.03, z);
    decal.receiveShadow = true;
    scene.add(decal);
  }

  // Tire stacks and sand mounds near the fences, for silhouette at the edges.
  function tireStack(x, z) {
    const group = new THREE.Group();
    const tires = [];
    for (let i = 0; i < 3; i += 1) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 8, 18), tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.y = 0.14 + i * 0.26;
      group.add(tire);
      tires.push(tire);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    for (const m of tires) solid(m, 1);
  }

  function sandMound(x, z, r) {
    const mound = new THREE.Mesh(
      new THREE.ConeGeometry(r, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.groundDark), roughness: 1 }),
    );
    mound.position.set(x, 0.17, z);
    mound.receiveShadow = true;
    scene.add(mound);
  }

  // Extra lane crates flanking the site approach, clear of every corridor.
  function crate(x, z, size, rotY) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.9 }),
    );
    body.position.set(x, size / 2, z);
    body.rotation.y = rotY;
    scene.add(body);
    solid(body);
  }

  // --- placement: tight to the walls and the existing cover, never on a node ---
  sandbags(-19, 5, Math.PI / 2, 3.4);
  sandbags(19, 5, Math.PI / 2, 3.4);
  sandbags(-19, -8, Math.PI / 2, 3.0);
  sandbags(19, -8, Math.PI / 2, 3.0);
  sandbags(-4.5, 4.6, 0, 2.6);
  sandbags(4.5, 4.6, 0, 2.6);
  spool(-6, 12, 0.4);
  spool(6, 12, -0.3);
  spool(-13, -13, 0.9);
  spool(13, -13, -0.7);
  pallet(-12, 10, 0.2);
  pallet(12, 10, -0.4);
  pallet(-17, 12.5, 1.1);
  floodlight(-19.5, 0, Math.PI / 2);
  floodlight(19.5, 0, -Math.PI / 2);
  floodlight(-19.5, -13, Math.PI / 2);
  floodlight(19.5, -13, -Math.PI / 2);
  siteBeacon(-14, -10);
  siteBeacon(14, -10);
  chevron(0, 8, Math.PI);
  chevron(-16.5, 8, Math.PI);
  chevron(16.5, 8, Math.PI);
  tireStack(-21, 14);
  tireStack(21, 14);
  tireStack(-21, -16);
  sandMound(-21, -14, 1.1);
  sandMound(21, -14, 1.1);
  sandMound(-21, 4, 0.9);
  sandMound(21, 4, 0.9);
  crate(-4, -8, 1.3, 0.4);
  crate(4, -8, 1.3, -0.5);
  crate(-6.5, -11, 1.0, 0.2);
  crate(6.5, -11, 1.0, -0.3);
}
