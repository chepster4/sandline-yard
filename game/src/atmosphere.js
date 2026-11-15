// SANDLINE YARD — atmosphere. A low sun, drifting dust and light shafts,
// so the dusk reads as evening air instead of a flat gradient: the sun
// hangs over the north fence where the play camera looks, dust motes drift
// through the lanes, and shafts fall from the gantry and the floodlights.
// All of it is static except the dust, which advances on step(dt) with a
// fixed phase, so a seeded screenshot renders the same frame every time.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function radialTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function addAtmosphere(scene) {
  // The sun: a glowing disc over the north yard, high enough to clear the
  // mid wall and the gantry in the play camera's view. Fog is off for it,
  // or the haze would eat it.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,236,190,1)', 'rgba(232,120,48,0.55)'),
    transparent: true, depthWrite: false, fog: false,
  }));
  sun.scale.set(40, 40, 1);
  sun.position.set(-15, 45, -85);
  scene.add(sun);

  // Dust: one Points cloud drifting slowly east, wrapping inside the yard.
  const COUNT = 240;
  const positions = new Float32Array(COUNT * 3);
  const drift = new Float32Array(COUNT);
  const wobble = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) {
    positions[i * 3] = -22 + Math.random() * 44;
    positions[i * 3 + 1] = 0.3 + Math.random() * 6.5;
    positions[i * 3 + 2] = -18 + Math.random() * 36;
    drift[i] = 0.12 + Math.random() * 0.25;
    wobble[i] = Math.random() * 6.28;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.lamp), size: 0.07, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  // Light shafts: tall gradient planes, additive and faint, under the
  // gantry lamp and two floodlights.
  function shaftTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,217,160,0.55)');
    grad.addColorStop(0.7, 'rgba(255,217,160,0.12)');
    grad.addColorStop(1, 'rgba(255,217,160,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const shaftTex = shaftTexture();
  function shaft(x, z, rotY, w = 2.4, h = 8) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: shaftTex, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    );
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
  }
  shaft(0, 1, 0);
  shaft(0, 1, Math.PI / 2, 1.8, 7);
  shaft(-19.5, 0, Math.PI / 2, 2.0, 6.2);
  shaft(19.5, 0, -Math.PI / 2, 2.0, 6.2);

  let time = 0;
  function step(dt) {
    time += dt;
    const attr = dustGeo.getAttribute('position');
    for (let i = 0; i < COUNT; i += 1) {
      let x = attr.getX(i) + drift[i] * dt;
      if (x > 22) x = -22;
      attr.setX(i, x);
      attr.setY(i, attr.getY(i) + Math.sin(time * 0.7 + wobble[i]) * 0.0006);
    }
    attr.needsUpdate = true;
  }

  return { step };
}
