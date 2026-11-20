import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PHYSICS, createPlayer, resetPlayer, stepPlayer } from './physics.js?v=20261120f';
import { createCameraPose, updateCameraPose } from './camera.js';
import { setupFullscreen } from './fullscreen.js';
import { PANELS, GOAL, SCENE_LENGTH, TRANSITION, sceneAt, floorPoint } from './scenes.js?v=20261120f';
import { addArtwork } from './artwork.js?v=20261120f';

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
scene.background = new THREE.Color('#9bb3a1');
const camera = new THREE.OrthographicCamera(-60, 60, 35, -35, .1, 200);
camera.position.z = 100;
const parameters = new URLSearchParams(location.search);
const debug = parameters.has('debug');
const player = createPlayer();
if (debug && parameters.has('panel')) {
  const panel = PANELS[Number(parameters.get('panel'))];
  if (panel) Object.assign(player, floorPoint(panel.start + (parameters.has('seam') ? panel.length - 1.2 : .8)));
}
if (debug && parameters.has('transition')) Object.assign(player, floorPoint((TRANSITION.start+TRANSITION.end)/2));
const cameraPose = createCameraPose(player);
const keys = new Set();
let jumpQueued = false, paused = false, started = false, wideView = false, finished = false;
let last = performance.now(), accumulator = 0;
let viewHeight = Math.max(28, 40 * window.innerHeight / window.innerWidth);

function material(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
}
function disk(radius, color, x, y, z, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), material(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
const hero = new THREE.Group();
scene.add(hero);
disk(WORLD.radius + .075, '#f4f2e9', 0, 0, .9, hero);
disk(WORLD.radius, '#d76545', 0, 0, 1, hero);
disk(.055, '#f4f2e9', -.18, .2, 1.1, hero);
disk(.055, '#f4f2e9', .18, .2, 1.1, hero);
const goalPoint = GOAL;
const goal = new THREE.Mesh(new THREE.RingGeometry(.85, .94, 48), material('#f3d790'));
goal.position.set(goalPoint.x, goalPoint.y, 2);
scene.add(goal);
const goalCore = disk(.22, '#e4bc81', goalPoint.x, goalPoint.y, 2);

// Gravity indicator points from the character towards its nearest ground.
const arrow = new THREE.Group();
const arrowGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, -.9, 2), new THREE.Vector3(0, -1.6, 2),
  new THREE.Vector3(-.17, -1.38, 2), new THREE.Vector3(0, -1.6, 2),
  new THREE.Vector3(.17, -1.38, 2), new THREE.Vector3(0, -1.6, 2),
]);
arrow.add(new THREE.LineSegments(arrowGeometry, new THREE.LineBasicMaterial({ color: '#d76545' })));
scene.add(arrow);
let updateArtwork;
try { updateArtwork = await addArtwork(scene); }
catch(error) { $('loading').textContent = 'Scene artwork could not load. Please refresh to retry.'; throw error; }

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
  if (event.code === 'Escape' || event.code === 'KeyF') return;
  if (event.target.closest?.('button') && ['Space', 'Enter'].includes(event.code)) return;
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
document.addEventListener('fullscreenchange', () => {
  resize();
  canvas.focus({ preventScroll: true });
});
resize();
$('loading').hidden = true;
setupFullscreen($('game'), $('fullscreen'));

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
  const targetHeight = wideView ? Math.max(56, 78 / aspect) : Math.max(28, 40 / aspect);
  const easing = 1 - Math.exp(-delta * 5);
  viewHeight += (targetHeight - viewHeight) * easing;
  updateCameraPose(cameraPose, player, delta);
  const edgeMargin=viewHeight*aspect/2-1.2;
  const routePosition=player.progress*WORLD.totalLength;
  const edgeFraming=Math.max(0,edgeMargin-routePosition)-Math.max(0,edgeMargin-(WORLD.totalLength-routePosition));
  camera.position.set(cameraPose.x+Math.cos(cameraPose.angle)*edgeFraming,cameraPose.y+Math.sin(cameraPose.angle)*edgeFraming,100);
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
  updateArtwork(player.progress,viewHeight*aspect,viewHeight,edgeFraming);
  $('minimap').setAttribute('viewBox', `${player.x - 42} ${-player.y - 25.2} 84 50.4`);
  $('map-player').setAttribute('cx', player.x); $('map-player').setAttribute('cy', -player.y);
  const percent = finished ? 100 : Math.floor(player.progress * 100);
  $('progress').innerHTML = `${String(percent).padStart(2, '0')}<span>%</span>`;
  $('progress-fill').style.width = `${percent}%`;
  if (debug) canvas.dataset.diagnostics = JSON.stringify({
    x: player.x, y: player.y, grounded: player.grounded, jumps: player.jumps, airJumpUsed: player.airJumpUsed,
    progress: player.progress, paused, finished, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    nx: player.nx, ny: player.ny, cameraAngle: cameraPose.angle, cameraX: camera.position.x, cameraY: camera.position.y, viewHeight,
    elapsed: player.elapsed, vx: player.vx, vy: player.vy, frameDelta: delta,
    fullscreen: Boolean(document.fullscreenElement),
    scene:sceneAt(routePosition)+1,sceneLength:SCENE_LENGTH,panels:PANELS.length,
    transition:routePosition>TRANSITION.start&&routePosition<TRANSITION.end,
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
