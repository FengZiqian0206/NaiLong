import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PHYSICS, createPlayer, resetPlayer, goalLapProgress } from './physics.js?v=20261126';
import { createCameraPose, updateCameraPose, frameRouteEnds } from './camera.js?v=20261126';
import { setupFullscreen } from './fullscreen.js?v=20261125';
import { PANELS, SPAWN, GOAL, SCENE_LENGTH, TRANSITIONS, sceneAt, transitionAt, floorPoint } from './scenes.js?v=20261123b';
import { addArtwork } from './artwork.js?v=20261126';
import { createCharacter } from './character.js?v=20261126';
import { createCharacterActions } from './character-actions.js?v=20261126';
import { createFeedback } from './feedback.js?v=20261124c';
import { createProps, propPoint } from './props.js?v=20261126';
import { createPropEditor } from './prop-editor.js?v=20261126';

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
const player = createPlayer({ bounded: true });
if (debug) {
  const panel = parameters.has('panel') ? PANELS[Number(parameters.get('panel'))] : null;
  const transition = parameters.has('transition') ? TRANSITIONS[Number(parameters.get('transition') || 1) - 1] : null;
  if (panel || transition) {
    const s = transition ? (transition.start + transition.end) / 2
      : panel.start + (parameters.has('seam') ? panel.length - 1.2 : parameters.has('middle') ? panel.length / 2 : .8);
    Object.assign(player, floorPoint(s), { lapProgress: (s - SPAWN.s) / WORLD.totalLength });
  }
}
let viewHeight = Math.max(28, 40 * window.innerHeight / window.innerWidth);
const cameraPose = createCameraPose(player, viewHeight);
const keys = new Set();
let paused = false, started = false, wideView = false, finished = false;
let last = performance.now(), accumulator = 0;

function material(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
}
function disk(radius, color, x, y, z, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), material(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
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
let updateArtwork, character, props;
try {
  [updateArtwork, character, props] = await Promise.all([
    addArtwork(scene), createCharacter(scene, WORLD.radius), createProps(scene),
  ]);
}
catch(error) { $('loading').textContent = 'Scene artwork could not load. Please refresh to retry.'; throw error; }
const hero = character.object;
const feedback = createFeedback(scene, WORLD.radius);
const actions = createCharacterActions(player, character, feedback);
const glowPalette = ['#ffc184', '#a5e8ff', '#e7a2ff', '#ff875c', '#a9e3ce', '#bbcaff']
  .map(hex => new THREE.Color(hex));
const glowIntensity = [.92, .78, 1.13, 1.02, .84, .86];
const glowColor = new THREE.Color();

// Keep the map north-up and crop a fixed local area around the player.
$('map-path').setAttribute('d', WORLD.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' ') + ' Z');
function clearInput() {
  keys.clear();
  actions.cancelJump();
}
const pointerPoint = new THREE.Vector3();
const editor = createPropEditor({
  root: $('game'), canvas, clearInput,
  getPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerPoint.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2, 0);
    pointerPoint.unproject(camera);
    return propPoint(pointerPoint.x, pointerPoint.y);
  },
  addProp: props.add, pickProp: props.pick, editProp: props.edit, removeProp: props.remove, selectProp: props.select,
  async restoreProps(definitions) {
    const results = await Promise.allSettled(definitions.map(props.add));
    return results.filter(result => result.status === 'fulfilled').map(result => result.value);
  },
});
function restart() {
  resetPlayer(player); clearInput();
  actions.reset();
  Object.assign(cameraPose, createCameraPose(player, viewHeight));
  accumulator = 0; paused = false; finished = false; started = false;
  canvas.focus({ preventScroll: true });
}
const playKeys = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE'];
const isEditingField = event => event.target.closest?.('input, select, textarea, [contenteditable]');
window.addEventListener('keydown', (event) => {
  // Resume audio before fullscreen can consume the same input gesture.
  if (event.isTrusted && !event.repeat && !isEditingField(event) && playKeys.includes(event.code)) void feedback.unlock();
}, { capture: true });
canvas.addEventListener('pointerdown', () => { void feedback.unlock(); });
window.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'KeyP' && !event.repeat) { event.preventDefault(); editor.toggle(); return; }
  if (event.code === 'Escape' || event.code === 'KeyF' || isEditingField(event)) return;
  if (event.target.closest?.('button') && ['Space', 'Enter'].includes(event.code)) return;
  if (playKeys.includes(event.code) || ['KeyR', 'KeyV'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyR') return restart();
  if (event.code === 'KeyV') { wideView = !wideView; return; }
  if (paused || finished) return;
  if (!playKeys.includes(event.code)) return;
  started = true;
  if (event.code === 'KeyE') {
    if (editor.active) return;
    if (!player.falling) props.interact(player);
    actions.interact();
  }
  else if (event.code === 'Space') actions.requestJump();
  else keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { clearInput(); feedback.reset(); paused = true; });
window.addEventListener('focus', () => { paused = false; last = performance.now(); accumulator = 0; });
document.addEventListener('visibilitychange', () => {
  clearInput(); paused = document.hidden;
  if (paused) feedback.reset();
  last = performance.now(); accumulator = 0;
});
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', () => {
  resize();
  if (!editor.active) canvas.focus({ preventScroll: true });
});
resize();
$('loading').hidden = true;
setupFullscreen($('game'), $('fullscreen'), () => !editor.active);

