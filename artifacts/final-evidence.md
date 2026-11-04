# Fullscreen controls and browser limits

Date:2026-11-04. Scope: automatic entry when allowed, Escape exit/reentry attempt, and a fullscreen control in the lower-left HUD.

Implementation: game/fullscreen.js uses the standard Fullscreen API on the complete game root so HUD remains visible. If transient activation exists at setup it attempts entry immediately; otherwise the first gameplay key or game click triggers one automatic attempt. Automatic entry is disarmed before the attempt and never rearmed after exit or restart. Escape explicitly requests exit when fullscreen; outside fullscreen it attempts entry only when activation permits. A300ms exit guard avoids rebounding on the same nativeEscape. F and the clickable HUD control provide reliable entry/exit. Pending promises are guarded, API failures handled, and unsupported browsers show a disabled hint. Ctrl/Meta/Alt+F and browser Escape behavior are preserved; no keyboard lock or browser settings are changed.

Browser limits: the Fullscreen standard requires transient user activation, and HTML explicitly excludes Escape as an activation-triggering key. Therefore no website can promise immediate fullscreen without interaction, nor standaloneEscape reentry in all browsers. Missing activation yields the English hint 'Click or F to enter'. Sources: https://fullscreen.spec.whatwg.org/#dom-element-requestfullscreen and https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event .

HUD: lower-left ESC/F button, dynamic Fullscreen/Exit fullscreen label, title, aria-label and aria-pressed. Pointer events enabled only for the control; footer wraps on narrow displays. Main gameplay leaves focused-button Space/Enter to its native click. Fullscreen changes resize the renderer and restore canvas focus, so subsequent Space continues to jump.

Checks: node --check game/main.js and node --test game/*.test.mjs pass. Fullscreen checks cover activated startup, deferred automatic entry, one-time attempt/denial, Escape exit, exit cooldown, explicit reentry with available activation, F/button, focused-button activation, pending request deduplication, browser-reserved shortcuts, rejected API, unsupported browsers and ARIA state. Physics and camera regressions also pass.

Actual browser: initial fullscreen=false; first A or Space enters fullscreen=true. First Space still produces jumps=1. Escape exits successfully via the standard exit call. Ordinary movement after exit does not reenter. A standaloneEscape without activation shows the handled hint. F exits and reenters. Clicking the footer enters, canvas regains focus, and Space jumps while staying fullscreen. KeyboardSpace on the fullscreen button toggles exactly once without a gameplay jump. No console errors/warnings.

320x780 layout: footer wraps; fullscreen button left20/right114.1/bottom758 remains fully visible, body scrollWidth320. Screenshot fullscreen-narrow.jpg is local/ignored. Native fullscreen screenshot reflects the actual display dimensions; no formal mobile performance testing.

Deployment: same authorized public GitHub Pages https://fengziqian0206.github.io/NaiLong/ . Workflow runs all three Node checks before deployment.
