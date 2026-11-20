import assert from 'node:assert/strict';
import LEVELS from './assets/levels.json' with { type: 'json' };
import { WORLD, samplePath } from './world.js';
import { SCENE_COUNT, PANELS_PER_SCENE, SCENE_LENGTH, TRANSITION, PANELS, COLLIDERS,
  panelAt, sceneAt, worldAt, floorPoint } from './scenes.js';
import { nearestSurface } from './physics.js';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message);
assert.equal(SCENE_COUNT, 6);
assert.equal(PANELS_PER_SCENE, 1);
assert.equal(PANELS.length, 6, 'there are exactly six scenes, with no repeated content panels');
close(SCENE_LENGTH * 6.2, WORLD.totalLength, 'six equal content lengths plus the transition fill the route');
close(TRANSITION.start, SCENE_LENGTH);
close(TRANSITION.end, SCENE_LENGTH * 1.2);
close(TRANSITION.length, SCENE_LENGTH * .2);
close(TRANSITION.end - TRANSITION.start, TRANSITION.length);
assert.deepEqual(PANELS.filter(panel => panel.image).map(panel => panel.image), ['level1.png', 'level2.png'],
  'each supplied artwork appears once, in scenes one and two only');

const groups = new Map();
const bridge = COLLIDERS.filter(part => part.platformId === 'transition');
for (const part of COLLIDERS.filter(part => part.tileIndex >= 0)) {
  const key = `${part.tileIndex}:${part.platformIndex}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(part);
}
for (const level of Object.values(LEVELS)) {
  assert.equal(level.width, 2172); assert.equal(level.height, 724);
  assert.equal(level.platforms.length, 12, 'all original mask components are retained');
}
for (const [scene, panel] of PANELS.entries()) {
  assert.equal(panel.index, scene); assert.equal(panel.sceneIndex, scene);
  close(panel.start, SCENE_LENGTH * [0, 1.2, 2.2, 3.2, 4.2, 5.2][scene]);
  close(panel.length, SCENE_LENGTH, 'all six content scenes have equal lengths');
  assert.equal(panelAt(panel.start + panel.length / 2), panel);
  assert.equal(sceneAt(panel.start + panel.length / 2), scene);
  if (scene < 2) {
    assert.equal(panel.image, `level${scene + 1}.png`);
    assert.equal(panel.isPlaceholder, false);
    assert.deepEqual(panel.source, LEVELS[`level${scene + 1}`], 'artwork uses its own unaltered mask geometry');
  } else {
    assert.equal(panel.image, null, 'unprovided scenes never reuse supplied artwork');
    assert.equal(panel.isPlaceholder, true);
    assert.equal(panel.source.platforms.length, 1, 'neutral placeholders contain one simple floor');
  }
  for (const [index, line] of panel.source.platforms.entries()) {
    const parts = groups.get(`${panel.index}:${index}`);
    assert.ok(parts?.length, 'every source platform has real collision geometry');
    close(parts[0].s0, panel.start + line.x1 * panel.pixelScale);
    close(parts.at(-1).s1, panel.start + line.x2 * panel.pixelScale,
      'collision geometry covers the entire source interval');
    let previousEnd = parts[0].s0;
    for (const part of parts) {
      close(part.s0, previousEnd, 'platform subdivision leaves no internal gaps');
      close(part.radius, line.halfThickness * panel.pixelScale, 'collision thickness matches the source');
      assert.equal(part.sceneIndex, scene);
      previousEnd = part.s1;
    }
  }
}
assert.equal(groups.size, 12 + 12 + 4, 'only the original masks and four placeholder floors are present');
close(PANELS[0].start + PANELS[0].length, TRANSITION.start);
close(PANELS[1].start, TRANSITION.end);
for (let index = 2; index < PANELS.length; index++) {
  close(PANELS[index - 1].start + PANELS[index - 1].length, PANELS[index].start);
}
close(PANELS.at(-1).start + PANELS.at(-1).length, WORLD.totalLength);
assert.equal(panelAt((TRANSITION.start + TRANSITION.end) / 2), null, 'transition is not a seventh content scene');
assert.equal(sceneAt((TRANSITION.start + TRANSITION.end) / 2), 0);
assert.equal(sceneAt(WORLD.totalLength), 5);

let minimumHoleClearance = Infinity;
for (const pixelX of [750, 1458]) {
  const point = worldAt(PANELS[0].start + pixelX * PANELS[0].pixelScale);
  const clearance = nearestSurface(point.x, point.y).surfaceDistance;
  assert.ok(clearance > .4, 'the two original level1 floor holes are not filled by an invisible ribbon');
  minimumHoleClearance = Math.min(minimumHoleClearance, clearance);
}
assert.ok(bridge.length, 'the transition has actual walkable ground');
close(bridge[0].s0, TRANSITION.start);
close(bridge.at(-1).s1, TRANSITION.end);
let previous = bridge[0].s0;
for (const part of bridge) {
  assert.equal(part.tileIndex, -1); assert.equal(part.sceneIndex, 0);
  assert.ok(part.radius > 0);
  close(part.s0, previous, 'transition collider subdivisions remain continuous');
  previous = part.s1;
}
for (let index = 0; index <= 40; index++) {
  const s = TRANSITION.start + TRANSITION.length * index / 40;
  const point = floorPoint(s), surface = nearestSurface(point.x, point.y), up = samplePath(s / WORLD.totalLength);
  assert.ok(Math.abs(surface.surfaceDistance - WORLD.radius) < .02,
    'the entire transition supports a player standing on its actual floor');
  assert.ok(surface.nx * up.nx + surface.ny * up.ny > .95, 'transition ground faces the local up direction');
  if (index > 1 && index < 39) assert.equal(surface.platformId, 'transition');
}
const floorParts = (panel, atEnd) => {
  const index = panel.source.platforms.findIndex(line => atEnd ? line.x2 >= panel.source.width - 1 : line.x1 === 0);
  return groups.get(`${panel.index}:${index}`);
};
const joins = [[floorParts(PANELS[0], true).at(-1), bridge[0]],
  [bridge.at(-1), floorParts(PANELS[1], false)[0]]];
for (let index = 2; index < PANELS.length; index++) {
  joins.push([floorParts(PANELS[index - 1], true).at(-1), floorParts(PANELS[index], false)[0]]);
}
for (const [exit, entry] of joins) {
  assert.ok(Math.hypot(exit.bx - entry.ax, exit.by - entry.ay) <= exit.radius + entry.radius,
    'real floor capsules meet across scene and transition handoffs');
}
console.log(JSON.stringify({ ok: true, scenes: SCENE_COUNT, artworkPanels: 2, placeholderPanels: 4,
  contentLength: SCENE_LENGTH, transitionLength: TRANSITION.length,
  sourceComponents: groups.size, minimumHoleClearance }, null, 2));
