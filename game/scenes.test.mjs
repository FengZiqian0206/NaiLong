import assert from 'node:assert/strict';
import LEVELS from './assets/levels.json' with { type: 'json' };
import { WORLD } from './world.js';
import { SCENE_COUNT, PANELS_PER_SCENE, SCENE_LENGTH, PANELS, COLLIDERS, worldAt } from './scenes.js';
import { nearestSurface } from './physics.js';

assert.equal(SCENE_COUNT, 6);
assert.equal(PANELS_PER_SCENE, 3);
assert.equal(PANELS.length, 18);
const groups = new Map();
for (const collider of COLLIDERS) {
  const key = `${collider.tileIndex}:${collider.platformIndex}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(collider);
}
for (const level of Object.values(LEVELS)) {
  assert.equal(level.width, 2172); assert.equal(level.height, 724);
  assert.equal(level.platforms.length, 12, 'all mask components are retained');
}
for (let scene = 0; scene < SCENE_COUNT; scene++) {
  const panels = PANELS.filter(panel => panel.sceneIndex === scene);
  assert.equal(panels.length, 3, 'each scene has exactly three artwork panels');
  assert.ok(Math.abs(panels[0].start - scene * SCENE_LENGTH) < 1e-8);
  assert.ok(Math.abs(panels.at(-1).start + panels.at(-1).length - (scene + 1) * SCENE_LENGTH) < 1e-8,
    'six scenes cover equal, contiguous route lengths');
  for (const panel of panels) {
    const theme = scene % 2 ? 'level2' : 'level1';
    assert.equal(panel.image, `${theme}.png`, 'themes alternate across all six scenes');
    assert.deepEqual(panel.source, LEVELS[theme]);
    assert.ok(Math.abs(panel.length - SCENE_LENGTH / 3) < 1e-8);
    for (const [index, line] of panel.source.platforms.entries()) {
      const parts = groups.get(`${panel.index}:${index}`);
      assert.ok(parts?.length, 'every mask component has real collision geometry in every panel');
      assert.ok(Math.abs(parts[0].s0 - panel.start - line.x1 * panel.pixelScale) < 1e-8);
      assert.ok(Math.abs(parts.at(-1).s1 - panel.start - line.x2 * panel.pixelScale) < 1e-8,
        'collision geometry covers the entire mask interval');
      let previousEnd = parts[0].s0;
      for (const part of parts) {
        assert.ok(Math.abs(part.s0 - previousEnd) < 1e-8, 'component subdivision leaves no internal gaps');
        assert.ok(Math.abs(part.radius - line.halfThickness * panel.pixelScale) < 1e-12,
          'collider thickness matches the mask stroke');
        assert.equal(part.sceneIndex, scene);
        previousEnd = part.s1;
      }
    }
  }
}
assert.equal(groups.size, 18 * 12, 'there are no extra invisible platform components');
assert.ok(Math.abs(PANELS.at(-1).start + PANELS.at(-1).length - WORLD.totalLength) < 1e-8);

let minimumHoleClearance = Infinity;
for (const panel of PANELS.filter(panel => panel.image === 'level1.png')) {
  // These two floor gaps are explicit in the original mask; lower stepping
  // stones must remain separate from a continuous floor at route height zero.
  for (const pixelX of [750, 1458]) {
    const point = worldAt(panel.start + pixelX * panel.pixelScale);
    const clearance = nearestSurface(point.x, point.y).surfaceDistance;
    assert.ok(clearance > .4, 'no hidden ribbon fills a level1 floor gap');
    minimumHoleClearance = Math.min(minimumHoleClearance, clearance);
  }
}
for (let index = 1; index < PANELS.length; index++) {
  const before = PANELS[index - 1], after = PANELS[index];
  assert.ok(Math.abs(before.start + before.length - after.start) < 1e-8);
  const left = worldAt(before.start + before.length), right = worldAt(after.start);
  assert.ok(Math.hypot(left.x - right.x, left.y - right.y) < 1e-8, 'artwork baselines meet at the same spiral point');
  const exitIndex = before.source.platforms.findIndex(line => line.x2 === before.source.width - 1);
  const entryIndex = after.source.platforms.findIndex(line => line.x1 === 0);
  const exit = groups.get(`${before.index}:${exitIndex}`).at(-1);
  const entry = groups.get(`${after.index}:${entryIndex}`)[0];
  assert.ok(Math.hypot(exit.bx - entry.ax, exit.by - entry.ay) <= exit.radius + entry.radius,
    'actual mask floor capsules overlap across artwork and scene seams');
}
console.log(JSON.stringify({ ok: true, scenes: SCENE_COUNT, panels: PANELS.length,
  maskComponents: groups.size, minimumHoleClearance }, null, 2));
