// SANDLINE YARD — boot and the one loop. The menu, the buy phase, the round, the
// bomb, the scoreboard: all of it is wired here, and the modules own the rest.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createLoadout, createGrenades, GRENADES } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME } from './bomb.js';
import { createEconomy, WIN_ROUNDS, ROUND_TIME, BUY_TIME } from './economy.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { addProps } from './props.js';
import { addAtmosphere } from './atmosphere.js';
import { createRadio } from './radio.js';
import { mulberry32 } from './rng.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
if (shot) Math.random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Dusk sky: a canvas gradient (deep purple overhead, amber at the horizon) so the
// open top of the compound reads as evening, not a black void.
function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#241a2e');
  gradient.addColorStop(0.45, '#7a4028');
  gradient.addColorStop(0.72, '#e07830');
  gradient.addColorStop(1, '#3a2a1c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(new THREE.Color('#6e4a2e'), 30, 70);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
addProps(scene, world);
const atmosphere = addAtmosphere(scene);
const audio = createAudio();
const fx = createFx(scene);
const hud = createHud(document);
const radio = createRadio(document);
const economy = createEconomy();
const player = createPlayer(world.colliders);
const loadout = createLoadout(camera, audio);
const bomb = createBomb(scene, world);
const grenades = createGrenades(scene, world.colliders, { onFrag: (position) => fragBlast(position) });
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 140;

// The player's hitboxes for bot raycasts: torso and head, invisible, moved every frame.
const playerHitboxes = [];
function makeHitbox(width, height, depth, part) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial());
  mesh.userData.isPlayerHitbox = true;
  mesh.userData.part = part;
  mesh.visible = false;
  scene.add(mesh);
  playerHitboxes.push(mesh);
  return mesh;
}
const torsoBox = makeHitbox(0.7, 1.15, 0.7, 'torso');
const headBox = makeHitbox(0.42, 0.32, 0.42, 'head');

const game = {
  phase: 'menu',
  roundTime: ROUND_TIME,
  attackSide: 'sable',
  plannedSite: 'A',
  player: player.state,
  bomb: bomb.state,
  economy,
  loadout,
  bots: null,
  objectiveText: '',
  crosshairSpread: 10,
  matchOver: false,
  roundWinner: null,
  lowTime: false,
  spectateIndex: 0,
};
let lastDamageHead = false;
let time = 0;
let paused = false;
let roundEndTimer = 0;
let throwCooldown = 0;
let prevFiring = false;
let lowTimeWarned = false;

const combat = {
  raycast(origin, dir, far, ignoreBot, includePlayer = true) {
    raycaster.set(origin, dir);
    raycaster.far = far;
    const targets = includePlayer
      ? world.shootables.concat(bots.hitMeshes, playerHitboxes)
      : world.shootables.concat(bots.hitMeshes);
    const hits = raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const hitBot = hit.object.userData.bot;
      if (hitBot && (!hitBot.alive || hitBot === ignoreBot)) continue;
      return hit;
    }
    return null;
  },
  damagePlayer(amount, head, attacker) {
    if (!player.state.alive || game.phase !== 'play') return;
    player.damage(amount, head);
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) {
      economy.onDeath();
      hud.killfeed(attacker.name ?? 'Frag', 'You', head, false, true);
      checkRoundEnd();
    }
  },
  damageBot(bot, amount, head, attacker) {
    if (!bot.alive) return;
    lastDamageHead = head;
    const wasAlive = bot.alive;
    bots.damageBot(bot, amount, head, attacker);
    if (attacker === 'player' && wasAlive) {
      hud.hitmarker(head, !bot.alive);
      if (bot.alive) audio.hit(head);
      else {
        audio.kill();
        economy.killReward(head);
      }
    }
  },
  shotSound(kind, position) {
    if (position.distanceTo(player.state.position) < 45) audio.distantShot();
  },
  tracer: fx.spawnTracer,
  sparks: fx.spawnSparks,
  smokeBlocked: (a, b) => grenades.blockedBySmoke(a, b),
  onBotDeath(bot, killer) {
    hud.killfeed(killer === 'player' ? 'You' : killer.name, bot.name, lastDamageHead, killer === 'player', false);
    if (bomb.state.carrier === bot) {
      bomb.drop(bot.group.position);
      hud.showBanner('BOMB DROPPED', 'Pick it up — walk over it', 2200);
    }
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    // Last man standing: the radio names it, so a 1vX reads as a clutch.
    const alive = bots.bots.filter((b) => b.alive && b.team === bot.team);
    if (alive.length === 1) radio.callout(`LAST MAN — ${alive[0].name}`, bot.team);
    checkRoundEnd();
  },
  onPlant(bot, site) {
    bomb.plant(site);
    audio.plantBeep(true);
    radio.callout(`BOMB PLANTED — SITE ${site} · hold it`, game.attackSide);
    hud.showBanner(`BOMB PLANTED — SITE ${site}`, game.attackSide === 'sable' ? 'Defend it until it blows' : 'Defuse it before it blows', 3200);
    updateObjective();
  },
  onPlantProgress(bot, progress) {
    game.objectiveText = `Bomb being planted at ${bot.assignedSite}…`;
  },
  onDefuse(bot) {
    if (bot === 'player') economy.defuseReward();
    radio.callout('BOMB DEFUSED — site clear', game.attackSide === 'sable' ? 'viper' : 'sable');
    endRound(game.attackSide === 'sable' ? 'viper' : 'sable', 'Bomb defused');
  },
  onDefuseProgress(bot, progress) {
    game.objectiveText = 'Bomb is being defused!';
  },
  onPickup(bot) {
    bomb.pickUp(bot);
    bot.role = 'carry';
    bot.assignedSite = game.plannedSite;
    bots.setRoute(bot, world.sites[bot.assignedSite].x, world.sites[bot.assignedSite].z);
    hud.showBanner(`${bot.name.toUpperCase()} PICKED UP THE BOMB`, '', 1800);
  },
};

