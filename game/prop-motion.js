import { worldAt } from './scenes.js?v=20261127c';
import { WORLD } from './world.js?v=20261123b';

const { ringRadius, totalLength } = WORLD;
const pathSpeed = 8.5, orbitSpeed = .85;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrap = s => s >= 0 && s < totalLength ? s : ((s % totalLength) + totalLength) % totalLength;
export const MOTION_POINT_LIMIT = 32;

function normalizePoint(point) {
  if (Number.isFinite(point?.s) && Number.isFinite(point.h)) {
    return { s: wrap(point.s), h: clamp(point.h, 1 - ringRadius, 128) };
  }
}

export function normalizeMotion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const pivot = normalizePoint(value.pivot);
  const path = Array.isArray(value.path)
    ? value.path.slice(0, MOTION_POINT_LIMIT).map(normalizePoint).filter(Boolean) : [];
  return { ...(pivot && { pivot }), ...(path.length && { path }) };
}

function poseAt(s, h) {
  const point = worldAt(wrap(s), h);
  return { s: point.s, h, x: point.x, y: point.y, turn: 0 };
}

function worldPose(x, y, fallbackS, turn = 0) {
  const radius = Math.hypot(x, y);
  return { s: radius > 1e-7 ? wrap(Math.atan2(x, y) * ringRadius) : fallbackS,
    h: radius - ringRadius, x, y, turn };
}

function tangent(nodes, index, axis) {
  const point = nodes[index], before = nodes[index - 1] ?? point, after = nodes[index + 1] ?? point;
  const slope = (after[axis] - before[axis]) / (after.distance - before.distance);
  if (before === point || after === point) return slope;
  const incoming = (point[axis] - before[axis]) / (point.distance - before.distance);
  const outgoing = (after[axis] - point[axis]) / (after.distance - point.distance);
  return incoming * outgoing > 0
    ? Math.sign(slope) * Math.min(Math.abs(slope), 2 * Math.abs(incoming), 2 * Math.abs(outgoing)) : 0;
}

export function sampleMotionPath(path) {
  const points = normalizeMotion({ path }).path ?? [];
  if (!points.length) return [];
  const nodes = [{ ...points[0], distance: 0, wrappedS: points[0].s }];
  for (let i = 1; i < points.length; i++) {
    const from = nodes.at(-1), to = points[i];
    const span = to.s - from.wrappedS;
    const ds = span - totalLength * Math.round(span / totalLength);
    const spanLength = Math.hypot(ds, to.h - from.h);
    if (spanLength > 1e-8) nodes.push({ s: from.s + ds, h: to.h, wrappedS: to.s, distance: from.distance + spanLength });
  }

  // Interpolate every control point with shared, limited Hermite tangents.
  // Limiting each axis preserves bounds and prevents overshooting a tight turn.
  const samples = [poseAt(points[0].s, points[0].h)];
  for (let i = 1; i < nodes.length; i++) {
    const from = nodes[i - 1], to = nodes[i], span = to.distance - from.distance;
    const startS = span * tangent(nodes, i - 1, 's'), endS = span * tangent(nodes, i, 's');
    const startH = span * tangent(nodes, i - 1, 'h'), endH = span * tangent(nodes, i, 'h');
    const steps = Math.max(4, Math.ceil(span));
    for (let j = 1; j < steps; j++) {
      const t = j / steps, blend = t * t * (3 - 2 * t);
      const startWeight = t * (1 - t) ** 2, endWeight = -t * t * (1 - t);
      const s = from.s + (to.s - from.s) * blend + startS * startWeight + endS * endWeight;
      const h = from.h + (to.h - from.h) * blend + startH * startWeight + endH * endWeight;
      samples.push(poseAt(s, h));
    }
    samples.push(poseAt(to.wrappedS, to.h));
  }
  return samples;
}

export function createPropMotion({ s, h, interactive, motion }) {
  if (!interactive || !motion) return null;
  const origin = poseAt(s, h);
  const samples = motion.path ? sampleMotionPath([{ s, h }, ...motion.path.slice(1)]) : [];
  const state = { pose: origin };
  if (samples.length > 1) {
    state.mode = 'path';
    const distances = [0];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const length = distances.at(-1);
    let progress = 0, segment = 0;
    state.advance = (direction, dt) => {
      const next = clamp(progress + pathSpeed * direction * dt, 0, length);
      if (next === progress) return false;
      progress = next;
      while (progress > distances[segment + 1]) segment++;
      while (progress < distances[segment]) segment--;
      const a = samples[segment], b = samples[segment + 1];
      const t = (progress - distances[segment]) / (distances[segment + 1] - distances[segment]);
      if (t === 0) state.pose = a;
      else if (t === 1) state.pose = b;
      else state.pose = worldPose(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.s);
      return progress === length;
    };
    return state;
  }
  if (!motion.pivot) return null;
  state.mode = 'orbit';
  const pivot = poseAt(motion.pivot.s, motion.pivot.h);
  const dx = origin.x - pivot.x, dy = origin.y - pivot.y;
  let turn = 0;
  state.advance = (direction, dt) => {
    if (!direction) return false;
    turn = (turn + orbitSpeed * direction * dt) % (2 * Math.PI);
    const sin = Math.sin(turn), cos = Math.cos(turn);
    const x = pivot.x + cos * dx + sin * dy, y = pivot.y + cos * dy - sin * dx;
    // Orientation at the Cartesian center is arbitrary. Keep it finite even
    // if the authored orbit crosses the center of the world.
    state.pose = worldPose(x, y, state.pose.s, turn);
    return false;
  };
  return state;
}
