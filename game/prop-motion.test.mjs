import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOTION_POINT_LIMIT, createPropMotion, normalizeMotion, sampleMotionPath } from './prop-motion.js?v=20261127b';
import { worldAt } from './scenes.js?v=20261127';
import { WORLD } from './world.js?v=20261123b';

test('authored motion normalizes safely and smooth previews follow the short direction around the ring', () => {
  const point = { s: 12.1123456789, h: 8.123456789 };
  assert.deepEqual(normalizeMotion({ pivot: point, path: [point] }), { pivot: point, path: [point] });
  assert.equal(normalizeMotion(null), undefined);
  assert.deepEqual(normalizeMotion({ pivot: { s: Infinity, h: 10 }, path: [{ s: '4', h: 8 }] }), {});
  assert.equal(normalizeMotion({ path: Array(100).fill(point) }).path.length, MOTION_POINT_LIMIT);
  assert.deepEqual(normalizeMotion({ pivot: { s: -1, h: 800 } }).pivot, { s: WORLD.totalLength - 1, h: 128 });

  const nodes = [{ s: 988, h: 1 }, { s: 2, h: 8 }, { s: 13, h: 11 }];
  const samples = sampleMotionPath(nodes);
  const middle = samples.findIndex(point => point.s === 2 && point.h === 8);
  assert.ok(middle > 0 && middle < samples.length - 1, 'the spline passes through the exact authored midpoint');
  assert.ok(samples.every(({ s }) => s >= 988 || s <= 13), 'the path uses the short arc across zero');
  assert.ok(samples.slice(1, middle).some(({ s, h }) => {
    const ds = s < 988 ? s + WORLD.totalLength - 988 : s - 988;
    return Math.abs(h - 1 - 7 * ds / (WORLD.totalLength + 2 - 988)) > .03;
  }), 'a curved path deviates from straight interpolation');
  const final = samples.at(-1);
  assert.deepEqual([final.s, final.h], [13, 11]);
  assert.ok(samples.every(({ h }) => h >= 1 && h <= 11), 'limited slopes do not overshoot the authored height');
  assert.deepEqual(sampleMotionPath([point, point, point]).map(({ s, h }) => ({ s, h })), [point]);
});

test('an orbit rotates the prop body as it moves and holds a constant Cartesian pivot distance', () => {
  const origin = { s: 21, h: 3 }, pivot = { s: 30, h: 6 };
  const controls = createPropMotion({ ...origin, interactive: true, motion: { pivot } });
  const start = controls.pose, center = worldAt(pivot.s, pivot.h);
  const distance = ({ x, y }) => Math.hypot(x - center.x, y - center.y);
  assert.equal(controls.advance(1, .75), false, 'an orbit never automatically ends');
  assert.ok(controls.pose.turn > 0);
  assert.ok(Math.abs(distance(controls.pose) - distance(start)) < 1e-10);
  controls.advance(-1, .75);
  assert.ok(Math.hypot(controls.pose.x - start.x, controls.pose.y - start.y) < 1e-10);
  assert.ok(Math.abs(controls.pose.turn) < 1e-10, 'reverse restores position and body orientation');
});
