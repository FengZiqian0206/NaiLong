import { WORLD } from './world.js?v=20261123b';
import { normalizeMotion } from './prop-motion.js?v=20261127b';

const repository = 'https://api.github.com/repos/FengZiqian0206/NaiLong';
const manifestPath = 'game/assets/shared-props.json';
const contentsURL = `${repository}/contents/${manifestPath}`;
const localManifest = new URL('./assets/shared-props.json', import.meta.url);
const publicManifest = `https://raw.githubusercontent.com/FengZiqian0206/NaiLong/refs/heads/main/${manifestPath}`;
const photoTypes = ['image/png', 'image/jpeg', 'image/webp'];
const modes = ['bounce', 'disappear', 'image'];
const maxImageBytes = 6 * 1024 * 1024;
const maxLayoutBytes = 16 * 1024 * 1024;

function asBase64(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageType(bytes) {
  if (bytes.length < 12) return '';
  const matches = (pattern, offset = 0) => pattern.every((byte, index) => bytes[offset + index] === byte);
  if (matches([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (matches([255, 216, 255])) return 'image/jpeg';
  if (matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8)) return 'image/webp';
  return '';
}

async function serializeImage(blob, allowedTypes) {
  if (!(blob instanceof Blob)) throw new Error('Choose an image for the object before publishing.');
  if (blob.size > maxImageBytes) throw new Error('Each published image must be 6 MB or smaller.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = imageType(bytes);
  if (!allowedTypes.includes(type)) throw new Error('The layout contains an unsupported image.');
  return { type, data: asBase64(bytes) };
}

function storedImage(image, allowedTypes) {
  if (!image || !allowedTypes.includes(image.type) || typeof image.data !== 'string' ||
    image.data.length > Math.ceil(maxImageBytes / 3) * 4) throw new Error('An image in the shared layout is invalid.');
  const bytes = fromBase64(image.data);
  if (bytes.length > maxImageBytes || imageType(bytes) !== image.type) throw new Error('An image in the shared layout is invalid.');
  return new Blob([bytes], { type: image.type });
}

function layoutRecords(props) {
  if (!Array.isArray(props) || props.length > 128) throw new Error('A shared layout can contain up to 128 objects.');
  const ids = new Set();
  return props.map(prop => {
    const { id, name, nameZh, asset, s, h, width, height, interactive, behavior, popupName, requires, fallZone, motion } = prop ?? {};
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(id) || ids.has(id) ||
      ![s, h, width].every(Number.isFinite) || width < .35 || width > 18 ||
      (height !== undefined && (!Number.isFinite(height) || height <= 0))) {
      throw new Error('An object in the shared layout has an invalid placement.');
    }
    ids.add(id);
    const dependencyIds = Array.isArray(requires) ? [...new Set(requires)].filter(value =>
      typeof value === 'string' && /^[a-z0-9_-]{1,80}$/i.test(value) && value !== id).slice(0, 128) : [];
    const zone = fallZone && [fallZone.s, fallZone.h, fallZone.width, fallZone.height].every(Number.isFinite) &&
      fallZone.width >= .25 && fallZone.width <= 512 && fallZone.height >= .25 && fallZone.height <= 512
      ? { s: fallZone.s, h: fallZone.h, width: fallZone.width, height: fallZone.height } : null;
    return { id, name: typeof name === 'string' ? name.slice(0, 255) : 'PNG object',
      nameZh: typeof nameZh === 'string' ? nameZh.slice(0, 255) : undefined,
      asset: asset === id ? asset : undefined, s, h, width, height,
      interactive: interactive !== false, behavior: modes.includes(behavior) ? behavior : 'bounce',
      popupName: typeof popupName === 'string' ? popupName.slice(0, 255) : undefined,
      requires: dependencyIds, fallZone: zone, motion: normalizeMotion(motion) };
  });
}

function layoutBlocks(blocks = []) {
  if (!Array.isArray(blocks) || blocks.length > 128) throw new Error('A layout can contain up to 128 collision blocks.');
  const ids = new Set();
  return blocks.map(block => {
    const { id, s, h, width, height } = block ?? {};
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(id) || ids.has(id) ||
      ![s, h, width, height].every(Number.isFinite) || width < .1 || width > 48 || height < .08 || height > 20 ||
      h - height / 2 <= -WORLD.ringRadius + 1) throw new Error('A collision block has an invalid position or size.');
    ids.add(id);
    return { id, s, h, width, height };
  });
}

function parseLayout(text) {
  if (text.length > maxLayoutBytes) throw new Error('The shared layout is too large.');
  const { version, revision, props, includesDefaults, blocks } = JSON.parse(text);
  if (version !== 1 || typeof revision !== 'string' ||
    (revision !== 'initial' && !/^[0-9a-f-]{36}$/i.test(revision))) {
    throw new Error('This shared layout could not be read.');
  }
  return { revision, props, blocks: layoutBlocks(blocks), includesDefaults: includesDefaults === true };
}

async function readLayout(response) {
  if (!response.ok) throw new Error('The shared layout is unavailable.');
  const { revision, props, blocks, includesDefaults } = parseLayout(await response.text());
  return { revision, blocks, includesDefaults, props: layoutRecords(props).map((prop, index) => {
    const { sprite, popup } = props[index];
    if (prop.interactive && !prop.motion && prop.behavior === 'image' && !popup) throw new Error('A shared image interaction has no image.');
    return { ...prop, blob: prop.asset ? undefined : storedImage(sprite, ['image/png']),
      popupImage: popup ? storedImage(popup, photoTypes) : undefined };
  }) };
}

export async function loadSharedProps() {
  const options = { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000) };
  if (localManifest.origin === 'https://fengziqian0206.github.io' && localManifest.pathname.startsWith('/NaiLong/')) {
    // A saved layout is public as soon as the commit reaches GitHub, even while Pages rebuilds.
    try { return await readLayout(await fetch(`${publicManifest}?t=${Date.now()}`, options)); }
    catch { /* The deployed layout is available as a same-origin fallback. */ }
  }
  return readLayout(await fetch(localManifest, { ...options, signal: AbortSignal.timeout(5000) }));
}

const conflictMessage = 'The shared layout changed. Keep your local draft, reload the game and review it before publishing again.';

async function githubRequest(url, token, options = {}, accept = 'application/vnd.github.object+json') {
  let response;
  try {
    response = await fetch(url, {
      ...options, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: accept, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch {
    throw new Error('GitHub could not be reached. Your local edits are still open.');
  }
  if (response.status === 401) throw new Error('This GitHub access token is invalid or expired.');
  if (response.status === 403 || response.status === 404) {
    throw new Error('GitHub denied access. Give the token Contents read and write access to FengZiqian0206/NaiLong.');
  }
  if (response.status === 409) throw new Error(conflictMessage);
  if (!response.ok) throw new Error(`GitHub could not publish this layout (${response.status}). Your local edits are still open.`);
  return response;
}

export async function publishSharedProps(definitions, expectedRevision, token, collisionBlocks) {
  const access = String(token ?? '').trim();
  if (!/^github_pat_[a-z0-9_]+$/i.test(access)) throw new Error('Enter a fine-grained GitHub access token.');
  const records = layoutRecords(definitions);
  const blocks = layoutBlocks(collisionBlocks);
  const totalBytes = definitions.reduce((total, prop) => total + (prop.blob?.size ?? 0) + (prop.popupImage?.size ?? 0), 0);
  if (totalBytes > 11 * 1024 * 1024) throw new Error('The images in a shared layout must total 11 MB or less.');

  const props = await Promise.all(records.map(async (prop, index) => {
    const { blob, popupImage } = definitions[index];
    if (prop.interactive && !prop.motion && prop.behavior === 'image' && !popupImage) throw new Error('Choose a popup image before publishing.');
    return { ...prop, sprite: prop.asset ? undefined : await serializeImage(blob, ['image/png']),
      popup: popupImage ? await serializeImage(popupImage, photoTypes) : undefined };
  }));
  const revision = crypto.randomUUID();
  const packed = new TextEncoder().encode(JSON.stringify({ version: 1, revision, includesDefaults: true, props, blocks }));
  if (packed.byteLength > maxLayoutBytes) throw new Error('The shared layout is too large.');

  const metadata = await (await githubRequest(`${contentsURL}?ref=main`, access)).json();
  const { sha } = metadata;
  if (!/^[a-f0-9]{40}$/i.test(sha ?? '')) throw new Error('GitHub did not return a revision for this layout.');
  // Contents metadata omits file data above 1 MB. Read the exact immutable blob
  // for those layouts so the checked revision and the PUT's SHA cannot diverge.
  const current = metadata.encoding === 'base64' && metadata.content
    ? new TextDecoder().decode(fromBase64(metadata.content))
    : await (await githubRequest(`${repository}/git/blobs/${sha}`, access, {}, 'application/vnd.github.raw+json')).text();
  if (parseLayout(current).revision !== expectedRevision) throw new Error(conflictMessage);

  await githubRequest(contentsURL, access, { method: 'PUT', body: JSON.stringify({
    message: 'Save shared game objects', content: asBase64(packed), sha, branch: 'main',
  }) }, 'application/vnd.github+json');
  return { revision, blocks, includesDefaults: true, props: records.map((prop, index) => ({ ...prop,
    blob: definitions[index].blob, popupImage: definitions[index].popupImage })) };
}
