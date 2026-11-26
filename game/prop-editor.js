const MIN_SIZE = 0.35;
const MAX_SIZE = 18;
const DEFAULT_WIDTH = 2.8;
const STORE = 'placed-props';

function openPropStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nailong-local-editor', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Another tab is blocking access to saved props.'));
  });
}

async function usePropStorage(database, mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let result;
    transaction.oncomplete = () => resolve(result?.result);
    transaction.onabort = () => reject(transaction.error);
    try {
      result = operation(transaction.objectStore(STORE));
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export function createPropEditor({
  root, canvas, getPoint, addProp, pickProp, editProp, removeProp, selectProp, restoreProps, clearInput,
}) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./prop-editor.css?v=20261126', import.meta.url);
  document.head.append(stylesheet);

  const panel = document.createElement('section');
  panel.className = 'prop-editor';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'prop-editor-title');
  panel.innerHTML = `
    <header>
      <h2 id="prop-editor-title">Prop editor</h2>
      <button type="button" data-action="close">Close</button>
    </header>
    <div class="prop-editor-actions">
      <button type="button" data-action="file">Add PNG</button>
      <button type="button" data-action="save" disabled>Save locally</button>
      <input type="file" accept="image/png,.png" hidden>
    </div>
    <label>Placed object
      <select name="prop" disabled></select>
    </label>
    <div class="prop-editor-properties">
      <div>
        <label for="prop-width">Width</label> <output for="prop-width" aria-hidden="true"></output>
        <input type="range" id="prop-width" min="${MIN_SIZE}" max="${MAX_SIZE}" step="0.05" aria-label="Object width" disabled>
      </div>
      <div>
        <label for="prop-height">Height</label> <output for="prop-height" aria-hidden="true"></output>
        <input type="range" id="prop-height" min="${MIN_SIZE}" max="${MAX_SIZE}" step="0.05" aria-label="Object height" disabled>
      </div>
    </div>
    <div class="prop-editor-options">
      <label>
        <input type="checkbox" name="interactive" checked disabled>
        Interactive
      </label>
      <button type="button" data-action="remove" disabled>Remove</button>
    </div>
    <p role="status" aria-live="polite">Loading saved objects…</p>`;
  root.append(panel);
  const button = (action) => panel.querySelector(`[data-action="${action}"]`);
  const fileButton = button('file');
  const saveButton = button('save');
  const removeButton = button('remove');
  const fileInput = panel.querySelector('input[type=file]');
  const interactiveInput = panel.querySelector('[name=interactive]');
  const sizeFields = ['width', 'height'].map(dimension => ({
    dimension,
    input: panel.querySelector(`#prop-${dimension}`),
    output: panel.querySelector(`output[for="prop-${dimension}"]`),
  }));
  const propList = panel.querySelector('select');
  const status = panel.querySelector('[role=status]');

  const definitions = new Map();
  const edits = new Map();
  const database = openPropStorage();
  let active = false, loaded = false, loadMessage = '', saving = false;
  let selectedId = null, pendingFile = null, drag = null, placing = false;

  function defaultHint() {
    if (pendingFile) return `Click the scene to place ${pendingFile.name}.`;
    if (selectedId) return 'Drag the object to move it.';
    return 'Choose a PNG, then click the scene to place it.';
  }
  const setHint = (message = defaultHint()) => { status.textContent = message; };
  const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
  function syncControls() {
    const selection = definitions.get(selectedId);
    propList.value = selectedId ?? '';
    propList.disabled = definitions.size === 0;
    removeButton.disabled = interactiveInput.disabled = !selection;
    interactiveInput.checked = selection?.interactive !== false;
    for (const { dimension, input, output } of sizeFields) {
      const size = selection?.[dimension];
      input.disabled = !selection;
      input.value = size ?? DEFAULT_WIDTH;
      output.value = Number.isFinite(size) ? Number(size.toFixed(2)).toString() : '';
    }
    fileButton.disabled = !loaded || placing;
    saveButton.disabled = !loaded || saving || !edits.size;
    button('close').disabled = saving;
    if (edits.size) window.addEventListener('beforeunload', beforeUnload);
    else window.removeEventListener('beforeunload', beforeUnload);
  }

  function listProps() {
    const empty = new Option(definitions.size ? 'Select an object' : 'No objects placed', '');
    empty.disabled = true;
    propList.replaceChildren(empty);
    for (const prop of definitions.values()) {
      propList.add(new Option(prop.name ?? 'PNG object', prop.id));
    }
    syncControls();
  }

  function select(id) {
    selectedId = definitions.has(id) ? id : null;
    selectProp(active ? selectedId : null);
    syncControls();
  }

  function changeProp(id, patch) {
    const previous = definitions.get(id);
    if (!previous || Object.keys(patch).every(key => previous[key] === patch[key])) return;
    const changed = editProp(id, patch);
    const definition = changed ? { ...previous, ...changed } : { ...previous, ...patch };
    definitions.set(id, definition);
    edits.set(id, definition);
    syncControls();
  }

  async function save() {
    if (saving || !edits.size) return;
    const changes = [...edits.entries()];
    saving = true;
    syncControls();
    setHint('Saving objects…');
    try {
      await usePropStorage(database, 'readwrite', (store) => {
        for (const [id, definition] of changes) {
          if (definition) store.put(definition);
          else store.delete(id);
        }
      });
      for (const [id, definition] of changes) {
        if (edits.get(id) === definition) edits.delete(id);
      }
      setHint(edits.size ? 'Saved. New edits are pending.' : 'Saved in this browser.');
    } catch {
      setHint('Could not save. Your edits are still open.');
    } finally {
      saving = false;
      syncControls();
    }
  }

  const stopDrag = () => {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  };

  function toggle() {
    if (saving) return;
    active = !active;
    panel.hidden = !active;
    canvas.classList.toggle('prop-editor-canvas', active);
    clearInput();
    stopDrag();
    if (!active) pendingFile = null;
    selectProp(active ? selectedId : null);
    if (active && loaded) {
      setHint(edits.size ? 'You have unsaved edits.' : loadMessage || defaultHint());
    }
    canvas.focus({ preventScroll: true });
  }

  async function place(file, { s, h }) {
    placing = true;
    syncControls();
    setHint('Preparing PNG…');
    try {
      const id = crypto.randomUUID();
      const input = { id, blob: file, name: file.name, s, h, width: DEFAULT_WIDTH, interactive: true };
      const placed = await addProp(input);
      if (!placed) throw new Error('Object placement failed.');
      const definition = { ...input, ...placed };
      definitions.set(id, definition);
      edits.set(id, definition);
      select(id);
      listProps();
      setHint('Drag to adjust the position, then save.');
    } catch (error) {
      setHint(error instanceof Error ? error.message : 'This PNG could not be placed.');
    } finally {
      placing = false;
      syncControls();
    }
  }

  fileButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file || !active) return;
    pendingFile = file;
    setHint();
    canvas.focus({ preventScroll: true });
  });
  saveButton.addEventListener('click', () => { void save(); });
  button('close').addEventListener('click', toggle);
  propList.addEventListener('change', () => {
    select(propList.value);
    setHint();
  });
  for (const { dimension, input } of sizeFields) {
    input.addEventListener('input', () => {
      changeProp(selectedId, { [dimension]: input.valueAsNumber });
      setHint();
    });
  }
  interactiveInput.addEventListener('change', () => {
    changeProp(selectedId, { interactive: interactiveInput.checked });
    setHint();
  });
  removeButton.addEventListener('click', () => {
    if (!selectedId) return;
    removeProp(selectedId);
    definitions.delete(selectedId);
    edits.set(selectedId, null);
    select(null);
    listProps();
    setHint('Removed. Save to keep this change.');
  });
  panel.addEventListener('focusin', clearInput);

  canvas.addEventListener('pointerdown', (event) => {
    if (!active || !loaded || placing || event.button !== 0) return;
    const point = getPoint(event.clientX, event.clientY);
    if (!point) return;
    if (pendingFile) {
      const file = pendingFile;
      pendingFile = null;
      void place(file, point);
      return;
    }
    const hit = pickProp(point);
    select(hit?.id);
    setHint();
    if (!selectedId) return;
    drag = { pointerId: event.pointerId, s: hit.s - point.s, h: hit.h - point.h };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag?.pointerId) return;
    const point = getPoint(event.clientX, event.clientY);
    if (point) changeProp(selectedId, { s: point.s + drag.s, h: point.h + drag.h });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === drag?.pointerId) stopDrag();
    });
  }
  window.addEventListener('blur', stopDrag);

  const ready = usePropStorage(database, 'readonly', (store) => store.getAll())
    .then(async (stored) => {
      const restored = await restoreProps(stored) ?? stored;
      for (const definition of restored) definitions.set(definition.id, definition);
      if (restored.length < stored.length) loadMessage = 'Some saved objects could not load.';
      setHint(loadMessage || defaultHint());
    })
    .catch(() => {
      loadMessage = 'Saved objects could not load.';
      setHint(loadMessage);
    })
    .finally(() => {
      loaded = true;
      listProps();
    });
  syncControls();
  return { get active() { return active; }, toggle, ready };
}
