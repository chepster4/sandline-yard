// Bots: five enemies and four teammates with a Counter-Strike-style brain. Each bot
// has one job at a time — follow a route, hold an angle, engage what it sees,
// investigate what it hears, plant the bomb or defuse it — and the round's roles
// decide which. Vision is a real line-of-sight raycast; hearing is a radius around
// every gunshot. Bots shoot in bursts with an error that grows with distance, target
// speed and their own movement, so stopping to aim pays for them too.
//
// Two things make this brain play less like nine copies of one bot: skill tiers
// (a rookie reacts late and sprays, an elite snaps, bursts long and holds an angle
// until it pays) and callouts — when one bot spots the player, nearby teammates
// who are not holding a site converge on the same last-known position.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { buildSoldier } from './soldier.js';
import { range } from './rng.js';

const BOT_NAMES = {
  sable: ['Dune', 'Rook', 'Havoc', 'Mira'],
  viper: ['Vex', 'Onyx', 'Razor', 'Ghost', 'Fang'],
};
// One tier per seat, fixed per team so a seeded screenshot plays out the same way
// every time: the anchor is the veteran, the second seat is the wildcard.
const TIER_BY_SEAT = {
  sable: ['veteran', 'rookie', 'elite', 'veteran'],
  viper: ['veteran', 'elite', 'rookie', 'veteran', 'elite'],
};
const TIERS = {
  rookie: { reaction: [0.45, 0.8], errorMul: 1.35, burst: [2, 4], headChance: 0.12, strafe: 1.4, holdExtra: 0 },
  veteran: { reaction: [0.28, 0.53], errorMul: 1.0, burst: [3, 5], headChance: 0.22, strafe: 1.6, holdExtra: 0.8 },
  elite: { reaction: [0.16, 0.31], errorMul: 0.75, burst: [4, 6], headChance: 0.3, strafe: 2.0, holdExtra: 1.6 },
};
const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;
const BOT_EYE = 1.55;
const WALK_SPEED = 3.6;
const SIGHT_RANGE = 42;
const SIGHT_HALF_FOV = 0.96;
const HEAR_RADIUS = 26;
const CALLOUT_RADIUS = 18;

