import * as THREE from '../vendor/three.module.min.js';
import { WORLD, nearestPath } from './world.js?v=20261123b';
import { PANELS, worldAt } from './scenes.js?v=20261127';
import { createFallingProp, stepFallingProp } from './prop-gravity.js?v=20261127';
import { createPropMotion, normalizeMotion } from './prop-motion.js?v=20261127b';

const { ringRadius, totalLength } = WORLD;
const reach = 3.25;
const bounceDuration = .43;
const fadeDuration = .26;
const padding = .36;
const behaviors = new Set(['bounce', 'disappear', 'image']);
const wrap = s => s >= 0 && s < totalLength ? s : THREE.MathUtils.euclideanModulo(s, totalLength);
const routeDelta = (a, b) => {
  const delta = a - b;
  return delta - totalLength * Math.round(delta / totalLength);
};
const runtimePose = prop => prop.travel?.pose ?? (prop.fall ? { s: prop.s, h: prop.fall.height } : prop);
const homeNames = {
  backpack: ['Backpack', '背包'], 'family-photo': ['Family photo', '全家福'], key: ['Key', '钥匙'],
  'storage-door': ['Storage door', '柜门'], dog: ['Dog', '小狗'], bell: ['Bell', '铃铛'],
  'pink-flowers': ['Pink flowers', '粉花'],
};

export function propPoint(x, y) {
  return { s: nearestPath(x, y).progress * totalLength, h: Math.hypot(x, y) - ringRadius };
}

function propDistance(point, prop, pose = runtimePose(prop)) {
  // Tangential distance is measured at the prop's height above the ring.
  const scale = Math.max(.05, 1 + pose.h / ringRadius);
  let dx = routeDelta(point.s, pose.s) * scale, dy = point.h - pose.h;
  if (pose.turn) {
    const angle = (prop.s - pose.s) / ringRadius + pose.turn;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    [dx, dy] = [cos * dx - sin * dy, sin * dx + cos * dy];
  }
  return Math.hypot(Math.max(0, Math.abs(dx) - prop.width * scale / 2),
    Math.max(0, Math.abs(dy) - prop.height / 2));
}

function nearbyProp(props, point) {
  let nearest = null, best = Infinity;
  for (const prop of props) {
    if (!prop.interactive || prop.fadeTime !== null || prop.fall?.gone) continue;
    const pose = runtimePose(prop);
    const distance = propDistance(point, prop, pose);
    if (distance > reach) continue;
    const centerDistance = Math.hypot(routeDelta(point.s, pose.s), point.h - pose.h);
    const score = distance + .02 * centerDistance;
    if (score < best) { best = score; nearest = prop; }
  }
  return nearest;
}

function pulseScale(time) {
  if (time < .13) return 1 + .13 * (1 - (1 - time / .13) ** 3);
  if (time < .29) return 1.13 - .158 * THREE.MathUtils.smoothstep(time, .13, .29);
  return .972 + .028 * THREE.MathUtils.smoothstep(time, .29, bounceDuration);
}

const vertexShader = `
  uniform vec4 bounds;
  uniform vec2 orbitOrigin;
  uniform float pulse, orbitTurn;
  varying vec2 spriteUV;
  varying vec2 worldSize;
  vec2 ringPoint(vec2 p) {
    float angle = p.x / ${ringRadius};
    return vec2(sin(angle), cos(angle)) * (${ringRadius} + p.y);
  }
  void main() {
    worldSize = bounds.zw * pulse;
    vec2 offset = position.xy * (worldSize + ${2 * padding});
    spriteUV = offset / worldSize + .5;
    vec2 world = ringPoint(bounds.xy + offset);
    if (orbitTurn != 0.) {
      vec2 body = ringPoint(orbitOrigin + offset) - ringPoint(orbitOrigin);
      float c = cos(orbitTurn), s = sin(orbitTurn);
      world = ringPoint(bounds.xy) + mat2(c, -s, s, c) * body;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, -1., 1.);
  }`;

