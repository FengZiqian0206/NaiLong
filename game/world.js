// One clockwise circuit: D travels right from the top, with outward-facing up.
export const SCENE_COUNT = 6;
export const SCENE_LENGTH = 101.00626436394589;
// Keep the scenes at the previous scale and give a 1380-pixel-wide portion
// of each transition the same world units per pixel as the 2172-pixel art.
export const TRANSITION_LENGTH = SCENE_LENGTH * 1380 / 2172;
const totalLength = SCENE_COUNT * (SCENE_LENGTH + TRANSITION_LENGTH);
const ringRadius = totalLength / (Math.PI * 2);
export function samplePath(fraction) {
  const progress = fraction - Math.floor(fraction), angle = progress * Math.PI * 2;
  const nx = Math.sin(angle), ny = Math.cos(angle);
  return { x: nx * ringRadius, y: ny * ringRadius, tx: ny, ty: -nx, nx, ny, progress };
}
const pointCount = Math.ceil(totalLength / .2);
const points = Array.from({ length: pointCount + 1 }, (_, index) => {
  const { x, y } = samplePath(index / pointCount);
  return { x, y };
});
export const WORLD = { points, scale: 3, radius: .62, ringRadius, totalLength };
export function nearestPath(x, y) {
  return { ...samplePath(Math.atan2(x, y) / (Math.PI * 2)),
    distance: Math.abs(Math.hypot(x, y) - ringRadius) };
}
