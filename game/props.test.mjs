import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three.module.min.js';
import { createProps } from './props.js';
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
});
