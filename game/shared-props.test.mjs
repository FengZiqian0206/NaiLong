import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSharedProps, publishSharedProps } from './shared-props.js';

test('global publishing preserves editable originals, dependencies and zones and protects newer revisions', async context => {
  const token = 'github_pat_test_not_a_real_token';
  const sha = '1'.repeat(40);
  let document = { version: 1, revision: 'initial', props: [] };
  let writes = 0;
  const png = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+i7ZsAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' });
  context.mock.method(globalThis, 'fetch', async (requestedURL, options) => {
    const url = new URL(requestedURL);
    assert.equal(options.cache, 'no-store');
    if (url.protocol === 'file:') {
      assert.equal(options.headers, undefined, 'players load the layout without an access token');
      return Response.json(document);
    }
    assert.equal(url.host, 'api.github.com');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    if (options.method === 'PUT') {
      const request = JSON.parse(options.body);
      assert.equal(url.pathname, '/repos/FengZiqian0206/NaiLong/contents/game/assets/shared-props.json');
      assert.equal(request.sha, sha);
      assert.equal(request.branch, 'main');
      document = JSON.parse(Buffer.from(request.content, 'base64').toString('utf8'));
      writes++;
      return Response.json({});
    }
    if (url.searchParams.get('ref') === 'main') return Response.json({ sha, encoding: 'none', content: '' });
    assert.equal(url.pathname, `/repos/FengZiqian0206/NaiLong/git/blobs/${sha}`);
    assert.equal(options.headers.Accept, 'application/vnd.github.raw+json');
    return Response.json(document);
  });

  assert.equal((await loadSharedProps()).includesDefaults, false, 'an older layout still needs the default props');
  const objects = [{ id: 'lamp', name: 'Lamp', nameZh: '吊灯', s: 3, h: 2, width: 1, height: 2,
    behavior: 'image', interactive: true, blob: png, popupImage: png, popupName: '说明.png',
    requires: ['key'], fallZone: { s: 4, h: 1, width: 3, height: 2 } },
  { id: 'key', asset: 'key', name: 'Key', nameZh: '钥匙', s: 9, h: 2, width: 2, height: 1,
    behavior: 'disappear', interactive: true }];
  const published = await publishSharedProps(objects, 'initial', token);
  const loaded = await loadSharedProps();
  assert.equal(loaded.revision, published.revision);
  assert.equal(loaded.includesDefaults, true, 'deleting an original must not reintroduce it on reload');
  assert.deepEqual(loaded.props, published.props);
  assert.deepEqual(loaded.props[0].requires, ['key']);
  assert.deepEqual(loaded.props[0].fallZone, objects[0].fallZone);
  assert.equal(loaded.props[1].asset, 'key');
  assert.equal(document.props[1].sprite, undefined, 'built-in PNGs are reused without copying the image into the layout');
  assert.deepEqual(await loaded.props[0].popupImage.arrayBuffer(), await png.arrayBuffer());
  assert.equal(JSON.stringify(document).includes(token), false);
  await assert.rejects(publishSharedProps([], 'initial', token), /shared layout changed/);
  assert.equal(writes, 1, 'a stale editor cannot delete the shared objects');
});