const bots = createBots(scene, world, combat);
game.bots = bots;
bots.makeBot('sable', 0, 'rifle');
bots.makeBot('sable', 1, 'rifle');
bots.makeBot('sable', 2, 'smg');
bots.makeBot('sable', 3, 'rifle');
bots.makeBot('viper', 0, 'rifle');
bots.makeBot('viper', 1, 'rifle');
bots.makeBot('viper', 2, 'smg');
bots.makeBot('viper', 3, 'rifle');
bots.makeBot('viper', 4, 'sniper');

function attackSideFor(round) {
  return Math.floor((round - 1) / 2) % 2 === 0 ? 'sable' : 'viper';
}

function siteAt(x, z) {
  for (const [name, site] of Object.entries(world.sites)) {
    if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return name;
  }
  return null;
}

function updateObjective() {
  const b = bomb.state;
  let text = '';
  if (game.phase === 'buy') {
    text = game.attackSide === 'sable' ? 'Buy phase — SABLE attacks this round' : 'Buy phase — VIPER attacks this round';
  } else if (b.status === 'planted') {
    text = game.attackSide === 'sable' ? `Bomb planted at ${b.site} — defend it` : `Bomb planted at ${b.site} — defuse it!`;
  } else if (b.status === 'dropped') {
    text = game.attackSide === 'sable' ? 'Bomb dropped — pick it up' : 'Bomb dropped — hold the sites';
  } else if (game.attackSide === 'sable') {
    text = b.carrier === 'player' ? 'You carry the bomb — plant it at A or B' : `Escort the carrier — plant at ${game.plannedSite}`;
  } else {
    text = 'Defend A and B — stop the bomb';
  }
  game.objectiveText = text;
}

function showScreen(name) {
  for (const id of ['menu', 'pause', 'match-end']) {
    document.getElementById(id).classList.toggle('hidden', id !== name);
  }
}

function startMatch() {
  economy.state.money = 800;
  economy.state.round = 1;
  economy.state.score = { sable: 0, viper: 0 };
  economy.state.lossStreak = 0;
  economy.state.kills = 0;
  economy.state.deaths = 0;
  economy.state.plants = 0;
  economy.state.defuses = 0;
  economy.state.headshots = 0;
  economy.state.roundKills = 0;
  loadout.state.owned = { pistol: { mag: 12, reserve: 36, cooldown: 0, reloadLeft: 0 } };
  loadout.state.current = 'pistol';
  loadout.state.grenades = { frag: 0, smoke: 0 };
  player.state.armor = 0;
  player.state.helmet = false;
  game.matchOver = false;
  game.spectateIndex = 0;
  startBuy();
}

