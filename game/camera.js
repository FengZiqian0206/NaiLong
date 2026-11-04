// Camera local +Y follows the surface normal; local -Y points into the ground.
// Only rotation eases, so the player stays at screen (0, -2) during every turn.
export function createCameraPose(player) {
  const pose = { x: 0, y: 0, angle: Math.atan2(player.ny, player.nx) - Math.PI / 2 };
  return updateCameraPose(pose, player, 0);
}

export function updateCameraPose(pose, player, dt) {
  const target = Math.atan2(player.ny, player.nx) - Math.PI / 2;
  const turn = Math.atan2(Math.sin(target - pose.angle), Math.cos(target - pose.angle));
  pose.angle += turn * (1 - Math.exp(-10 * dt));
  pose.x = player.x - Math.sin(pose.angle) * 2;
  pose.y = player.y + Math.cos(pose.angle) * 2;
  return pose;
}
