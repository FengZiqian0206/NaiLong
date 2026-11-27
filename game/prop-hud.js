export function createPropHud(root) {
  const doc = root.ownerDocument;
  const stylesheet = doc.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./prop-hud.css?v=20261127c', import.meta.url);
  doc.head.append(stylesheet);

  const inventory = doc.createElement('ul');
  inventory.className = 'prop-inventory';
  inventory.setAttribute('role', 'list');
  inventory.setAttribute('aria-label', 'Collected items');
  inventory.hidden = true;

  const prompt = doc.createElement('span');
  prompt.className = 'prop-prompt';
  prompt.setAttribute('role', 'img');
  prompt.hidden = true;
  root.querySelector('#right-hud').append(inventory);
  root.append(prompt);

  const collected = new Map();

  return {
    collect({ id, name, blob, url }) {
      if (!id || collected.has(id) || (!(blob instanceof Blob) && !url)) return;
      const objectUrl = blob instanceof Blob ? URL.createObjectURL(blob) : null;
      const slot = doc.createElement('li');
      const thumbnail = doc.createElement('img');
      thumbnail.alt = name || 'Collected item';
      thumbnail.src = objectUrl || url;
      thumbnail.draggable = false;
      slot.title = thumbnail.alt;
      slot.append(thumbnail);
      inventory.append(slot);
      inventory.hidden = false;
      inventory.scrollTop = inventory.scrollHeight;
      collected.set(id, objectUrl);
    },
    reset() {
      for (const url of collected.values()) {
        if (url) URL.revokeObjectURL(url);
      }
      collected.clear();
      inventory.replaceChildren();
      inventory.hidden = true;
      prompt.hidden = true;
    },
    showPrompt(point) {
      const { x, y, blocked, rideMode } = point ?? {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        prompt.hidden = true;
        return;
      }
      const mode = rideMode ?? (blocked ? 'blocked' : 'interact');
      if (prompt.dataset.mode !== mode) {
        prompt.dataset.mode = mode;
        prompt.classList.toggle('prop-prompt-blocked', Boolean(blocked));
        prompt.classList.toggle('prop-prompt-ride', Boolean(rideMode));
        if (rideMode) {
          const orbit = rideMode === 'orbit';
          const controls = orbit ? [['A', 'Turn left'], ['D', 'Turn right'], ['E', 'Exit']]
            : [['A', 'Back'], ['D', 'Forward'], ['E', 'Exit']];
          prompt.replaceChildren(...controls.map(([key, label]) => {
            const control = doc.createElement('span');
            const cap = doc.createElement('kbd');
            cap.textContent = key;
            control.append(cap, label);
            return control;
          }));
          prompt.setAttribute('aria-label', orbit ? 'A rotates counterclockwise. D rotates clockwise. E exits.'
            : 'A moves back. D moves forward. E exits.');
        } else {
          prompt.textContent = blocked ? '×' : 'E';
          prompt.setAttribute('aria-label', blocked ? 'Required item missing' : 'Press E to interact');
        }
      }
      prompt.style.setProperty('--screen-x', `${x}px`);
      prompt.style.setProperty('--screen-y', `${y}px`);
      prompt.hidden = false;
    },
  };
}
