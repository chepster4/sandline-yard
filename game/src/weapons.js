// Weapons: four guns, two grenades, and the numbers behind them. Every weapon is a
// plain definition; the loadout below owns one set of live state per weapon. Bots use
// the same definitions with a lighter state object (see bots.js). Damage falls with
// range past the weapon's best distance; a headshot multiplies it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidewinder', price: 300, mag: 12, reserve: 36,
    damage: 28, headMult: 3, fireGap: 0.18, auto: false, reload: 1.4,
    spreadStill: 0.003, spreadMove: 0.02, kick: 0.006, range: 60, zoom: 1,
  },
  smg: {
    id: 'smg', name: 'KM-9 Wasp', price: 1150, mag: 32, reserve: 96,
    damage: 22, headMult: 3, fireGap: 0.075, auto: true, reload: 1.7,
    spreadStill: 0.004, spreadMove: 0.03, kick: 0.004, range: 45, zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Jackal', price: 2700, mag: 30, reserve: 90,
    damage: 34, headMult: 3, fireGap: 0.1, auto: true, reload: 1.9,
    spreadStill: 0.002, spreadMove: 0.028, kick: 0.009, range: 80, zoom: 1,
  },
  sniper: {
    id: 'sniper', name: 'LS-88 Longshot', price: 4750, mag: 5, reserve: 20,
    damage: 90, headMult: 2.8, fireGap: 1.1, auto: false, reload: 2.6,
    spreadStill: 0.0008, spreadMove: 0.05, kick: 0.03, range: 120, zoom: 2.4,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'M67 Frag', price: 300, radius: 6, maxDamage: 120 },
  smoke: { id: 'smoke', name: 'SK-2 Smoke', price: 300, radius: 3.2, duration: 12 },
};

const VIEW_MODELS = {
  pistol: { receiver: [0.07, 0.09, 0.24], barrel: [0.04, 0.04, 0.16], stock: null, pos: [0.25, -0.23, -0.36] },
  smg: { receiver: [0.08, 0.1, 0.34], barrel: [0.04, 0.04, 0.24], stock: [0.06, 0.07, 0.16], pos: [0.26, -0.23, -0.4] },
  rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22], pos: [0.27, -0.23, -0.42] },
  sniper: { receiver: [0.09, 0.11, 0.5], barrel: [0.04, 0.04, 0.55], stock: [0.07, 0.09, 0.26], pos: [0.27, -0.23, -0.46], scope: true },
};

