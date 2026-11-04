import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PHYSICS, samplePath, createPlayer, resetPlayer, stepPlayer } from './physics.js';
import { createCameraPose, updateCameraPose } from './camera.js';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  $('loading').textContent = 'WebGL could not start. Enable hardware acceleration and reload.';
  throw new Error('WebGL is unavailable');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4f2e9');
const camera = new THREE.OrthographicCamera(-60, 60, 35, -35, .1, 200);
camera.position.z = 100;
const player = createPlayer();
const cameraPose = createCameraPose(player);
const keys = new Set();
const debug = new URLSearchParams(location.search).has('debug');
let jumpQueued = false, paused = false, started = false, wideView = false, finished = false;
let last = performance.now(), accumulator = 0;
let viewHeight = Math.max(56, 78 * window.innerHeight / window.innerWidth);

function material(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
}
function disk(radius, color, x, y, z, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), material(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function ribbon(width, color, z, offsetY = 0, opacity = 1) {
  const vertices = [];
  const points = WORLD.points;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (b.y - a.y) / len * width, ny = -(b.x - a.x) / len * width;
    vertices.push(points[i].x + nx, points[i].y + ny + offsetY, z, points[i].x - nx, points[i].y - ny + offsetY, z);
  }
  const indices = [];
  for (let i = 0; i < points.length - 1; i++) {
    const j = i * 2;
    indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const mat = material(color, opacity);
  scene.add(new THREE.Mesh(geometry, mat));
  for (const p of [points[0], points.at(-1)]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(width, 32), mat);
    cap.position.set(p.x, p.y + offsetY, z);
    scene.add(cap);
  }
}

// A quiet paper grid makes gravity direction and movement readable.
const gridPositions = [];
for (let x = -120 * WORLD.scale; x <= 120 * WORLD.scale; x += 4) {
  for (let y = -90 * WORLD.scale; y <= 90 * WORLD.scale; y += 4) gridPositions.push(x, y, -3);
}
const gridGeometry = new THREE.BufferGeometry();
gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
scene.add(new THREE.Points(gridGeometry, new THREE.PointsMaterial({ color: '#bac2b4', size: .055, sizeAttenuation: true })));
ribbon(WORLD.halfWidth + .12 * WORLD.scale, '#293e3b', -1, -.45 * WORLD.scale, .09);
ribbon(WORLD.halfWidth, '#293e3b', 0);
ribbon(.035 * WORLD.scale, '#6c8173', .02);

// Small in-world route marks stay subordinate to the continuous terrain.
const marks = [];
for (let f = .06; f < .95; f += .052) {
  const p = samplePath(f), size = .22 * WORLD.scale;
  marks.push(p.x - p.tx * size + p.nx * size, p.y - p.ty * size + p.ny * size, .05,
    p.x + p.tx * size, p.y + p.ty * size, .05,
    p.x + p.tx * size, p.y + p.ty * size, .05,
    p.x - p.tx * size - p.nx * size, p.y - p.ty * size - p.ny * size, .05);
}
const markGeometry = new THREE.BufferGeometry();
markGeometry.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
scene.add(new THREE.LineSegments(markGeometry, new THREE.LineBasicMaterial({ color: '#c0c6a7', transparent: true, opacity: .6 })));

const hero = new THREE.Group();
scene.add(hero);
disk(WORLD.radius + .075, '#f4f2e9', 0, 0, .9, hero);
disk(WORLD.radius, '#d76545', 0, 0, 1, hero);
disk(.055, '#f4f2e9', -.18, .2, 1.1, hero);
disk(.055, '#f4f2e9', .18, .2, 1.1, hero);
const goalPoint = samplePath(1);
const goal = new THREE.Mesh(new THREE.RingGeometry(.95 * WORLD.scale, 1.02 * WORLD.scale, 48), material('#d76545'));
goal.position.set(goalPoint.x, goalPoint.y, 2);
scene.add(goal);
const goalCore = disk(.22 * WORLD.scale, '#e4bc81', goalPoint.x, goalPoint.y, 2);