function startBuy() {
  game.phase = 'buy';
  game.attackSide = attackSideFor(economy.state.round);
  game.roundTime = BUY_TIME;
  lowTimeWarned = false;
  game.lowTime = false;
  game.spectateIndex = 0;
  const spawn = world.spawns.sable[0];
  player.reset(spawn.x, spawn.z, spawn.yaw);
  loadout.refillAmmo();
  loadout.reveal();
  bots.reset(world.spawns);
  const carrier = game.attackSide === 'viper' ? bots.bots.find((b) => b.team === 'viper') : 'player';
  bomb.state.carrier = carrier;
  bots.assignRoles(game);
  bomb.reset(carrier, game.plannedSite);
  grenades.reset();
  radio.clear();
  radio.plan(game.attackSide, game.plannedSite, carrier === 'player' ? 'player' : carrier.name);
  updateObjective();
  // Match point is the round that decides the match: name it, so the buy phase
  // reads as the climax it is instead of one more round.
  const sablePoint = economy.state.score.sable === WIN_ROUNDS - 1;
  const viperPoint = economy.state.score.viper === WIN_ROUNDS - 1;
  if (sablePoint || viperPoint) {
    const side = sablePoint ? 'SABLE' : 'VIPER';
    hud.showBanner(`MATCH POINT — ${side}`, `Round ${economy.state.round} · first to ${WIN_ROUNDS} takes the match`, 3200);
  } else {
    hud.showBanner(`ROUND ${economy.state.round}`, game.attackSide === 'sable' ? 'SABLE attacks — plant the bomb' : 'VIPER attacks — defend the sites', 2800);
  }
  hud.hideBuyMenu();
  showScreen(null);
}

function startPlay() {
  game.phase = 'play';
  game.roundTime = ROUND_TIME;
  lowTimeWarned = false;
  game.lowTime = false;
  hud.hideBuyMenu();
  updateObjective();
}

function endRound(winner, reason) {
  if (game.phase !== 'play') return;
  game.phase = 'roundEnd';
  roundEndTimer = 4.5;
  // settleRound zeroes the round-kill count, so the MVP read happens first.
  const mvp = winner === 'sable' && economy.state.roundKills >= 3;
  game.matchOver = economy.settleRound(winner);
  game.roundWinner = winner;
  audio.roundEnd(winner === 'sable');
  if (mvp) audio.mvp();
  hud.showBanner(winner === 'sable' ? 'SABLE WINS THE ROUND' : 'VIPER WINS THE ROUND', reason, 4200);
  hud.hideProgress();
  updateObjective();
}

function checkRoundEnd() {
  if (game.phase !== 'play') return;
  const sableAlive = bots.aliveCount('sable') + (player.state.alive ? 1 : 0);
  const viperAlive = bots.aliveCount('viper');
  if (bomb.state.status !== 'planted') {
    if (sableAlive === 0) endRound('viper', 'SABLE eliminated');
    else if (viperAlive === 0) endRound('sable', 'VIPER eliminated');
  } else if (viperAlive === 0) {
    bomb.state.timer = Math.min(bomb.state.timer, 3);
  }
}

function fireWeapon() {
  const def = loadout.def();
  if (!loadout.takeRound()) {
    audio.dryFire();
    loadout.reload();
    return;
  }
  loadout.pullTrigger();
  const spread = loadout.spread(player.groundSpeed(), input.state.aiming, player.state.crouching);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  dir.addScaledVector(right, (Math.random() - 0.5) * 2 * spread)
    .addScaledVector(up, (Math.random() - 0.5) * 2 * spread)
    .normalize();
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const muzzle = origin.clone().addScaledVector(dir, 0.7).addScaledVector(right, 0.22).add(new THREE.Vector3(0, -0.14, 0));
  const hit = combat.raycast(origin, dir, def.range + 20, null, false);
  const end = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, def.range);
  fx.spawnTracer(muzzle, end);
  player.recoil(def.kick, (Math.random() - 0.5) * def.kick * 0.6);
  for (const bot of bots.bots) bots.hearShot(bot, { pos: player.state.position, team: 'sable', time });
  if (!hit) return;
  const hitBot = hit.object.userData.bot;
  if (hitBot && hitBot.alive) {
    const head = hit.object.userData.part === 'head';
    let damage = def.damage * (head ? def.headMult : 1);
    if (hit.distance > 40) damage *= 0.75;
    combat.damageBot(hitBot, damage, head, 'player');
    return;
  }
  const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
  fx.spawnSparks(hit.point, normal);
}

