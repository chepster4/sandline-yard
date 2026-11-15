// SANDLINE YARD — the soldier. An articulated low-poly trooper to replace
// the block bots: helmet with visor, vest with plate and pouches, arms held
// forward on the rifle, two-segment legs and a backpack, so a bot reads as a
// soldier at a glance instead of a toy. Limbs pivot at their joints, and the
// caller swings thigh/shin/arm by a walk phase. The torso and head meshes
// are the hitboxes, tagged by the caller exactly as before.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function std(color, roughness = 0.7, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
}

// A limb segment pivoting at its top: geometry translated so rotation.x
// swings it from the joint instead of its centre.
function limb(w, len, d, mat) {
  const geo = new THREE.BoxGeometry(w, len, d);
  geo.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

export function buildSoldier(team) {
  const teamColor = team === 'sable' ? PALETTE.sable : PALETTE.viper;
  const cloth = std(teamColor, 0.75);
  const dark = std(PALETTE.hairline, 0.85);
  const vestMat = std(team === 'sable' ? '#24504c' : '#5a3a20', 0.8);
  const skin = std(PALETTE.sand, 0.7);
  const group = new THREE.Group();

  // Legs: thigh pivots at the hip, shin hangs from the knee, boot caps it.
  function leg(side) {
    const thigh = limb(0.17, 0.38, 0.2, dark);
    thigh.position.set(0.12 * side, 0.82, 0);
    const shin = limb(0.15, 0.38, 0.17, dark);
    shin.position.set(0, -0.38, 0);
    thigh.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), std('#17130f', 0.9));
    boot.position.set(0, -0.38, 0.04);
    shin.add(boot);
    group.add(thigh);
    return { thigh, shin };
  }
  const legL = leg(-1);
  const legR = leg(1);

  // Torso: team cloth with a dark vest plate, two pouches and shoulder pads.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.32), cloth);
  torso.position.y = 1.18;
  torso.castShadow = true;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.48, 0.08), vestMat);
  plate.position.set(0, 1.18, -0.18);
  const pouchL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.08), dark);
  pouchL.position.set(-0.13, 0.98, -0.19);
  const pouchR = pouchL.clone();
  pouchR.position.x = 0.13;
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), vestMat);
  padL.position.set(-0.3, 1.5, 0);
  const padR = padL.clone();
  padR.position.x = 0.3;
  group.add(torso, plate, pouchL, pouchR, padL, padR);

  // Backpack with a bedroll on top.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.48, 0.16), vestMat);
  pack.position.set(0, 1.2, 0.22);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 8), sandMat());
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 1.48, 0.22);
  group.add(pack, roll);
  function sandMat() { return std(PALETTE.sand, 0.9); }

  // Head: helmet dome with brim and a team-coloured visor strip; the dome
  // itself is the head hitbox.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), std('#3a4048', 0.55, 0.3));
  head.scale.set(1, 0.88, 1);
  head.position.y = 1.68;
  head.castShadow = true;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.04, 14), std('#2c3138', 0.6, 0.3));
  brim.position.y = 1.72;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), std(teamColor, 0.4, 0.2));
  visor.position.set(0, 1.68, -0.16);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.1), skin);
  face.position.set(0, 1.56, -0.08);
  group.add(head, brim, visor, face);

  // Arms: angled forward and down to meet the rifle, pivoting at the shoulder.
  function arm(side) {
    const upper = limb(0.13, 0.34, 0.14, cloth);
    upper.position.set(0.32 * side, 1.48, 0);
    upper.rotation.x = -0.85;
    upper.rotation.z = side * -0.18;
    group.add(upper);
    return upper;
  }
  const armL = arm(-1);
  const armR = arm(1);

  // Rifle held across the chest: body, barrel, magazine, stock.
  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.52), dark);
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8), dark);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0, 0.01, -0.36);
  const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), dark);
  gunMag.position.set(0, -0.11, -0.08);
  gunMag.rotation.x = 0.15;
  gun.add(gunBody, gunBarrel, gunMag);
  gun.position.set(0.08, 1.22, -0.3);
  gun.rotation.y = 0.08;
  group.add(gun);

  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  return {
    group, torso, head,
    thighL: legL.thigh, shinL: legL.shin, thighR: legR.thigh, shinR: legR.shin,
    armL, armR, gun,
  };
}
