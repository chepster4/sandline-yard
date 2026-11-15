// SANDLINE YARD — combat effects, pooled so the hot loop never allocates.
// Tracers are a ring of reusable beams that fade in a tenth of a second;
// impact sparks are one THREE.Points cloud of 240 particles, each with a
// velocity and a life, recycled in place. Nothing here creates a mesh, a
// material or a vector while a round is running.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const TRACER_LIFE = 0.14;
const SPARK_COUNT = 240;
const SPARKS_PER_HIT = 10;

export function createFx(scene) {
  // Tracers are a ring of reusable beams: a thin cylinder stretched from the
  // muzzle to the hit, additive and fading in a tenth of a second. A beam has
  // real width on screen, where the old 1px line read as a stray wire.
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const beamDir = new THREE.Vector3();
  const beamUp = new THREE.Vector3(0, 1, 0);
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const beam = new THREE.Mesh(beamGeo, material);
    beam.frustumCulled = false;
    beam.visible = false;
    scene.add(beam);
    tracers.push({ beam, life: 0 });
  }
  let tracerCursor = 0;

  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  for (let i = 0; i < SPARK_COUNT; i += 1) sparkPositions[i * 3 + 1] = -100;
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.spark), size: 0.09, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const sparkPoints = new THREE.Points(sparkGeometry, sparkMaterial);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  let sparkCursor = 0;

  // One shared muzzle light, flashed at the shot's origin and cut after a
  // blink: a tracer alone reads flat in the dusk, the flash sells the shot.
  let flashLight = null;
  function flashAt(position) {
    if (!flashLight) {
      flashLight = new THREE.PointLight(new THREE.Color(PALETTE.muzzle), 0, 10, 2);
      scene.add(flashLight);
    }
    flashLight.position.copy(position);
    flashLight.intensity = 2.4;
    window.setTimeout(() => { flashLight.intensity = 0; }, 70);
  }

  // spawnTracer(from, to, color): one bright beam from the muzzle to the hit,
  // coloured by team when the caller knows it (bots pass their team colour).
  function spawnTracer(from, to, color) {
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACER_POOL;
    const length = from.distanceTo(to);
    if (length < 0.1) return;
    beamDir.copy(to).sub(from).normalize();
    slot.beam.position.copy(from).add(to).multiplyScalar(0.5);
    slot.beam.quaternion.setFromUnitVectors(beamUp, beamDir);
    slot.beam.scale.set(0.02, length, 0.02);
    if (color) slot.beam.material.color.set(color);
    else slot.beam.material.color.set(PALETTE.muzzle);
    slot.beam.material.opacity = 0.85;
    slot.beam.visible = true;
    slot.life = TRACER_LIFE;
    flashAt(from);
  }

  // spawnSparks(point, normal): a fan of hot particles off a wall hit, biased
  // along the surface normal so the burst reads as an impact, not a cloud.
  function spawnSparks(point, normal) {
    for (let n = 0; n < SPARKS_PER_HIT; n += 1) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
      sparkPositions[i * 3] = point.x;
      sparkPositions[i * 3 + 1] = point.y;
      sparkPositions[i * 3 + 2] = point.z;
      const spread = 2.2;
      sparkVel[i * 3] = normal.x * (2 + Math.random() * 2.5) + (Math.random() - 0.5) * spread;
      sparkVel[i * 3 + 1] = Math.abs(normal.y) * (1.5 + Math.random() * 2) + Math.random() * 1.5;
      sparkVel[i * 3 + 2] = normal.z * (2 + Math.random() * 2.5) + (Math.random() - 0.5) * spread;
      sparkLife[i] = 0.35 + Math.random() * 0.25;
    }
    sparkGeometry.getAttribute('position').needsUpdate = true;
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.beam.visible = false;
        slot.beam.material.opacity = 0;
      } else {
        slot.beam.material.opacity = 0.85 * (slot.life / TRACER_LIFE);
      }
    }
    let anyAlive = false;
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      if (sparkLife[i] <= 0) continue;
      anyAlive = true;
      sparkLife[i] -= dt;
      if (sparkLife[i] <= 0) {
        sparkPositions[i * 3 + 1] = -100;
        continue;
      }
      sparkVel[i * 3 + 1] -= 9.8 * dt;
      sparkPositions[i * 3] += sparkVel[i * 3] * dt;
      sparkPositions[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPositions[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkPositions[i * 3 + 1] < 0.02) {
        sparkPositions[i * 3 + 1] = 0.02;
        sparkVel[i * 3 + 1] *= -0.35;
        sparkVel[i * 3] *= 0.6;
        sparkVel[i * 3 + 2] *= 0.6;
      }
    }
    if (anyAlive) sparkGeometry.getAttribute('position').needsUpdate = true;
  }

  return { spawnTracer, spawnSparks, step };
}