function fragBlast(position) {
  audio.explosion();
  const radius = GRENADES.frag.radius;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const chest = new THREE.Vector3(bot.group.position.x, bot.group.position.y + 1.2, bot.group.position.z);
    const distance = position.distanceTo(chest);
    if (distance > radius) continue;
    const hit = combat.raycast(position, chest.clone().sub(position).normalize(), distance + 0.3, null);
    if (hit && hit.distance < distance - 0.3) continue;
    combat.damageBot(bot, GRENADES.frag.maxDamage * (1 - (distance / radius) * 0.85), false, 'player');
  }
  if (player.state.alive) {
    const chest = new THREE.Vector3(player.state.position.x, player.state.position.y + 1.2, player.state.position.z);
    const distance = position.distanceTo(chest);
    if (distance <= radius) {
      const hit = combat.raycast(position, chest.clone().sub(position).normalize(), distance + 0.3, null);
      if (!hit || hit.distance >= distance - 0.3) {
        combat.damagePlayer(GRENADES.frag.maxDamage * (1 - (distance / radius) * 0.85), false, { name: 'Frag' });
      }
    }
  }
  fx.spawnSparks(position, new THREE.Vector3(0, 1, 0));
}

function throwGrenade(kind) {
  if (game.phase !== 'play' || !player.state.alive || throwCooldown > 0) return;
  if (loadout.state.grenades[kind] <= 0) return;
  loadout.state.grenades[kind] -= 1;
  throwCooldown = 0.8;
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  grenades.throwGrenade(kind, origin.clone().addScaledVector(dir, 0.6), dir);
  audio.click();
}

function buyItem(item) {
  if (!economy.canAfford(item.price)) return;
  if (item.kind === 'weapon') {
    if (loadout.state.owned[item.id]) return;
    economy.spend(item.price);
    loadout.buy(item.id);
    loadout.equip(item.id);
  } else if (item.kind === 'grenade') {
    if (loadout.state.grenades[item.id] >= 2) return;
    economy.spend(item.price);
    loadout.state.grenades[item.id] += 1;
  } else if (item.id === 'armor') {
    if (player.state.armor >= 100) return;
    economy.spend(item.price);
    player.state.armor = 100;
  } else if (item.id === 'helmet') {
    if (player.state.helmet) return;
    economy.spend(item.price);
    player.state.helmet = true;
  } else {
    return;
  }
  audio.buy();
  refreshBuyMenu();
}

function refreshBuyMenu() {
  if (!hud.buyMenuVisible()) return;
  hud.showBuyMenu(economy.buyItems(), economy.state.money, loadout.state.owned, buyItem);
}

function handleInteract(dt) {
  const p = player.state;
  const b = bomb.state;
  const holdingE = input.state.keys.has('KeyE');
  if (p.alive && b.status === 'carried' && b.carrier === 'player') {
    const site = siteAt(p.position.x, p.position.z);
    if (site && holdingE) {
      b.plantProgress += dt;
      hud.showProgress(`PLANTING — SITE ${site}`, b.plantProgress / PLANT_TIME);
      if (b.plantProgress >= PLANT_TIME) {
        hud.hideProgress();
        economy.plantReward();
        combat.onPlant('player', site);
      }
      return;
    }
  }
  if (p.alive && b.status === 'planted') {
    const distance = Math.hypot(p.position.x - b.position.x, p.position.z - b.position.z);
    if (distance <= 1.6 && holdingE) {
      b.defuseProgress += dt;
      hud.showProgress('DEFUSING', b.defuseProgress / DEFUSE_TIME);
      if (b.defuseProgress >= DEFUSE_TIME) {
        hud.hideProgress();
        combat.onDefuse('player');
      }
      return;
    }
  }
  if (b.status === 'carried') b.plantProgress = Math.max(0, b.plantProgress - dt * 2);
  if (b.status === 'planted') b.defuseProgress = Math.max(0, b.defuseProgress - dt * 2);
  hud.hideProgress();
}

function onLockChange(locked) {
  if (shot) return;
  if (game.phase === 'play' && !locked) {
    paused = true;
    showScreen('pause');
  } else if (locked) {
    paused = false;
    showScreen(null);
  }
}

// Alt-tabbing out of a round pauses it too: the pointer lock is already gone by
// then, but the tab can hide without a lock change in some browsers.
document.addEventListener('visibilitychange', () => {
  if (shot) return;
  if (document.hidden && game.phase === 'play') {
    paused = true;
    showScreen('pause');
  }
});

