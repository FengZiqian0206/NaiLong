import { WORLD } from './world.js?v=20261123b';
import { createColliderEditor } from './collider-editor.js?v=20261127';
import { createMovementEditor } from './movement-editor.js?v=20261127c';

const MIN_SIZE = 0.35;
const MAX_SIZE = 18;
const DEFAULT_WIDTH = 2.8;
const STORE = 'placed-props';
const BLOCK_DRAFT = '!collision-blocks';
const LANGUAGE_KEY = 'nailong-editor-language';
const POPUP_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const missingPopup = prop => prop?.interactive !== false && !prop?.motion && prop?.behavior === 'image' && !prop.popupImage;
const isPickup = prop => prop?.interactive !== false && !prop?.motion && prop?.behavior === 'disappear';
const chinese = {
  'Prop editor': '物品编辑器',
  'Editing tool': '编辑工具',
  'Objects': '物品',
  'Collision blocks': '碰撞块',
  'Add collision block': '添加碰撞块',
  'Cancel placement': '取消放置',
  'Placed block': '已放置的碰撞块',
  'Collision block width': '碰撞块宽度',
  'Collision block height': '碰撞块高度',
  'Collision block': '碰撞块',
  'Select a block': '选择碰撞块',
  'No blocks placed': '还没有碰撞块',
  'Add a collision block or select one in the scene.': '添加碰撞块，或在场景中选中已有的块。',
  'Click to place a block or drag out its size.': '点击场景放置碰撞块，或拖出所需大小。',
  'Drag the block to move it. Edit its width and height here.': '拖动碰撞块可改变位置，也可在面板中修改宽高。',
  'Block changed. Save to keep it.': '已修改碰撞块。请保存这次修改。',
  'Close': '关闭',
  'Add PNG': '添加 PNG',
  'Save locally': '保存草稿',
  'Save globally': '全局保存',
  'The layout and its images will be visible to everyone who opens the game.': '布局和图片会对所有打开游戏的玩家可见。',
  'GitHub access token': 'GitHub 访问令牌',
  'Create a fine-grained token for NaiLong with Contents read and write.': '为 NaiLong 创建具备 Contents 读写权限的细粒度令牌。',
  'Publish layout': '发布布局',
  'Cancel': '取消',
  'Placed object': '已放置物品',
  'Width': '宽度',
  'Height': '高度',
  'Object width': '物品宽度',
  'Object height': '物品高度',
  'Interactive': '可交互',
  'Remove': '移除',
  'On interaction': '交互效果',
  'Bounce': '弹动',
  'Disappear': '拾取并消失',
  'Show image': '显示图片',
  'Choose image': '选择图片',
  'Moving object': '移动物品',
  'Set pivot': '设置旋转中心',
  'Move pivot': '移动旋转中心',
  'Clear pivot': '清除旋转中心',
  'Cancel pivot': '取消设置中心',
  'Draw path': '绘制轨迹',
  'Redraw path': '重画轨迹',
  'Clear path': '清除轨迹',
  'Finish path': '完成轨迹',
  'Undo point': '撤销点位',
  'Moving object enabled. Save to keep it.': '已设为移动物品。请保存这次修改。',
  'Moving object disabled. Save to keep it.': '已关闭移动物品。请保存这次修改。',
  'Click the scene to place the pivot.': '点击场景，放置旋转中心。',
  'Click to add curve points. Finish to set the exit.': '依次点击添加曲线点。完成后，最后一点就是下车位置。',
  'Point limit reached. Finish the path or undo a point.': '点位已达上限。可以完成轨迹或撤销点位。',
  'Pivot set. Save to keep it.': '已设置旋转中心。请保存这次修改。',
  'Pivot cleared. Save to keep it.': '已清除旋转中心。请保存这次修改。',
  'Path set. Save to keep it.': '已设置轨迹。请保存这次修改。',
  'Path cleared. Save to keep it.': '已清除轨迹。请保存这次修改。',
  'Required pickups': '依赖物品',
  'All selected items are required.': '玩家需要拾取全部勾选的物品。',
  'No other pickups available.': '将其他物品设为「拾取并消失」后，即可设为依赖。',
  'Unavailable pickup': '不可用的依赖',
  'Draw trigger zone': '绘制掉落区域',
  'Redraw trigger zone': '重画掉落区域',
  'Cancel drawing': '取消绘制',
  'Clear zone': '清除区域',
  'Drag on the scene to draw the trigger zone.': '在场景中拖动，画出触发掉落的区域。',
  'Drag a wider and taller area to set the trigger zone.': '请拖出有一定宽度和高度的区域。',
  'Trigger zone set. Save to keep it.': '已设置掉落区域。请保存这次修改。',
  'Zone cleared. Save to keep this change.': '已清除掉落区域。请保存这次修改。',
  'Loading saved objects…': '正在加载已保存的物品…',
  'Click the scene to place {name}.': '点击场景放置「{name}」。',
  'Checking popup image…': '正在检查弹窗图片…',
  'Choose an image for this interaction.': '为这项交互选择一张图片。',
  'An object needs a popup image before saving.': '有物品还未选择弹窗图片。',
  'Drag the object to move it.': '拖动物品可以移动它。',
  'Choose a PNG, then click the scene to place it.': '选择 PNG 后，点击场景放置。',
  'Image selected': '已选择图片',
  'No image selected': '尚未选择图片',
  'Select an object': '选择一个物品',
  'No objects placed': '还没有已放置的物品',
  'PNG object': 'PNG 物品',
  'Saving objects…': '正在保存物品…',
  'Saved. New edits are pending.': '已保存。还有新的修改待保存。',
  'Saved in this browser.': '已保存到当前浏览器。',
  'Could not save. Your edits are still open.': '保存失败，当前修改仍保留在页面里。',
  'Publishing layout…': '正在发布布局…',
  'Published for all players.': '已发布，所有玩家都可看到。',
  'Published for all players. Local drafts could not be cleared.': '已发布到公开游戏。本地草稿未能清除。',
  'Could not publish the layout. Your edits are still open.': '发布失败，当前修改仍保留在页面里。',
  'You have unsaved edits.': '有修改尚未保存。',
  'Preparing PNG…': '正在处理 PNG…',
  'Object placement failed.': '物品放置失败。',
  'Drag to adjust the position, then save.': '拖动可调整位置，然后保存。',
  'This PNG could not be placed.': '无法放置这张 PNG。',
  'Choose a valid PNG, JPEG or WebP image.': '请选择有效的 PNG、JPEG 或 WebP 图片。',
  'Removed. Save to keep this change.': '已移除。请保存这次修改。',
  'Dependency links were cleared. Save to keep this change.': '相关依赖已清除。请保存这次修改。',
  'Shared layout could not load. Reload before publishing.': '共享布局加载失败。刷新后再发布。',
  'Some saved objects could not load. Reload before publishing.': '部分物品加载失败。刷新后再发布。',
  'Local drafts could not load.': '本地草稿加载失败。',
  'Saved objects could not load.': '无法加载已保存的物品。',
  'Enter a fine-grained GitHub access token.': '请输入 GitHub 细粒度访问令牌。',
  'This GitHub access token is invalid or expired.': 'GitHub 访问令牌无效或已过期。',
  'GitHub denied access. Give the token Contents read and write access to FengZiqian0206/NaiLong.': 'GitHub 拒绝了访问。请给令牌授予该 NaiLong 仓库的 Contents 读写权限。',
  'GitHub could not be reached. Your local edits are still open.': '无法连接 GitHub，当前修改仍保留在页面里。',
  'The shared layout changed. Keep your local draft, reload the game and review it before publishing again.': '共享布局已有更新。请保存本地草稿，刷新检查后再发布。',
  'The prop placement is invalid.': '物品的放置位置或尺寸无效。',
  'Choose a valid PNG image.': '请选择有效的 PNG 图片。',
  'Use a PNG under 24 megapixels.': '请选择低于 2400 万像素的 PNG。',
  'This PNG is transparent throughout.': '这张 PNG 完全透明。',
  'Each published image must be 6 MB or smaller.': '每张发布图片最多 6 MB。',
  'The images in a shared layout must total 11 MB or less.': '共享布局中的图片总计不可超过 11 MB。',
  'A shared layout can contain up to 128 objects.': '共享布局最多可包含 128 件物品。',
  'The shared layout is too large.': '共享布局过大。',
  'The layout contains an unsupported image.': '布局里含有不支持的图片格式。',
  'Choose a popup image before publishing.': '请先选择弹窗图片，再发布。',
};

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
  loadSharedProps, publishSharedProps, defaultProps = [], previewZone = () => {},
  setCollisionBlocks = () => {}, previewCollisionBlocks = () => {}, previewMotion = () => {},
}) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./prop-editor.css?v=20261127b', import.meta.url);
  document.head.append(stylesheet);

  const panel = document.createElement('section');
  panel.className = 'prop-editor';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'prop-editor-title');
  panel.innerHTML = `
    <header>
      <h2 id="prop-editor-title" data-text="Prop editor">Prop editor</h2>
      <div class="prop-editor-header-actions">
        <button type="button" data-action="language">EN</button>
        <button type="button" data-action="close" data-text="Close">Close</button>
      </div>
    </header>
    <div class="prop-editor-tools" role="group" data-aria="Editing tool">
      <button type="button" data-tool="objects" data-text="Objects" aria-pressed="true">Objects</button>
      <button type="button" data-tool="blocks" data-text="Collision blocks" aria-pressed="false">Collision blocks</button>
    </div>
    <div class="prop-editor-actions">
      <button type="button" data-action="file" data-text="Add PNG">Add PNG</button>
      <button type="button" data-action="save" data-text="Save locally" disabled>Save locally</button>
      <button type="button" data-action="global" data-text="Save globally" disabled hidden aria-expanded="false">Save globally</button>
      <input type="file" name="sprite" accept="image/png,.png" hidden>
    </div>
    <form class="prop-editor-publish" hidden>
      <p data-text="The layout and its images will be visible to everyone who opens the game.">The layout and its images will be visible to everyone who opens the game.</p>
      <label><span data-text="GitHub access token">GitHub access token</span>
        <input type="password" required autocomplete="off" spellcheck="false" autocapitalize="none">
      </label>
      <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token" target="_blank" rel="noopener noreferrer" data-text="Create a fine-grained token for NaiLong with Contents read and write.">Create a fine-grained token for NaiLong with Contents read and write.</a>
      <div class="prop-editor-actions">
        <button type="submit" data-action="publish" data-text="Publish layout">Publish layout</button>
        <button type="button" data-action="cancel-publish" data-text="Cancel">Cancel</button>
      </div>
    </form>
    <div class="prop-editor-objects">
    <label><span data-text="Placed object">Placed object</span>
      <select name="prop" disabled></select>
    </label>
    <div class="prop-editor-properties">
      <div>
        <label for="prop-width" data-text="Width">Width</label> <output for="prop-width" aria-hidden="true"></output>
        <input type="range" id="prop-width" min="${MIN_SIZE}" max="${MAX_SIZE}" step="0.05" data-aria="Object width" disabled>
      </div>
      <div>
        <label for="prop-height" data-text="Height">Height</label> <output for="prop-height" aria-hidden="true"></output>
        <input type="range" id="prop-height" min="${MIN_SIZE}" max="${MAX_SIZE}" step="0.05" data-aria="Object height" disabled>
      </div>
    </div>
    <div class="prop-editor-options">
      <label>
        <input type="checkbox" name="interactive" checked disabled>
        <span data-text="Interactive">Interactive</span>
      </label>
      <button type="button" data-action="remove" data-text="Remove" disabled>Remove</button>
    </div>
    <div class="prop-editor-reaction" hidden>
      <label><span data-text="On interaction">On interaction</span>
        <select name="behavior">
          <option value="bounce" data-text="Bounce">Bounce</option>
          <option value="disappear" data-text="Disappear">Disappear</option>
          <option value="image" data-text="Show image">Show image</option>
        </select>
      </label>
      <div class="prop-editor-popup-file" hidden>
        <button type="button" data-action="choose-popup" data-text="Choose image">Choose image</button>
        <span aria-live="polite"></span>
        <input type="file" name="popup" accept="${POPUP_TYPES.join(',')}" hidden>
      </div>
      <div class="prop-editor-motion"></div>
      <details class="prop-editor-requirements">
        <summary><span data-text="Required pickups">Required pickups</span> <span class="prop-editor-count"></span></summary>
        <p data-text="All selected items are required.">All selected items are required.</p>
        <fieldset class="prop-editor-pickups"></fieldset>
      </details>
      <div class="prop-editor-actions">
        <button type="button" data-action="draw-zone" aria-pressed="false">Draw trigger zone</button>
        <button type="button" data-action="clear-zone" data-text="Clear zone" hidden>Clear zone</button>
      </div>
    </div>
    </div>
    <div class="prop-editor-blocks" hidden></div>
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
  const pickupList = panel.querySelector('.prop-editor-pickups');
  const pickupCount = panel.querySelector('.prop-editor-count');
  const drawButton = button('draw-zone');
  const clearZoneButton = button('clear-zone');
  const languageButton = button('language');
  const sizeFields = ['width', 'height'].map(dimension => ({
    dimension,
    input: panel.querySelector(`#prop-${dimension}`),
    output: panel.querySelector(`output[for="prop-${dimension}"]`),
  }));
  const propList = panel.querySelector('[name=prop]');
  const status = panel.querySelector('[role=status]');
  const tools = [...panel.querySelectorAll('[data-tool]')];
  const objectsPanel = panel.querySelector('.prop-editor-objects');
  const blocksPanel = panel.querySelector('.prop-editor-blocks');

  const definitions = new Map();
  const edits = new Map();
  const savedDrafts = new Map();
  const database = openPropStorage();
  let active = false, loaded = false, loadMessage = '', saving = false;
  let localLoaded = false, sharedLoaded = false, sharedRevision = null;
  let sharedIds = new Set();
  let selectedId = null, pendingFile = null, drag = null, placing = false, drawingZone = false;
  let popupTarget = null, preparingPopup = false;
  let tool = 'objects', collisionBlocks = [];
  let locale = 'zh-CN', currentHint = 'Loading saved objects…';
  try {
    if (localStorage.getItem(LANGUAGE_KEY) === 'en') locale = 'en';
  } catch { /* Browser storage might be unavailable. */ }
  const t = message => (locale === 'zh-CN' && chinese[message]) || message;
  const propName = prop => (locale === 'zh-CN' && prop.nameZh) || prop.name || t('PNG object');
  const collisionTool = createColliderEditor({
    host: blocksPanel, canvas, getPoint, t, hint: setHint, preview: previewCollisionBlocks,
    onChange(blocks) {
      collisionBlocks = blocks;
      edits.set(BLOCK_DRAFT, { id: BLOCK_DRAFT, blocks });
      setCollisionBlocks(blocks);
      syncControls();
    },
  });
  const movementTool = createMovementEditor({
    host: panel.querySelector('.prop-editor-motion'), t, preview: previewMotion, hint: setHint,
    start(editing) {
      if (editing) {
        stopDrag();
        drawingZone = false;
        pendingFile = null;
        canvas.focus({ preventScroll: true });
      }
      syncControls();
      setHint();
    },
    change(motion, message) {
      const wasPickup = isPickup(definitions.get(selectedId));
      changeProp(selectedId, { motion });
      const cleared = motion && wasPickup && clearReferences(selectedId);
      listDependencies();
      setHint(cleared ? 'Dependency links were cleared. Save to keep this change.' : message);
    },
  });

  globalButton.hidden = !publishSharedProps;
  const hasMissingImage = objects => [...objects].some(missingPopup);
  function canPublish() {
    return Boolean(publishSharedProps) && sharedLoaded && loaded && !saving && !placing && !preparingPopup &&
      !drawingZone && !movementTool.mode && Boolean(edits.size || savedDrafts.size) && !hasMissingImage(definitions.values());
  }
  function defaultHint() {
    if (tool === 'blocks') return collisionTool.hint();
    const movementHint = movementTool.hint();
    if (movementHint) return movementHint;
    if (drawingZone) return 'Drag on the scene to draw the trigger zone.';
    if (pendingFile) return 'Click the scene to place {name}.';
    if (preparingPopup) return 'Checking popup image…';
    if (missingPopup(definitions.get(selectedId))) return 'Choose an image for this interaction.';
    if (hasMissingImage(definitions.values())) return 'An object needs a popup image before saving.';
    if (selectedId) return 'Drag the object to move it.';
    return 'Choose a PNG, then click the scene to place it.';
  }
  function setHint(message = defaultHint()) {
    currentHint = message;
    status.textContent = t(message).replace('{name}', () => pendingFile?.name ?? '');
  }

  function propagatePreview() {
    const prop = definitions.get(selectedId);
    previewZone(active && tool === 'objects' && prop?.interactive !== false ? (drag?.zone ?? prop?.fallZone ?? null) : null);
  }

  function setLanguage() {
    panel.lang = locale;
    for (const element of panel.querySelectorAll('[data-text]')) element.textContent = t(element.dataset.text);
    for (const element of panel.querySelectorAll('[data-aria]')) element.setAttribute('aria-label', t(element.dataset.aria));
    languageButton.textContent = locale === 'zh-CN' ? 'EN' : '中文';
    languageButton.setAttribute('aria-label', locale === 'zh-CN' ? '切换到英文' : 'Switch editor to Chinese');
    listProps();
    collisionTool.render();
    setHint(currentHint);
  }

  function dependsOn(prop, id) {
    const pending = [...(prop.requires ?? [])], visited = new Set();
    while (pending.length) {
      const required = pending.pop();
      if (required === id) return true;
      if (visited.has(required)) continue;
      visited.add(required);
      pending.push(...(definitions.get(required)?.requires ?? []));
    }
    return false;
  }

  function listDependencies() {
    pickupList.replaceChildren();
    const prop = definitions.get(selectedId);
    if (!prop) return;
    const required = new Set(prop.requires ?? []);
    const options = new Map([...definitions.values()]
      .filter(option => option.id !== selectedId && isPickup(option) && !dependsOn(option, selectedId))
      .map(option => [option.id, propName(option)]));
    for (const id of required) {
      if (!options.has(id)) {
        const other = definitions.get(id);
        options.set(id, other ? `${propName(other)} · ${t('Unavailable pickup')}` : t('Unavailable pickup'));
      }
    }
    if (!options.size) {
      const empty = document.createElement('p');
      empty.textContent = t('No other pickups available.');
      pickupList.append(empty);
    }
    for (const [id, name] of options) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = id;
      checkbox.checked = required.has(id);
      const label = document.createElement('label');
      label.append(checkbox, name);
      pickupList.append(label);
    }
  }
  const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
  function syncControls() {
    const selection = definitions.get(selectedId);
    propList.value = selectedId ?? '';
    propList.disabled = saving || definitions.size === 0;
    removeButton.disabled = interactiveInput.disabled = saving || !selection;
    interactiveInput.checked = selection?.interactive !== false;
    reaction.hidden = !selection || !interactiveInput.checked;
    behaviorInput.value = selection?.behavior ?? 'bounce';
    behaviorInput.disabled = saving || Boolean(selection?.motion);
    behaviorInput.closest('label').hidden = Boolean(selection?.motion);
    popupRow.hidden = behaviorInput.value !== 'image' || Boolean(selection?.motion);
    popupButton.disabled = saving || preparingPopup;
    popupFileName.textContent = selection?.popupImage ? selection.popupName || t('Image selected') : t('No image selected');
    pickupList.disabled = saving;
    const dependencyCount = selection?.requires?.length ?? 0;
    pickupCount.textContent = dependencyCount ? `(${dependencyCount})` : '';
    drawButton.disabled = clearZoneButton.disabled = saving || !selection;
    drawButton.textContent = t(drawingZone ? 'Cancel drawing' : selection?.fallZone ? 'Redraw trigger zone' : 'Draw trigger zone');
    drawButton.setAttribute('aria-pressed', String(drawingZone));
    clearZoneButton.hidden = !selection?.fallZone;
    for (const { dimension, input, output } of sizeFields) {
      const size = selection?.[dimension];
      input.disabled = saving || !selection;
      input.value = size ?? DEFAULT_WIDTH;
      output.value = Number.isFinite(size) ? Number(size.toFixed(2)).toString() : '';
    }
    fileButton.disabled = !loaded || saving || placing;
    fileButton.hidden = tool === 'blocks';
    for (const option of tools) option.disabled = saving || placing || preparingPopup;
    collisionTool.setState({ active: active && tool === 'blocks', disabled: !loaded || saving });
    movementTool.setState(active && tool === 'objects' && selection?.interactive !== false ? selection : null, !loaded || saving || placing);
    panel.classList.toggle('prop-editor-drawing-motion', Boolean(movementTool.mode));
    saveButton.disabled = !localLoaded || !loaded || saving || preparingPopup || drawingZone || Boolean(movementTool.mode) || !edits.size || hasMissingImage(edits.values());
    globalButton.disabled = button('publish').disabled = !canPublish();
    button('cancel-publish').disabled = saving;
    tokenInput.disabled = saving;
    button('close').disabled = saving;
    if (edits.size) window.addEventListener('beforeunload', beforeUnload);
    else window.removeEventListener('beforeunload', beforeUnload);
  }

  function listProps() {
    const empty = new Option(t(definitions.size ? 'Select an object' : 'No objects placed'), '');
    empty.disabled = true;
    propList.replaceChildren(empty);
    for (const prop of definitions.values()) {
      propList.add(new Option(propName(prop), prop.id));
    }
    listDependencies();
    syncControls();
  }

  function select(id) {
    const next = definitions.has(id) ? id : null;
    if (next !== selectedId) {
      stopDrag();
      drawingZone = false;
    }
    selectedId = next;
    selectProp(active && tool === 'objects' ? selectedId : null);
    listDependencies();
    propagatePreview();
    syncControls();
  }

  function changeProp(id, patch) {
    const previous = definitions.get(id);
    if (!previous || Object.keys(patch).every(key => previous[key] === patch[key])) return;
    const changed = editProp(id, patch);
    const definition = changed ? { ...previous, ...changed } : { ...previous, ...patch };
    definitions.set(id, definition);
    edits.set(id, definition);
    propagatePreview();
    syncControls();
  }

  function clearReferences(id) {
    let removed = false;
    for (const prop of definitions.values()) {
      if (!prop.requires?.includes(id)) continue;
      changeProp(prop.id, { requires: prop.requires.filter(required => required !== id) });
      removed = true;
    }
    return removed;
  }

  function areaBetween(start, end) {
    const rings = WORLD.totalLength;
    const difference = end.s - start.s;
    const width = difference - Math.round(difference / rings) * rings;
    const height = Math.max(-512, Math.min(512, end.h - start.h));
    return {
      s: (start.s + .5 * width + rings) % rings,
      h: start.h + .5 * height,
      width: Math.abs(width),
      height: Math.abs(height),
    };
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
      const published = await publishSharedProps(layout, sharedRevision, token, collisionBlocks);
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
    propagatePreview();
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
      drawingZone = false;
      showPublishForm(false);
    }
    selectProp(active && tool === 'objects' ? selectedId : null);
    propagatePreview();
    syncControls();
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
    movementTool.cancel();
    drawingZone = false;
    stopDrag();
    pendingFile = file;
    syncControls();
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
  for (const option of tools) option.addEventListener('click', () => {
    if (tool === option.dataset.tool) return;
    stopDrag();
    drawingZone = false;
    pendingFile = null;
    tool = option.dataset.tool;
    objectsPanel.hidden = tool !== 'objects';
    blocksPanel.hidden = tool !== 'blocks';
    for (const button of tools) button.setAttribute('aria-pressed', String(button === option));
    selectProp(active && tool === 'objects' ? selectedId : null);
    propagatePreview();
    syncControls();
    setHint(!loaded ? 'Loading saved objects…' : loadMessage || undefined);
  });
  languageButton.addEventListener('click', () => {
    locale = locale === 'zh-CN' ? 'en' : 'zh-CN';
    try { localStorage.setItem(LANGUAGE_KEY, locale); }
    catch { /* The selection can still apply to this tab. */ }
    setLanguage();
  });
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
    const id = selectedId;
    const wasPickup = isPickup(definitions.get(id));
    if (!interactiveInput.checked) {
      drawingZone = false;
      stopDrag();
    }
    changeProp(selectedId, { interactive: interactiveInput.checked });
    const cleared = !interactiveInput.checked && wasPickup && clearReferences(id);
    listDependencies();
    setHint(cleared ? 'Dependency links were cleared. Save to keep this change.' : undefined);
  });
  behaviorInput.addEventListener('change', () => {
    const id = selectedId, behavior = behaviorInput.value;
    const wasPickup = isPickup(definitions.get(id));
    changeProp(id, { behavior });
    const cleared = wasPickup && behavior !== 'disappear' && clearReferences(id);
    listDependencies();
    setHint(cleared ? 'Dependency links were cleared. Save to keep this change.' : undefined);
  });
  pickupList.addEventListener('change', event => {
    const checkbox = event.target;
    const prop = definitions.get(selectedId);
    if (!prop || checkbox.type !== 'checkbox') return;
    const required = new Set(prop.requires ?? []);
    if (checkbox.checked) required.add(checkbox.value);
    else required.delete(checkbox.value);
    changeProp(selectedId, { requires: [...required] });
    setHint();
  });
  drawButton.addEventListener('click', () => {
    if (!selectedId) return;
    movementTool.cancel();
    stopDrag();
    drawingZone = !drawingZone;
    pendingFile = null;
    syncControls();
    setHint();
    canvas.focus({ preventScroll: true });
  });
  clearZoneButton.addEventListener('click', () => {
    drawingZone = false;
    stopDrag();
    changeProp(selectedId, { fallZone: null });
    setHint('Zone cleared. Save to keep this change.');
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
    const cleared = clearReferences(selectedId);
    removeProp(selectedId);
    definitions.delete(selectedId);
    edits.set(selectedId, null);
    select(null);
    listProps();
    setHint(cleared ? 'Dependency links were cleared. Save to keep this change.' : 'Removed. Save to keep this change.');
  });
  panel.addEventListener('focusin', clearInput);

  canvas.addEventListener('pointerdown', (event) => {
    if (!active || tool !== 'objects' || !loaded || placing || saving || event.button !== 0) return;
    const point = getPoint(event.clientX, event.clientY);
    if (!point) return;
    if (movementTool.mode) {
      movementTool.place(point);
      return;
    }
    if (drawingZone && selectedId) {
      drag = { pointerId: event.pointerId, origin: point };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
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
    if (movementTool.mode === 'path') {
      movementTool.hover(getPoint(event.clientX, event.clientY));
      return;
    }
    if (event.pointerId !== drag?.pointerId) return;
    const point = getPoint(event.clientX, event.clientY);
    if (!point) return;
    if (drag.origin) {
      drag.zone = areaBetween(drag.origin, point);
      propagatePreview();
    } else {
      changeProp(selectedId, { s: point.s + drag.s, h: point.h + drag.h });
    }
  });
  canvas.addEventListener('pointerleave', () => {
    if (movementTool.mode === 'path') movementTool.hover(null);
  });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.pointerId) return;
    if (!drag.origin) { stopDrag(); return; }
    const point = getPoint(event.clientX, event.clientY);
    const zone = point ? areaBetween(drag.origin, point) : drag.zone;
    stopDrag();
    if (!zone || zone.width < .25 || zone.height < .25) {
      setHint('Drag a wider and taller area to set the trigger zone.');
      return;
    }
    drawingZone = false;
    changeProp(selectedId, { fallZone: zone });
    setHint('Trigger zone set. Save to keep it.');
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === drag?.pointerId) stopDrag();
    });
  }
  window.addEventListener('blur', stopDrag);

  const ready = Promise.allSettled([
    usePropStorage(database, 'readonly', (store) => store.getAll()),
    Promise.resolve().then(() => loadSharedProps?.() ?? { revision: null, props: defaultProps }),
  ])
    .then(async ([local, shared]) => {
      localLoaded = local.status === 'fulfilled';
      sharedLoaded = shared.status === 'fulfilled';
      const published = sharedLoaded ? shared.value.props : defaultProps;
      collisionBlocks = sharedLoaded ? shared.value.blocks ?? [] : [];
      sharedRevision = sharedLoaded ? shared.value.revision : null;
      sharedIds = new Set(published.map(prop => prop.id));
      const merged = new Map(published.map(prop => [prop.id, prop]));
      for (const draft of localLoaded ? local.value : []) {
        savedDrafts.set(draft.id, draft.draftVersion);
        if (draft.id === BLOCK_DRAFT) {
          if (Array.isArray(draft.blocks)) collisionBlocks = draft.blocks;
        } else if (draft.deleted) merged.delete(draft.id);
        else merged.set(draft.id, draft);
      }
      collisionTool.setBlocks(collisionBlocks);
      setCollisionBlocks(collisionBlocks);
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
  setLanguage();
  return { get active() { return active; }, toggle, ready };
}
