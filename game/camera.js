// Camera local +Y follows the surface normal; local -Y points into the ground.
// Only rotation eases; the lower framing leaves more sky above the player.
const upOffset = 3.5;
export function createCameraPose(player) {
  const pose = { x: 0, y: 0, angle: Math.atan2(player.ny, player.nx) - Math.PI / 2 };
  return updateCameraPose(pose, player, 0);
}

export function updateCameraPose(pose, player, dt) {
  const target = Math.atan2(player.ny, player.nx) - Math.PI / 2;
  const turn = Math.atan2(Math.sin(target - pose.angle), Math.cos(target - pose.angle));
  pose.angle += turn * (1 - Math.exp(-10 * dt));
  pose.x = player.x - Math.sin(pose.angle) * upOffset;
  pose.y = player.y + Math.cos(pose.angle) * upOffset;
  return pose;
}
