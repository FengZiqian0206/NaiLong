import * as THREE from '../vendor/three.module.min.js';

const sheets = ['walk.jpg', 'jump.png', 'interact.png'];
// Source bounds [x, y, width, height] and the two eye centers in sheet pixels.
// Crops exclude the labels and empty cells of the original artwork.
const crops = [
  [238, 113, 461, 387, 298, 451, 318],
  [830, 104, 507, 399, 988, 1181, 317],
  [1471, 111, 470, 389, 1731, 1882, 317],
  [110, 263, 314, 231, 213, 327, 381],
  [477, 347, 348, 175, 587, 719, 447],
  [884, 241, 278, 236, 976, 1081, 353],
  [1240, 197, 293, 222, 1337, 1446, 307],
  [1611, 259, 288, 238, 1702, 1817, 376],
  [1968, 326, 325, 207, 2076, 2200, 438],
  [30, 63, 260, 194, 116, 209, 163],
  [349, 94, 262, 134, 432, 529, 171],
  [670, 49, 260, 222, 757, 853, 155],
  [990, 61, 260, 198, 1077, 1171, 158],
  [1310, 50, 261, 219, 1393, 1486, 160],
  [1629, 76, 262, 170, 1717, 1815, 168],
];
const idle = 1, compress = 4, falling = 7, impact = 8;
const jumpFrames = [[0, compress], [.09, 5], [.23, 6]];
const interactFrames = [[0, 9], [.11, 10], [.21, 11], [.28, 12], [.34, 13], [.42, 14]];
const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

const plumMatte = [48, 29, 59];
const matteFloor = 13;
const edgeDirections = [[-1,0], [1,0], [0,-1], [0,1], [-1,-1], [1,-1], [-1,1], [1,1]];
function matteSignal(bytes, at) {
  return Math.max(bytes[at] - plumMatte[0], bytes[at + 1] - plumMatte[1], bytes[at + 2] - plumMatte[2]);
}

function prepareSheet(source, sheet) {
  // Upload the already-transparent jump sheet with alpha-weighted filtering.
  if (sheet === 1) {
    source.premultiplyAlpha = true;
    return source;
  }

  // Key the plum background before the GPU builds its smaller mip levels.
  // Doing this after filtering blends the matte into the character's outline.
  const { width, height } = source.image;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source.image, 0, 0);
  const original = ctx.getImageData(0, 0, width, height).data;
  const keyed = ctx.createImageData(width, height);
  const output = keyed.data;
  const first = sheet === 0 ? 0 : 9;
  const last = sheet === 0 ? 3 : crops.length;
  for (let index = first; index < last; index++) {
    const [left, top, frameWidth, frameHeight] = crops[index];
    const right = left + frameWidth, bottom = top + frameHeight;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if ((index === 11 && x < 675 && y > 216) ||
            (index === 13 && ((x < 1320 && y > 215) || (x < 1344 && y > 240)))) continue;
        const at = (y * width + x) * 4;
        const signal = matteSignal(original, at);
        const sourceAlpha = original[at + 3] / 255;
        if (signal <= matteFloor || sourceAlpha <= .012) continue;

        // Estimate matte coverage only near the contour, preserving opaque paint.
        let coverage = 1;
        if (signal < 150 && (sheet === 0 || sourceAlpha < .96)) {
          let nearMatte = sourceAlpha < .96, neighborSignal = signal;
          for (const [dx, dy] of edgeDirections) {
            for (const step of [1, 3]) {
              const px = x + dx * step, py = y + dy * step;
              if (px < left || px >= right || py < top || py >= bottom) {
                nearMatte = true;
                continue;
              }
              const next = (py * width + px) * 4;
              const amount = matteSignal(original, next);
              nearMatte ||= original[next + 3] < 20 || amount <= matteFloor;
              if (original[next + 3] >= 235) neighborSignal = Math.max(neighborSignal, amount);
            }
          }
          if (nearMatte) {
            coverage = clamp((signal - matteFloor) / (Math.max(neighborSignal, 118) - matteFloor), .02, 1);
          }
        }
        for (let channel = 0; channel < 3; channel++) {
          output[at + channel] = (original[at + channel] - plumMatte[channel] * (1 - coverage)) / coverage;
        }
        output[at + 3] = 255 * sourceAlpha * coverage;
      }
    }
  }
  ctx.putImageData(keyed, 0, 0);
  source.dispose();
  const texture = new THREE.CanvasTexture(canvas);
  texture.premultiplyAlpha = true;
  return texture;
}

