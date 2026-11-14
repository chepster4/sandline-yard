// SANDLINE YARD — weapons. Four guns in the Counter-Strike shape (a free
// pistol, a cheap SMG, a workhorse rifle, a slow heavy sniper), each with its
// own damage, headshot multiplier, range, magazine and recoil, plus frag and
// smoke grenades with real physics: they bounce off walls, then the frag
// bursts and the smoke hangs as a sphere that blocks line of sight.
// The loadout owns the first-person viewmodel, a low-poly gun that bobs as
// you walk and kicks when you fire.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, damage: 28, headMult: 2.0, range: 60,
    mag: 12, reserve: 36, reload: 1.4, fireGap: 0.16, kick: 0.011,
    auto: false, zoom: 1, spreadBase: 0.006, color: 0x3a3f45,
  },
  smg: {
    name: 'Raptor-9', price: 1150, damage: 24, headMult: 1.8, range: 55,
    mag: 28, reserve: 84, reload: 1.9, fireGap: 0.085, kick: 0.009,
    auto: true, zoom: 1, spreadBase: 0.009, color: 0x4a4438,
  },
  rifle: {
    name: 'Longshot AR', price: 2700, damage: 32, headMult: 2.2, range: 120,
    mag: 25, reserve: 75, reload: 2.3, fireGap: 0.11, kick: 0.016,
    auto: true, zoom: 1, spreadBase: 0.005, color: 0x2f3a2f,
  },
  sniper: {
    name: 'Deadeye .50', price: 4750, damage: 95, headMult: 2.5, range: 160,
    mag: 5, reserve: 15, reload: 3.0, fireGap: 1.1, kick: 0.05,
    auto: false, zoom: 2.4, spreadBase: 0.001, color: 0x51382a,
  },
};

export const GRENADES = {
  frag: { name: 'Frag Grenade', price: 300, radius: 9, maxDamage: 110, fuse: 1.6 },
  smoke: { name: 'Smoke Grenade', price: 300, radius: 5, duration: 14, fuse: 1.2 },
};

export function createLoadout(camera, audio) {
  const state = {
    owned: { pistol: { mag: 12, reserve: 36, cooldown: 0, reloadLeft: 0 } },
    current: 'pistol',
    grenades: { frag: 0, smoke: 0 },
  };
  let viewmodel = null;
  let kickOffset = 0;
  let bobTime = 0;

  function buildViewmodel() {
    if (viewmodel) {
      camera.remove(viewmodel);
      viewmodel.traverse((child) => {
        if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); }
      });
    }
    const def = WEAPONS[state.current];
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5, metalness: 0.6, emissive: def.color, emissiveIntensity: 0.28 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.5, emissive: 0x2a2e35, emissiveIntensity: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xd97a2b, roughness: 0.45, metalness: 0.4, emissive: 0xd97a2b, emissiveIntensity: 0.35 });
    const bodyLen = state.current === 'sniper' ? 0.62 : state.current === 'rifle' ? 0.5 : 0.34;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, bodyLen), bodyMat);
    body.position.set(0, 0, -bodyLen / 2);
    group.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.014, bodyLen * 0.8), accentMat);
    stripe.position.set(0, 0.06, -bodyLen / 2);
    group.add(stripe);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -bodyLen - 0.08);
    group.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), darkMat);
    grip.position.set(0, -0.13, 0.05);
    grip.rotation.x = 0.25;
    group.add(grip);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.035, 0.02), accentMat);
    frontSight.position.set(0, 0.07, -bodyLen + 0.03);
    group.add(frontSight);
    if (state.current === 'rifle' || state.current === 'sniper') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), darkMat);
      mag.position.set(0, -0.13, -0.12);
      mag.rotation.x = 0.12;
      group.add(mag);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), darkMat);
      sight.position.set(0, 0.09, -0.08);
      group.add(sight);
    }
    if (state.current === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), darkMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.1, -0.05);
      group.add(scope);
    }
    group.position.set(0.28, -0.24, -0.5);
    camera.add(group);
    viewmodel = group;
  }

  function def() {
    return WEAPONS[state.current];
  }

  function takeRound() {
    const slot = state.owned[state.current];
    if (!slot || slot.mag <= 0) return false;
    slot.mag -= 1;
    return true;
  }

  function pullTrigger() {
    const w = state.owned[state.current];
    if (!w || w.cooldown > 0 || w.reloadLeft > 0) return false;
    if (w.mag <= 0) {
      reload();
      return false;
    }
    w.mag -= 1;
    w.cooldown = def().fireGap;
    return true;
  }

  // Spread in radians: a base per weapon, worse while moving, better while
  // crouched or aiming down the sights. Stopping to aim pays, as it should.
  function spread(speed, aiming, crouching) {
    const base = def().spreadBase;
    const move = Math.min(speed, 6) * 0.0022;
    let value = base + move;
    if (crouching) value *= 0.7;
    if (aiming) value *= 0.55;
    return value;
  }

  function reload() {
    const slot = state.owned[state.current];
    const d = def();
    if (slot.reloadLeft > 0 || slot.mag >= d.mag || slot.reserve <= 0) return;
    slot.reloadLeft = d.reload;
    audio.reload();
  }

  function refillAmmo() {
    for (const [id, slot] of Object.entries(state.owned)) {
      slot.mag = WEAPONS[id].mag;
      slot.reserve = WEAPONS[id].reserve;
      slot.cooldown = 0;
      slot.reloadLeft = 0;
    }
  }

  function reveal() {
    if (!viewmodel) buildViewmodel();
    viewmodel.visible = true;
  }

  function buy(id) {
    const d = WEAPONS[id];
    if (!d || state.owned[id]) return;
    state.owned[id] = { mag: d.mag, reserve: d.reserve, cooldown: 0, reloadLeft: 0 };
  }

  function equip(id) {
    if (!state.owned[id]) return false;
    state.current = id;
    buildViewmodel();
    // Picking up an empty gun starts its reload at once instead of leaving
    // the player to discover the empty magazine mid-fight.
    if (state.owned[id].mag === 0 && state.owned[id].reserve > 0) reload();
    return true;
  }

  function step(dt) {
    const slot = state.owned[state.current];
    if (slot.cooldown > 0) slot.cooldown -= dt;
    if (slot.reloadLeft > 0) {
      slot.reloadLeft -= dt;
      if (slot.reloadLeft <= 0) {
        slot.reloadLeft = 0;
        const d = def();
        const need = d.mag - slot.mag;
        const moved = Math.min(need, slot.reserve);
        slot.mag += moved;
        slot.reserve -= moved;
      }
    }
    // Viewmodel life: a slow breathing bob and a sharp kick that settles.
    bobTime += dt;
    kickOffset = Math.max(0, kickOffset - dt * 6);
    if (viewmodel) {
      viewmodel.position.y = -0.24 + Math.sin(bobTime * 1.8) * 0.004;
      viewmodel.position.z = -0.5 + kickOffset * 0.06;
      viewmodel.rotation.x = kickOffset * 0.09;
    }
  }

  function ready() {
    const slot = state.owned[state.current];
    return slot.cooldown <= 0 && slot.reloadLeft <= 0;
  }

  function primaryId() {
    for (const id of ['rifle', 'smg', 'sniper']) {
      if (state.owned[id]) return id;
    }
    return null;
  }

  function zoom() {
    return def().zoom;
  }

  buildViewmodel();
  return {
    state, def, takeRound, pullTrigger, spread, reload, refillAmmo,
    reveal, buy, equip, step, ready, primaryId, zoom,
  };
}