let wasAlive = true;

function cycleWeapon(direction) {
  const owned = Object.keys(loadout.state.owned);
  if (owned.length < 2) return;
  const current = owned.indexOf(loadout.state.current);
  const next = owned[(current + direction + owned.length) % owned.length];
  if (loadout.equip(next)) audio.select();
}

function cycleSpectate() {
  if (player.state.alive || game.phase !== 'play') return;
  const mates = bots.bots.filter((b) => b.team === 'sable' && b.alive);
  if (mates.length === 0) return;
  game.spectateIndex = (game.spectateIndex + 1) % mates.length;
  const mate = mates[game.spectateIndex % mates.length];
  hud.showBanner(`SPECTATING ${mate.name.toUpperCase()}`, 'Press C for the next teammate', 1600);
}

function handlePressedKeys() {
  const pressed = input.takePressed();
  if (pressed.size === 0) return;
  if (pressed.has('KeyM')) audio.toggleMute();
  if (pressed.has('KeyC')) cycleSpectate();
  if (game.phase !== 'buy' && game.phase !== 'play') return;
  if (pressed.has('KeyR')) loadout.reload();
  if (pressed.has('Digit1')) {
    const primary = loadout.primaryId();
    if (primary) loadout.equip(primary);
  }
  if (pressed.has('Digit2')) loadout.equip('pistol');
  if (pressed.has('WheelUp')) cycleWeapon(1);
  if (pressed.has('WheelDown')) cycleWeapon(-1);
  if (pressed.has('Digit4')) throwGrenade('frag');
  if (pressed.has('Digit5')) throwGrenade('smoke');
  if (pressed.has('KeyG')) throwGrenade(loadout.state.grenades.frag > 0 ? 'frag' : 'smoke');
  if (pressed.has('Enter') && game.phase === 'buy') startPlay();
  if (pressed.has('KeyB') && game.phase === 'buy') {
    if (hud.buyMenuVisible()) {
      hud.hideBuyMenu();
      input.requestLock();
    } else {
      hud.showBuyMenu(economy.buyItems(), economy.state.money, loadout.state.owned, buyItem);
      document.exitPointerLock();
    }
  }
}

function updateCamera(dt) {
  if (!player.state.alive && game.phase === 'play') {
    const mates = bots.bots.filter((b) => b.team === 'sable' && b.alive);
    const mate = mates[game.spectateIndex % Math.max(1, mates.length)];
    if (mate) {
      const forward = new THREE.Vector3(-Math.sin(mate.yaw), 0, -Math.cos(mate.yaw));
      camera.position.copy(mate.group.position).addScaledVector(forward, -3.2).add(new THREE.Vector3(0, 2.1, 0));
      camera.lookAt(mate.group.position.x + forward.x * 4, 1.4, mate.group.position.z + forward.z * 4);
      return;
    }
    // Nobody left to spectate: a high overview of the yard instead of the floor
    // where the player fell.
    camera.position.set(0, 14, 14);
    camera.lookAt(0, 0, -4);
    return;
  }
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.y = player.state.yaw;
  camera.rotation.x = player.state.pitch;
  camera.rotation.z = 0;
  const targetFov = input.state.aiming ? 75 / loadout.zoom() : 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
}

function updatePlayerHitboxes() {
  const p = player.state;
  const crouch = p.crouching;
  torsoBox.position.set(p.position.x, p.position.y + (crouch ? 0.55 : 0.85), p.position.z);
  headBox.position.set(p.position.x, p.position.y + (crouch ? 1.0 : 1.58), p.position.z);
}

