import { WORLD } from './world.js?v=20261123b';

const { totalLength } = WORLD;
const limits = { width: [.1, 48], height: [.08, 20] };
const defaultWidth = 3;
const defaultHeight = .45;
const limit = 128;
const wrap = s => s - Math.floor(s / totalLength) * totalLength;
const relativeTo = (s, origin) => {
  const delta = s - origin;
  return delta - Math.round(delta / totalLength) * totalLength;
};
const constrain = (dimension, size) => {
  const [min, max] = limits[dimension];
  return Math.round(Math.max(min, Math.min(max, size)) * 100) / 100;
};

export function createColliderEditor({ host, canvas, getPoint, t, hint, onChange, preview }) {
  host.innerHTML = `
    <div class="prop-editor-actions">
      <button type="button" data-action="add-block" aria-pressed="false">Add collision block</button>
      <button type="button" data-action="remove-block" data-text="Remove">Remove</button>
    </div>
    <label><span data-text="Placed block">Placed block</span><select name="collision-block"></select></label>
    <div class="prop-editor-block-sizes">
      <label><span data-text="Width">Width</span><input type="number" name="width" min="${limits.width[0]}" max="${limits.width[1]}" step=".01" data-aria="Collision block width"></label>
      <label><span data-text="Height">Height</span><input type="number" name="height" min="${limits.height[0]}" max="${limits.height[1]}" step=".01" data-aria="Collision block height"></label>
    </div>`;
  const addButton = host.querySelector('[data-action="add-block"]');
  const removeButton = host.querySelector('[data-action="remove-block"]');
  const choices = host.querySelector('[name="collision-block"]');
  const sizes = Object.keys(limits).map(dimension => ({ dimension, input: host.querySelector(`[name="${dimension}"]`) }));
  let blocks = [], selectedId = null, drag = null;
  let active = false, disabled = true, adding = false;

  function render() {
    const selected = blocks.find(block => block.id === selectedId);
    addButton.textContent = t(adding ? 'Cancel placement' : 'Add collision block');
    addButton.setAttribute('aria-pressed', String(adding));
    addButton.disabled = disabled || blocks.length >= limit;
    removeButton.disabled = disabled || !selected;
    const empty = new Option(t(blocks.length ? 'Select a block' : 'No blocks placed'), '');
    empty.disabled = true;
    choices.replaceChildren(empty, ...blocks.map(({ id }, index) =>
      new Option(`${t('Collision block')} ${index + 1}`, id)));
    choices.value = selectedId ?? '';
    choices.disabled = disabled || !blocks.length;
    for (const { dimension, input } of sizes) {
      input.value = selected?.[dimension] ?? '';
      input.disabled = disabled || !selected;
    }
  }

  function renderPreview() {
    if (!active) {
      preview(null);
      return;
    }
    const draft = drag?.draft;
    const shown = !draft ? blocks : drag.origin ? [...blocks, draft]
      : blocks.map(block => block.id === draft.id ? draft : block);
    preview({ blocks: shown, selectedId: draft?.id ?? selectedId });
  }

  function cancelDrag() {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    renderPreview();
  }

  function commit(next) {
    blocks = next;
    onChange(blocks);
    render();
    renderPreview();
  }

  addButton.addEventListener('click', () => {
    cancelDrag();
    adding = !adding;
    if (adding) selectedId = null;
    render();
    renderPreview();
    hint();
    canvas.focus({ preventScroll: true });
  });

  removeButton.addEventListener('click', () => {
    if (!selectedId) return;
    cancelDrag();
    const removedId = selectedId;
    selectedId = null;
    commit(blocks.filter(block => block.id !== removedId));
    hint('Removed. Save to keep this change.');
  });

  choices.addEventListener('change', () => {
    cancelDrag();
    selectedId = choices.value || null;
    adding = false;
    render();
    renderPreview();
    hint();
  });

  for (const { dimension, input } of sizes) {
    input.addEventListener('change', () => {
      const size = input.valueAsNumber;
      if (!Number.isFinite(size)) { render(); return; }
      const value = constrain(dimension, size);
      commit(blocks.map(block => block.id === selectedId ? { ...block, [dimension]: value } : block));
      hint('Block changed. Save to keep it.');
    });
  }

  function dragTo(point) {
    if (drag.origin) {
      const ds = relativeTo(point.s, drag.origin.s), dh = point.h - drag.origin.h;
      if (Math.max(Math.abs(ds), Math.abs(dh)) < .12) return { ...drag.start };
      const width = constrain('width', Math.abs(ds)), height = constrain('height', Math.abs(dh));
      return { id: drag.start.id, s: wrap(drag.origin.s + Math.sign(ds) * width / 2),
        h: drag.origin.h + Math.sign(dh) * height / 2, width, height };
    }
    return { ...drag.start, s: wrap(point.s + drag.s), h: point.h + drag.h };
  }

  canvas.addEventListener('pointerdown', event => {
    if (!active || disabled || event.button !== 0 || drag) return;
    const point = getPoint(event.clientX, event.clientY);
    if (!point) return;
    if (adding) {
      const start = { id: crypto.randomUUID(), s: point.s, h: point.h, width: defaultWidth, height: defaultHeight };
      drag = { pointerId: event.pointerId, origin: point, start, draft: start };
    } else {
      const hit = blocks.findLast(block => Math.abs(relativeTo(point.s, block.s)) <= block.width / 2 &&
        Math.abs(point.h - block.h) <= block.height / 2);
      selectedId = hit?.id ?? null;
      render();
      hint();
      if (hit) drag = { pointerId: event.pointerId, start: hit, s: relativeTo(hit.s, point.s), h: hit.h - point.h };
    }
    if (drag) canvas.setPointerCapture(event.pointerId);
    renderPreview();
  });

  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.pointerId) return;
    const point = getPoint(event.clientX, event.clientY);
    if (!point) return;
    drag.draft = dragTo(point);
    renderPreview();
  });

  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.pointerId) return;
    const point = getPoint(event.clientX, event.clientY);
    const next = point ? dragTo(point) : drag.draft ?? drag.start;
    const { origin, start } = drag;
    cancelDrag();
    if (!origin && Math.abs(relativeTo(next.s, start.s)) < 1e-6 && Math.abs(next.h - start.h) < 1e-6) return;
    adding = false;
    selectedId = next.id;
    commit(origin ? [...blocks, next] : blocks.map(block => block.id === next.id ? next : block));
    hint('Block changed. Save to keep it.');
  });

  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      if (event.pointerId === drag?.pointerId) cancelDrag();
    });
  }
  window.addEventListener('blur', cancelDrag);

  return {
    hint() {
      if (adding) return 'Click to place a block or drag out its size.';
      if (selectedId) return 'Drag the block to move it. Edit its width and height here.';
      return 'Add a collision block or select one in the scene.';
    },
    render,
    setState(next) {
      if (active === next.active && disabled === next.disabled) return;
      active = next.active;
      disabled = next.disabled;
      if (!active || disabled) {
        adding = false;
        cancelDrag();
      }
      render();
      renderPreview();
    },
    setBlocks(next) {
      blocks = next;
      if (!blocks.some(block => block.id === selectedId)) selectedId = null;
      render();
      renderPreview();
    },
  };
}
