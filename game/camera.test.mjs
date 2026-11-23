import assert from 'node:assert/strict';
import { createCameraPose, updateCameraPose } from './camera.js';
import { PHYSICS } from './physics.js';
import { WORLD, samplePath, nearestPath } from './world.js';

const radians = degrees => degrees * Math.PI / 180;
const playerAt = angle => ({ x: 13, y: -7, nx: -Math.sin(angle), ny: Math.cos(angle) });
function screenVector(pose, x, y) {
  return { x: x * Math.cos(pose.angle) + y * Math.sin(pose.angle),
    y: -x * Math.sin(pose.angle) + y * Math.cos(pose.angle) };
}
function checkFollow(pose, player) {
  const screen = screenVector(pose, player.x - pose.x, player.y - pose.y);
  assert.ok(Math.abs(screen.x) < 1e-10, 'player stays horizontally centered');
  assert.ok(Math.abs(screen.y + 3.5) < 1e-10, 'player and horizon stay lower in the frame');
}
const start = samplePath(0);
assert.ok(Math.abs(WORLD.ringRadius * Math.PI * 2 - WORLD.totalLength) < 1e-10);
assert.ok(start.x === 0 && start.y === WORLD.ringRadius && start.tx === 1 && start.ny === 1,
  'the clockwise ring starts at its top, with D pointing right');
assert.deepEqual(samplePath(1), start, 'one complete circuit returns to the exact start pose');
assert.deepEqual(WORLD.points[0], WORLD.points.at(-1), 'the minimap ring closes without a gap');
for (const fraction of [-1, -.2, 0, .25, .5, .75, .999, 1, 1.2, 2.3]) {
  const point = samplePath(fraction), again = samplePath(fraction + 1);
  assert.ok(point.progress >= 0 && point.progress < 1, 'negative and repeated route fractions wrap');
  assert.ok(Math.hypot(point.x - again.x, point.y - again.y) < 1e-10);
  assert.ok(Math.abs(Math.hypot(point.x, point.y) - WORLD.ringRadius) < 1e-10);
  assert.ok(Math.abs(point.tx * point.nx + point.ty * point.ny) < 1e-12, 'tangent and outward normal remain perpendicular');
  const nearest = nearestPath(point.x + point.nx * 3, point.y + point.ny * 3);
  assert.ok(Math.hypot(nearest.x - point.x, nearest.y - point.y) < 1e-10, 'radial nearest-point projection matches the ring');
  assert.ok(Math.abs(nearest.distance - 3) < 1e-10);
  assert.ok(nearest.progress >= 0 && nearest.progress < 1);
}
assert.ok(Number.isFinite(nearestPath(0, 0).x + nearestPath(0, 0).y), 'the center has a deterministic finite nearest point');
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

const routes = [];
// Sample two clockwise laps, including the closing seam. Mask holes require
// jumping, so a ground-only bot is not an appropriate camera traversal test.
for (const fps of [30, 60]) {
  const player = samplePath(0), pose = createCameraPose(player), dt = 1 / fps;
  const initialAngle = pose.angle;
  const laps = 2, frames = Math.ceil(laps * WORLD.totalLength / PHYSICS.speed * fps);
  let maxStep = 0, maxLag = 0;
  for (let frame = 1; frame <= frames; frame++) {
    Object.assign(player, samplePath(Math.min(laps, frame * dt * PHYSICS.speed / WORLD.totalLength)));
    player.x += player.nx * WORLD.radius; player.y += player.ny * WORLD.radius;
    const previous = pose.angle;
    updateCameraPose(pose, player, dt);
    checkFollow(pose, player);
    assert.ok(Number.isFinite(pose.x + pose.y + pose.angle), 'camera pose remains finite');
    assert.ok(screenVector(pose, player.tx, player.ty).x > 0, 'D progresses toward screen-right around the ring');
    const targetAngle = Math.atan2(player.ny, player.nx) - Math.PI / 2;
    const lag = Math.abs(Math.atan2(Math.sin(targetAngle - pose.angle), Math.cos(targetAngle - pose.angle)));
    maxStep = Math.max(maxStep, Math.abs(pose.angle - previous));
    maxLag = Math.max(maxLag, lag);
  }
  assert.equal(player.progress, 0, 'two laps close at the start without clamping the route endpoint');
  assert.ok(maxStep < .2, 'turns stay smooth without angle-wrap spins');
  assert.ok(maxLag < Math.PI / 2, 'ground remains in the lower half of the view');
  for (let frame = 0; frame < fps * 2; frame++) updateCameraPose(pose, player, dt);
  assert.ok(Math.abs(pose.angle - initialAngle + laps * Math.PI * 2) < 1e-8,
    'continuous camera rotation completes two clockwise laps without seam resets');
  const turns = Math.abs(pose.angle - initialAngle) / (2 * Math.PI);
  routes.push({ fps, seconds: frames * dt, turns, maximumTurnDegreesPerFrame: maxStep * 180 / Math.PI,
    maximumLagDegrees: maxLag * 180 / Math.PI });
}
console.log(JSON.stringify({ ok: true, routes }, null, 2));
