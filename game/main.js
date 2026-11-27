import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PHYSICS, createPlayer, resetPlayer, respawnPlayer, goalLapProgress } from './physics.js?v=20261127';
import { createCameraPose, updateCameraPose, frameRouteEnds } from './camera.js?v=20261127b';
import { setupFullscreen } from './fullscreen.js?v=20261125';
import { PANELS, SPAWN, GOAL, SCENE_LENGTH, TRANSITIONS, sceneAt, transitionAt, floorPoint, worldAt, setCustomColliders } from './scenes.js?v=20261127';
import { addArtwork } from './artwork.js?v=20261127b';
import { createCharacter } from './character.js?v=20261127b';
import { createCharacterActions } from './character-actions.js?v=20261127';
import { createFeedback } from './feedback.js?v=20261127b';
import { createProps, propPoint } from './props.js?v=20261127b';
import { createPropEditor } from './prop-editor.js?v=20261127b';
import { createPropPopup } from './prop-popup.js?v=20261126b';
import { loadSharedProps, publishSharedProps } from './shared-props.js?v=20261127b';
import { createPropHud } from './prop-hud.js?v=20261127b';
import { createColliderPreview } from './collider-preview.js?v=20261127';
import { createMotionPreview } from './motion-preview.js?v=20261127b';

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
const routeEnd = PANELS.at(-1).start + PANELS.at(-1).length;
const endProgress = routeEnd / WORLD.totalLength;
const player = createPlayer({ bounded: true });
if (debug) {
  const panel = parameters.has('panel') ? PANELS[Number(parameters.get('panel'))] : null;
  const transition = parameters.has('transition') ? TRANSITIONS[Number(parameters.get('transition') || 1) - 1] : null;
  if (panel || transition) {
    const s = transition ? Math.min(GOAL.s, (transition.start + transition.end) / 2)
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
const glowPalette = ['#ffc184', '#a5e8ff', '#e7a2ff', '#ff875c', '#78e4f5', '#f7b7ee']
  .map(hex => new THREE.Color(hex));
const glowIntensity = [.92, .78, 1.13, 1.02, .84, .86];
const glowColor = new THREE.Color();

// Keep the map north-up and mark only the course between the two ends.
const mapPoints = WORLD.points.slice(0, Math.floor(endProgress * (WORLD.points.length - 1)) + 1);
mapPoints.push(worldAt(routeEnd));
$('map-path').setAttribute('d', mapPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' '));
function clearInput() {
  keys.clear();
  actions.cancelJump();
}
const pointerPoint = new THREE.Vector3(), promptPoint = new THREE.Vector3();
const popup = createPropPopup($('game'), { clearInput });
const propHud = createPropHud($('game'));
const editor = createPropEditor({
  root: $('game'), canvas, clearInput, publishSharedProps, defaultProps: props.defaults,
  previewZone: props.previewZone,
  setCollisionBlocks: setCustomColliders,
  previewCollisionBlocks: createColliderPreview(scene),
  previewMotion: createMotionPreview(scene),
  async loadSharedProps() {
    const shared = await loadSharedProps();
    if (shared.includesDefaults) return shared;
    const layout = new Map(props.defaults.map(prop => [prop.id, prop]));
    for (const prop of shared.props) layout.set(prop.id, prop);
    return { ...shared, props: [...layout.values()] };
  },
  getPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerPoint.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2, 0);
    pointerPoint.unproject(camera);
    return propPoint(pointerPoint.x, pointerPoint.y);
  },
  addProp: props.add, pickProp: props.pick, editProp: props.edit, removeProp: props.remove, selectProp: props.select,
  async restoreProps(definitions) {
    const ids = new Set(definitions.map(prop => prop.id));
    for (const prop of props.defaults) if (!ids.has(prop.id)) props.remove(prop.id);
    const results = await Promise.allSettled(definitions.map(props.add));
    return results.filter(result => result.status === 'fulfilled').map(result => result.value);
  },
});
let propsReady = false;
void editor.ready.then(() => { propsReady = true; });