export function createBots(scene, world, combat) {
  const bots = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();
  const tempDir = new THREE.Vector3();
  const tempTarget = new THREE.Vector3();

  function overlaps(x, y, z) {
    probe.min.set(x - BOT_RADIUS, y + 0.02, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, y + BOT_HEIGHT - 0.02, z + BOT_RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function makeBot(team, index, weaponId) {
    const name = BOT_NAMES[team][index % BOT_NAMES[team].length];
    const tier = TIER_BY_SEAT[team][index % TIER_BY_SEAT[team].length];
    const soldier = buildSoldier(team);
    const group = soldier.group;
    const torso = soldier.torso;
    const head = soldier.head;
    scene.add(group);

    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      weaponId,
      tier,
      group,
      torso,
      head,
      thighL: soldier.thighL,
      shinL: soldier.shinL,
      thighR: soldier.thighR,
      shinR: soldier.shinR,
      armL: soldier.armL,
      armR: soldier.armR,
      walkPhase: 0,
      health: 100,
      armor: 0,
      helmet: false,
      alive: true,
      yaw: 0,
      state: 'route',
      path: [],
      pathIndex: 0,
      holdYaw: 0,
      holdUntil: 0,
      target: null,
      targetIsPlayer: false,
      lastSeen: new THREE.Vector3(),
      lastSeenTime: -99,
      reactionAt: 0,
      burstLeft: 0,
      burstPause: 0,
      shotCooldown: 0,
      reloadLeft: 0,
      mag: WEAPONS[weaponId].mag,
      strafeDir: 1,
      strafeTimer: 0,
      visionTimer: Math.random() * 0.15,
      stuckTimer: 0,
      lastX: 0,
      lastZ: 0,
      plantProgress: 0,
      defuseProgress: 0,
      assignedSite: null,
      role: 'roam',
      speed: WALK_SPEED,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function moveBot(bot, dt, tx, tz, speed) {
    const dx = tx - bot.group.position.x;
    const dz = tz - bot.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return true;
    const stepLength = Math.min(distance, speed * dt);
    const nx = bot.group.position.x + (dx / distance) * stepLength;
    const nz = bot.group.position.z + (dz / distance) * stepLength;
    const targetYaw = Math.atan2(-dx, -dz);
    let yawDiff = targetYaw - bot.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    bot.yaw += yawDiff * Math.min(1, dt * 8);
    if (!overlaps(nx, bot.group.position.y, bot.group.position.z)) bot.group.position.x = nx;
    if (!overlaps(bot.group.position.x, bot.group.position.y, nz)) bot.group.position.z = nz;
    const moved = Math.hypot(bot.group.position.x - bot.lastX, bot.group.position.z - bot.lastZ);
    if (moved < 0.02) bot.stuckTimer += dt;
    else bot.stuckTimer = 0;
    // Walk cycle: thighs and shins swing with the stride, arms counter-swing
    // a little against the rifle; standing bots ease back to neutral.
    if (moved > 0.005) {
      bot.walkPhase += dt * speed * 2.4;
      const swing = Math.sin(bot.walkPhase) * 0.55;
      bot.thighL.rotation.x = swing;
      bot.thighR.rotation.x = -swing;
      bot.shinL.rotation.x = Math.max(0, -Math.sin(bot.walkPhase)) * 0.9;
      bot.shinR.rotation.x = Math.max(0, Math.sin(bot.walkPhase)) * 0.9;
      bot.armL.rotation.x = -0.85 - swing * 0.35;
      bot.armR.rotation.x = -0.85 + swing * 0.35;
    } else {
      bot.thighL.rotation.x *= 0.85;
      bot.thighR.rotation.x *= 0.85;
      bot.shinL.rotation.x *= 0.85;
      bot.shinR.rotation.x *= 0.85;
      bot.armL.rotation.x += (-0.85 - bot.armL.rotation.x) * 0.2;
      bot.armR.rotation.x += (-0.85 - bot.armR.rotation.x) * 0.2;
    }
    bot.lastX = bot.group.position.x;
    bot.lastZ = bot.group.position.z;
    return distance - stepLength < 0.3;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const point = bot.path[bot.pathIndex];
    const arrived = moveBot(bot, dt, point.x, point.z, speed);
    if (arrived) bot.pathIndex += 1;
    if (bot.stuckTimer > 0.7) {
      bot.stuckTimer = 0;
      bot.pathIndex = Math.min(bot.pathIndex + 1, bot.path.length);
    }
    return bot.pathIndex >= bot.path.length;
  }

  function setRoute(bot, x, z) {
    bot.path = world.waypoints.path(bot.group.position.x, bot.group.position.z, x, z);
    bot.pathIndex = 0;
    bot.state = 'route';
  }

  function eyePosition(bot, out) {
    return out.set(bot.group.position.x, bot.group.position.y + BOT_EYE, bot.group.position.z);
  }

  // Vision: a target counts when it is close enough, inside the field of view, with
  // a clear ray between the eyes and not hidden by smoke.
  function canSee(bot, targetPos, targetCrouching) {
    const eye = eyePosition(bot, new THREE.Vector3());
    const toTarget = tempTarget.copy(targetPos).sub(eye);
    const distance = toTarget.length();
    if (distance > SIGHT_RANGE) return false;
    const forward = tempDir.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const flat = new THREE.Vector3(toTarget.x, 0, toTarget.z).normalize();
    if (flat.dot(forward) < Math.cos(SIGHT_HALF_FOV) && distance > 3) return false;
    if (combat.smokeBlocked(eye, targetPos)) return false;
    const aim = targetPos.clone();
    aim.y = targetCrouching ? targetPos.y + 0.9 : targetPos.y + 1.3;
    // The ray starts inside the bot's own head, so the bot itself must be ignored.
    const hit = combat.raycast(eye, aim.clone().sub(eye).normalize(), distance + 0.5, bot);
    if (!hit) return true;
    return hit.distance >= distance - 0.4;
  }

  function acquireTarget(bot, game) {
    const candidates = [];
    if (game.player.alive && bot.team !== 'sable') {
      const pos = new THREE.Vector3(game.player.position.x, game.player.position.y, game.player.position.z);
      candidates.push({ pos, isPlayer: true, crouching: game.player.crouching, speed: Math.hypot(game.player.velocity.x, game.player.velocity.z) });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const pos = other.group.position.clone();
      candidates.push({ pos, bot: other, isPlayer: false, crouching: false, speed: 0 });
    }
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const eye = eyePosition(bot, new THREE.Vector3());
      const distance = eye.distanceTo(candidate.pos);
      if (distance < bestDistance && canSee(bot, candidate.pos, candidate.crouching)) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  // A callout: one bot's sighting becomes the whole nearby team's last-known
  // position. Holders keep their site — only bots already moving converge.
  function callout(spotter, time) {
    for (const mate of bots) {
      if (!mate.alive || mate.team !== spotter.team || mate === spotter) continue;
      if (mate.state === 'plant' || mate.state === 'defuse' || mate.state === 'engage') continue;
      const distance = Math.hypot(mate.group.position.x - spotter.lastSeen.x, mate.group.position.z - spotter.lastSeen.z);
      if (distance > CALLOUT_RADIUS) continue;
      mate.lastSeen.copy(spotter.lastSeen);
      mate.lastSeenTime = time;
      if (mate.state === 'route' || mate.state === 'investigate') {
        setRoute(mate, spotter.lastSeen.x, spotter.lastSeen.z);
        mate.state = 'investigate';
      }
    }
  }

  function hearShot(bot, event) {
    if (!bot.alive || bot.state === 'engage') return;
    const distance = Math.hypot(event.pos.x - bot.group.position.x, event.pos.z - bot.group.position.z);
    if (distance > HEAR_RADIUS || event.team === bot.team) return;
    if (bot.state === 'plant' || bot.state === 'defuse') return;
    bot.lastSeen.set(event.pos.x, 0, event.pos.z);
    bot.lastSeenTime = event.time;
    if (bot.state !== 'route' || bot.pathIndex >= bot.path.length) {
      bot.state = 'investigate';
      setRoute(bot, event.pos.x, event.pos.z);
      bot.state = 'investigate';
    }
  }

  function damageBot(bot, amount, head, attacker) {
    if (!bot.alive) return;
    let taken = amount;
    if (head && bot.helmet) taken *= 0.5;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, taken * 0.5);
      bot.armor -= absorbed;
      taken -= absorbed;
    }
    bot.health -= taken;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      combat.onBotDeath(bot, attacker);
    }
  }

  function faceTarget(bot, dt, x, z) {
    const dx = x - bot.group.position.x;
    const dz = z - bot.group.position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, dt * 10);
    return Math.abs(diff);
  }

  // One burst round: aim at the target's chest (or head, more often for better
  // tiers) with an error that grows with distance, target speed and the bot's own
  // movement, then resolve the ray for real — a bot can miss, and a bot can be missed.
  function shootAt(bot, game, dt) {
    const def = WEAPONS[bot.weaponId];
    const tier = TIERS[bot.tier];
    bot.shotCooldown = Math.max(0, bot.shotCooldown - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= dt;
      if (bot.reloadLeft <= 0) bot.mag = def.mag;
      return;
    }
    if (bot.shotCooldown > 0) return;
    if (bot.mag <= 0) {
      bot.reloadLeft = def.reload;
      return;
    }
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > 0) {
        bot.burstPause -= dt;
        return;
      }
      bot.burstLeft = tier.burst[0] + Math.floor(Math.random() * (tier.burst[1] - tier.burst[0] + 1));
    }
    bot.shotCooldown = def.fireGap;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = 0.5 + Math.random() * 0.6;

    const eye = eyePosition(bot, new THREE.Vector3());
    let targetPos;
    let targetSpeed = 0;
    if (bot.targetIsPlayer) {
      const p = game.player;
      targetPos = new THREE.Vector3(p.position.x, p.position.y + (p.crouching ? 0.9 : 1.25), p.position.z);
      targetSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    } else {
      const t = bot.target.bot;
      targetPos = new THREE.Vector3(t.group.position.x, t.group.position.y + 1.2, t.group.position.z);
      targetSpeed = 3;
    }
    const headshot = Math.random() < tier.headChance;
    if (headshot) {
      targetPos.y = bot.targetIsPlayer
        ? game.player.position.y + (game.player.crouching ? 1.0 : 1.55)
        : bot.target.bot.group.position.y + 1.55;
    }
    const distance = eye.distanceTo(targetPos);
    const ownSpeed = Math.hypot(bot.group.position.x - bot.lastX, bot.group.position.z - bot.lastZ) / Math.max(dt, 0.001);
    const error = (0.025 + distance * 0.0011 + targetSpeed * 0.004 + Math.min(ownSpeed, 5) * 0.006) * tier.errorMul;
    const dir = targetPos.clone().sub(eye).normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, (Math.random() - 0.5) * 2 * error)
      .addScaledVector(up, (Math.random() - 0.5) * 2 * error)
      .normalize();
    bot.mag -= 1;
    combat.shotSound(bot.weaponId, bot.group.position);
    const muzzle = eye.clone().addScaledVector(dir, 0.6);
    const hit = combat.raycast(eye, dir, def.range + 10, bot);
    const end = hit ? hit.point.clone() : eye.clone().addScaledVector(dir, def.range);
    combat.tracer(muzzle, end, bot.team === 'sable' ? PALETTE.sable : PALETTE.viper);
    if (!hit) return;
    const hitBot = hit.object.userData.bot;
    if (hitBot && hitBot.alive && hitBot.team !== bot.team) {
      const isHead = hit.object.userData.part === 'head';
      let damage = def.damage * (isHead ? def.headMult : 1);
      if (distance > 40) damage *= 0.75;
      combat.damageBot(hitBot, damage, isHead, bot);
      return;
    }
    if (hit.object.userData.isPlayerHitbox) {
      const isHead = hit.object.userData.part === 'head';
      let damage = def.damage * (isHead ? def.headMult : 1);
      if (distance > 40) damage *= 0.75;
      combat.damagePlayer(damage, isHead, bot);
      return;
    }
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0);
    combat.sparks(hit.point, normal);
  }

  function stepBot(bot, dt, time, game) {
    if (!bot.alive) return;
    const bomb = game.bomb;
    const tier = TIERS[bot.tier];

    // Vision runs on a staggered timer, not every frame, so nine bots stay cheap.
    bot.visionTimer -= dt;
    if (bot.visionTimer <= 0) {
      bot.visionTimer = 0.15 + Math.random() * 0.1;
      const found = acquireTarget(bot, game);
      if (found) {
        bot.lastSeen.set(found.pos.x, 0, found.pos.z);
        bot.lastSeenTime = time;
        if (bot.state !== 'engage') {
          bot.reactionAt = time + range(Math.random, tier.reaction[0], tier.reaction[1]);
          bot.burstLeft = 0;
          bot.burstPause = 0;
        }
        bot.target = found;
        bot.targetIsPlayer = found.isPlayer;
        if (bot.state !== 'plant' && bot.state !== 'defuse') bot.state = 'engage';
        callout(bot, time);
      } else if (bot.state === 'engage' && time - bot.lastSeenTime > 1.2) {
        bot.target = null;
        if (bot.role === 'carry') {
          setRoute(bot, world.sites[bot.assignedSite].x, world.sites[bot.assignedSite].z);
        } else if (bot.role === 'retrieve') {
          setRoute(bot, bomb.position.x, bomb.position.z);
        } else if (bot.role === 'hold') {
          bot.state = 'hold';
        } else {
          setRoute(bot, bot.lastSeen.x, bot.lastSeen.z);
          bot.state = 'investigate';
        }
      }
    }

    // After a plant the attackers hold the site and the defenders converge on it.
    if (bomb.status === 'planted' && bot.team === game.attackSide && bot.role !== 'hold' && bot.state !== 'engage' && bot.state !== 'plant') {
      bot.role = 'hold';
      const spots = bomb.site === 'A'
        ? [{ x: -12, z: -13 }, { x: -18, z: -9 }, { x: -13, z: -7 }]
        : [{ x: 12, z: -13 }, { x: 18, z: -9 }, { x: 13, z: -7 }];
      const teamBots = bots.filter((b) => b.team === bot.team);
      const spot = spots[teamBots.indexOf(bot) % spots.length];
      bot.holdYaw = Math.atan2(-(world.sites[bomb.site].x - spot.x), -(-7 - spot.z));
      setRoute(bot, spot.x, spot.z);
    }

    switch (bot.state) {
      case 'route': {
        const done = followPath(bot, dt, bot.speed);
        if (done) {
          if (bot.role === 'carry' && bomb.status === 'carried' && bomb.carrier === bot) {
            bot.state = 'plant';
          } else if (bot.role === 'retrieve') {
            combat.onPickup(bot);
          } else {
            bot.state = 'hold';
            // An elite holds the angle it just took for a while longer instead of
            // rotating on; a rookie gets bored and drifts sooner.
            bot.holdUntil = time + 1.5 + tier.holdExtra + Math.random() * 1.5;
          }
        }
        break;
      }
      case 'hold': {
        faceTarget(bot, dt, bot.group.position.x - Math.sin(bot.holdYaw) * 5, bot.group.position.z - Math.cos(bot.holdYaw) * 5);
        // Hold patience: once the hold has aged out, drift to a nearby angle
        // instead of staring at the same wall all round.
        if (time > bot.holdUntil && bomb.status !== 'planted' && bot.role !== 'defuse') {
          bot.holdYaw += (Math.random() - 0.5) * 1.2;
          bot.holdUntil = time + 2 + tier.holdExtra + Math.random() * 2;
        }
        if (bomb.status === 'planted' && bot.team !== game.attackSide) {
          const defenders = bots.filter((b) => b.alive && b.team === bot.team);
          const nearest = defenders.reduce((a, b) => (a.group.position.distanceTo(bomb.position) < b.group.position.distanceTo(bomb.position) ? a : b));
          if (nearest === bot) {
            bot.role = 'defuse';
            setRoute(bot, bomb.position.x, bomb.position.z);
          } else if (bot.role !== 'retake') {
            bot.role = 'retake';
            setRoute(bot, bomb.site === 'A' ? -13 : 13, -9);
          }
        }
        break;
      }
      case 'investigate': {
        const done = followPath(bot, dt, bot.speed);
        if (done) {
          if (bot.role === 'carry') setRoute(bot, world.sites[bot.assignedSite].x, world.sites[bot.assignedSite].z);
          else if (bot.role === 'retrieve') setRoute(bot, bomb.position.x, bomb.position.z);
          else {
            bot.holdYaw = bot.yaw;
            bot.holdUntil = time + 1.5 + tier.holdExtra + Math.random() * 1.5;
            bot.state = 'hold';
          }
        }
        break;
      }
      case 'engage': {
        // A target that died mid-fight is not a target any more: fall back to the
        // last-known position instead of strafing around a body.
        if (bot.target && !bot.targetIsPlayer && bot.target.bot && !bot.target.bot.alive) {
          bot.target = null;
          setRoute(bot, bot.lastSeen.x, bot.lastSeen.z);
          bot.state = 'investigate';
          break;
        }
        const targetPos = bot.targetIsPlayer
          ? new THREE.Vector3(game.player.position.x, game.player.position.y, game.player.position.z)
          : bot.target?.bot?.group.position ?? bot.lastSeen;
        const distance = Math.hypot(targetPos.x - bot.group.position.x, targetPos.z - bot.group.position.z);
        faceTarget(bot, dt, targetPos.x, targetPos.z);
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
          bot.strafeTimer = 0.7 + Math.random() * 0.8;
        }
        const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        let mx = right.x * bot.strafeDir * tier.strafe;
        let mz = right.z * bot.strafeDir * tier.strafe;
        if (distance > 20) {
          mx += forward.x * 2.2;
          mz += forward.z * 2.2;
        } else if (distance < 5) {
          mx -= forward.x * 1.4;
          mz -= forward.z * 1.4;
        }
        moveBot(bot, dt, bot.group.position.x + mx, bot.group.position.z + mz, 2.2);
        if (time >= bot.reactionAt) shootAt(bot, game, dt);
        break;
      }
      case 'plant': {
        const site = world.sites[bomb.site];
        const inZone = bot.group.position.x >= site.minX && bot.group.position.x <= site.maxX
          && bot.group.position.z >= site.minZ && bot.group.position.z <= site.maxZ;
        if (!inZone) {
          setRoute(bot, site.x, site.z);
          break;
        }
        bot.plantProgress += dt;
        faceTarget(bot, dt, bot.group.position.x - Math.sin(bot.yaw) * 5, bot.group.position.z - Math.cos(bot.yaw) * 5);
        combat.onPlantProgress(bot, bot.plantProgress);
        if (bot.plantProgress >= 3) combat.onPlant(bot, bomb.site);
        break;
      }
      case 'defuse': {
        const distance = bot.group.position.distanceTo(bomb.position);
        if (distance > 1.6) {
          setRoute(bot, bomb.position.x, bomb.position.z);
          break;
        }
        bot.defuseProgress += dt;
        combat.onDefuseProgress(bot, bot.defuseProgress);
        if (bot.defuseProgress >= 5) combat.onDefuse(bot);
        break;
      }
      default:
        break;
    }

    // A dropped bomb is fetched by the nearest alive attacker.
    if (bomb.status === 'dropped' && bot.team === game.attackSide && bot.state !== 'engage' && bot.state !== 'plant') {
      const attackers = bots.filter((b) => b.alive && b.team === game.attackSide);
      const nearest = attackers.reduce((a, b) => (a.group.position.distanceTo(bomb.position) < b.group.position.distanceTo(bomb.position) ? a : b));
      if (nearest === bot && bot.role !== 'retrieve') {
        bot.role = 'retrieve';
        setRoute(bot, bomb.position.x, bomb.position.z);
      }
    }
    bot.group.rotation.y = bot.yaw;
  }

  // Round setup: the attack side picks a site and a carrier; escorts split across
  // the lanes to that site; the defence holds two at each site and one at mid. The
  // site is not a coin flip any more: the carrier goes where the defence is
  // thinnest, counting the defenders already near each site.
  function assignRoles(game) {
    const attack = game.attackSide;
    const defense = attack === 'sable' ? 'viper' : 'sable';
    const defendersAlive = bots.filter((b) => b.alive && b.team === defense);
    const nearA = defendersAlive.filter((b) => Math.hypot(b.group.position.x - world.sites.A.x, b.group.position.z - world.sites.A.z) < 10).length;
    const nearB = defendersAlive.filter((b) => Math.hypot(b.group.position.x - world.sites.B.x, b.group.position.z - world.sites.B.z) < 10).length;
    const site = nearA === nearB ? (Math.random() < 0.5 ? 'A' : 'B') : (nearA < nearB ? 'A' : 'B');
    game.plannedSite = site;
    const attackers = bots.filter((b) => b.team === attack);
    const defenders = bots.filter((b) => b.team === defense);
    const carrier = game.bomb.carrier && game.bomb.carrier !== 'player' ? game.bomb.carrier : null;
    const lanes = site === 'A' ? ['along', 'mid', 'along', 'mid'] : ['blong', 'mid', 'blong', 'mid'];
    attackers.forEach((bot) => {
      bot.assignedSite = site;
      if (bot === carrier) {
        bot.role = 'carry';
        setRoute(bot, world.sites[site].x, world.sites[site].z);
        return;
      }
      bot.role = 'escort';
      const lane = lanes[attackers.indexOf(bot) % lanes.length];
      const mid = lane === 'mid' ? { x: 0, z: 2 } : lane === 'along' ? { x: -16.5, z: 2 } : { x: 16.5, z: 2 };
      bot.path = world.waypoints.path(bot.group.position.x, bot.group.position.z, mid.x, mid.z)
        .concat(world.waypoints.path(mid.x, mid.z, world.sites[site].x, world.sites[site].z));
      bot.pathIndex = 0;
      bot.state = 'route';
    });
    const defSpots = [
      { x: -12, z: -12, look: { x: -13, z: -4 } },
      { x: -17, z: -9, look: { x: -15, z: -7 } },
      { x: 12, z: -12, look: { x: 13, z: -4 } },
      { x: 17, z: -9, look: { x: 15, z: -7 } },
      { x: 0, z: -6, look: { x: 0, z: 10 } },
    ];
    defenders.forEach((bot, i) => {
      const spot = defSpots[i % defSpots.length];
      bot.role = 'hold';
      bot.holdYaw = Math.atan2(-(spot.look.x - spot.x), -(spot.look.z - spot.z));
      setRoute(bot, spot.x, spot.z);
    });
  }

  function step(dt, time, game) {
    for (const bot of bots) stepBot(bot, dt, time, game);
  }

  return {
    bots,
    hitMeshes,
    makeBot,
    setRoute,
    followPath,
    acquireTarget,
    hearShot,
    damageBot,
    eyePosition,
    step,
    assignRoles,
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
    reset(spawns) {
      for (const bot of bots) {
        const spawn = spawns[bot.team][bots.filter((b) => b.team === bot.team).indexOf(bot) % spawns[bot.team].length];
        bot.group.position.set(spawn.x, 0, spawn.z);
        bot.group.rotation.set(0, 0, 0);
        bot.yaw = spawn.yaw;
        bot.health = 100;
        bot.alive = true;
        bot.state = 'route';
        bot.path = [];
        bot.pathIndex = 0;
        bot.target = null;
        bot.mag = WEAPONS[bot.weaponId].mag;
        bot.reloadLeft = 0;
        bot.shotCooldown = 0;
        bot.burstLeft = 0;
        bot.burstPause = 0;
        bot.holdUntil = 0;
        bot.visionTimer = Math.random() * 0.15;
        bot.plantProgress = 0;
        bot.defuseProgress = 0;
        bot.assignedSite = null;
        bot.role = 'roam';
      }
    },
  };
}