export function createGrenades(scene, colliders, hooks) {
  const thrown = [];
  const smokes = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({ color: 0x2c3128, roughness: 0.5, metalness: 0.6 });
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.3 });

  function reset() {
    for (const g of thrown) scene.remove(g.mesh);
    for (const s of smokes) scene.remove(s.mesh);
    thrown.length = 0;
    smokes.length = 0;
  }

  function throwGrenade(kind, origin, dir) {
    const mesh = new THREE.Mesh(grenadeGeo, kind === 'frag' ? fragMat : smokeMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    thrown.push({
      kind,
      mesh,
      vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: GRENADES[kind].fuse,
    });
  }

  // Bounce a thrown grenade off the world's boxes: find the shallowest
  // penetration axis, push the grenade out along it and flip that velocity
  // component with a dampening factor.
  function collide(g, next) {
    for (const box of colliders) {
      if (next.x < box.min.x - 0.1 || next.x > box.max.x + 0.1) continue;
      if (next.y < box.min.y - 0.1 || next.y > box.max.y + 0.1) continue;
      if (next.z < box.min.z - 0.1 || next.z > box.max.z + 0.1) continue;
      const penX = Math.min(next.x - box.min.x, box.max.x - next.x);
      const penY = Math.min(next.y - box.min.y, box.max.y - next.y);
      const penZ = Math.min(next.z - box.min.z, box.max.z - next.z);
      if (penX <= penY && penX <= penZ) {
        g.vel.x *= -0.45;
        next.x = g.vel.x > 0 ? box.min.x - 0.1 : box.max.x + 0.1;
      } else if (penY <= penZ) {
        g.vel.y *= -0.45;
        next.y = g.vel.y > 0 ? box.min.y - 0.1 : box.max.y + 0.1;
      } else {
        g.vel.z *= -0.45;
        next.z = g.vel.z > 0 ? box.min.z - 0.1 : box.max.z + 0.1;
      }
      return true;
    }
    return false;
  }

  function detonate(g) {
    scene.remove(g.mesh);
    if (g.kind === 'frag') {
      hooks.onFrag(g.mesh.position.clone());
    } else {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(GRENADES.smoke.radius, 18, 12),
        new THREE.MeshBasicMaterial({
          color: 0xb8bcc2, transparent: true, opacity: 0.5, depthWrite: false,
        }),
      );
      mesh.position.copy(g.mesh.position);
      mesh.position.y = Math.max(1.6, mesh.position.y);
      scene.add(mesh);
      smokes.push({ mesh, life: GRENADES.smoke.duration });
    }
  }

  function step(dt) {
    for (let i = thrown.length - 1; i >= 0; i -= 1) {
      const g = thrown[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
      if (next.y <= 0.09) {
        next.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      collide(g, next);
      g.mesh.position.copy(next);
      if (g.fuse <= 0) {
        thrown.splice(i, 1);
        detonate(g);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      s.life -= dt;
      if (s.life <= 0) {
        scene.remove(s.mesh);
        smokes.splice(i, 1);
      } else if (s.life < 3) {
        s.mesh.material.opacity = 0.5 * (s.life / 3);
      }
    }
  }

  // blockedBySmoke(a, b): true when the segment between two points passes
  // through any live smoke cloud — the bots' vision check uses it.
  function blockedBySmoke(a, b) {
    for (const s of smokes) {
      const center = s.mesh.position;
      const ab = b.clone().sub(a);
      const lenSq = ab.lengthSq();
      if (lenSq === 0) continue;
      const t = Math.max(0, Math.min(1, center.clone().sub(a).dot(ab) / lenSq));
      const closest = a.clone().addScaledVector(ab, t);
      if (closest.distanceTo(center) < GRENADES.smoke.radius) return true;
    }
    return false;
  }

  return { reset, throwGrenade, step, blockedBySmoke };
}