function followRide(position) {
  const anchor = worldAt(position.s);
  const travel = anchor.progress - player.progress;
  Object.assign(player, {
    x: position.x, y: position.y, vx: 0, vy: 0, nx: anchor.nx, ny: anchor.ny,
    tx: -anchor.ny, ty: anchor.nx, progress: anchor.progress,
    lapProgress: player.lapProgress + travel - Math.round(travel),
    grounded: false, groundId: null, airJumpUsed: false, falling: false,
  });
}

function disembark(position) {
  if (!position) return;
  followRide(position);
  actions.interact();
}

function restart() {
  resetPlayer(player); clearInput();
  actions.reset();
  props.reset();
  propHud.reset();
  Object.assign(cameraPose, createCameraPose(player, viewHeight));
  accumulator = 0; paused = false; finished = false; started = false;
  canvas.focus({ preventScroll: true });
}
const playKeys = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE'];
const isEditingField = event => event.target.closest?.('input, select, textarea, [contenteditable]');
const isTyping = event => event.target.closest?.('input:not([type]), input[type=text], input[type=password], textarea, [contenteditable]');
window.addEventListener('keydown', (event) => {
  // Resume audio before fullscreen can consume the same input gesture.
  if (!popup.active && event.isTrusted && !event.repeat && !isEditingField(event) && playKeys.includes(event.code)) void feedback.unlock();
}, { capture: true });
canvas.addEventListener('pointerdown', () => { void feedback.unlock(); });
window.addEventListener('keydown', (event) => {
  if (popup.active || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'KeyP' && !event.repeat && !isTyping(event)) {
    event.preventDefault();
    if (props.ridingId) disembark(props.exitRide());
    editor.toggle();
    return;
  }
  if (event.code === 'Escape' || event.code === 'KeyF' || isEditingField(event)) return;
  if (event.target.closest?.('button, summary') && ['Space', 'Enter'].includes(event.code)) return;
  if (playKeys.includes(event.code) || ['KeyR', 'KeyV'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyR') return restart();
  if (event.code === 'KeyV') { wideView = !wideView; return; }
  if (paused || finished) return;
  if (!playKeys.includes(event.code)) return;
  started = true;
  if (event.code === 'KeyE') {
    if (editor.active) return;
    if (props.ridingId) { disembark(props.exitRide()); return; }
    const interaction = player.falling || !propsReady ? null : props.interact(player);
    if (interaction?.type === 'blocked') return;
    if (interaction?.type === 'ride') {
      actions.cancelJump();
      followRide(interaction);
    }
    actions.interact();
    if (interaction?.type === 'image') void popup.show(interaction.image);
    if (interaction?.type === 'pickup') propHud.collect(interaction);
  }
  else if (event.code === 'Space') {
    if (!props.ridingId) actions.requestJump();
  }
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
  if (!editor.active && !popup.active) canvas.focus({ preventScroll: true });
});
resize();
$('loading').hidden = true;
setupFullscreen($('game'), $('fullscreen'), () => !editor.active && !popup.active);

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
  if (propsReady && !paused && !finished && !popup.active && started) {
    accumulator += delta;
    const move = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    while (accumulator >= PHYSICS.fixedDt) {
      accumulator -= PHYSICS.fixedDt;
      const ride = props.stepRide(move, PHYSICS.fixedDt);
      if (ride) {
        if (ride.finished) disembark(ride);
        else followRide(ride);
        continue;
      }
      const before = { x: player.x, y: player.y, respawnId: player.respawnId };
      actions.step(move, PHYSICS.fixedDt);
      if (!editor.active && player.respawnId === before.respawnId && props.stepHazards(before, player, PHYSICS.fixedDt)) {
        respawnPlayer(player, sceneAt(player.progress * WORLD.totalLength));
        clearInput(); actions.reset(); accumulator = 0;
        break;
      }
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
  const riding = Boolean(props.ridingId);
  updateCameraPose(cameraPose, player, delta, viewHeight, riding);
  const routePosition = player.progress * WORLD.totalLength;
  const viewWidth = viewHeight * aspect;
  const framed = frameRouteEnds(cameraPose, viewWidth, viewHeight, endProgress);
  camera.position.set(framed.x, framed.y, 100);
  camera.rotation.z = framed.angle;
  camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
  camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  hero.position.set(player.x, player.y, 0);
  hero.rotation.z = Math.atan2(player.ny, player.nx) - Math.PI / 2;
  hero.visible = !riding;
  if (!paused) {
    const tangentSpeed = player.vx * player.ny - player.vy * player.nx;
    character.update(delta, {
      direction: Math.abs(tangentSpeed) > .3 ? Math.sign(tangentSpeed) : 0,
      grounded: player.grounded,
      verticalSpeed: player.vx * player.nx + player.vy * player.ny,
      glowColor, glowStrength,
    });
    feedback.update(delta, { player: riding ? undefined : player, idle: character.state === 'idle' && player.grounded });
  }
  arrow.position.copy(hero.position); arrow.rotation.z = hero.rotation.z;
  arrow.visible = !riding && !player.grounded;
  const pulse = 1 + Math.sin(now * .002) * .12;
  goal.scale.setScalar(pulse); goalCore.scale.setScalar(2 - pulse);
  goal.visible = goalCore.visible = player.lapProgress > .85;
  updateArtwork(cameraPose.progress, viewWidth, viewHeight, framed.progress);
  props.update(paused ? 0 : delta, player, framed.progress, viewWidth, viewHeight, editor.active,
    propsReady && !finished && !popup.active);
  const prompt = props.prompt;
  if (prompt) {
    const point = worldAt(prompt.s, prompt.h);
    promptPoint.set(point.x, point.y, 0).project(camera);
    propHud.showPrompt({ x: (promptPoint.x + 1) * canvas.clientWidth / 2,
      y: (1 - promptPoint.y) * canvas.clientHeight / 2, blocked: prompt.blocked, riding: prompt.riding });
  } else propHud.showPrompt(null);
  $('minimap').setAttribute('viewBox', `${player.x - 42} ${-player.y - 25.2} 84 50.4`);
  $('map-player').setAttribute('cx', player.x); $('map-player').setAttribute('cy', -player.y);
  const percent = finished ? 100 : Math.min(99, Math.max(0, Math.floor(player.lapProgress / goalLapProgress * 100)));
  $('progress').innerHTML = `${String(percent).padStart(2, '0')}<span>%</span>`;
  $('progress-fill').style.width = `${percent}%`;
  if (debug) canvas.dataset.diagnostics = JSON.stringify({
    x: player.x, y: player.y, grounded: player.grounded, groundId: player.groundId, jumps: player.jumps, airJumpUsed: player.airJumpUsed,
    progress: player.progress, paused, finished, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    nx: player.nx, ny: player.ny, cameraAngle: framed.angle, cameraX: camera.position.x, cameraY: camera.position.y, viewHeight, viewWidth,
    elapsed: player.elapsed, vx: player.vx, vy: player.vy, frameDelta: delta,
    falling: player.falling, fallLocked: cameraPose.fallLocked, cameraLift: cameraPose.lift,
    respawns: player.respawnId, respawnScene: player.respawnScene + 1,
    fullscreen: Boolean(document.fullscreenElement),
    scene:sceneAt(routePosition)+1,sceneLength:SCENE_LENGTH,panels:PANELS.length,
    transition: Boolean(transitionAt(routePosition)), lapProgress: player.lapProgress, ringRadius: WORLD.ringRadius,
    character: character.state, glow: '#' + glowColor.getHexString(), feedback: feedback.diagnostics,
    activeProp: props.activeId, blockedProp: prompt?.blocked ?? false, riding: props.ridingId ?? null,
    animatingProp: props.animatingId, collectedProps: props.collectedIds, imagePopup: popup.active,
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