const fragmentShader = `
  uniform sampler2D art;
  uniform float highlight, opacity;
  uniform vec3 outlineColor;
  varying vec2 spriteUV;
  varying vec2 worldSize;
  vec4 readArt(vec2 p) {
    if (p.x < 0. || p.y < 0. || p.x > 1. || p.y > 1.) return vec4(0.);
    return texture2D(art, p);
  }
  float reachAlpha(vec2 p, vec2 size) {
    float edge = 0.;
    for (int i = 0; i < 8; i++) {
      float angle = float(i) * .78539816;
      edge = max(edge, readArt(p + size * vec2(cos(angle), sin(angle))).a);
    }
    return edge;
  }
  void main() {
    vec4 color = readArt(spriteUV);
    vec3 paint = sRGBTransferEOTF(vec4(clamp(color.rgb / max(color.a, .002), 0., 1.), 1.)).rgb;
    float halo = 0.;
    if (highlight > .005 && color.a < .99) {
      float nearEdge = reachAlpha(spriteUV, .115 / worldSize);
      float farEdge = reachAlpha(spriteUV, .25 / worldSize);
      halo = max(.96 * smoothstep(.08, .8, nearEdge), .24 * smoothstep(.09, .9, farEdge)) * highlight;
    }
    float rim = halo * (1. - color.a);
    float alpha = color.a + rim;
    if (alpha < .005) discard;
    gl_FragColor = vec4((paint * color.a + outlineColor * rim) / alpha, alpha * opacity);
    #include <colorspace_fragment>
  }`;

async function uploadTexture(blob) {
  const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  if (header.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => header[i] === byte)) {
    throw new Error('Choose a valid PNG image.');
  }
  const dimensions = new DataView(header.buffer);
  const width = dimensions.getUint32(16), height = dimensions.getUint32(20);
  if (!width || !height || width * height > 24_000_000) throw new Error('Use a PNG under 24 megapixels.');
  const ratio = Math.min(1, 1200 / Math.max(width, height));
  const image = await createImageBitmap(blob, {
    resizeWidth: Math.max(1, Math.round(width * ratio)), resizeHeight: Math.max(1, Math.round(height * ratio)),
    resizeQuality: 'high',
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  image.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels.data[(y * canvas.width + x) * 4 + 3] < 12) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right === -1) throw new Error('This PNG is transparent throughout.');
  const cropped = document.createElement('canvas');
  cropped.width = right - left + 3; cropped.height = bottom - top + 3;
  cropped.getContext('2d').drawImage(canvas, left, top, right - left + 1, bottom - top + 1,
    1, 1, right - left + 1, bottom - top + 1);
  const texture = new THREE.CanvasTexture(cropped);
  return texture;
}

