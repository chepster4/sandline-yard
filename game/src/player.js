// SANDLINE YARD — the player. First-person movement with acceleration and
// friction, so stopping to aim pays: sprinting is fast but loud and wild,
// crouching is slow and steady, and the Shift walk is the quiet middle.
// Collision is axis-separated against the world's boxes, so the player slides
// along walls instead of sticking to them. Health and armour follow the
// Counter-Strike shape: armour eats half of every hit, a helmet halves
// headshots.
import * as THREE from 'three';

const RADIUS = 0.35;
const HEIGHT_STAND = 1.7;
const HEIGHT_CROUCH = 1.15;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.08;
const WALK_SPEED = 4.3;
const CROUCH_SPEED = 2.1;
const SLOW_SPEED = 2.6;
const ACCEL = 34;
const FRICTION = 11;
const GRAVITY = 22;
const JUMP_SPEED = 7.4;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 14),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    health: 100,
    armor: 0,
    helmet: false,
    alive: true,
    crouching: false,
    onGround: true,
  };
  let jumpBuffer = 0;
  let coyote = 0;

  function collidesAt(x, y, z) {
    const height = state.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
    for (const box of colliders) {
      if (x + RADIUS < box.min.x || x - RADIUS > box.max.x) continue;
      if (z + RADIUS < box.min.z || z - RADIUS > box.max.z) continue;
      if (y + height < box.min.y || y > box.max.y) continue;
      return true;
    }
    return false;
  }

  function moveAxis(dx, dz) {
    const nx = state.position.x + dx;
    if (!collidesAt(nx, state.position.y, state.position.z)) state.position.x = nx;
    const nz = state.position.z + dz;
    if (!collidesAt(state.position.x, state.position.y, nz)) state.position.z = nz;
  }

  function reset(x, z, yaw) {
    state.position.set(x, 0, z);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.health = 100;
    state.alive = true;
    state.crouching = false;
    state.eye = EYE_STAND;
    state.onGround = true;
    jumpBuffer = 0;
    coyote = 0;
  }

  function damage(amount, head) {
    if (!state.alive) return;
    let taken = amount;
    if (head && state.helmet) taken *= 0.5;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, taken * 0.5);
      state.armor -= absorbed;
      taken -= absorbed;
    }
    state.health -= taken;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
    }
  }

  function groundSpeed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  function recoil(kick, yawKick) {
    state.pitch += kick;
    state.yaw += yawKick;
    if (state.pitch > 1.45) state.pitch = 1.45;
    if (state.pitch < -1.45) state.pitch = -1.45;
  }

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch -= dy * 0.0021;
    if (state.pitch > 1.45) state.pitch = 1.45;
    if (state.pitch < -1.45) state.pitch = -1.45;
  }

  function step(dt, keys, aiming) {
    if (!state.alive) return;
    const crouchKey = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouching = crouchKey;
    const targetEye = state.crouching ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    let mx = -sin * forward + cos * strafe;
    let mz = -cos * forward - sin * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const topSpeed = state.crouching
      ? CROUCH_SPEED
      : (keys.has('ShiftLeft') || keys.has('ShiftRight') || aiming) ? SLOW_SPEED : WALK_SPEED;
    state.velocity.x += mx * ACCEL * dt;
    state.velocity.z += mz * ACCEL * dt;
    // Friction: bleed speed when no input, cap it at the top speed either way.
    const damp = Math.max(0, 1 - FRICTION * dt);
    if (len === 0) {
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }
    const speed = groundSpeed();
    if (speed > topSpeed) {
      state.velocity.x *= topSpeed / speed;
      state.velocity.z *= topSpeed / speed;
    }
    moveAxis(state.velocity.x * dt, state.velocity.z * dt);

    // Jump with a short input buffer and a coyote window, so a jump pressed
    // just before landing still fires.
    if (keys.has('Space')) jumpBuffer = 0.12;
    else jumpBuffer = Math.max(0, jumpBuffer - dt);
    if (state.onGround) coyote = 0.12;
    else coyote = Math.max(0, coyote - dt);
    if (jumpBuffer > 0 && coyote > 0) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
      jumpBuffer = 0;
      coyote = 0;
    }
    state.velocity.y -= GRAVITY * dt;
    // Terminal velocity: a long fall cannot tunnel through the floor on a
    // slow frame.
    if (state.velocity.y < -18) state.velocity.y = -18;
    state.position.y += state.velocity.y * dt;
    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
  }

  return { state, reset, damage, groundSpeed, recoil, look, step };
}
