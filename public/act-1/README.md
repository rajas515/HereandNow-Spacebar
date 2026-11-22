# Act I — Take it to the grave (walkthrough)

Source: the Act I team's portable walkthrough (`Exhib-Walkthrough-Transfer.zip`, Nov 2026). Opening graphic over a 3D reveal, studio camera path, room-to-title morph, the farewell letter, dissolve to empty paper.

Standalone: `/act-1/`, scrolled by the page as in the original. In `/exhibition/` it is the opening: the world feeds it scroll progress (0–1 over `length` screens set in `exhibition/chapters.js`) and, at its end, scrolling continues down into Act II. Scrolling back up plays it in reverse.

Changes from the transfer, kept small so a newer version can be merged the same way:

- `walkthrough.js` exports `mount(host)` (card contract, see the project README). It uses `host.$`, `host.createRenderer`, `host.documentElement`, and `host.scroll` when present (progress, `onChange`, `set`) in place of `window.scrollY`/`scrollTo`. Assets load relative to the module.
- `letter-reveal.js` takes the host: its overlay goes in the card's document and it draws through `host.createGL` (the shared renderer) instead of a second WebGL context.
- Three.js, GLTFLoader, DRACOLoader, BufferGeometryUtils and the Draco decoder come from `shared/vendor/` (identical r180 files; the bundled `node_modules`, `server.mjs` and launcher are not needed).
- `index.html` is `walkthrough.html` without the import map, bootstrapping `mount(pageHost())`.
- `walkthrough.css` hides the Scroll/Auto and intro switch when embedded.
- The cut-out frame outline follows the camera in 40 steps instead of 20, each blended over 0.7 s (smoothstep) instead of 0.22 s, so its edges flow rather than jump (`OUTLINE_STEPS`, `OUTLINE_BLEND`).
- Pointer parallax is off inside the exhibition (`host.world`).

The model (`walkthrough-baked.glb`) is already Draco- and WebP-compressed. `frame-outline-LICENSES.txt` covers `frame-outline.js`.