function step(dt) {
  time += dt;
  const look = input.takeLook();
  if (input.state.locked && player.state.alive && (game.phase === 'play' || game.phase === 'buy')) {
    player.look(look.x, look.y);
  }
  handlePressedKeys();
  if (game.phase === 'buy') {
    game.roundTime -= dt;
    if (game.roundTime <= 0) startPlay();
  }
  if (game.phase === 'play' && !paused) {
    if (player.state.alive) {
      player.step(dt, input.state.keys, input.state.aiming);
      const firing = input.state.firing;
      if (firing && loadout.ready()) {
        if (loadout.def().auto || !prevFiring) fireWeapon();
      } else if (firing && loadout.state.owned[loadout.state.current].mag === 0) {
        loadout.reload();
      }
      prevFiring = firing;
      handleInteract(dt);
      if (bomb.state.status === 'dropped') {
        const distance = Math.hypot(player.state.position.x - bomb.state.position.x, player.state.position.z - bomb.state.position.z);
        if (distance < 1.2) {
          bomb.pickUp('player');
          hud.showBanner('YOU PICKED UP THE BOMB', 'Plant it at A or B', 2200);
          updateObjective();
        }
      }
    }
    bots.step(dt, time, game);
    bomb.step(dt, () => {
      audio.explosion();
      hud.showBanner('BOMB DETONATED', 'Site destroyed', 3500);
      endRound(game.attackSide, 'Bomb detonated');
    }, () => audio.bombTick());
    game.roundTime -= dt;
    // Ten seconds left: one clock tick and a red timer, so the end of a round is
    // felt before the banner says it.
    game.lowTime = game.roundTime <= 10;
    if (game.lowTime && !lowTimeWarned) {
      lowTimeWarned = true;
      audio.clock();
    }
    if (game.roundTime <= 0 && bomb.state.status !== 'planted') {
      endRound(game.attackSide === 'sable' ? 'viper' : 'sable', 'Time expired');
    }
    throwCooldown = Math.max(0, throwCooldown - dt);
    updatePlayerHitboxes();
  }
  if (game.phase === 'roundEnd') {
    roundEndTimer -= dt;
    if (roundEndTimer <= 0) {
      if (game.matchOver) {
        game.phase = 'matchEnd';
        document.getElementById('final-score').textContent = `SABLE ${economy.state.score.sable} — ${economy.state.score.viper} VIPER`;
        document.getElementById('final-stats').textContent = `Kills ${economy.state.kills} · Deaths ${economy.state.deaths} · Plants ${economy.state.plants} · Defuses ${economy.state.defuses} · Headshots ${economy.state.headshots}`;
        showScreen('match-end');
      } else {
        economy.nextRound();
        startBuy();
      }
    }
  }
  if (player.state.alive) loadout.step(dt);
  else if (wasAlive) camera.children.forEach((child) => { child.visible = false; });
  wasAlive = player.state.alive;
  grenades.step(dt);
  fx.step(dt);
  atmosphere.step(dt);
  updateCamera(dt);
  updateObjective();
  game.crosshairSpread = 6 + loadout.spread(player.groundSpeed(), input.state.aiming, player.state.crouching) * 1400;
  hud.update(game);
}

let lastNow = performance.now();
let frames = 0;
let fpsTime = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  step(dt);
  renderer.render(scene, camera);
  frames += 1;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    const fpsEl = document.getElementById('fps');
    if (fpsEl) fpsEl.textContent = `${Math.round(frames / fpsTime)} FPS`;
    frames = 0;
    fpsTime = 0;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('deploy').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  startMatch();
  input.requestLock();
});
document.getElementById('resume').addEventListener('click', () => {
  input.requestLock();
});
document.getElementById('again').addEventListener('click', () => {
  audio.unlock();
  startMatch();
  input.requestLock();
});

