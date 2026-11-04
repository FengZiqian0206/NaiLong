import assert from 'node:assert/strict';
import { setupFullscreen } from './fullscreen.js';

function mock({ active = false, supported = true } = {}) {
  const doc = new EventTarget(), root = new EventTarget(), button = new EventTarget();
  const label = { textContent: '' }, attrs = new Map();
  let clock = 1000, entries = 0, exits = 0;
  doc.fullscreenElement = null;
  doc.fullscreenEnabled = supported;
  doc.defaultView = { navigator: { userActivation: { isActive: active } }, performance: { now: () => clock } };
  root.ownerDocument = doc;
  root.requestFullscreen = async () => { entries++; doc.fullscreenElement = root; doc.dispatchEvent(new Event('fullscreenchange')); };
  doc.exitFullscreen = async () => { exits++; doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange')); };
  button.querySelector = () => label;
  button.setAttribute = (name, value) => attrs.set(name, value);
  button.closest = () => button;
  function key(code, options = {}) {
    const event = new Event('keydown', { cancelable: true });
    const { target, ...keys } = options;
    Object.assign(event, { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...keys });
    if (target) Object.defineProperty(event, 'target', { value: target });
    doc.dispatchEvent(event);
    return event;
  }
  return { doc, root, button, label, attrs, key,
    start: () => setupFullscreen(root, button),
    activate: () => { doc.defaultView.navigator.userActivation.isActive = true; },
    advance: ms => { clock += ms; },
    get entries() { return entries; }, get exits() { return exits; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

// No activation at load: defer one automatic attempt to an actual gameplay gesture.
const automatic = mock(); automatic.start();
assert.equal(automatic.entries, 0);
assert.equal(automatic.label.textContent, 'Fullscreen');
assert.equal(automatic.attrs.get('aria-label'), 'Enter fullscreen');
automatic.activate(); automatic.key('KeyA'); await settle();
assert.equal(automatic.entries, 1);
assert.equal(automatic.doc.fullscreenElement, automatic.root);
assert.equal(automatic.attrs.get('aria-pressed'), 'true');
assert.equal(automatic.label.textContent, 'Exit fullscreen');
assert.equal(automatic.attrs.get('aria-label'), 'Exit fullscreen');
const nativeEscape = automatic.key('Escape');
assert.equal(nativeEscape.defaultPrevented, false, 'native fullscreen Escape is never intercepted');
assert.equal(automatic.exits, 1, 'Escape also exits through the standard API when the host does not handle it');
await settle();
automatic.key('Escape'); await settle();
assert.equal(automatic.entries, 1, 'exit Escape cannot immediately reenter');
automatic.advance(301); automatic.key('KeyD');
automatic.root.dispatchEvent(new Event('click')); await settle();
assert.equal(automatic.entries, 1, 'manual exit never rearms automatic entry');
automatic.key('KeyF', { ctrlKey: true }); automatic.key('KeyF', { repeat: true }); await settle();
assert.equal(automatic.entries, 1, 'modified and repeated F are ignored');
automatic.key('KeyF'); await settle();
assert.equal(automatic.entries, 2, 'F explicitly reenters after native exit');
automatic.key('KeyF'); await settle();
assert.equal(automatic.exits, 2, 'F explicitly exits');

const startup = mock({ active: true }); startup.start(); await settle();
assert.equal(startup.entries, 1, 'active load may enter immediately');

const deniedActivation = mock(); deniedActivation.start(); deniedActivation.key('Escape'); await settle();
assert.equal(deniedActivation.entries, 0, 'known missing activation does not call the API');
assert.equal(deniedActivation.label.textContent, 'Click or F to enter');
deniedActivation.activate(); deniedActivation.key('KeyA'); await settle();
assert.equal(deniedActivation.entries, 0, 'an explicit windowed choice consumes automatic entry');
deniedActivation.key('Escape'); await settle();
assert.equal(deniedActivation.entries, 1, 'Escape attempts entry when activation is available');

const consumedAuto = mock(); consumedAuto.start(); consumedAuto.key('Space');
consumedAuto.activate(); consumedAuto.key('KeyA'); await settle();
assert.equal(consumedAuto.entries, 0, 'a failed first automatic attempt is not retried on later gameplay');
consumedAuto.button.dispatchEvent(new Event('click')); await settle();
assert.equal(consumedAuto.entries, 1, 'button remains available after an automatic attempt fails');

// Space/Enter on the focused button must rely on its native click, not auto-entry.
const keyboardButton = mock(); keyboardButton.start(); keyboardButton.activate();
keyboardButton.key('Space', { target: keyboardButton.button });
assert.equal(keyboardButton.entries, 0);
keyboardButton.button.dispatchEvent(new Event('click')); await settle();
assert.equal(keyboardButton.entries, 1, 'keyboard-activated button toggles exactly once');
const clicked = mock(); clicked.start(); clicked.activate(); clicked.root.dispatchEvent(new Event('click')); await settle();
assert.equal(clicked.entries, 1, 'first game click enters fullscreen');

const failed = mock(); let failures = 0;
failed.root.requestFullscreen = async () => { failures++; throw new Error('Browser denied fullscreen'); };
failed.start(); failed.activate(); failed.key('KeyF'); await settle();
assert.equal(failures, 1);
assert.equal(failed.label.textContent, 'Click or F to enter', 'API rejection becomes a handled entry hint');
failed.key('KeyD'); await settle();
assert.equal(failures, 1, 'rejection does not rearm automatic entry');

const pending = mock(); let pendingCalls = 0, finish;
pending.root.requestFullscreen = () => { pendingCalls++; return new Promise(resolve => { finish = resolve; }); };
pending.start(); pending.activate(); pending.key('KeyF'); pending.key('KeyF');
pending.button.dispatchEvent(new Event('click'));
assert.equal(pendingCalls, 1, 'only one request may be pending');
finish(); await settle();

const unsupported = mock({ supported: false, active: true }); unsupported.start();
assert.equal(unsupported.button.disabled, true);
assert.equal(unsupported.label.textContent, 'Fullscreen unavailable');
assert.equal(unsupported.attrs.get('aria-label'), 'Fullscreen unavailable');
unsupported.key('KeyF'); await settle();
assert.equal(unsupported.entries, 0);
console.log('Fullscreen activation, native Escape, explicit reentry, request gating and fallback checks passed.');
