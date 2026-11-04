export function setupFullscreen(root, button) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const label = button.querySelector('[data-fullscreen-label]');
  const supported = doc.fullscreenEnabled !== false &&
    typeof root.requestFullscreen === 'function' && typeof doc.exitFullscreen === 'function';
  let autoEntryArmed = true, pending = false, wasFullscreen = !!doc.fullscreenElement, exitedAt = -Infinity;

  function update(hint) {
    const full = !!doc.fullscreenElement;
    button.disabled = !supported;
    button.setAttribute('aria-pressed', String(full));
    button.setAttribute('aria-label', !supported ? 'Fullscreen unavailable' : full ? 'Exit fullscreen' : 'Enter fullscreen');
    label.textContent = !supported ? 'Fullscreen unavailable' : hint || (full ? 'Exit fullscreen' : 'Fullscreen');
    button.title = !supported ? 'This browser does not support fullscreen.' :
      full ? 'Press Esc or F to exit fullscreen.' : 'Click or press F to enter fullscreen.';
  }
  async function enter() {
    autoEntryArmed = false;
    if (!supported || pending || doc.fullscreenElement) return;
    if (win.navigator.userActivation?.isActive === false) return update('Click or F to enter');
    pending = true;
    try { await root.requestFullscreen(); update(); }
    catch { update('Click or F to enter'); }
    finally { pending = false; }
  }
  async function toggle() {
    autoEntryArmed = false;
    if (!supported || pending) return;
    if (!doc.fullscreenElement) return enter();
    pending = true;
    try { await doc.exitFullscreen(); }
    catch { update(); }
    finally { pending = false; }
  }
  doc.addEventListener('fullscreenchange', () => {
    const full = !!doc.fullscreenElement;
    if (wasFullscreen && !full) exitedAt = win.performance.now();
    wasFullscreen = full;
    autoEntryArmed = false;
    update();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyF') { event.preventDefault(); void toggle(); return; }
    if (event.code === 'Escape') {
      autoEntryArmed = false;
      if (doc.fullscreenElement) { void toggle(); return; }
      // Native Escape may exit fullscreen before its key event reaches the page.
      if (win.performance.now() - exitedAt < 300) return;
      void enter();
      return;
    }
    if (autoEntryArmed && !event.target.closest?.('button') &&
      ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyV', 'KeyR'].includes(event.code)) void enter();
  });
  button.addEventListener('click', (event) => { event.stopPropagation(); void toggle(); });
  root.addEventListener('click', (event) => {
    if (autoEntryArmed && !event.target.closest?.('button')) void enter();
  });
  update();
  if (doc.fullscreenElement) autoEntryArmed = false;
  else if (supported && win.navigator.userActivation?.isActive) void enter();
}
