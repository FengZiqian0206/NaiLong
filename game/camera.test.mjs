import assert from 'node:assert/strict';
import { createCameraPose, updateCameraPose, frameRouteEnds } from './camera.js';
import { PHYSICS } from './physics.js?v=20261127';
import { SPAWN, GOAL, PANELS } from './scenes.js?v=20261127';
import { WORLD, samplePath, nearestPath } from './world.js';

const radians = degrees => degrees * Math.PI / 180;
const playerAt = (angle, height = WORLD.radius) => ({
  x: -Math.sin(angle) * (WORLD.ringRadius + height), y: Math.cos(angle) * (WORLD.ringRadius + height),
  nx: -Math.sin(angle), ny: Math.cos(angle), falling: false, respawnId: 0,
});
function screenVector(pose, x, y) {
  return { x: x * Math.cos(pose.angle) + y * Math.sin(pose.angle),
    y: -x * Math.sin(pose.angle) + y * Math.cos(pose.angle) };
}
function checkFollow(pose, player, viewHeight = 28) {
  const ground = nearestPath(player.x, player.y);
  const screen = screenVector(pose, ground.x - pose.x, ground.y - pose.y);
  assert.ok(Math.abs(screen.x) < 1e-10, 'the local road stays horizontally centered');
  assert.ok(Math.abs(screen.y + 3.5 + .2 * viewHeight + WORLD.radius + pose.lift) < 1e-10,
    'road framing is independent of player altitude');
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

const endProgress = (PANELS.at(-1).start + PANELS.at(-1).length) / WORLD.totalLength;
for (const aspect of [390 / 844, 4 / 3, 16 / 9, 21 / 9]) {
  for (const [minHeight, minWidth] of [[28, 40], [56, 78]]) {
    const height = Math.max(minHeight, minWidth / aspect), width = height * aspect;
    for (const [point, side] of [[SPAWN, 1], [GOAL, -1]]) {
      const boundary = side > 0 ? 0 : endProgress;
      const axis = samplePath(boundary);
      const across = pose => pose.x * axis.tx + pose.y * axis.ty;
      const endpoint = frameRouteEnds(createCameraPose(point, height), width, height, endProgress);
      assert.ok(Math.abs(across(endpoint) * side - width / 2) < 1e-8, 'the endpoint meridian is flush with the edge');
      const hero = screenVector(endpoint, point.x - endpoint.x, point.y - endpoint.y);
      assert.ok(Math.abs(hero.x * side + width / 2 - .8) < .02, 'the character stays just inside the viewport');
      for (let distance = .01; distance < WORLD.totalLength / 8; distance += .25) {
        const ground = samplePath(boundary + side * distance / WORLD.totalLength);
        const framed = frameRouteEnds(createCameraPose(ground, height), width, height, endProgress);
        const tilt = framed.angle + 2 * Math.PI * boundary;
        const extent = Math.abs(Math.cos(tilt)) * width / 2 + Math.abs(Math.sin(tilt)) * height / 2;
        assert.ok(across(framed) * side >= extent - 1e-8, 'no rotated corner shows the area outside the playable route');
      }
    }
  }
}
for (const viewHeight of [28, 56, 86]) {
  const player = playerAt(0), pose = createCameraPose(player, viewHeight);
  checkFollow(pose, player, viewHeight);
  const roadY = screenVector(pose, 0 - pose.x, WORLD.ringRadius - pose.y).y;
  const screenFraction = .5 - roadY / viewHeight;
  const previousFraction = .5 + (3.5 + WORLD.radius) / viewHeight;
  assert.ok(Math.abs(screenFraction - previousFraction - .2) < 1e-10,
    'near, far and narrow framing lower the road by exactly 20% of viewport height');
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

  const grounded = playerAt(0), jumping = createCameraPose(grounded), originalY = jumping.y;
  Object.assign(grounded, playerAt(0, WORLD.radius + 25));
  for (let frame = 0; frame < fps * 2; frame++) {
    updateCameraPose(jumping, grounded, dt);
    assert.ok(jumping.y - originalY >= 0 && jumping.y - originalY <= .7 + 1e-10,
      'even a large jump gives the camera at most a tiny vertical offset');
  }
  const highestLift = jumping.lift;
  Object.assign(grounded, playerAt(0));
  for (let frame = 0; frame < fps * 2; frame++) updateCameraPose(jumping, grounded, dt);
  assert.ok(jumping.lift < .0001 && jumping.lift < highestLift, 'landing eases back to the same road framing');

  const falling = playerAt(0), fixed = createCameraPose(falling), beforeFall = { ...fixed };
  Object.assign(falling, playerAt(0, -1.5));
  updateCameraPose(fixed, falling, dt);
  assert.ok(Math.hypot(fixed.x - beforeFall.x, fixed.y - beforeFall.y) < 1e-10 && fixed.angle === beforeFall.angle,
    'an early fall never pulls the camera below its road baseline');
  Object.assign(falling, playerAt(.2, -3), { falling: true });
  updateCameraPose(fixed, falling, dt);
  assert.ok(fixed.fallLocked);
  const frozen = { ...fixed };
  Object.assign(falling, playerAt(.6, -20), { falling: true });
  for (let frame = 0; frame < fps; frame++) updateCameraPose(fixed, falling, dt, 56);
  assert.deepEqual(fixed, frozen, 'fall lock freezes position, rotation and zoom framing until respawn');
  Object.assign(falling, playerAt(.6));
  updateCameraPose(fixed, falling, dt);
  assert.ok(!fixed.fallLocked && fixed.recovering, 'an air jump can recover the view without triggering a respawn');
  assert.ok(Math.hypot(fixed.x-frozen.x,fixed.y-frozen.y)<WORLD.ringRadius*.6,
    'recovery eases to the player instead of teleporting');
  for (let frame = 0; frame < fps; frame++) updateCameraPose(fixed, falling, dt);
  assert.ok(!fixed.recovering, 'the camera resumes normal following after catching up');
  checkFollow(fixed, falling);
  falling.respawnId++;
  updateCameraPose(fixed, falling, dt, 56);
  assert.ok(!fixed.fallLocked && fixed.respawnId === falling.respawnId, 'respawn snaps and unlocks the camera');
  checkFollow(fixed, falling, 56);

  const radialFall = createCameraPose(playerAt(0));
  updateCameraPose(radialFall, playerAt(0, -3), dt);
  assert.ok(radialFall.fallLocked, 'radial depth also protects samples without a physics fall flag');
}
console.log(JSON.stringify({ ok: true, routes }, null, 2));
