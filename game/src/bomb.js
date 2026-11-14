// The bomb: a small state machine with a beeping box in the world. It starts carried,
// can be dropped on death and picked up again, plants in 3 seconds inside a site,
// ticks for 40 seconds, and ends the round either by exploding or by a 5-second
// defuse. The round clock, the plant progress and the detonation are all here; the
// scores live in economy.js.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 40;

export function createBomb(scene, world) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.4 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  light.position.set(0, 0.12, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    status: 'carried',
    carrier: null,
    site: null,
    position: new THREE.Vector3(),
    plantProgress: 0,
    defuseProgress: 0,
    timer: BOMB_TIMER,
    lastBeep: 0,
  };

  return {
    state,
    reset(carrier, site) {
      state.status = 'carried';
      state.carrier = carrier;
      state.site = site;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.timer = BOMB_TIMER;
      state.lastBeep = 0;
      group.visible = false;
    },
    drop(position) {
      state.status = 'dropped';
      state.carrier = null;
      state.plantProgress = 0;
      state.position.copy(position);
      state.position.y = 0.12;
      group.position.copy(state.position);
      group.visible = true;
    },
    pickUp(carrier) {
      state.status = 'carried';
      state.carrier = carrier;
      group.visible = false;
    },
    // The carrier (or the player) stands in the site; progress is driven by the
    // caller and reported back through onPlanted when it completes.
    plantProgress(amount) {
      state.plantProgress = amount;
    },
    plant(site) {
      state.status = 'planted';
      state.site = site;
      state.timer = BOMB_TIMER;
      state.position.copy(group.position);
      group.visible = true;
      group.position.set(world.sites[site].x, 0.12, world.sites[site].z);
      state.position.copy(group.position);
    },
    defuseProgress(amount) {
      state.defuseProgress = amount;
    },
    step(dt, onDetonate, onBeep) {
      if (state.status !== 'planted') return;
      state.timer -= dt;
      const interval = state.timer > 20 ? 1 : state.timer > 10 ? 0.5 : 0.25;
      if (state.lastBeep - state.timer >= interval || state.lastBeep === 0) {
        state.lastBeep = state.timer;
        onBeep(state.timer);
      }
      // Under ten seconds the blink turns danger-red and doubles in rate: the
      // last seconds of a round should look as urgent as they play. While a
      // defuse is in progress the light goes SABLE teal instead.
      const urgent = state.timer <= 10;
      const blink = Math.sin(state.timer * (urgent ? 12 : 6)) > 0;
      if (state.defuseProgress > 0) light.material.color.set(PALETTE.sable);
      else if (urgent) light.material.color.set(blink ? PALETTE.danger : PALETTE.ink);
      else light.material.color.set(blink ? PALETTE.accent : PALETTE.viper);
      if (state.timer <= 0) onDetonate();
    },
  };
}
