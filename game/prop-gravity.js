import { COLLIDERS } from './scenes.js?v=20261123b';
import { WORLD } from './world.js?v=20261123b';

const { ringRadius, totalLength } = WORLD;
const gravity = 30;
const voidDepth = -45;

function routeDelta(s, origin) {
  const delta = s - origin;
  return delta - totalLength * Math.round(delta / totalLength);
}

function routePoint({ x, y }) {
  return { s: Math.atan2(x, y) * ringRadius, h: Math.hypot(x, y) - ringRadius };
}

// Clip a swept point to an axis-aligned box in local route coordinates.
function crossesBox(x0, y0, x1, y1, halfWidth, halfHeight) {
  let enter = 0, leave = 1;
  for (const [start, end, halfSize] of [[x0, x1, halfWidth], [y0, y1, halfHeight]]) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(start) > halfSize) return false;
      continue;
    }
    const a = (-halfSize - start) / delta, b = (halfSize - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

function landingHeight(body) {
  const bottom = body.height - body.halfHeight;
  let highest = -Infinity;
  for (const segment of COLLIDERS) {
    const start = routeDelta(segment.s0, body.s);
    const span = segment.s1 - segment.s0;
    const end = start + span;
    if (end < -body.halfWidth - segment.radius || start > body.halfWidth + segment.radius) continue;

    const first = Math.hypot(segment.ax, segment.ay) - ringRadius;
    const last = Math.hypot(segment.bx, segment.by) - ringRadius;
    const contact = first < last ? Math.min(end, body.halfWidth) : Math.max(start, -body.halfWidth);
    const fraction = Math.min(1, Math.max(0, (contact - start) / span));
    const top = first + (last - first) * fraction + segment.radius;
    if (top <= bottom + .025) highest = Math.max(highest, top);
  }
  return highest + body.halfHeight;
}

export function createFallingProp({ s, h, width, height, fallZone }) {
  if (!fallZone || ![s, h, width, height, fallZone.s, fallZone.h, fallZone.width, fallZone.height].every(Number.isFinite) ||
    Math.min(width, height, fallZone.width, fallZone.height) <= 0) return null;

  return { s, height: h, halfWidth: width / 2, halfHeight: height / 2, zone: fallZone,
    speed: 0, floor: -Infinity, dropped: false, settled: false, gone: false, bounced: false, hit: false };
}

export function stepFallingProp(body, playerBefore, playerAfter, dt) {
  if (!body || body.settled || body.gone || !Number.isFinite(dt) || dt <= 0) return false;

  const from = routePoint(playerBefore), to = routePoint(playerAfter);
  const movement = routeDelta(to.s, from.s);
  if (!body.dropped) {
    const { s, h, width, height } = body.zone;
    const x = routeDelta(from.s, s);
    if (!crossesBox(x, from.h - h, x + movement, to.h - h, width / 2, height / 2)) return false;

    body.dropped = true;
    body.floor = landingHeight(body);
    if (body.floor >= body.height - 1e-4) {
      body.settled = true;
      return false;
    }
  }

  const startHeight = body.height;
  const nextHeight = startHeight + body.speed * dt - gravity * dt * dt / 2;
  body.speed -= gravity * dt;
  body.height = Math.max(nextHeight, body.floor);
  const landed = nextHeight <= body.floor && body.speed < 0;
  let hit = false;
  if (!body.hit) {
    const fraction = landed ? Math.min(1, (startHeight - body.floor) / (startHeight - nextHeight)) : 1;
    const x = routeDelta(from.s, body.s);
    const projectedRadius = WORLD.radius * ringRadius / (ringRadius + Math.max(voidDepth, Math.min(from.h, to.h)));
    hit = crossesBox(x, from.h - startHeight, x + movement * fraction,
      from.h + (to.h - from.h) * fraction - body.height,
      body.halfWidth + projectedRadius, body.halfHeight + WORLD.radius);
    body.hit = hit;
  }

  if (landed) {
    if (!body.bounced && body.speed < -5) {
      body.speed = Math.min(3.3, -body.speed * .23);
      body.bounced = true;
    } else {
      body.speed = 0;
      body.settled = true;
    }
  }
  body.gone = body.height + body.halfHeight < voidDepth;
  return hit;
}