function renderShot() {
  hud.update(game);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// Dev self-test (?selftest=1&frames=N): runs the real loop headlessly with scripted
// input (walk, strafe, fire) and reports the outcome in the document title and
// window.__selftest, so a headless run can prove a round plays without errors.
// Inert unless the parameter is present.
if (params.get('selftest')) {
  const errors = [];
  window.addEventListener('error', (event) => errors.push(String(event.message)));
  startMatch();
  startPlay();
  input.state.keys.add('KeyW');
  input.state.firing = true;
  const frames = Number.parseInt(params.get('frames') ?? '1800', 10) || 1800;
  const phases = new Set([game.phase]);
  for (let i = 0; i < frames; i += 1) {
    if (i === 600) {
      input.state.keys.delete('KeyW');
      input.state.keys.add('KeyA');
    }
    if (i === 900) {
      input.state.keys.delete('KeyA');
      input.state.keys.add('KeyW');
    }
    step(1 / 60);
    phases.add(game.phase);
    if (game.phase === 'matchEnd') break;
  }
  // Force the round-end path too: settle a round, wait out the banner, and confirm
  // the next round's buy phase starts cleanly.
  endRound('viper', 'Self-test round end');
  for (let i = 0; i < 360; i += 1) {
    step(1 / 60);
    phases.add(game.phase);
    if (game.phase === 'buy' && economy.state.round === 2) break;
  }
  const summary = {
    errors,
    phase: game.phase,
    phases: [...phases],
    round: economy.state.round,
    score: economy.state.score,
    kills: economy.state.kills,
    deaths: economy.state.deaths,
    playerHealth: Math.round(player.state.health),
    playerAlive: player.state.alive,
    playerPos: player.state.position.toArray().map((v) => Number(v.toFixed(1))),
    sableAlive: bots.aliveCount('sable'),
    viperAlive: bots.aliveCount('viper'),
    money: economy.state.money,
    bomb: bomb.state.status,
  };
  document.title = `SELFTEST ${JSON.stringify(summary)}`;
  window.__selftest = summary;
  window.__shotReady = true;
}

if (shot === 'start') {
  bots.reset(world.spawns);
  player.reset(0, 14, 0);
  updatePlayerHitboxes();
  updateCamera(0);
  document.getElementById('menu').style.background = 'rgba(23,19,16,0.55)';
  showScreen('menu');
  renderShot();
} else if (shot === 'play') {
  startMatch();
  startPlay();
  // Round start from mid-south, looking straight up mid at the doors: the silo
  // pair and the pipe gantry frame the gap, the SABLE escorts are ahead in the
  // lane, the VIPER mid holder is visible through the doors, smoke blooms at
  // the doors and a tracer crosses the lane.
  loadout.buy('rifle');
  loadout.equip('rifle');
  player.reset(0, 12, 0);
  for (let i = 0; i < 120; i += 1) bots.step(1 / 60, i / 60, game);
  player.reset(0, 12, 0);
  // Stage the firefight for the capture: two escorts ahead in the lane, two
  // VIPER holders visible through the doors, smoke blooming at the doors.
  const sable = bots.bots.filter((b) => b.team === 'sable');
  const viper = bots.bots.filter((b) => b.team === 'viper');
  if (sable[0]) { sable[0].group.position.set(-1.6, 0, 5.5); sable[0].yaw = 0; sable[0].group.rotation.y = 0; }
  if (sable[1]) { sable[1].group.position.set(2.2, 0, 3.5); sable[1].yaw = 0.2; sable[1].group.rotation.y = 0.2; }
  // The VIPER holders stand in the doorway itself, visible through the gap.
  if (viper[0]) { viper[0].group.position.set(1.5, 0, -2); viper[0].yaw = Math.PI; viper[0].group.rotation.y = Math.PI; }
  if (viper[1]) { viper[1].group.position.set(-0.8, 0, -1); viper[1].yaw = Math.PI - 0.3; viper[1].group.rotation.y = Math.PI - 0.3; }
  // The smoke blooms in the open west lane, clear of the doors, so it reads
  // as a cloud instead of a grey panel glimpsed through the gap.
  grenades.throwGrenade('smoke', new THREE.Vector3(0, 1.5, 11.5), new THREE.Vector3(-0.35, 0.1, -0.3).normalize());
  for (let i = 0; i < 100; i += 1) grenades.step(1 / 60);
  updatePlayerHitboxes();
  fx.step(0.5);
  fx.spawnTracer(new THREE.Vector3(0.5, 1.31, 11.2), new THREE.Vector3(0.2, 1.25, -2));
  fx.spawnSparks(new THREE.Vector3(-1.2, 1.2, 1.5), new THREE.Vector3(0, 0, 1));
  showScreen(null);
  updateCamera(0);
  renderShot();
} else if (shot === 'buy') {
  startMatch();
  hud.showBuyMenu(economy.buyItems(), economy.state.money, loadout.state.owned, buyItem);
  showScreen(null);
  updateCamera(0);
  renderShot();
} else if (shot === 'end') {
  economy.state.score = { sable: 8, viper: 5 };
  economy.state.round = 13;
  document.getElementById('final-score').textContent = 'SABLE 8 — 5 VIPER';
  document.getElementById('final-stats').textContent = 'Kills 14 · Deaths 6 · Plants 3 · Defuses 1 · Headshots 5';
  bots.reset(world.spawns);
  showScreen('match-end');
  document.getElementById('match-end').style.background = 'rgba(23,19,16,0.55)';
  camera.position.set(0, 11, 12);
  camera.lookAt(10, 0, -11);
  renderShot();
} else {
  showScreen('menu');
  player.reset(0, 14, 0);
  bots.reset(world.spawns);
  animate();
}
