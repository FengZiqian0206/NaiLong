import { MOTION_POINT_LIMIT } from './prop-motion.js?v=20261127e';
import { WORLD } from './world.js?v=20261123b';

const totalLength = WORLD.totalLength;

function isNewPoint(previous, point) {
  const delta = Math.abs(previous.s - point.s);
  return Math.hypot(Math.min(delta, totalLength - delta), previous.h - point.h) >= .05;
}

export function createMovementEditor({ host, t, preview, change, start, hint }) {
  host.innerHTML = `
    <label class="prop-editor-motion-toggle"><input type="checkbox" name="motion"><span data-text="Moving object">Moving object</span></label>
    <div class="prop-editor-actions" data-motion-panel="pivot">
      <button type="button" data-motion="pivot" aria-pressed="false"></button>
      <button type="button" data-motion="clear-pivot" data-text="Clear pivot">Clear pivot</button>
    </div>
    <div class="prop-editor-actions" data-motion-panel="path">
      <button type="button" data-motion="path"></button>
      <button type="button" data-motion="clear-path" data-text="Clear path">Clear path</button>
    </div>
    <div class="prop-editor-actions" data-motion-panel="finish" hidden>
      <button type="button" data-motion="finish" data-text="Finish path">Finish path</button>
      <button type="button" data-motion="undo" data-text="Undo point">Undo point</button>
      <button type="button" data-motion="cancel" data-text="Cancel">Cancel</button>
    </div>`;
  const toggle = host.querySelector('[name=motion]');
  const action = name => host.querySelector(`[data-motion="${name}"]`);
  const panel = name => host.querySelector(`[data-motion-panel="${name}"]`);
  const pivot = action('pivot');
  const clearPivot = action('clear-pivot');
  const drawPath = action('path');
  const clearPath = action('clear-path');
  const finish = action('finish');
  const undo = action('undo');
  const cancelButton = action('cancel');
  let prop = null, mode = null, path = [], hoverPoint = null, disabled = true;

  function showPreview() {
    if (!prop?.motion) { preview(null); return; }
    if (mode !== 'path') { preview(prop); return; }
    const points = hoverPoint && path.length < MOTION_POINT_LIMIT && isNewPoint(path.at(-1), hoverPoint)
      ? [...path, hoverPoint] : path;
    preview({ ...prop, motion: { ...prop.motion, path: points } });
  }

  function render() {
    const moving = Boolean(prop?.motion);
    const drawing = mode === 'path';
    toggle.checked = moving;
    toggle.disabled = !prop || disabled || mode !== null;
    panel('pivot').hidden = !moving || drawing;
    panel('path').hidden = !moving || mode !== null;
    panel('finish').hidden = !moving || !drawing;
    pivot.textContent = t(mode === 'pivot' ? 'Cancel pivot' : prop?.motion?.pivot ? 'Move pivot' : 'Set pivot');
    pivot.setAttribute('aria-pressed', String(mode === 'pivot'));
    clearPivot.hidden = !prop?.motion?.pivot || mode !== null;
    drawPath.textContent = t(prop?.motion?.path?.length ? 'Redraw path' : 'Draw path');
    clearPath.hidden = !prop?.motion?.path?.length;
    pivot.disabled = clearPivot.disabled = drawPath.disabled = clearPath.disabled = cancelButton.disabled = disabled;
    finish.disabled = undo.disabled = disabled || path.length < 2;
    showPreview();
  }

  function cancel() {
    mode = null;
    path = [];
    hoverPoint = null;
  }

  function saveMotion(patch, message) {
    cancel();
    const motion = { ...prop.motion, ...patch };
    if (!motion.pivot) delete motion.pivot;
    if (!motion.path) delete motion.path;
    change(motion, message);
  }

  toggle.addEventListener('change', () => {
    change(toggle.checked ? {} : null, toggle.checked ? 'Moving object enabled. Save to keep it.' : 'Moving object disabled. Save to keep it.');
  });
  pivot.addEventListener('click', () => {
    mode = mode === 'pivot' ? null : 'pivot';
    start(Boolean(mode));
  });
  drawPath.addEventListener('click', () => {
    mode = 'path';
    path = [{ s: prop.s, h: prop.h }];
    start(true);
  });
  clearPivot.addEventListener('click', () => saveMotion({ pivot: null }, 'Pivot cleared. Save to keep it.'));
  clearPath.addEventListener('click', () => saveMotion({ path: null }, 'Path cleared. Save to keep it.'));
  finish.addEventListener('click', () => saveMotion({ path }, 'Path set. Save to keep it.'));
  undo.addEventListener('click', () => {
    path = path.slice(0, -1);
    render();
    hint();
  });
  cancelButton.addEventListener('click', () => {
    cancel();
    start(false);
  });

  return {
    get mode() { return mode; },
    cancel,
    setState(nextProp, nextDisabled) {
      if (!nextProp?.motion || prop?.id !== nextProp.id) cancel();
      prop = nextProp;
      disabled = nextDisabled;
      render();
    },
    hint() {
      if (mode === 'pivot') return 'Click the scene to place the pivot.';
      if (mode === 'path') return path.length >= MOTION_POINT_LIMIT
        ? 'Point limit reached. Finish the path or undo a point.' : 'Click to add curve points. Finish to set the exit.';
      return null;
    },
    place(point) {
      if (mode === 'pivot') saveMotion({ pivot: point }, 'Pivot set. Save to keep it.');
      if (mode !== 'path' || path.length >= MOTION_POINT_LIMIT || !isNewPoint(path.at(-1), point)) return;
      path = [...path, point];
      hoverPoint = null;
      render();
      hint();
    },
    hover(point) {
      hoverPoint = point;
      showPreview();
    },
  };
}