export async function createCharacter(scene, radius) {
  const loader = new THREE.TextureLoader();
  const textures = await Promise.all(sheets.map(async (name, sheet) =>
    prepareSheet(await loader.loadAsync(new URL('./assets/character/' + name, import.meta.url).href), sheet)));
  const authored = crops.map(([x, y, w, h, left, right, eyeY], i) => {
    const sheet = i < 3 ? 0 : i < 9 ? 1 : 2;
    const { width, height } = textures[sheet].image;
    // Match the natural standing width between the three source sheets.
    const referenceWidth = crops[[idle, 3, 9][sheet]][2];
    const scale = (2 * radius / crops[idle][3]) * crops[idle][2] / referenceWidth;
    return {
      crop: new THREE.Vector4(x / width, 1 - (y + h) / height, w / width, h / height),
      eyes: new THREE.Vector3((left - x) / w, (right - x) / w, 1 - (eyeY - y) / h),
      width: w * scale, height: h * scale,
    };
  });

  const weights = new Float32Array(crops.length);
  const desired = new Float32Array(crops.length);
  const eyes = new THREE.Vector3().copy(authored[idle].eyes);
  const sceneLight = { value: new THREE.Color('#ffc184') };
  weights[idle] = 1;
  const uniforms = {
    walkSheet: { value: textures[0] },
    jumpSheet: { value: textures[1] },
    interactSheet: { value: textures[2] },
    frameBoxes: { value: authored.map(frame => frame.crop) },
    frameEyes: { value: authored.map(frame => frame.eyes) },
    weights: { value: weights },
    eyes: { value: eyes },
    time: { value: 0 },
    sceneLight,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 spriteUV;
      void main() {
        spriteUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D walkSheet, jumpSheet, interactSheet;
      uniform vec4 frameBoxes[${crops.length}];
      uniform vec3 frameEyes[${crops.length}];
      uniform float weights[${crops.length}], time;
      uniform vec3 eyes, sceneLight;
      varying vec2 spriteUV;
      vec4 readFrame(int index, vec2 point) {
        vec4 box = frameBoxes[index];
        vec2 uv = box.xy + clamp(point, .001, .999) * box.zw;
        vec4 color;
        if (index < 3) color = texture2D(walkSheet, uv);
        else if (index < 9) color = texture2D(jumpSheet, uv);
        else color = texture2D(interactSheet, uv);
        // Recover the straight paint color after alpha-weighted mip filtering.
        color.rgb /= max(color.a, .002);
        return color;
      }
      float align(float x, float left, float right, float sourceLeft, float sourceRight) {
        if (x < left) return x * sourceLeft / left;
        if (x > right) return mix(sourceRight, 1., (x - right) / (1. - right));
        return mix(sourceLeft, sourceRight, (x - left) / (right - left));
      }
      void main() {
        vec4 result = vec4(0.);
        const vec3 luminance = vec3(.2126, .7152, .0722);
        vec3 reflectedLight = sceneLight / max(.01, dot(sceneLight, luminance));
        // The paint moves slowly behind the anchored eyes and silhouette.
        vec2 flow = .028 * vec2(
          sin(6.8 * spriteUV.y - 3.2 * spriteUV.x - time * .82),
          cos(5.1 * spriteUV.x + 4.6 * spriteUV.y + time * .67));
        for (int i = 0; i < ${crops.length}; i++) {
          if (weights[i] < .001) continue;
          vec3 local = frameEyes[i];
          vec2 q = vec2(
            align(spriteUV.x, eyes.x, eyes.y, local.x, local.y),
            spriteUV.y < eyes.z ? spriteUV.y * local.z / eyes.z :
              mix(local.z, 1., (spriteUV.y - eyes.z) / (1. - eyes.z)));
          vec4 color = readFrame(i, q);
          vec4 shifted = readFrame(i, q + flow);
          float edge = min(min(q.x, 1. - q.x), min(q.y, 1. - q.y));
          float eyeDist = length(vec2(
            min(abs(q.x - local.x), abs(q.x - local.y)) / .10, (q.y - local.z) / .145));
          float painted = smoothstep(.45, 1.15, eyeDist) * smoothstep(.025, .13, edge) *
            smoothstep(.93, .999, color.a * shifted.a);
          color.rgb = mix(color.rgb, shifted.rgb, .53 * painted);
          color.rgb *= mix(vec3(1.), vec3(1. + .05 * sin(time * 1.0 + 6. * q.x),
            1. + .03 * cos(time * .74 - 5. * q.y), 1. - .055 * sin(time * 1.0 + 6. * q.x)), painted);
          vec3 linearColor = sRGBTransferEOTF(vec4(clamp(color.rgb, 0., 1.), 1.)).rgb;
          // The cool brushstrokes pick up nearby light while the eyes and edge keep their paint.
          float reflection = .16 * painted * smoothstep(.02, .23, color.b - min(color.r, color.g));
          linearColor = mix(linearColor, reflectedLight * dot(linearColor, luminance), reflection);
          result += vec4(linearColor * color.a, color.a) * weights[i];
        }
        if (result.a < .008) discard;
        gl_FragColor = vec4(result.rgb / result.a, .90 * result.a);
        #include <colorspace_fragment>
      }`,
  });
  const object = new THREE.Group();
  const glow = {
    color: sceneLight,
    breath: { value: 1 },
  };
  const aura = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShaderMaterial({
    uniforms: glow,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec2 lightOffset;
      void main() {
        lightOffset = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float breath;
      varying vec2 lightOffset;
      void main() {
        float radiusSquared = dot(lightOffset, lightOffset);
        float innerLight = exp(-11. * radiusSquared);
        float outerLight = exp(-4.5 * radiusSquared);
        float fade = 1. - smoothstep(.25, .98, radiusSquared);
        float alpha = (.14 * innerLight + .11 * outerLight) * fade * breath;
        gl_FragColor = vec4(mix(color, vec3(1., .91, .81), .18 * innerLight), alpha);
        #include <colorspace_fragment>
      }`,
  }));
  aura.position.z = .85;
  aura.renderOrder = 1;
  object.add(aura);

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, .5, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, -radius, 1);
  mesh.scale.set(authored[idle].width, authored[idle].height, 1);
  mesh.renderOrder = 3;
  object.add(mesh);
  scene.add(object);
  function positionGlow(pulse = 1) {
    const spread = authored[idle].width * 3.1 * pulse;
    aura.scale.set(spread, spread, 1);
    aura.position.y = mesh.position.y + mesh.scale.y * .51;
  }
  positionGlow();

  let action = '', age = 0, airborneJump = false, landing = 0, lean = 0;
  let state = 'idle';
  function select(next) {
    action = next;
    age = 0;
  }
  function pair(from, to, fraction) {
    const t = clamp(fraction, 0, 1), ease = t * t * (3 - 2 * t);
    desired[from] += 1 - ease;
    desired[to] += ease;
  }
  function sequence(frames, time) {
    for (let i = 1; i < frames.length; i++) {
      const [end, to] = frames[i];
      if (time <= end) {
        const [start, from] = frames[i - 1];
        pair(from, to, (time - start) / (end - start));
        return;
      }
    }
    desired[frames.at(-1)[1]] = 1;
  }

  return {
    object,
    get state() { return state; },
    anticipateJump(isAir) {
      airborneJump = isAir;
      select('anticipate');
    },
    cancelAnticipation() {
      if (action === 'anticipate') select('');
    },
    jump(isAir) {
      airborneJump = isAir;
      select('jump');
    },
    land(strength = .65) {
      landing = clamp(strength, 0, 1);
      if (action !== 'interact') select('land');
    },
    interact() { select('interact'); },
    reset() {
      select('');
      weights.fill(0);
      weights[idle] = 1;
      eyes.copy(authored[idle].eyes);
      uniforms.time.value = 0;
      state = 'idle';
      lean = 0;
      mesh.scale.set(authored[idle].width, authored[idle].height, 1);
      mesh.position.y = -radius;
      mesh.rotation.z = 0;
      glow.breath.value = 1;
      positionGlow();
    },
    update(dt, { direction = 0, grounded = true, verticalSpeed = 0, glowColor, glowStrength = 1 }) {
      age += dt;
      uniforms.time.value += dt;
      if ((action === 'land' && age >= .16) || (action === 'interact' && age >= .49)) {
        select('');
      }
      const moving = grounded && Math.abs(direction) > .05;
      const walkPose = moving ? direction < 0 ? 0 : 2 : idle;
      const walkState = moving ? direction < 0 ? 'walk-left' : 'walk-right' : 'idle';
      desired.fill(0);
      let stretch = 1;
      if (action === 'anticipate') {
        state = airborneJump ? 'anticipate-double-jump' : 'anticipate-jump';
        pair(airborneJump ? 6 : walkPose, compress, age / .042);
      } else if (action === 'interact') {
        state = 'interact';
        sequence(interactFrames, age);
        // The source's deepest squash is softened for an interaction.
        stretch += .21 * desired[10];
      } else if (action === 'land' && grounded) {
        state = 'land';
        pair(impact, walkPose, age / .16);
        stretch -= .10 * landing * (1 - age / .16);
      } else if (!grounded) {
        state = verticalSpeed < -.45 ? 'fall' : airborneJump ? 'double-jump' : 'jump';
        if (verticalSpeed < -.45 || action !== 'jump') desired[falling] = 1;
        else sequence(jumpFrames, age);
      } else {
        state = walkState;
        desired[walkPose] = 1;
      }

      const ease = 1 - Math.exp(-36 * dt);
      let width = 0, height = 0;
      eyes.set(0, 0, 0);
      for (let i = 0; i < weights.length; i++) {
        const weight = weights[i] = mix(weights[i], desired[i], ease);
        width += authored[i].width * weight;
        height += authored[i].height * weight;
        eyes.addScaledVector(authored[i].eyes, weight);
      }
      const time = uniforms.time.value;
      const bob = state.startsWith('walk') ? Math.sin(13 * time) : 0;
      const breathe = Math.sin(3.1 * time);
      const tilt = state.startsWith('walk') ? -.05 * Math.sign(direction) : 0;
      lean = mix(lean, tilt, 1 - Math.exp(-14 * dt));
      mesh.scale.set(width * (1 - .017 * breathe), height * stretch * (1 + .016 * breathe + .033 * bob), 1);
      mesh.position.y = -radius + .035 * Math.abs(bob);
      mesh.rotation.z = lean;
      if (glowColor) sceneLight.value.copy(glowColor);
      const pulse = state === 'idle' ? Math.sin(time * 2.4) : .28 * Math.sin(time * 2.4);
      glow.breath.value = glowStrength * (1 + .15 * pulse);
      positionGlow(1 + .055 * pulse);
    },
  };
}
