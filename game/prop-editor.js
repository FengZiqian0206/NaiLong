const MIN_SIZE = 0.35;
const MAX_SIZE = 18;
const DEFAULT_WIDTH = 2.8;
const STORE = 'placed-props';
const POPUP_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const missingPopup = prop => prop?.interactive !== false && prop?.behavior === 'image' && !prop.popupImage;

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
  loadSharedProps, publishSharedProps,
}) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./prop-editor.css?v=20261126b', import.meta.url);
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
      <button type="button" data-action="global" disabled hidden aria-expanded="false">Save globally</button>
      <input type="file" name="sprite" accept="image/png,.png" hidden>
    </div>
    <form class="prop-editor-publish" hidden>
      <p>The layout and its images will be visible to everyone who opens the game.</p>
      <label>GitHub access token
        <input type="password" required autocomplete="off" spellcheck="false" autocapitalize="none">
      </label>
      <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token" target="_blank" rel="noopener noreferrer">Create a fine-grained token for NaiLong with Contents read and write.</a>
      <div class="prop-editor-actions">
        <button type="submit" data-action="publish">Publish layout</button>
        <button type="button" data-action="cancel-publish">Cancel</button>
      </div>
    </form>
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
    <div class="prop-editor-reaction" hidden>
      <label>On interaction
        <select name="behavior">
          <option value="bounce">Bounce</option>
          <option value="disappear">Disappear</option>
          <option value="image">Show image</option>
        </select>
      </label>
      <div class="prop-editor-popup-file" hidden>
        <button type="button" data-action="choose-popup">Choose image</button>
        <span aria-live="polite"></span>
        <input type="file" name="popup" accept="${POPUP_TYPES.join(',')}" hidden>
      </div>
    </div>
    <p role="status" aria-live="polite">Loading saved objects…</p>`;
  root.append(panel);
  const button = (action) => panel.querySelector(`[data-action="${action}"]`);
  const fileButton = button('file');
  const saveButton = button('save');
  const globalButton = button('global');
  const publishForm = panel.querySelector('.prop-editor-publish');
  const tokenInput = publishForm.querySelector('input');
  const removeButton = button('remove');
  const fileInput = panel.querySelector('[name=sprite]');
  const interactiveInput = panel.querySelector('[name=interactive]');
  const reaction = panel.querySelector('.prop-editor-reaction');
  const behaviorInput = panel.querySelector('[name=behavior]');
  const popupRow = panel.querySelector('.prop-editor-popup-file');
  const popupInput = panel.querySelector('[name=popup]');
  const popupButton = button('choose-popup');
  const popupFileName = popupRow.querySelector('span');
  const sizeFields = ['width', 'height'].map(dimension => ({
    dimension,
    input: panel.querySelector(`#prop-${dimension}`),
    output: panel.querySelector(`output[for="prop-${dimension}"]`),
  }));
  const propList = panel.querySelector('[name=prop]');
  const status = panel.querySelector('[role=status]');

  const definitions = new Map();
  const edits = new Map();
  const savedDrafts = new Map();
  const database = openPropStorage();
  let active = false, loaded = false, loadMessage = '', saving = false;
  let localLoaded = false, sharedLoaded = false, sharedRevision = null;
  let sharedIds = new Set();
  let selectedId = null, pendingFile = null, drag = null, placing = false;
  let popupTarget = null, preparingPopup = false;

  globalButton.hidden = !publishSharedProps;
  const hasMissingImage = objects => [...objects].some(missingPopup);
  function canPublish() {
    return Boolean(publishSharedProps) && sharedLoaded && loaded && !saving && !placing && !preparingPopup &&
      Boolean(edits.size || savedDrafts.size) && !hasMissingImage(definitions.values());
  }
  function defaultHint() {
    if (pendingFile) return `Click the scene to place ${pendingFile.name}.`;
    if (preparingPopup) return 'Checking popup image…';
    if (missingPopup(definitions.get(selectedId))) return 'Choose an image for this interaction.';
    if (hasMissingImage(definitions.values())) return 'An object needs a popup image before saving.';
    if (selectedId) return 'Drag the object to move it.';
    return 'Choose a PNG, then click the scene to place it.';
  }
  const setHint = (message = defaultHint()) => { status.textContent = message; };
  const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
  function syncControls() {
    const selection = definitions.get(selectedId);
    propList.value = selectedId ?? '';
    propList.disabled = saving || definitions.size === 0;
    removeButton.disabled = interactiveInput.disabled = saving || !selection;
    interactiveInput.checked = selection?.interactive !== false;
    reaction.hidden = !selection || !interactiveInput.checked;
    behaviorInput.value = selection?.behavior ?? 'bounce';
    behaviorInput.disabled = saving;
    popupRow.hidden = behaviorInput.value !== 'image';
    popupButton.disabled = saving || preparingPopup;
    popupFileName.textContent = selection?.popupImage ? selection.popupName || 'Image selected' : 'No image selected';
    for (const { dimension, input, output } of sizeFields) {
      const size = selection?.[dimension];
      input.disabled = saving || !selection;
      input.value = size ?? DEFAULT_WIDTH;
      output.value = Number.isFinite(size) ? Number(size.toFixed(2)).toString() : '';
    }
    fileButton.disabled = !loaded || saving || placing;
    saveButton.disabled = !localLoaded || !loaded || saving || preparingPopup || !edits.size || hasMissingImage(edits.values());
    globalButton.disabled = button('publish').disabled = !canPublish();
    button('cancel-publish').disabled = saving;
    tokenInput.disabled = saving;
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
    if (saveButton.disabled) return;
    const changes = [...edits.entries()];
    const drafts = changes.map(([id, definition]) => {
      if (!definition && !sharedIds.has(id)) return [id, null];
      const value = definition ?? { id, deleted: true };
      return [id, { ...value, draftVersion: crypto.randomUUID() }];
    });
    saving = true;
    stopDrag();
    syncControls();
    setHint('Saving objects…');
    try {
      await usePropStorage(database, 'readwrite', (store) => {
        for (const [id, draft] of drafts) {
          if (draft) store.put(draft);
          else store.delete(id);
        }
      });
      for (const [id, draft] of drafts) {
        if (draft) savedDrafts.set(id, draft.draftVersion);
        else savedDrafts.delete(id);
      }
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

  function showPublishForm(open) {
    publishForm.hidden = !open;
    globalButton.setAttribute('aria-expanded', String(open));
    if (open) tokenInput.focus();
    else tokenInput.value = '';
  }

  async function publish(event) {
    event.preventDefault();
    const token = tokenInput.value.trim();
    tokenInput.value = '';
    if (!token || !canPublish()) return;
    const layout = [...definitions.values()];
    const draftSnapshot = new Map(savedDrafts);
    saving = true;
    stopDrag();
    syncControls();
    setHint('Publishing layout…');
    try {
      const published = await publishSharedProps(layout, sharedRevision, token);
      sharedRevision = published.revision;
      sharedIds = new Set(published.props.map(prop => prop.id));
      edits.clear();
      showPublishForm(false);
      try {
        if (draftSnapshot.size) await usePropStorage(database, 'readwrite', (store) => {
          for (const [id, version] of draftSnapshot) {
            const lookup = store.get(id);
            lookup.onsuccess = () => {
              if (lookup.result && lookup.result.draftVersion === version) store.delete(id);
            };
          }
        });
        savedDrafts.clear();
        setHint('Published for all players.');
      } catch {
        setHint('Published for all players. Local drafts could not be cleared.');
      }
    } catch (error) {
      setHint(error instanceof Error ? error.message : 'Could not publish the layout. Your edits are still open.');
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
    if (!active) {
      pendingFile = null;
      showPublishForm(false);
    }
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
  globalButton.addEventListener('click', () => showPublishForm(publishForm.hidden));
  publishForm.addEventListener('submit', (event) => { void publish(event); });
  button('cancel-publish').addEventListener('click', () => {
    showPublishForm(false);
    globalButton.focus();
  });
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
  behaviorInput.addEventListener('change', () => {
    changeProp(selectedId, { behavior: behaviorInput.value });
    setHint();
  });
  popupButton.addEventListener('click', () => {
    popupTarget = selectedId;
    popupInput.click();
  });
  popupInput.addEventListener('change', async () => {
    const file = popupInput.files[0];
    const id = popupTarget;
    popupInput.value = '';
    popupTarget = null;
    if (!file || !definitions.has(id)) return;
    preparingPopup = true;
    syncControls();
    setHint();
    let message;
    try {
      if (!POPUP_TYPES.includes(file.type)) throw new Error('Unsupported image type.');
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      changeProp(id, { popupImage: file, popupName: file.name });
    } catch {
      message = 'Choose a valid PNG, JPEG or WebP image.';
    } finally {
      preparingPopup = false;
      syncControls();
      setHint(message);
    }
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
    if (!active || !loaded || placing || saving || event.button !== 0) return;
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

  const ready = Promise.allSettled([
    usePropStorage(database, 'readonly', (store) => store.getAll()),
    Promise.resolve().then(() => loadSharedProps?.() ?? { revision: null, props: [] }),
  ])
    .then(async ([local, shared]) => {
      localLoaded = local.status === 'fulfilled';
      sharedLoaded = shared.status === 'fulfilled';
      const published = sharedLoaded ? shared.value.props : [];
      sharedRevision = sharedLoaded ? shared.value.revision : null;
      sharedIds = new Set(published.map(prop => prop.id));
      const merged = new Map(published.map(prop => [prop.id, prop]));
      for (const draft of localLoaded ? local.value : []) {
        savedDrafts.set(draft.id, draft.draftVersion);
        if (draft.deleted) merged.delete(draft.id);
        else merged.set(draft.id, draft);
      }
      const layout = [...merged.values()];
      const restored = await restoreProps(layout) ?? layout;
      for (const definition of restored) definitions.set(definition.id, definition);
      if (!sharedLoaded) loadMessage = 'Shared layout could not load. Reload before publishing.';
      else if (restored.length < layout.length) {
        sharedLoaded = false;
        loadMessage = 'Some saved objects could not load. Reload before publishing.';
      } else if (!localLoaded) loadMessage = 'Local drafts could not load.';
      setHint(loadMessage || defaultHint());
    })
    .catch(() => {
      sharedLoaded = false;
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