// The player's loadout: the weapons they own, the one in hand, grenades, and the
// view model on the camera. main.js owns the ray and the damage; this owns the rest.
export function createLoadout(camera, audio) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.3 });

  const models = {};
  for (const [id, spec] of Object.entries(VIEW_MODELS)) {
    const model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), grip);
    barrel.position.set(0, 0.025, -(spec.receiver[2] / 2 + spec.barrel[2] / 2 - 0.05));
    model.add(receiver, barrel);
    if (spec.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.stock), grip);
      stock.position.set(0, -0.02, spec.receiver[2] / 2 + spec.stock[2] / 2 - 0.04);
      model.add(stock);
    }
    if (spec.scope) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12), accent);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.08, 0.02);
      model.add(scope);
    }
    model.position.set(...spec.pos);
    model.scale.setScalar(0.85);
    model.rotation.y = -0.1;
    model.visible = false;
    camera.add(model);
    models[id] = model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    owned: { pistol: { mag: 12, reserve: 36, cooldown: 0, reloadLeft: 0 } },
    current: 'pistol',
    grenades: { frag: 0, smoke: 0 },
    flash: 0,
    kick: 0,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function current() {
    return state.owned[state.current];
  }

  function step(dt) {
    const weapon = current();
    weapon.cooldown = Math.max(0, weapon.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = VIEW_MODELS[state.current].pos[2] + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (weapon.reloadLeft > 0) {
      weapon.reloadLeft = Math.max(0, weapon.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - weapon.reloadLeft) * 2);
      if (weapon.reloadLeft === 0) {
        const need = def().mag - weapon.mag;
        const take = Math.min(need, weapon.reserve);
        weapon.mag += take;
        weapon.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    // Show the current view model again after it was hidden (player respawn).
    reveal() {
      for (const [id, model] of Object.entries(models)) model.visible = id === state.current;
      flash.visible = false;
      flashLight.visible = true;
    },
    spread(speed, aiming, crouching) {
      const d = def();
      let spread = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
      if (aiming) spread *= 0.45;
      if (crouching) spread *= 0.7;
      return spread;
    },
    zoom() {
      return def().zoom;
    },
    ready() {
      const weapon = current();
      return weapon.mag > 0 && weapon.cooldown === 0 && weapon.reloadLeft === 0;
    },
    pullTrigger() {
      const weapon = current();
      weapon.cooldown = def().fireGap;
      state.flash = 0.06;
      state.kick = 0.02 + def().kick * 3;
      audio.shot(state.current);
    },
    takeRound() {
      const weapon = current();
      if (weapon.mag <= 0) return false;
      weapon.mag -= 1;
      return true;
    },
    reload() {
      const weapon = current();
      if (weapon.reloadLeft > 0 || weapon.mag === def().mag || weapon.reserve === 0) return false;
      weapon.reloadLeft = def().reload;
      audio.reload();
      return true;
    },
    equip(id) {
      if (!state.owned[id] || state.current === id) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.kick = 0;
      return true;
    },
    buy(id) {
      const d = WEAPONS[id];
      if (!d || state.owned[id]) return false;
      state.owned[id] = { mag: d.mag, reserve: d.reserve, cooldown: 0, reloadLeft: 0 };
      return true;
    },
    refillAmmo() {
      for (const [id, weapon] of Object.entries(state.owned)) {
        weapon.mag = WEAPONS[id].mag;
        weapon.reserve = WEAPONS[id].reserve;
        weapon.cooldown = 0;
        weapon.reloadLeft = 0;
      }
    },
    hasPrimary() {
      return ['smg', 'rifle', 'sniper'].some((id) => state.owned[id]);
    },
    primaryId() {
      return ['sniper', 'rifle', 'smg'].find((id) => state.owned[id]) ?? null;
    },
  };
}

// Thrown grenades: a gravity projectile that bounces once, then bursts. A frag
// damages everything in its radius with falloff; a smoke opens a cloud that blocks
// sight. The scene owns the meshes; the callbacks own the consequences.
export function createGrenades(scene, colliders, hooks) {
  const active = [];
  const clouds = [];
  const sphereGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.5, metalness: 0.6 });
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.3 });
  const cloudGeometry = new THREE.SphereGeometry(1, 16, 12);
  const probe = new THREE.Box3();

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function throwGrenade(kind, origin, direction) {
    const mesh = new THREE.Mesh(sphereGeometry, kind === 'frag' ? fragMaterial : smokeMaterial);
    mesh.position.copy(origin);
    scene.add(mesh);
    active.push({
      kind,
      mesh,
      velocity: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.4, 0)),
      fuse: kind === 'frag' ? 1.5 : 1.1,
      bounced: false,
    });
  }

  function step(dt) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const grenade = active[i];
      grenade.velocity.y -= 14 * dt;
      const next = grenade.mesh.position.clone().addScaledVector(grenade.velocity, dt);
      const hit = overlaps(next.x, next.y, next.z);
      if (hit) {
        if (!grenade.bounced) {
          grenade.velocity.multiplyScalar(0.45);
          grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.5 + 1.2;
          grenade.bounced = true;
        } else {
          grenade.velocity.multiplyScalar(0.4);
          grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.35;
        }
      } else {
        grenade.mesh.position.copy(next);
      }
      if (grenade.mesh.position.y < 0.09) {
        grenade.mesh.position.y = 0.09;
        grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.4;
        grenade.velocity.x *= 0.7;
        grenade.velocity.z *= 0.7;
      }
      grenade.fuse -= dt;
      if (grenade.fuse <= 0) {
        const position = grenade.mesh.position.clone();
        scene.remove(grenade.mesh);
        active.splice(i, 1);
        if (grenade.kind === 'frag') hooks.onFrag(position);
        else {
          const cloud = new THREE.Mesh(
            cloudGeometry,
            new THREE.MeshBasicMaterial({ color: new THREE.Color('#b9a98e'), transparent: true, opacity: 0.82, depthWrite: false }),
          );
          cloud.position.set(position.x, 1.4, position.z);
          cloud.scale.setScalar(GRENADES.smoke.radius);
          scene.add(cloud);
          clouds.push({ mesh: cloud, center: position.clone(), radius: GRENADES.smoke.radius, left: GRENADES.smoke.duration });
        }
      }
    }
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      const cloud = clouds[i];
      cloud.left -= dt;
      cloud.mesh.material.opacity = Math.min(0.82, cloud.left * 0.4);
      if (cloud.left <= 0) {
        scene.remove(cloud.mesh);
        clouds.splice(i, 1);
      }
    }
  }

  return {
    throwGrenade,
    step,
    clouds,
    // A segment is seen through smoke when it passes within a live cloud.
    blockedBySmoke(a, b) {
      for (const cloud of clouds) {
        const ab = new THREE.Vector3().subVectors(b, a);
        const ac = new THREE.Vector3().subVectors(cloud.center, a);
        const lengthSq = ab.lengthSq();
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ac.dot(ab) / lengthSq));
        const closest = new THREE.Vector3().copy(a).addScaledVector(ab, t);
        if (closest.distanceTo(cloud.center) < cloud.radius) return true;
      }
      return false;
    },
    reset() {
      for (const grenade of active) scene.remove(grenade.mesh);
      active.length = 0;
      for (const cloud of clouds) scene.remove(cloud.mesh);
      clouds.length = 0;
    },
  };
}
