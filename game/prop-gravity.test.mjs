import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFallingProp, stepFallingProp } from './prop-gravity.js?v=20261127e';
import { PANELS, floorPoint, setCustomColliders, worldAt } from './scenes.js?v=20261127e';
import { WORLD } from './world.js?v=20261123b';

const tick = 1 / 120;

test('a swept trigger starts a fall, with one player hit and a damped landing', () => {
  const s = PANELS[2].start + 30;
  const ground = floorPoint(s).h - WORLD.radius;
  const body = createFallingProp({ s, h: 12, width: 1.6, height: 2,
    fallZone: { s: s - 4, h: 1, width: 1, height: 1 } });
  const above = worldAt(s - 4, 4);
  assert.equal(stepFallingProp(body, above, above, tick), false);
  assert.equal(body.dropped, false);

  stepFallingProp(body, worldAt(s - 6, 1), worldAt(s - 2, 1), tick);
  assert.equal(body.dropped, true, 'walking through a zone between samples still triggers it');
  assert.ok(body.height < 12 && body.speed < 0);

  const under = worldAt(s, ground + WORLD.radius);
  let hits = 0, rebounded = false;
  for (let frame = 0; frame < 400; frame++) {
    hits += Number(stepFallingProp(body, under, under, tick));
    assert.ok(body.height >= ground + 1 - 1e-6, 'the body does not tunnel below the floor');
    rebounded ||= body.speed > 0;
  }
  assert.equal(hits, 1, 'one drop reports at most one hit');
  assert.ok(rebounded && body.settled);
  assert.ok(Math.abs(body.height - ground - 1) < 1e-6);
});

test('an added collision block catches objects and an empty gap does not', () => {
  const home = PANELS[0];
  const s = 17;
  setCustomColliders([{ id: 'ledge', s, h: 3, width: 2, height: 1 }]);
  const body = createFallingProp({ s, h: 8, width: 1, height: 1,
    fallZone: { s: 12, h: 1, width: 2, height: 2 } });
  const trigger = worldAt(12, 1);
  for (let frame = 0; frame < 400; frame++) stepFallingProp(body, trigger, trigger, tick);
  const top = 3.5;
  assert.ok(body.settled);
  assert.ok(Math.abs(body.height - top - .5) < 1e-6);
  setCustomColliders([]);

  const inGap = createFallingProp({ s: 706 * home.pixelScale, h: 2, width: .6, height: 1,
    fallZone: { s: 12, h: 1, width: 2, height: 2 } });
  for (let frame = 0; frame < 400; frame++) stepFallingProp(inGap, trigger, trigger, tick);
  assert.equal(inGap.gone, true);
  assert.equal(inGap.settled, false);
});

test('a wrapped trigger and a moving player are swept in ring coordinates', () => {
  const acrossSeam = createFallingProp({ s: 12, h: 9, width: 1, height: 1,
    fallZone: { s: 0, h: 2, width: .7, height: 1 } });
  stepFallingProp(acrossSeam, worldAt(WORLD.totalLength - 1, 2), worldAt(1, 2), tick);
  assert.equal(acrossSeam.dropped, true);

  const body = createFallingProp({ s: 50, h: 7, width: 1, height: 1,
    fallZone: { s: 50, h: 7, width: 2, height: 2 } });
  assert.equal(stepFallingProp(body, worldAt(47, 7), worldAt(53, 7), tick), true,
    'the moving player can hit the body even if both end poses are outside it');
});

test('a hazard resets inside its wrapped trigger and rearms only after an exit', () => {
  const definition = { s: 12, h: 9, width: 1, height: 1, fallZone: { s: 0, h: 2, width: 2, height: 1 } };
  const spawn = worldAt(WORLD.totalLength - .4, 2), inside = worldAt(.4, 2);
  const outside = worldAt(2, 2);
  const body = createFallingProp(definition, spawn);

  stepFallingProp(body, spawn, inside, tick);
  assert.equal(body.dropped, false);
  stepFallingProp(body, inside, outside, tick);
  assert.equal(body.dropped, false, 'leaving the spawn trigger does not start the drop');
  stepFallingProp(body, outside, outside, tick);
  assert.equal(body.height, 9);
  stepFallingProp(body, outside, inside, tick);
  assert.equal(body.dropped, true, 'a genuine re-entry starts a fresh drop');
});
