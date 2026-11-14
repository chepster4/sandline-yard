// Player movement: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows the
// player. Aiming down sights slows movement; crouching slows it more and steadies aim.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const ADS_SPEED = 2.6;
const CROUCH_SPEED = 2.4;
const QUIET_SPEED = 2.2;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders) {
  const player = {
    position: new THREE.Vector3(0, 0, 14),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    helmet: false,
    alive: true,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();
  // Jump buffering: a Space press up to 0.12 s before landing still jumps, so a
  // jump timed a frame early is not eaten by the landing.
  let jumpBuffer = 0;
  let prevSpace = false;

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, aiming) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = player.crouching ? CROUCH_SPEED : aiming ? ADS_SPEED : walking ? QUIET_SPEED : WALK_SPEED;
    const blend = Math.min(1, ((player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    const space = keys.has('Space');
    if (space && !prevSpace) jumpBuffer = 0.12;
    prevSpace = space;
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    if (jumpBuffer > 0 && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
      jumpBuffer = 0;
    }
    player.velocity.y -= GRAVITY * dt;

    const nextX = player.position.x + player.velocity.x * dt;
    if (!overlaps(nextX, player.position.y, player.position.z, player.height, 0.04)) player.position.x = nextX;
    else player.velocity.x = 0;
    const nextZ = player.position.z + player.velocity.z * dt;
    if (!overlaps(player.position.x, player.position.y, nextZ, player.height, 0.04)) player.position.z = nextZ;
    else player.velocity.z = 0;

    player.position.y += player.velocity.y * dt;
    player.onGround = false;
    const hit = overlaps(player.position.x, player.position.y, player.position.z, player.height, 0);
    if (hit && player.velocity.y <= 0) {
      player.position.y = hit.max.y;
      player.velocity.y = 0;
      player.onGround = true;
    } else if (hit) {
      player.position.y = hit.min.y - player.height;
      player.velocity.y = 0;
    }
    if (player.position.y < 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }
    player.velocity.y = Math.max(-30, player.velocity.y);
  }

  // Damage with armour: armour absorbs half of every hit until it is gone. A helmet
  // halves headshot damage as well. Returns the health damage actually taken.
  function damage(amount, head) {
    let taken = amount;
    if (head && player.helmet) taken *= 0.5;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, taken * 0.5);
      player.armor -= absorbed;
      taken -= absorbed;
    }
    player.health = Math.max(0, player.health - taken);
    if (player.health <= 0) player.alive = false;
    return taken;
  }

  function reset(x, z, yaw) {
    player.position.set(x, 0, z);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = 0;
    player.health = 100;
    player.alive = true;
    player.crouching = false;
    player.height = STAND_HEIGHT;
    player.eye = STAND_EYE;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    damage,
    reset,
    overlaps,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
