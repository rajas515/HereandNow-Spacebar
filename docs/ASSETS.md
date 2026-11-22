# Assets

Architecture: the colleague-supplied spatial-experience package. Geometry/UV source and original group placements remain in dist/architecture/scene-web.json. Ten image layers were resized proportionally to 1280px for GPU memory savings. The supplied caption, mask geometry and detail composition are retained.

Disco studio: the user's room reference photographs, purple-chair.glb and nine face drawings. The face drawings repeat across 120 independent reflective tiles using a 3x3 atlas. The garden texture was generated in the earlier scene iteration; original provenance remains in the previous project. No new images were generated for this integration.

Three.js and its local loaders are retained from the existing scene. All runtime assets are local. No remote fonts, trackers or build dependencies are required.

In the life of: the user's `studio-panorama-v3.blend` supplies the room, placed furniture, central objects and peripheral clutter. The lean vertex-colored GLB excludes the furniture library and review copies, ceiling slab, exterior geometry and subpixel bevels. Six 256px exterior cubemap faces are baked from the same supplied model. Peripheral clutter is converted into 14 transparent color/normal plates at startup. No new images were generated. See `dist/in-the-life-of/README.md` and `tools/export-life.py` for the reproducible export and rendering details.

The annotated window apertures reuse `dist/disco/assets/garden.webp`. Table paper contours are extracted from the supplied curled paper sheets; no image generation or external asset download was used for this revision.

Skeletons in the closet: supplied `lab-studio-pinup.blend`, exported by `tools/export-skeletons.py` to a roughly 2.53 MB GLB. Static geometry uses welded vertex-color batches; mannequin and other textured hero geometry retain source UV/material images capped at 1024px. The garden is the existing disco image. No new generated images or external downloads. The Blender source is not saved or overwritten.


Skeleton window revision: right-side garden reuses the local disco photograph; the adjacent studio view is a one-time 256px cubemap of the existing In the life of GLB. Pane lighting uses a small procedural aperture texture. No external images or downloads.

Combined-room revision: studio-combined.blend supplies the aligned adjacent-room export. The matching desk determines its exact common transform; no manual scaling is applied. Source blend files remain unchanged.

## Compression (November 2026)

Runtime assets are compressed; load them through `shared/gltf.js` (Draco decoder in `shared/vendor/draco/`) and bump the `?v=` tag in the loading code whenever a file changes, so browsers do not reuse an old copy.

- GLB models: Draco, sequential method (vertex order kept, so index ranges and geometry edits still match), positions at 16 bits (~0.15 mm on a 10 m room). Textures inside a GLB are WebP. Command for a new export:
  `npx @gltf-transform/cli draco in.glb out.glb --method sequential --quantize-position 16 --quantize-color 10 --quantize-texcoord 14 --quantize-normal 12`
  (for an embedded PNG texture, first run `npx @gltf-transform/cli webp in.glb in.glb --quality 90`).
- Images: WebP, quality 88 for photographs, 90 for drawings, layers and cube faces; alpha kept lossless.
- Three.js: the vendored r180 build is the official minified one (same release, same file names).

Result for Act II: about 23 MB to 10.5 MB per first visit. Originals are in git history and in the original project folder.
