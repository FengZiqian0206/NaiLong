import * as THREE from '../vendor/three.module.min.js';
import { WORLD, nearestPath } from './world.js?v=20261123b';
import { PANELS } from './scenes.js?v=20261123b';

const { ringRadius, totalLength } = WORLD;
const reach = 3.25;
const bounceDuration = .43;
const padding = .36;
const wrap = s => THREE.MathUtils.euclideanModulo(s, totalLength);
const routeDelta = (a, b) => wrap(a - b + totalLength / 2) - totalLength / 2;

export function propPoint(x, y) {
  return { s: nearestPath(x, y).progress * totalLength, h: Math.hypot(x, y) - ringRadius };
}

function propDistance(point, prop) {
  const dx = Math.max(0, Math.abs(routeDelta(point.s, prop.s)) - prop.width / 2);
  const dy = Math.max(0, Math.abs(point.h - prop.h) - prop.height / 2);
  // Tangential distance is measured at the prop's height above the ring.
  return Math.hypot(dx * (1 + prop.h / ringRadius), dy);
}

function nearbyProp(props, point) {
  let nearest = null, best = Infinity;
  for (const prop of props) {
    if (!prop.interactive) continue;
    const distance = propDistance(point, prop);
    if (distance > reach) continue;
    const centerDistance = Math.hypot(routeDelta(point.s, prop.s), point.h - prop.h);
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
  uniform float pulse;
  varying vec2 spriteUV;
  varying vec2 worldSize;
  void main() {
    worldSize = bounds.zw * pulse;
    vec2 offset = position.xy * (worldSize + ${2 * padding});
    spriteUV = offset / worldSize + .5;
    float angle = (bounds.x + offset.x) / ${ringRadius};
    float radius = ${ringRadius} + bounds.y + offset.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vec2(sin(angle), cos(angle)) * radius, -1., 1.);
  }`;

const fragmentShader = `
  uniform sampler2D art;
  uniform float highlight;
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
    gl_FragColor = vec4((paint * color.a + outlineColor * rim) / alpha, alpha);
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
  const geometry = new THREE.PlaneGeometry(1, 1, 16, 1);
  const warm = new THREE.Color('#ffecae');
  const editColor = new THREE.Color('#b5ffee');
  let active = null, selected = null;

  function placement(prop) {
    const { id, name, blob, s, h, width, height, interactive } = prop;
    return { id, name, blob, s, h, width, height, interactive };
  }

  function change(prop, { s, h, width, height, interactive }) {
    if (Number.isFinite(s)) prop.s = wrap(s);
    if (Number.isFinite(h)) prop.h = Math.max(-ringRadius + 1, h);
    if (Number.isFinite(width) && width >= .35 && width <= 18) prop.width = width;
    if (Number.isFinite(height) && height >= .35 && height <= 18) prop.height = height;
    if (typeof interactive === 'boolean') prop.interactive = interactive;
    prop.mesh.material.uniforms.bounds.value.set(prop.s, prop.h, prop.width, prop.height);
    return placement(prop);
  }

  function mount(definition, texture) {
    texture.premultiplyAlpha = true;
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { art: { value: texture }, bounds: { value: new THREE.Vector4() }, pulse: { value: 1 },
        highlight: { value: 0 }, outlineColor: { value: warm } }, vertexShader, fragmentShader });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = definition.blob ? .6 : .5;
    const prop = { ...definition, interactive: definition.interactive !== false, mesh, elapsed: bounceDuration };
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
  await Promise.all(definitions.map(async ({ id, image, x, y, width, height }) => {
    const url = new URL(image, manifestURL);
    url.search = manifestURL.search;
    const texture = await loader.loadAsync(url.href);
    mount({ id, s: home.start + (x + width / 2) * home.pixelScale,
      h: (home.baseline - y - height / 2) * home.pixelScale, width: width * home.pixelScale,
      height: height * home.pixelScale }, texture);
  }));

  return {
    get activeId() { return active?.id ?? null; },
    get animatingId() { return [...props.values()].find(prop => prop.elapsed < bounceDuration)?.id ?? null; },
    interact(player) {
      const target = nearbyProp(props.values(), propPoint(player.x, player.y));
      if (target && target.elapsed >= bounceDuration) target.elapsed = 0;
    },
    update(dt, player, cameraProgress, viewWidth, viewHeight, editing) {
      active = !editing && !player.falling ? nearbyProp(props.values(), propPoint(player.x, player.y)) : null;
      const cameraS = cameraProgress * totalLength;
      for (const prop of props.values()) {
        prop.elapsed = Math.min(bounceDuration, prop.elapsed + dt);
        prop.mesh.visible = Math.abs(routeDelta(prop.s, cameraS)) < Math.max(viewWidth, viewHeight) * .75 + 10 + prop.width;
        const uniforms = prop.mesh.material.uniforms;
        uniforms.pulse.value = pulseScale(prop.elapsed);
        uniforms.highlight.value = THREE.MathUtils.damp(uniforms.highlight.value,
          prop === active || (editing && selected === prop.id) ? 1 : 0, 18, dt);
        uniforms.outlineColor.value = editing ? editColor : warm;
      }
    },
    async add(definition) {
      if (!definition.id || props.has(definition.id) || ![definition.s, definition.h, definition.width].every(Number.isFinite) ||
        definition.width < .35 || definition.width > 18) throw new Error('The prop placement is invalid.');
      const texture = await uploadTexture(definition.blob);
      const height = Number.isFinite(definition.height) && definition.height > 0
        ? definition.height : definition.width * texture.image.height / texture.image.width;
      return mount({ ...definition, height }, texture);
    },
    pick(point) {
      const list = Array.from(props.values());
      const prop = list.findLast(item => item.blob && propDistance(point, item) <= .18);
      if (prop) return placement(prop);
    },
    edit(id, values) {
      const prop = props.get(id);
      if (prop?.blob) return change(prop, values);
    },
    remove(id) {
      const prop = props.get(id);
      if (!prop?.blob) return;
      scene.remove(prop.mesh);
      prop.mesh.material.uniforms.art.value.dispose();
      prop.mesh.material.dispose();
      props.delete(id);
      if (selected === id) selected = null;
    },
    select(id) { selected = id; },
  };
}
