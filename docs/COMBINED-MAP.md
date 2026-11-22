# Combined map implementation

The map registry in public/map/registry.js lists six standalone pages. DEFAULT_LAYOUT in shared/studio.js supplies per-card placement and grading. saved-layout merging is isolated in layout-state.js, preserves recognized finite old fields and supplies new defaults.

Map coordinates are viewport percentages: x=100 is one viewport right, y=100 is one viewport down. Placement ranges are expanded for six cards. Rotation-aware bounds drive visibility, pan bounds and fit-all. The main world uses compositor transforms and time-based easing; its requestAnimationFrame loop stops after settling. Input and settings changes wake it. Child visibility and layout messages are deduplicated. Loading is staggered, initiated by navigation or proximity, and never repeatedly destroys a scene just because it leaves view.

Four scene cards retain their renderers and map bridge. Studio/workshop adapters now retain palette messages arriving before WebGL is ready, apply stack grading, and receive a small bounded camera offset for depth during parent pan. Worktable zoom state reports back to the parent. Workshop detail drawing is capped by the map's detail frame rate. No new local camera zoom is added to the workshop.

Both existing title studies use the title-map adapter; controls are hidden only in embedded mode. Their drawing is limited by parent quality and visibility. The two title pages are intentionally kept separately even though they share the same lettering source.

Checks: npm run build (syntax, static references, five regression tests). Browser checks: six-card navigation, overview, worktable zoom, live workshop position/scale/rotation, persistence after reload, rendered exposure changes, offscreen frame-count stability, narrow view and console. No publication or remote Git changes are part of this update.

## Camera correction and adopted export

map-preset.js contains the supplied November 14 settings and a one-time revision migration. Its defaults are merged with known layout fields; later local edits are preserved after adoption. The exact supplied export is retained under docs/presets.

localCardOffset converts parent translation to unscaled, unrotated card pixels. map-camera.js converts those pixels with the same perspective formula as standalone drag (eye height, receiving-plane height and field of view), with the same pan limits. applyMapCamera sets an off-axis view offset to cancel duplicate flat reference-plane movement. Studio/workshop retain their original camera axes, geometry, model-fixed cuts and light projection. Their overview cameras are centered. The nested screen-space disco pan was removed only in embedded mode; its camera and auxiliary depth remain.

Regression checks cover reference-plane alignment with the actual Three.js projection matrices, per-card scale/rotation normalization, overview centering and one-time preset adoption.