export async function createProps(scene) {
  const props = new Map();
  const collected = new Set();
  const homeAssets = new Map();
  const geometry = new THREE.PlaneGeometry(1, 1, 16, 1);
  const warm = new THREE.Color('#ffecae');
  const editColor = new THREE.Color('#b5ffee');
  let active = null, selected = null, riding = null, zoneLine;

  const blocked = prop => prop.requires.some(id => !collected.has(id));

  function placement(prop) {
    const { id, name, nameZh, asset, blob, s, h, width, height, interactive, behavior,
      popupImage, popupName, requires, fallZone, motion } = prop;
    return { id, name, nameZh, asset, blob, s, h, width, height, interactive, behavior,
      popupImage, popupName, requires, fallZone, motion };
  }

  function change(prop, { s, h, width, height, interactive, behavior, popupImage, popupName, requires, fallZone, motion }) {
    const rebuildFall = fallZone !== undefined || typeof interactive === 'boolean' || [s, h, width, height].some(Number.isFinite);
    const previousS = prop.s, previousH = prop.h;
    if (Number.isFinite(s)) prop.s = wrap(s);
    if (Number.isFinite(h)) prop.h = Math.max(-ringRadius + 1, h);
    const ds = routeDelta(prop.s, previousS), dh = prop.h - previousH;
    const moved = Math.abs(ds) > 1e-9 || dh !== 0;
    if (Number.isFinite(width) && width >= .35 && width <= 18) prop.width = width;
    if (Number.isFinite(height) && height >= .35 && height <= 18) prop.height = height;
    if (typeof interactive === 'boolean' && prop.interactive !== interactive) {
      prop.interactive = interactive;
      prop.fadeTime = null;
    }
    if (behaviors.has(behavior) && prop.behavior !== behavior) {
      prop.behavior = behavior;
      prop.fadeTime = null;
    }
    if (popupImage instanceof Blob || popupImage === null) prop.popupImage = popupImage;
    if (typeof popupName === 'string') prop.popupName = popupName;
    if (Array.isArray(requires)) prop.requires = [...new Set(requires.filter(id => typeof id === 'string' && id !== prop.id))];
    if (fallZone !== undefined) prop.fallZone = fallZone;
    if (motion !== undefined) {
      prop.motion = normalizeMotion(motion);
      prop.fadeTime = null;
    } else if (moved && prop.motion) {
      const shift = point => ({ s: point.s + ds, h: point.h + dh });
      prop.motion = normalizeMotion({ pivot: prop.motion.pivot && shift(prop.motion.pivot), path: prop.motion.path?.map(shift) });
    }
    if (motion !== undefined || moved || typeof interactive === 'boolean') {
      prop.travel = createPropMotion(prop);
      if (riding === prop) riding = null;
    }
    if (rebuildFall || motion !== undefined) prop.fall = prop.travel ? null : createFallingProp(prop);
    const uniforms = prop.mesh.material.uniforms;
    uniforms.bounds.value.set(prop.s, prop.h, prop.width, prop.height);
    uniforms.orbitOrigin.value.set(prop.s, prop.h);
    return placement(prop);
  }

  function mount(definition, texture) {
    texture.premultiplyAlpha = true;
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { art: { value: texture }, bounds: { value: new THREE.Vector4() }, pulse: { value: 1 },
        orbitOrigin: { value: new THREE.Vector2() }, orbitTurn: { value: 0 },
        highlight: { value: 0 }, opacity: { value: 1 }, outlineColor: { value: warm } }, vertexShader, fragmentShader });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = definition.asset ? .5 : .6;
    const prop = { ...definition, interactive: definition.interactive !== false,
      behavior: behaviors.has(definition.behavior) ? definition.behavior : 'bounce', requires: [], fallZone: null,
      mesh, elapsed: bounceDuration, fadeTime: null };
    const placed = change(prop, definition);
    props.set(prop.id, prop);
    scene.add(mesh);
    return placed;
  }

  const home = PANELS[0];
  const manifestURL = new URL('./assets/home/props.json?v=20261125', import.meta.url);
  const response = await fetch(manifestURL);
  if (!response.ok) throw new Error('Could not load home props.');
  const definitions = await response.json();
  const loader = new THREE.TextureLoader();
  const defaults = await Promise.all(definitions.map(async ({ id, image, x, y, width, height }) => {
    const url = new URL(image, manifestURL);
    url.search = manifestURL.search;
    const texture = await loader.loadAsync(url.href);
    homeAssets.set(id, { texture, url: url.href, height: height * home.pixelScale });
    const [name, nameZh] = homeNames[id] ?? [id, id];
    return mount({ id, asset: id, name, nameZh, s: home.start + (x + width / 2) * home.pixelScale,
      h: (home.baseline - y - height / 2) * home.pixelScale, width: width * home.pixelScale,
      height: height * home.pixelScale }, texture);
  }));

  function ridingPose() {
    const { s, h, x, y } = riding.travel.pose;
    return { id: riding.id, s, h, x, y };
  }

  return {
    defaults,
    get activeId() { return active?.id ?? null; },
    get ridingId() { return riding?.id ?? null; },
    get animatingId() { return [...props.values()].find(prop => prop.elapsed < bounceDuration)?.id ?? null; },
    get collectedIds() { return [...collected]; },
    get prompt() {
      const target = riding ?? active;
      if (!target) return;
      const pose = runtimePose(target);
      const turn = pose.turn ? (target.s - pose.s) / ringRadius + pose.turn : 0;
      const extent = Math.abs(Math.cos(turn)) * target.height / 2 + Math.abs(Math.sin(turn)) * target.width / 2;
      return { s: pose.s, h: pose.h + extent + .26, blocked: !riding && blocked(target), riding: Boolean(riding) };
    },
    reset() {
      active = riding = null;
      collected.clear();
      for (const prop of props.values()) {
        prop.fadeTime = null;
        prop.elapsed = bounceDuration;
        prop.travel = createPropMotion(prop);
        prop.fall = prop.travel ? null : createFallingProp(prop);
      }
    },
    stepHazards(before, player, dt) {
      let hit = false;
      for (const prop of props.values()) {
        if (prop.interactive && prop.fadeTime === null && stepFallingProp(prop.fall, before, player, dt)) hit = true;
      }
      return hit;
    },
    interact(player) {
      if (riding) return null;
      const target = nearbyProp(props.values(), propPoint(player.x, player.y));
      if (!target) return null;
      if (blocked(target)) return { type: 'blocked' };
      if (target.travel) {
        riding = target;
        active = null;
        return { type: 'ride', ...ridingPose() };
      }
      if (!target.motion && target.behavior === 'disappear') {
        target.fadeTime = 0;
        collected.add(target.id);
        const { id, name, blob, asset } = target;
        return { type: 'pickup', id, name, blob, url: homeAssets.get(asset)?.url };
      }
      if (!target.motion && target.behavior === 'image' && target.popupImage instanceof Blob) {
        return { type: 'image', image: target.popupImage };
      }
      if ((target.motion || target.behavior === 'bounce') && target.elapsed >= bounceDuration) target.elapsed = 0;
      return null;
    },
    stepRide(move, dt) {
      if (!riding) return null;
      const finished = Number.isFinite(dt) && dt > 0 && riding.travel.advance(Math.sign(move || 0), dt);
      const pose = ridingPose();
      if (finished) riding = null;
      return { ...pose, finished };
    },
    exitRide() {
      if (!riding) return null;
      const pose = ridingPose();
      riding = null;
      return pose;
    },
    update(dt, player, cameraProgress, viewWidth, viewHeight, editing, interactionEnabled = true) {
      active = interactionEnabled && !editing && !riding && !player.falling ? nearbyProp(props.values(), propPoint(player.x, player.y)) : null;
      const cameraS = cameraProgress * totalLength;
      for (const prop of props.values()) {
        prop.elapsed = Math.min(bounceDuration, prop.elapsed + dt);
        if (prop.fadeTime !== null) prop.fadeTime = Math.min(fadeDuration, prop.fadeTime + dt);
        const fading = !editing && prop.fadeTime !== null;
        const fade = fading ? THREE.MathUtils.smoothstep(prop.fadeTime, 0, fadeDuration) : 0;
        const pose = editing ? prop : runtimePose(prop);
        prop.mesh.visible = (editing || !prop.fall?.gone) && fade < 1 &&
          Math.abs(routeDelta(pose.s, cameraS)) < Math.max(viewWidth, viewHeight) * .75 + 10 + prop.width;
        const uniforms = prop.mesh.material.uniforms;
        uniforms.bounds.value.x = pose.s;
        uniforms.bounds.value.y = pose.h;
        uniforms.orbitTurn.value = pose.turn ?? 0;
        uniforms.pulse.value = fading ? 1 - .15 * fade : pulseScale(prop.elapsed);
        uniforms.opacity.value = 1 - fade;
        uniforms.highlight.value = THREE.MathUtils.damp(uniforms.highlight.value,
          prop === active || (editing && selected === prop.id) ? 1 : 0, 18, dt);
        uniforms.outlineColor.value = editing ? editColor : warm;
      }
    },
    async add(definition) {
      if (!definition.id || ![definition.s, definition.h, definition.width].every(Number.isFinite) ||
        definition.width < .35 || definition.width > 18) throw new Error('The prop placement is invalid.');
      const existing = props.get(definition.id);
      if (definition.asset) {
        const asset = definition.asset === definition.id && homeAssets.get(definition.asset);
        if (!asset) throw new Error('This original prop could not load.');
        if (existing) return change(existing, { ...definition, motion: definition.motion ?? null });
        return mount({ ...definition, height: definition.height ?? asset.height }, asset.texture);
      }
      if (existing) throw new Error('An object already has this identifier.');
      const texture = await uploadTexture(definition.blob);
      const height = Number.isFinite(definition.height) && definition.height > 0
        ? definition.height : definition.width * texture.image.height / texture.image.width;
      return mount({ ...definition, height }, texture);
    },
    pick(point) {
      const list = Array.from(props.values());
      const prop = list.findLast(item => propDistance(point, item, item) <= .18);
      if (prop) return placement(prop);
    },
    edit(id, values) {
      const prop = props.get(id);
      if (prop) return change(prop, values);
    },
    remove(id) {
      const prop = props.get(id);
      if (!prop) return;
      scene.remove(prop.mesh);
      if (!prop.asset) prop.mesh.material.uniforms.art.value.dispose();
      prop.mesh.material.dispose();
      props.delete(id);
      if (selected === id) selected = null;
      if (riding === prop) riding = null;
    },
    select(id) { selected = id; },
    previewZone(zone) {
      if (!zone) {
        if (zoneLine) zoneLine.visible = false;
        return;
      }
      if (!zoneLine) {
        zoneLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
          color: '#85fff1', depthTest: false, transparent: true, opacity: .9,
        }));
        zoneLine.frustumCulled = false;
        zoneLine.renderOrder = 4;
        scene.add(zoneLine);
      }
      const points = [], segments = Math.max(2, Math.ceil(zone.width / 2));
      for (const side of [-1, 1]) {
        for (let i = 0; i <= segments; i++) {
          const point = worldAt(zone.s + side * (i / segments - .5) * zone.width, zone.h + side * zone.height / 2);
          points.push(new THREE.Vector3(point.x, point.y, 0));
        }
      }
      zoneLine.geometry.dispose();
      zoneLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
      zoneLine.visible = true;
    },
  };
}
