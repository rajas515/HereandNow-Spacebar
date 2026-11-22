# Shared dependencies

- shared/vendor/: vendored Three.js modules and loaders used by disco, in-the-life-of and skeletons. Preserve the supplied license notices.
- shared/print-pass.js: common print rendering.
- shared/cutout/: composition, stage clipping, atmosphere and the earlier bake helper.
- shared/map-bridge.js: card/parent message validation.
- shared/studio.js, shared/studio.css, shared/defaults.json: existing map composition controls and default layouts, also imported by standalone disco and architecture.
- disco/assets/garden.webp: existing foliage reference used by both later studio cards.
- skeletons assets/adjacent-aligned.glb: separate exported adjacent studio for its one-time window cubemap capture.

Move shared assets only with a reference update across all dependent pages. Each page can be opened directly without the map. The WebGL cards require a browser with WebGL support.