function frame(now) {
  const delta = Math.min((now - last) / 1000, .05); last = now;
  const lightPosition = player.progress * WORLD.totalLength;
  const lightScene = sceneAt(lightPosition), lightTransition = transitionAt(lightPosition);
  const nextLight = (lightScene + 1) % glowPalette.length;
  const blend = lightTransition
    ? THREE.MathUtils.smoothstep(lightPosition, lightTransition.start, lightTransition.end) : 0;
  const glowStrength = THREE.MathUtils.lerp(glowIntensity[lightScene], glowIntensity[nextLight], blend);
  glowColor.copy(glowPalette[lightScene]).lerp(glowPalette[nextLight], blend);
  feedback.setGlowColor(glowColor);
  if (!paused && !finished && started) {
    accumulator += delta;
    let move = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    move = Math.sign(move);
    while (accumulator >= PHYSICS.fixedDt) {
      actions.step(move, PHYSICS.fixedDt);
      accumulator -= PHYSICS.fixedDt;
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
  updateCameraPose(cameraPose, player, delta, viewHeight);
  const routePosition = player.progress * WORLD.totalLength;
  const viewWidth = viewHeight * aspect;
  const framed = frameRouteEnds(cameraPose, viewWidth, viewHeight);
  camera.position.set(framed.x, framed.y, 100);
  camera.rotation.z = framed.angle;
  camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
  camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  hero.position.set(player.x, player.y, 0);
  hero.rotation.z = Math.atan2(player.ny, player.nx) - Math.PI / 2;
  if (!paused) {
    const tangentSpeed = player.vx * player.ny - player.vy * player.nx;
    character.update(delta, {
      direction: Math.abs(tangentSpeed) > .3 ? Math.sign(tangentSpeed) : 0,
      grounded: player.grounded,
      verticalSpeed: player.vx * player.nx + player.vy * player.ny,
      glowColor, glowStrength,
    });
    feedback.update(delta, { player, idle: character.state === 'idle' && player.grounded });
  }
  arrow.position.copy(hero.position); arrow.rotation.z = hero.rotation.z;
  arrow.visible = !player.grounded;
  const pulse = 1 + Math.sin(now * .002) * .12;
  goal.scale.setScalar(pulse); goalCore.scale.setScalar(2 - pulse);
  goal.visible = goalCore.visible = player.lapProgress > .85;
  updateArtwork(cameraPose.progress, viewWidth, viewHeight, framed.progress);
  props.update(paused ? 0 : delta, player, framed.progress, viewWidth, viewHeight, editor.active || finished);
  $('minimap').setAttribute('viewBox', `${player.x - 42} ${-player.y - 25.2} 84 50.4`);
  $('map-player').setAttribute('cx', player.x); $('map-player').setAttribute('cy', -player.y);
  const percent = finished ? 100 : Math.min(99, Math.max(0, Math.floor(player.lapProgress / goalLapProgress * 100)));
  $('progress').innerHTML = `${String(percent).padStart(2, '0')}<span>%</span>`;
  $('progress-fill').style.width = `${percent}%`;
  if (debug) canvas.dataset.diagnostics = JSON.stringify({
    x: player.x, y: player.y, grounded: player.grounded, jumps: player.jumps, airJumpUsed: player.airJumpUsed,
    progress: player.progress, paused, finished, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    nx: player.nx, ny: player.ny, cameraAngle: framed.angle, cameraX: camera.position.x, cameraY: camera.position.y, viewHeight, viewWidth,
    elapsed: player.elapsed, vx: player.vx, vy: player.vy, frameDelta: delta,
    falling: player.falling, fallLocked: cameraPose.fallLocked, cameraLift: cameraPose.lift,
    respawns: player.respawnId, respawnScene: player.respawnScene + 1,
    fullscreen: Boolean(document.fullscreenElement),
    scene:sceneAt(routePosition)+1,sceneLength:SCENE_LENGTH,panels:PANELS.length,
    transition: Boolean(transitionAt(routePosition)), lapProgress: player.lapProgress, ringRadius: WORLD.ringRadius,
    character: character.state, glow: '#' + glowColor.getHexString(), feedback: feedback.diagnostics,
    activeProp: props.activeId, animatingProp: props.animatingId,
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