// Gravity indicator points from the character towards its nearest ground.
const arrow = new THREE.Group();
const arrowGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, -.9, 2), new THREE.Vector3(0, -1.6, 2),
  new THREE.Vector3(-.17, -1.38, 2), new THREE.Vector3(0, -1.6, 2),
  new THREE.Vector3(.17, -1.38, 2), new THREE.Vector3(0, -1.6, 2),
]);
arrow.add(new THREE.LineSegments(arrowGeometry, new THREE.LineBasicMaterial({ color: '#d76545' })));
scene.add(arrow);

// Keep the map north-up and crop a fixed local area around the player.
$('map-path').setAttribute('d', WORLD.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' '));
function clearInput() {
  keys.clear(); jumpQueued = false;
}
function restart() {
  resetPlayer(player); clearInput();
  Object.assign(cameraPose, createCameraPose(player));
  accumulator = 0; paused = false; finished = false; started = false;
  canvas.focus({ preventScroll: true });
}
window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyR', 'KeyV'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyR') return restart();
  if (event.code === 'KeyV') { wideView = !wideView; return; }
  if (paused || finished) return;
  if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) started = true;
  keys.add(event.code);
  if (event.code === 'Space') jumpQueued = true;
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { clearInput(); paused = true; });
window.addEventListener('focus', () => { paused = false; last = performance.now(); accumulator = 0; });
document.addEventListener('visibilitychange', () => {
  clearInput(); paused = document.hidden;
  last = performance.now(); accumulator = 0;
});
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
$('loading').hidden = true;

function frame(now) {
  const delta = Math.min((now - last) / 1000, .05); last = now;
  if (!paused && !finished && started) {
    accumulator += delta;
    let move = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    move = Math.sign(move);
    while (accumulator >= PHYSICS.fixedDt) {
      stepPlayer(player, { move, jump: jumpQueued }, PHYSICS.fixedDt);
      jumpQueued = false; accumulator -= PHYSICS.fixedDt;
      if (player.won) {
        finished = true; clearInput();
        break;
      }
    }
  }
  const aspect = window.innerWidth / window.innerHeight;
  const targetHeight = wideView ? Math.max(86, 120 / aspect) : Math.max(56, 78 / aspect);
  const easing = 1 - Math.exp(-delta * 5);
  viewHeight += (targetHeight - viewHeight) * easing;
  updateCameraPose(cameraPose, player, delta);
  camera.position.set(cameraPose.x, cameraPose.y, 100);
  camera.rotation.z = cameraPose.angle;
  camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  hero.position.set(player.x, player.y, 0);
  hero.rotation.z = Math.atan2(player.ny, player.nx) - Math.PI / 2;
  arrow.position.copy(hero.position); arrow.rotation.z = hero.rotation.z;
  arrow.visible = !player.grounded;
  const pulse = 1 + Math.sin(now * .002) * .12;
  goal.scale.setScalar(pulse); goalCore.scale.setScalar(2 - pulse);
  $('minimap').setAttribute('viewBox', `${player.x - 42} ${-player.y - 25.2} 84 50.4`);
  $('map-player').setAttribute('cx', player.x); $('map-player').setAttribute('cy', -player.y);
  const percent = finished ? 100 : Math.floor(player.progress * 100);
  $('progress').innerHTML = `${String(percent).padStart(2, '0')}<span>%</span>`;
  $('progress-fill').style.width = `${percent}%`;
  if (debug) canvas.dataset.diagnostics = JSON.stringify({
    x: player.x, y: player.y, grounded: player.grounded, jumps: player.jumps,
    progress: player.progress, paused, finished, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    nx: player.nx, ny: player.ny, cameraAngle: cameraPose.angle, cameraX: cameraPose.x, cameraY: cameraPose.y, viewHeight,
    elapsed: player.elapsed, vx: player.vx, vy: player.vy, frameDelta: delta,
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
