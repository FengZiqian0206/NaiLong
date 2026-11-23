import { WORLD, nearestPath, samplePath } from './world.js?v=20261123b';

// Anchor the view to the road, leaving jumping and falling motion to the player.
function placeCamera(pose, ground, viewHeight) {
  const offset = 3.5 + .2 * viewHeight + WORLD.radius + pose.lift;
  pose.x = ground.x - Math.sin(pose.angle) * offset;
  pose.y = ground.y + Math.cos(pose.angle) * offset;
  return pose;
}
export function createCameraPose(player, viewHeight = 28) {
  const ground = nearestPath(player.x, player.y);
  const height = Math.hypot(player.x, player.y) - WORLD.ringRadius;
  const pose = { x: 0, y: 0, angle: Math.atan2(ground.ny, ground.nx) - Math.PI / 2,
    lift: Math.min(.7, Math.max(0, height - WORLD.radius) * .08),
    fallLocked: Boolean(player.falling) || height < -2.6, recovering: false,
    progress: ground.progress, respawnId: player.respawnId ?? 0 };
  return placeCamera(pose, ground, viewHeight);
}
export function updateCameraPose(pose, player, dt, viewHeight = 28) {
  if ((player.respawnId ?? 0) !== pose.respawnId) {
    return Object.assign(pose, createCameraPose(player, viewHeight));
  }
  const height = Math.hypot(player.x, player.y) - WORLD.ringRadius;
  if (player.falling || height < -2.6) { pose.fallLocked = true; return pose; }
  const playerGround = nearestPath(player.x, player.y);
  if (pose.fallLocked) {
    pose.fallLocked = false;
    pose.recovering = true;
  }
  let ground = playerGround;
  if (pose.recovering) {
    let travel = playerGround.progress - pose.progress;
    travel -= Math.round(travel);
    if (Math.abs(travel) * WORLD.totalLength < .12) pose.recovering = false;
    else ground = samplePath(pose.progress + travel * (1 - Math.exp(-16 * dt)));
  }
  pose.progress = ground.progress;
  const target = Math.atan2(ground.ny, ground.nx) - Math.PI / 2;
  const turn = Math.atan2(Math.sin(target - pose.angle), Math.cos(target - pose.angle));
  pose.angle += turn * (1 - Math.exp(-10 * dt));
  const lift = Math.min(.7, Math.max(0, height - WORLD.radius) * .08);
  pose.lift += (lift - pose.lift) * (1 - Math.exp(-5 * dt));
  return placeCamera(pose, ground, viewHeight);
}
