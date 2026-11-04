import assert from 'node:assert/strict';
import { createCameraPose, updateCameraPose } from './camera.js';
import { PHYSICS, createPlayer, stepPlayer } from './physics.js';

const radians = degrees => degrees * Math.PI / 180;
const playerAt = angle => ({ x: 13, y: -7, nx: -Math.sin(angle), ny: Math.cos(angle) });
function screenVector(pose, x, y) {
  return { x: x * Math.cos(pose.angle) + y * Math.sin(pose.angle),
    y: -x * Math.sin(pose.angle) + y * Math.cos(pose.angle) };
}
function checkFollow(pose, player) {
  const screen = screenVector(pose, player.x - pose.x, player.y - pose.y);
  assert.ok(Math.abs(screen.x) < 1e-10, 'player stays horizontally centered');
  assert.ok(Math.abs(screen.y + 2) < 1e-10, 'player stays two units below screen center');
}
for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, radians(179)]) {
  const player = playerAt(angle), pose = createCameraPose(player);
  const gravity = screenVector(pose, -player.nx, -player.ny);
  assert.ok(Math.abs(gravity.x) < 1e-10 && Math.abs(gravity.y + 1) < 1e-10,
    'initial camera makes local gravity point straight down');
  checkFollow(pose, player);
}

const seamPlayer = playerAt(radians(179)), seamPose = createCameraPose(seamPlayer);
const initial = seamPose.angle;
Object.assign(seamPlayer, playerAt(radians(-179)));
updateCameraPose(seamPose, seamPlayer, 1 / 60);
assert.ok(seamPose.angle > initial && seamPose.angle - initial < radians(2),
  'crossing the angle seam takes the short two-degree turn');
for (let i = 0; i < 120; i++) updateCameraPose(seamPose, seamPlayer, 1 / 60);
assert.ok(Math.abs(seamPose.angle - initial - radians(2)) < 1e-8, 'stationary angle converges');

const target = playerAt(.7), whole = createCameraPose(playerAt(0)), split = { ...whole };
updateCameraPose(whole, target, 1 / 30);
updateCameraPose(split, target, 1 / 60);
updateCameraPose(split, target, 1 / 60);
assert.ok(Math.abs(whole.angle - split.angle) < 1e-12, 'smoothing is independent of frame splitting');

const player = createPlayer(), pose = createCameraPose(player), dt = PHYSICS.fixedDt;
let frames = 0, maxStep = 0, maxLag = 0;
for (; frames < 18000 && !player.won; frames++) {
  stepPlayer(player, { move: -1, jump: false }, dt);
  const previous = pose.angle;
  updateCameraPose(pose, player, dt);
  checkFollow(pose, player);
  assert.ok(Number.isFinite(pose.x + pose.y + pose.angle), 'camera pose remains finite');
  const targetAngle = Math.atan2(player.ny, player.nx) - Math.PI / 2;
  const lag = Math.abs(Math.atan2(Math.sin(targetAngle - pose.angle), Math.cos(targetAngle - pose.angle)));
  maxStep = Math.max(maxStep, Math.abs(pose.angle - previous));
  maxLag = Math.max(maxLag, lag);
}
assert.ok(player.won, 'camera follows the complete spiral');
assert.ok(maxStep < .2, 'turns stay smooth without angle-wrap spins');
assert.ok(maxLag < Math.PI / 2, 'ground remains in the lower half of the view throughout walking');
console.log(JSON.stringify({ ok: true, walkSeconds: frames * dt,
  maximumTurnDegreesPerStep: maxStep * 180 / Math.PI, maximumLagDegrees: maxLag * 180 / Math.PI }, null, 2));
