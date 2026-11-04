# Airborne double jump verification

Date:2026-11-04. Scope: allow exactly one extra jump while airborne.

Behavior: a ground jump leaves the extra air jump available. A new Space press while rising or falling uses it. Further airborne presses are ignored. Landing on any ground surface or restarting restores it. Walking off a surface also permits one airborne impulse. Holding Space does not repeat jumps. Both impulses use the current nearest-ground normal and replace its normal velocity with the existing13.4 jump speed; tangential motion is preserved.

Implementation: one new boolean player.airJumpUsed; resetPlayer initializes itfalse, accepted airborne impulse setsittrue, ground contact restoresfalse. Existing main.js keydown repeat guard and one-step jump intent prevent automatic second jumps. Diagnostics include the newboolean behind ?debug. Accessibility instructions explain the second Space press. Existing English UI, local upper-right map and two zoom modes remain as requested.

Automated checks: node --check game/main.js and node --test game/*.test.mjs pass. Double-jump checks cover rising and falling secondpresses, exact-state equivalence of rejected thirdpress vs noinput, landing rearm, reset, underside launches, currentnearestground vs staleorientation, and one air impulse after falling without groundjump. Existing no-penetration, full forward/reverse route, stable contact and camera checks pass.

Actual browser: three Space presses80ms each in one airborne sequence produce cumulative jump counts1,2,2 and airJumpUsed false,true,true. Landing leaves cumulative count2 and resetsairJumpUsedfalse; next ground+air sequence reaches4. Restart then holding Space1500ms produces only1jump and returns grounded with unused airjump. No console errors/warnings. Local screenshot double-jump.jpg is ignored byGit. No UI or viewport retesting beyond the affected mechanic is necessary for this change.

Deployment: same authorized public GitHub Pages site https://fengziqian0206.github.io/NaiLong/ . The workflow runs both physics and camera tests before deployment.
