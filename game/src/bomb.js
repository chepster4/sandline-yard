// SANDLINE YARD — the bomb. The objective that makes the rounds tactical:
// the attacking side carries it to A or B, plants it, and the round is won
// by the explosion or the defuse. The device is a small dark case with a
// blinking light — green while carried or dropped, red and beeping faster
// once planted — so its state reads from across the yard.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
const BOMB_TIMER = 35;

export function createBomb(scene, world) {
  const state = {
    carrier: null,
    status: 'carried',
    site: 'A',
    position: new THREE.Vector3(0, 0, 0),
    timer: BOMB_TIMER,
    plantProgress: 0,
    defuseProgress: 0,
  };

  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.2, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.bombBody), roughness: 0.4, metalness: 0.5 }),
  );
  body.castShadow = true;
  group.add(body);
  const lightMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.bombLightSafe),
    emissive: new THREE.Color(PALETTE.bombLightSafe), emissiveIntensity: 1.5,
  });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), lightMat);
  lamp.position.set(0.12, 0.12, 0);
  group.add(lamp);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), lightMat);
  antenna.position.set(-0.15, 0.2, 0);
  group.add(antenna);
  group.visible = false;
  scene.add(group);

  let blink = 0;
  let lastTickSecond = -1;

  function showAt(x, z) {
    group.position.set(x, 0.12, z);
    group.visible = true;
  }

  function reset(carrier, plannedSite) {
    state.carrier = carrier;
    state.status = 'carried';
    state.site = plannedSite;
    state.timer = BOMB_TIMER;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    group.visible = false;
    blink = 0;
    lastTickSecond = -1;
    if (carrier && carrier !== 'player') {
      state.position.copy(carrier.group.position);
    } else if (carrier === 'player') {
      state.position.set(0, 0, 14);
    }
  }

  function drop(position) {
    state.carrier = null;
    state.status = 'dropped';
    state.position.copy(position);
    state.position.y = 0;
    lightMat.color.set(PALETTE.bombLightSafe);
    lightMat.emissive.set(PALETTE.bombLightSafe);
    showAt(position.x, position.z);
  }

  function pickUp(holder) {
    state.carrier = holder;
    state.status = 'carried';
    state.plantProgress = 0;
    group.visible = false;
  }

  function plant(site) {
    state.status = 'planted';
    state.site = site;
    state.timer = BOMB_TIMER;
    state.defuseProgress = 0;
    const target = world.sites[site];
    state.position.set(target.x, 0, target.z);
    lightMat.color.set(PALETTE.bombLight);
    lightMat.emissive.set(PALETTE.bombLight);
    showAt(target.x, target.z);
    lastTickSecond = -1;
  }

  // step: while carried, the bomb follows its carrier; while planted it
  // counts down, beeping once a second and faster under ten seconds, until
  // it detonates and the round ends.
  function step(dt, onDetonate, onTick) {
    if (state.status === 'carried' && state.carrier) {
      // The bomb rides with its carrier; the player carries it in hand, so
      // there is no world position to track until it is dropped or planted.
      if (state.carrier !== 'player' && state.carrier.group) {
        state.position.copy(state.carrier.group.position);
        state.position.y = 0;
      }
      return;
    }
    if (state.status !== 'planted') return;
    state.timer -= dt;
    blink += dt;
    const fast = state.timer <= 10;
    const period = fast ? 0.35 : 0.9;
    lightMat.emissiveIntensity = (blink % period) < period / 2 ? 2.2 : 0.25;
    const second = Math.ceil(state.timer);
    if (second !== lastTickSecond && second > 0) {
      lastTickSecond = second;
      if (onTick) onTick();
    }
    if (state.timer <= 0) {
      state.timer = 0;
      state.status = 'detonated';
      group.visible = false;
      if (onDetonate) onDetonate();
    }
  }

  return { state, reset, drop, pickUp, plant, step };
}
