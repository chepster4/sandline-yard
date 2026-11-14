// Transient combat effects, pooled so the hot loop makes no new objects: bullet
// tracers (a fading line from muzzle to impact) and impact sparks (a burst of
// points). Everything here is fire-and-forget; main.js and bots.js only call spawn.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const TRACER_LIFE = 0.09;
const SPARK_COUNT = 12;
const SPARK_LIFE = 0.35;

export function createFx(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
    );
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, left: 0 });
  }

  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0 }),
    );
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, velocities: new Float32Array(30), left: 0 });
  }

  let tracerCursor = 0;
  let sparkCursor = 0;

  // The colour is the shooter's: amber for the player, team colours for bots,
  // so a firefight reads at a glance. Defaults to the amber accent.
  function spawnTracer(from, to, color = PALETTE.accent) {
    const tracer = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACER_COUNT;
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = from.x;
    positions[1] = from.y;
    positions[2] = from.z;
    positions[3] = to.x;
    positions[4] = to.y;
    positions[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.line.material.color.set(color);
    tracer.line.material.opacity = 0.85;
    tracer.line.visible = true;
    tracer.left = TRACER_LIFE;
  }

  function spawnSparks(at, normal) {
    const spark = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
    const positions = spark.points.geometry.attributes.position.array;
    for (let i = 0; i < 10; i += 1) {
      positions[i * 3] = at.x;
      positions[i * 3 + 1] = at.y;
      positions[i * 3 + 2] = at.z;
      const spread = 2.6;
      spark.velocities[i * 3] = normal.x * 2 + (Math.random() - 0.5) * spread;
      spark.velocities[i * 3 + 1] = Math.abs(normal.y) * 1.5 + Math.random() * 2 + 0.6;
      spark.velocities[i * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * spread;
    }
    spark.points.geometry.attributes.position.needsUpdate = true;
    spark.points.material.opacity = 1;
    spark.points.visible = true;
    spark.left = SPARK_LIFE;
  }

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.left <= 0) continue;
      tracer.left -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.left / TRACER_LIFE) * 0.85;
      if (tracer.left <= 0) tracer.line.visible = false;
    }
    for (const spark of sparks) {
      if (spark.left <= 0) continue;
      spark.left -= dt;
      const positions = spark.points.geometry.attributes.position.array;
      for (let i = 0; i < 10; i += 1) {
        positions[i * 3] += spark.velocities[i * 3] * dt;
        positions[i * 3 + 1] += spark.velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += spark.velocities[i * 3 + 2] * dt;
        spark.velocities[i * 3 + 1] -= 9 * dt;
      }
      spark.points.geometry.attributes.position.needsUpdate = true;
      spark.points.material.opacity = Math.max(0, spark.left / SPARK_LIFE);
      if (spark.left <= 0) spark.points.visible = false;
    }
  }

  return { spawnTracer, spawnSparks, step };
}
