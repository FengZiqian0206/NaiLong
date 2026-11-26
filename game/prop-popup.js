export function createPropPopup(root, { clearInput }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const stylesheet = doc.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./prop-popup.css?v=20261126b', import.meta.url).href;
  doc.head.append(stylesheet);

  const dialog = doc.createElement('div');
  dialog.className = 'prop-popup';
  dialog.hidden = true;
  dialog.tabIndex = -1;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Interaction image. Press any key or click to close.');
  const image = doc.createElement('img');
  image.draggable = false;
  dialog.append(image);
  root.append(dialog);
  let openImage = null;

  function finish(entry) {
    if (openImage !== entry) return;
    dialog.hidden = true;
    entry.animations.forEach(animation => animation.cancel());
    image.removeAttribute('src');
    URL.revokeObjectURL(entry.url);
    for (const sibling of entry.siblings) sibling.inert = false;
    openImage = null;
    clearInput();
    if (entry.previousFocus?.isConnected && entry.previousFocus !== doc.body) {
      entry.previousFocus.focus({ preventScroll: true });
    } else {
      root.querySelector('canvas')?.focus({ preventScroll: true });
    }
  }

  function dismiss() {
    const entry = openImage;
    if (!entry || entry.closing) return;
    entry.closing = true;
    if (dialog.hidden) {
      finish(entry);
      return;
    }

    const duration = entry.reduceMotion ? 120 : 440;
    const timing = { duration, easing: 'ease-out', fill: 'both' };
    const fade = dialog.animate([{ opacity: win.getComputedStyle(dialog).opacity }, { opacity: 0 }], timing);
    const shrink = image.animate([
      { transform: win.getComputedStyle(image).transform },
      { transform: entry.reduceMotion ? 'none' : 'scale(.84)' },
    ], timing);
    entry.animations.forEach(animation => animation.cancel());
    entry.animations = [fade, shrink];
    void fade.finished.then(() => finish(entry), () => finish(entry));
  }

  function consumeDismissal(event) {
    if (!openImage) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Holding the key that opened a picture must not also dismiss it.
    if (!event.repeat) dismiss();
  }
  for (const type of ['keydown', 'pointerdown', 'click', 'auxclick', 'contextmenu']) {
    win.addEventListener(type, consumeDismissal, { capture: true });
  }
  doc.addEventListener('fullscreenchange', () => {
    // Some browsers handle Escape without delivering a keydown.
    if (openImage && !doc.fullscreenElement) dismiss();
  });

  return {
    get active() { return Boolean(openImage); },
    async show(blob) {
      if (openImage || !(blob instanceof Blob)) return;
      const entry = {
        url: URL.createObjectURL(blob),
        previousFocus: doc.activeElement,
        siblings: [...root.children].filter(element => element !== dialog && !element.inert),
        reduceMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches,
        animations: [],
        closing: false,
      };
      openImage = entry;
      clearInput();
      for (const sibling of entry.siblings) sibling.inert = true;
      image.alt = blob.name || 'Interaction image';
      image.src = entry.url;
      try { await image.decode(); }
      catch { finish(entry); return; }
      if (openImage !== entry) return;

      dialog.hidden = false;
      const timing = { duration: entry.reduceMotion ? 120 : 420, easing: 'cubic-bezier(.19, .82, .26, 1)', fill: 'both' };
      entry.animations = [dialog.animate([{ opacity: 0 }, { opacity: 1 }], timing)];
      if (!entry.reduceMotion) {
        entry.animations.push(image.animate([{ transform: 'scale(.64)' }, { transform: 'scale(1)' }], timing));
      }
      dialog.focus({ preventScroll: true });
    },
    dismiss,
  };
}
