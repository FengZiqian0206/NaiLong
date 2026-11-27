import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three.module.min.js';
import { createProps } from './props.js?v=20261127e';
import { WORLD, samplePath } from './world.js';

test('scene props support disappearing, picture reveals and legacy bounce', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [] }));
  const previousImageBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  globalThis.createImageBitmap = async () => ({ width: 4, height: 4, close() {} });
  globalThis.document = { createElement: () => ({ getContext: () => ({
    drawImage() {}, getImageData: () => ({ data: new Uint8Array(64).fill(255) }),
  }) }) };
  t.after(() => {
    globalThis.createImageBitmap = previousImageBitmap;
    globalThis.document = previousDocument;
  });

  const header = new Uint8Array(24);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(header.buffer).setUint32(16, 4);
  new DataView(header.buffer).setUint32(20, 4);
  const blob = new Blob([header], { type: 'image/png' });
  const scene = new THREE.Scene();
  const props = await createProps(scene);
  const add = (id, s, options) => props.add({ id, s, h: 1, width: 2, blob, ...options });
  await add('pickup', 4, { behavior: 'disappear' });
  await add('picture', 14, { behavior: 'image', popupImage: blob, popupName: 'Keepsake.png', requires: ['pickup', 'other-pickup'] });
  await add('legacy', 24);
  await add('other-pickup', 34, { behavior: 'disappear' });
  const view = (s, editing = false) => {
    const path = samplePath(s / WORLD.totalLength);
    const player = { x: path.x + path.nx, y: path.y + path.ny };
    props.update(.3, player, path.progress, 50, 28, editing);
    return player;
  };

  const pickupPlayer = view(4);
  assert.equal(props.activeId, 'pickup');
  assert.deepEqual(props.interact(pickupPlayer), { type: 'pickup', id: 'pickup', name: undefined, blob, url: undefined });
  view(4);
  assert.deepEqual(props.collectedIds, ['pickup']);
  assert.equal(props.activeId, null);
  assert.equal(scene.children[0].visible, false);
  view(4, true);
  assert.equal(scene.children[0].visible, true, 'editing reveals a collected prop without resetting it');
  view(4);
  assert.equal(scene.children[0].visible, false);
  props.reset();
  view(4);
  assert.equal(props.activeId, 'pickup', 'a new run restores pickups');
  props.interact(pickupPlayer);

  const picturePlayer = view(14);
  assert.equal(props.activeId, 'picture');
  assert.equal(props.prompt.blocked, true);
  assert.deepEqual(props.interact(picturePlayer), { type: 'blocked' }, 'one of two dependencies cannot open the image');
  props.interact(view(34));
  view(14);
  assert.equal(props.prompt.blocked, false);
  assert.deepEqual(props.interact(picturePlayer), { type: 'image', image: blob });
  assert.equal(props.pick({ s: 14, h: 1 }).popupName, 'Keepsake.png');
  props.edit('picture', { interactive: false });
  view(14);
  assert.equal(props.interact(picturePlayer), null, 'a decorative prop cannot open a popup');
  const legacyPlayer = view(24);
  assert.equal(props.activeId, 'legacy');
  props.interact(legacyPlayer);
  assert.equal(props.animatingId, 'legacy');

  await add('ride-key', 90, { behavior: 'disappear' });
  const path = [{ s: 44, h: 1 }, { s: 52, h: 4 }, { s: 65, h: 2 }];
  await add('ride-path', 44, { behavior: 'disappear', requires: ['ride-key'], motion: { path, pivot: { s: 42, h: 3 } },
    fallZone: { s: 44, h: 1, width: 10, height: 10 } });
  const entry = view(44);
  assert.deepEqual(props.interact(entry), { type: 'blocked' }, 'dependencies block entry to a moving prop');
  props.interact(view(90));
  assert.equal(props.interact(entry).type, 'ride');
  assert.equal(props.ridingId, 'ride-path');
  assert.equal(props.stepHazards(entry, entry, 1), false, 'configured movement takes priority over falling');
  assert.equal(props.prompt.riding, true);
  assert.equal(props.prompt.rideMode, 'path');
  assert.equal(props.stepRide(-1, 1).s, 44, 'the path does not wrap backwards at its first endpoint');
  const midway = props.stepRide(1, .6);
  assert.ok(midway.s > 44 && midway.s < 52, 'the path wins over the pivot');
  assert.ok(midway.h > 1, 'the rider moves vertically on the path');
  assert.equal(props.prompt.s, midway.s);
  assert.equal(props.stepRide(0, 2).s, midway.s, 'the stopped rider holds position');
  const exit = props.exitRide();
  assert.equal(exit.s, midway.s);
  assert.equal(props.ridingId, null);
  assert.equal(props.interact(exit).type, 'ride', 'the object can be boarded again at its last pose');
  const finish = props.stepRide(1, 10);
  assert.equal(finish.finished, true);
  assert.equal(finish.s, 65);
  assert.equal(finish.h, 2);
  assert.equal(props.ridingId, null);
  assert.ok(!props.collectedIds.includes('ride-path'), 'travelling never picks up the moving prop');
  assert.equal(props.interact(finish).type, 'ride');
  assert.equal(props.stepRide(1, 2).finished, false, 'parked endpoint allows boarding and reverse travel');
  assert.ok(props.stepRide(-1, .65).s < finish.s);
  props.exitRide();

  assert.deepEqual(props.edit('ride-path', { s: 45, h: 3 }).motion,
    { path: [{ s: 45, h: 3 }, { s: 53, h: 6 }, { s: 66, h: 4 }], pivot: { s: 43, h: 5 } },
    'moving the authored placement keeps its pivot and path aligned');
  assert.equal(props.edit('ride-path', { motion: null }).motion, undefined);
  assert.equal(props.interact(view(45)).type, 'pickup', 'clearing motion restores the prior pickup action');

  await add('empty-motion', 115, { motion: {}, behavior: 'image', popupImage: blob });
  assert.equal(props.interact(view(115)), null, 'an unfinished motion can still give simple elastic feedback');
  assert.equal(props.animatingId, 'empty-motion');

  const tick = .01;
  const firstZone = { s: 129, h: 1, width: 2, height: 2 };
  const secondZone = { s: 136, h: 1, width: 2, height: 2 };
  await add('first-trap', 129, { h: 8, height: 1, fallZone: firstZone });
  const firstTrap = scene.children.at(-1);
  await add('second-trap', 145, { h: 12, height: 1, fallZone: secondZone });
  const secondTrap = scene.children.at(-1);
  const insideSecond = view(136), insideFirst = view(129), outside = view(126);
  let hit = false;
  for (let i = 0; i < 160 && !hit; i++) hit = props.stepHazards(insideFirst, insideFirst, tick);
  assert.equal(hit, true, 'the first trap really hit the player');
  for (let i = 0; i < 120; i++) props.stepHazards(outside, outside, tick);
  props.stepHazards(insideSecond, insideSecond, tick);
  assert.equal(props.hazardStates['first-trap'], 'resting');
  assert.equal(props.hazardStates['second-trap'], 'falling');
  view(129);
  assert.ok(firstTrap.material.uniforms.bounds.value.y < 8 && secondTrap.material.uniforms.bounds.value.y < 12);

  await add('orbit', 155, { motion: { pivot: { s: 152, h: 4 } } });
  assert.equal(props.interact(view(155)).type, 'ride');
  assert.equal(props.prompt.rideMode, 'orbit');
  const orbitPose = props.stepRide(1, .3);
  const collectedProps = props.collectedIds;
  props.resetHazards(insideFirst);
  assert.deepEqual(props.hazardStates, { 'ride-path': 'collected', 'first-trap': 'waiting-for-exit', 'second-trap': 'ready' });
  assert.deepEqual(props.collectedIds, collectedProps);
  assert.equal(scene.children[0].visible, false, 'a replaced hazard does not reveal collected items');
  assert.deepEqual(props.stepRide(0, .3), orbitPose, 'motion progress is kept when hazards reset');
  props.exitRide();
  view(129);
  assert.equal(firstTrap.material.uniforms.bounds.value.y, 8);
  assert.equal(secondTrap.material.uniforms.bounds.value.y, 12);
  assert.equal(props.stepHazards(insideFirst, insideFirst, .1), false);
  view(129);
  assert.equal(firstTrap.material.uniforms.bounds.value.y, 8, 'a hazard cannot briefly fall onto its respawn point');
  props.stepHazards(insideFirst, outside, .1);
  props.stepHazards(outside, insideFirst, .1);
  props.stepHazards(insideSecond, insideSecond, .1);
  view(129);
  assert.ok(firstTrap.material.uniforms.bounds.value.y < 8 && secondTrap.material.uniforms.bounds.value.y < 12,
    'all hazards can trigger again after a death');
});
