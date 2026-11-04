# Further world enlargement, local map and English UI

Date: 2026-11-04. Scope: enlarge the world and view, focus the map on the player, and translate all game UI into English.

World: scale3 compared with the initial prototype (up from1.8); half-width2.55; unchanged player radius0.62 and movement/jump constants. Track1252.48 units,4338 segments, maximum sampling gap0.31737.

View: default minimumheight56/minimumwidth78, wide86/120; about45% larger view than the previous version. Both modes always follow the player and rotate with local gravity. Camera math is unchanged.

Local map: static rawworld-coordinate path; moving SVG viewBox centered at(player.x,-player.y), with fixed84×50.4 extent. SVG overflow is clipped. Redmarker remains at50%/50% regardless of location or restart, while the nearby terrain scrolls. North-up orientation remains stable.

UI: Into the spiral; Move; Jump; Zoom; Restart; WORLD MAP. Page language=en. Page title, description, ARIA labels, loading state and WebGL error message also translated. No Han characters remain in index.html or runtime UI strings.

Checks: node --check game/main.js and node --test game/*.test.mjs pass. Two test groups cover physics and camera; forward130.425s, reverse130.617s,89 moving jumps, unchanged2.937-unit jump height, finite state, no penetration, underside/tip handling and stable idle. Camera full-route maximum angle lag10.67° and maximum step0.93°. Independent30/60FPS main-loop checks also pass.

Browser:1440×900 and390×844 layouts checked. A moves player fromx130.839 tox70.734; map viewBox left edge follows from88.839 to28.734, while marker stays exactly42units from the left and25.2units from the top. R resets both player and map together. Space launches; V changes zoom. Console errors/warnings empty. Local screenshots:local-map-english.jpg andlocal-map-english-narrow.jpg (ignored byGit). No formal device performance test.

Deployment: same authorized public GitHub Pages site, https://fengziqian0206.github.io/NaiLong/ . The workflow runs both physics and camera tests before deployment.
