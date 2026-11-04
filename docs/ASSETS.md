# Assets

Architecture: the colleague-supplied spatial-experience package. Geometry/UV source and original group placements remain in dist/architecture/scene-web.json. Ten image layers were resized proportionally to 1280px for GPU memory savings. The supplied caption, mask geometry and detail composition are retained.

Disco studio: the user's room reference photographs, purple-chair.glb and nine face drawings. The face drawings repeat across 120 independent reflective tiles using a 3x3 atlas. The garden texture was generated in the earlier scene iteration; original provenance remains in the previous project. No new images were generated for this integration.

Three.js and its local loaders are retained from the existing scene. All runtime assets are local. No remote fonts, trackers or build dependencies are required.

In the life of: the user's `studio-panorama-v3.blend` supplies the room, placed furniture, central objects and peripheral clutter. The lean vertex-colored GLB excludes the furniture library and review copies, ceiling slab, exterior geometry and subpixel bevels. Six 256px exterior cubemap faces are baked from the same supplied model. Peripheral clutter is converted into 14 transparent color/normal plates at startup. No new images were generated. See `dist/in-the-life-of/README.md` and `tools/export-life.py` for the reproducible export and rendering details.

The annotated window apertures reuse `dist/disco/assets/garden.jpg`. Table paper contours are extracted from the supplied curled paper sheets; no image generation or external asset download was used for this revision.

Skeletons in the closet: supplied `lab-studio-pinup.blend`, exported by `tools/export-skeletons.py` to a roughly 2.53 MB GLB. Static geometry uses welded vertex-color batches; mannequin and other textured hero geometry retain source UV/material images capped at 1024px. The garden is the existing disco image. No new generated images or external downloads. The Blender source is not saved or overwritten.


Skeleton window revision: right-side garden reuses the local disco photograph; the adjacent studio view is a one-time 256px cubemap of the existing In the life of GLB. Pane lighting uses a small procedural aperture texture. No external images or downloads.

Combined-room revision: studio-combined.blend supplies the aligned adjacent-room export. The matching desk determines its exact common transform; no manual scaling is applied. Source blend files remain unchanged.
