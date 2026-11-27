import * as THREE from '../vendor/three.module.min.js';

const loudness = { step: .38, jump: .65, doubleJump: .63, land: .76, interact: .52 };
const durations = { step: .13, jump: .25, doubleJump: .3, land: .24, interact: .48 };
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const tau = 2 * Math.PI;

// Original short cues. Filtered noise gives footsteps and landings a soft
// contact sound; the spring and chime share a gentler, pitched palette.
function synthesize(context, kind) {
  const duration = durations[kind];
  const size = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, size, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 92137, low = 0, scrape = 0, phase = 0;
  for (let i = 0; i < size; i++) {
    const t = i / context.sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += (noise - low) * .045;
    scrape += (noise - scrape) * .16;
    let wave;
    if (kind === 'step' || kind === 'land') {
      const land = kind === 'land';
      phase += tau * ((land ? 92 : 137) + 74 * Math.exp(-t * 65)) / context.sampleRate;
      const thump = Math.sin(phase) * Math.exp(-t * (land ? 34 : 51));
      const grit = (.65 * low + .46 * (scrape - low)) * Math.exp(-t * (land ? 16 : 32));
      wave = thump * (land ? .48 : .28) + grit * 1.2;
    } else if (kind === 'interact') {
      wave = 0;
      // Each strike has a short, rounded attack and a quickly fading bell overtone.
      const notes = [587.33, 739.99, 880];
      for (let note = 0; note < notes.length; note++) {
        const d = t - note * .037;
        if (d < 0) continue;
        const p = tau * notes[note] * d;
        wave += Math.min(1, d / .008) * Math.exp(-d * 15) *
          (.25 * Math.sin(p) + .07 * Math.sin(p * 2.76) * Math.exp(-d * 21));
      }
    } else {
      const second = kind === 'doubleJump';
      const sweep = 1 - Math.exp(-t * (second ? 17 : 13));
      const hz = (second ? 385 : 218) + (second ? 490 : 310) * sweep;
      phase += tau * hz / context.sampleRate;
      wave = (.43 * Math.sin(phase + .63 * Math.sin(phase * 1.72) * Math.exp(-t * 23)) +
        .14 * scrape) * Math.exp(-t * (second ? 16 : 20));
      if (second) wave += .105 * Math.sin(phase * 2.02) * Math.exp(-t * 11);
    }
    samples[i] = wave * Math.min(1, t / .004, (duration - t) / .021);
  }
  return buffer;
}

function createSound() {
  let context, master, resuming, pending, blocked = false, lastAudio = null;
  const sources = new Map();
  const buffers = new Map();
  const counts = {};
  function play(kind, strength) {
    if (context?.state !== 'running') {
      // A first keypress can trigger a cue before resume() resolves.
      if (resuming) pending = { kind, strength, until: performance.now() + 250 };
      return;
    }
    if (sources.size >= 12) return;
    if (!buffers.has(kind)) buffers.set(kind, synthesize(context, kind));
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffers.get(kind);
    const variation = [1, .91, 1.08, .97][(counts[kind] ?? 0) % 4];
    source.playbackRate.value = kind === 'step' ? variation : 1;
    gain.gain.value = loudness[kind] * strength;
    source.connect(gain);
    gain.connect(master);
    sources.set(source, gain);
    source.onended = () => release(source);
    source.start();
    counts[kind] = (counts[kind] ?? 0) + 1;
    lastAudio = kind;
  }
  function release(source) {
    const gain = sources.get(source);
    if (!gain) return;
    sources.delete(source);
    source.disconnect();
    gain.disconnect();
  }
  function flush() {
    const cue = pending;
    pending = null;
    if (cue && context?.state === 'running' && performance.now() <= cue.until) play(cue.kind, cue.strength);
  }
  function unlock() {
    if (blocked) return;
    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = .34;
        master.connect(context.destination);
      }
      if (context.state === 'running') flush();
      else if (!resuming) {
        resuming = context.resume().then(() => {
          resuming = null;
          flush();
        }).catch(() => {
          resuming = null;
          pending = null;
        });
      }
    } catch {
      blocked = true;
    }
  }
  return {
    unlock,
    play(kind, strength) {
      try { play(kind, strength); } catch { /* A failed audio cue cannot block controls. */ }
    },
    reset() {
      pending = null;
      for (const source of sources.keys()) {
        try { source.stop(); } catch { /* It may have ended already. */ }
        release(source);
      }
    },
    get diagnostics() {
      return { audioState: context?.state ?? (blocked ? 'unavailable' : 'locked'),
        audioCues: { ...counts }, lastAudio };
    },
  };
}

const sand = new THREE.Color('#e9d6bc');
const cream = new THREE.Color('#fff4d8');
const defaultGlow = new THREE.Color('#ffc7a2');

export function createFeedback(scene, radius) {
  const sound = createSound();
  const capacity = 112, slots = Array.from({ length: capacity }, () => ({ life: 0, tint: new THREE.Color() }));
  const positions = new Float32Array(capacity * 12);
  const colors = new Float32Array(capacity * 12);
  const opacity = new Float32Array(capacity * 4);
  const shape = new Float32Array(capacity * 4);
  const uv = new Float32Array(capacity * 8);
  const indices = new Uint16Array(capacity * 6);
  for (let i = 0; i < capacity; i++) {
    const v = i * 4;
    uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const [name, array, size] of [
    ['position', positions, 3], ['tint', colors, 3], ['opacity', opacity, 1], ['shape', shape, 1],
  ]) geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 tint;
      attribute float opacity, shape;
      varying vec2 localUV;
      varying vec3 rgb;
      varying float alpha, form;
      void main() {
        localUV=uv*2.-1.; rgb=tint; alpha=opacity; form=shape;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      varying vec2 localUV;
      varying vec3 rgb;
      varying float alpha, form;
      void main() {
        vec2 p=abs(localUV);
        float r=length(p);
        float a=1.-smoothstep(.43,1.,r);
        vec3 color=rgb;
        if(form<.5) color*=mix(.38,1.,1.-smoothstep(.56,.87,r));
        if(form>.5) {
          a=max(.52*(1.-smoothstep(.14,.87,r)),
                (1.-smoothstep(.41,.96,p.x+p.y))*(1.-smoothstep(.13,.51,min(p.x,p.y))));
        }
        if(form>1.5) {
          float outline=abs(r-.77);
          a=1.-smoothstep(.072,.205,outline);
          color*=mix(.31,1.,1.-smoothstep(.085,.158,outline));
        }
        if(form>3.5) {
          a=(1.-smoothstep(.25,1.,p.x))*(1.-smoothstep(.43,1.,p.y));
          color*=mix(.29,1.,1.-smoothstep(.34,.68,p.y));
        }
        if(form>4.5) {
          a=.49*(1.-smoothstep(.16,1.,r))+.51*(1.-smoothstep(.12,.45,r));
          color=rgb;
        }
        if(form>5.5) {
          float rays=1.-smoothstep(.35,1.,p.x+p.y+4.*min(p.x,p.y));
          a=max(a*.62,rays);
        }
        gl_FragColor=vec4(color,a*alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  scene.add(mesh);

  const glow = defaultGlow.clone(), lightGlow = new THREE.Color(), dustGlow = new THREE.Color();
  function setGlowColor(color) {
    glow.copy(color);
    lightGlow.copy(glow).lerp(cream, .46);
    dustGlow.copy(sand).lerp(glow, .59);
  }
  setGlowColor(defaultGlow);
  let next = 0, live = 0, idleLive = 0, idleWait = .45;
  let seed = 0x1539ed, lastCue = null, trailDirection = 0;
  const cues = {};
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function particle(player, x, y, vx, vy, width, life, type, tint, alpha, growth) {
    const item = slots[next];
    next = (next + 1) % slots.length;
    Object.assign(item, { life, age: 0, nx: player.nx, ny: player.ny,
      x: player.x + player.ny * x + player.nx * y,
      y: player.y - player.nx * x + player.ny * y, vx, vy, width, type, alpha, growth });
    item.tint.copy(tint);
  }
  function dust(player, foot, count, strength, spreading, direction) {
    for (let i = 0; i < count; i++) {
      const side = direction || (i % 2 === 0 ? 1 : -1);
      const speed = (1.25 + random() * (spreading ? 4.5 : 2.35)) * strength;
      particle(player, side * (.23 + random() * .56), foot, side * speed, .25 + random() * 1.0,
        (spreading ? .30 : .21) + random() * .20, spreading ? .45 + random() * .23 : .42 + random() * .15,
        0, i % 3 === 0 ? lightGlow : dustGlow, spreading ? .9 : .75, spreading ? 1.65 : 1.3);
    }
  }
  function scatter(player, origin, count, strength) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * tau + random() * .31;
      const cx = Math.cos(angle), cy = Math.sin(angle);
      particle(player, cx * .32, origin + cy * .30,
        cx * (1.4 + random() * 2.7) * strength, cy * (1.1 + random() * 2.8) * strength,
        .13 + random() * .11, .36 + random() * .24, 1, i % 3 === 0 ? glow : lightGlow, .97, -.42);
    }
  }
  function emit(kind, player, strength = 1) {
    if (!Object.hasOwn(loudness, kind)) return;
    strength = clamp(strength, .2, 1.2);
    lastCue = kind;
    cues[kind] = (cues[kind] ?? 0) + 1;
    sound.play(kind, strength);
    const foot = -radius + .08;
    if (kind === 'step') {
      const motion = player.vx * player.ny - player.vy * player.nx;
      trailDirection = Math.sign(motion) || 1;
      const behind = -trailDirection;
      const speed = Math.hypot(player.vx, player.vy);
      // Grounded movement already follows the supporting surface. Use its
      // tangent so a trail lies along a slope as well as on a flat path.
      const contact = speed > .7 && Math.abs(motion) > speed * .5
        ? { x: player.x, y: player.y, nx: -trailDirection * player.vy / speed, ny: trailDirection * player.vx / speed }
        : player;
      particle(contact, behind * 1.03, foot + .08, behind * 1.8, .04, 1.12, .42, 4, lightGlow, .96, .54);
      particle(contact, behind * 1.24, foot + .27, behind * 2.10, .11, .84, .37, 4, glow, .84, .45);
      dust(contact, foot, 4, strength, false, behind);
      particle(contact, behind * .64, foot + .18, behind * 3.1, .86, .151, .46, 1, cream, .93, -.42);
      particle(contact, behind * 1.03, foot + .32, behind * 2.9, .62, .109, .4, 1, glow, .91, -.37);
    } else if (kind === 'land') {
      particle(player, 0, foot, 0, .09, .90 + strength * .24, .39, 3, lightGlow, .92, 1.57);
      dust(player, foot, 14, strength, true, 0);
      for (let i = 0; i < 5; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        particle(player, side * (.46 + random() * .45), foot + .17,
          side * (2.1 + random() * 2.27), .85 + random() * 2.04, .135 + random() * .05,
          .39 + random() * .18, 1, lightGlow, .93, -.42);
      }
    } else if (kind === 'jump') {
      particle(player, 0, foot + .12, 0, .20, .89, .36, 3, lightGlow, .95, 1.53);
      dust(player, foot, 5, .84, true, 0);
      for (let i = 0; i < 10; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        particle(player, side * (.18 + random() * .39), foot + .25, side * (1.55 + random() * 2.7),
          .5 + random() * 2.7, .13 + random() * .10, .4 + random() * .21,
          1, i % 3 === 0 ? glow : lightGlow, .96, -.39);
      }
    } else {
      const interact = kind === 'interact';
      const origin = interact ? .08 : -radius * .45;
      particle(player, 0, origin, 0, .12, interact ? .69 : .85, .44, 2, glow, .88, 1.9);
      if (!interact) particle(player, 0, origin, 0, .2, .53, .36, 2, lightGlow, .85, 1.95);
      scatter(player, origin, interact ? 9 : 15, interact ? .75 : 1.12);
    }
  }
  function update(dt, { player, idle, glowColor } = {}) {
    if (glowColor) setGlowColor(glowColor);
    if (player && !player.falling) {
      idleWait -= dt;
      if (idleWait <= 0) {
        const side = random() < .5 ? -1 : 1;
        const spark = random() < .28;
        const travel = player.vx * player.ny - player.vy * player.nx;
        particle(player, side * (.34 + random() * .62), -.32 + random() * 1.12,
          side * (.17 + random() * .25) + travel * .19, .42 + random() * .35,
          .115 + random() * .11, (idle ? 2.15 : 1.3) + random() * .55,
          spark ? 6 : 5, random() < .43 ? lightGlow : glow, .96, -.16);
        idleWait += (idle ? .21 : .31) + random() * .11;
      }
    } else {
      idleWait = .45;
    }
    live = 0;
    idleLive = 0;
    for (const item of slots) {
      if (!item.life) continue;
      item.age += dt;
      if (item.age >= item.life) { item.life = 0; continue; }
      const f = item.age / item.life;
      const { nx, ny, type, age, tint } = item;
      const mote = type >= 5;
      const drift = mote ? Math.sin(age * 3.5 + item.x) * age * .11 : 0;
      const side = item.vx * age * (1 - .2 * f) + drift;
      const height = item.vy * age - (type === 1 ? .39 * age * age : 0);
      const x = item.x + side * ny + height * nx;
      const y = item.y - side * nx + height * ny;
      const width = item.width * (1 + item.growth * f);
      const tall = width * (type === 0 ? .67 : type === 3 ? .34 : type === 4 ? .19 : 1);
      const entrance = mote ? Math.min(1, f * 8) : 1;
      const twinkle = type === 6 ? .79 + .21 * Math.sin(age * 8 + item.x) : 1;
      const a = item.alpha * entrance * twinkle * (1 - f) ** (type === 0 ? 1.35 : .88);
      for (let corner = 0; corner < 4; corner++) {
        const v = live * 4 + corner;
        const dx = (corner % 2 === 0 ? -1 : 1) * width;
        const dy = (corner < 2 ? -1 : 1) * tall;
        positions[v * 3] = x + dx * ny + dy * nx;
        positions[v * 3 + 1] = y - dx * nx + dy * ny;
        positions[v * 3 + 2] = .86;
        colors[v * 3] = tint.r;
        colors[v * 3 + 1] = tint.g;
        colors[v * 3 + 2] = tint.b;
        opacity[v] = a;
        shape[v] = type;
      }
      live++;
      if (mote) idleLive++;
    }
    mesh.visible = live > 0;
    geometry.setDrawRange(0, live * 6);
    if (live > 0) for (const name of ['position', 'tint', 'opacity', 'shape']) geometry.attributes[name].needsUpdate = true;
  }
  return {
    emit, update, setGlowColor, unlock: sound.unlock,
    reset() {
      for (const item of slots) item.life = 0;
      trailDirection = 0;
      update(0);
      sound.reset();
    },
    get diagnostics() {
      return { lastCue, cues: { ...cues }, particles: live, idleParticles: idleLive, trailDirection,
        glowColor: '#' + glow.getHexString(), ...sound.diagnostics };
    },
  };
}
