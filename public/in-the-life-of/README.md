# In the life of

An isolated main-scene study for Green hour. Open `http://127.0.0.1:4174/in-the-life-of/` after running `node serve.mjs` from the scene-map folder. All assets and Three.js modules are local. No build or install is required.

## Composition

The supplied `studio-panorama-v3.blend` supplies the actual room, furniture and clutter. The wide camera looks straight down from the source MAIN CAMERA position with the source roll, using a 122-degree perspective composition. The two central tables are the focal point. The white ceiling slab is excluded, while the surrounding services remain. Modest pointer parallax preserves the authored view.

The wide silhouette follows the white annotated outline. It defines a fixed volume in world coordinates, sampled by the geometry's color, normal/depth and shadow materials. It is not a screen-space outline. Pointer movement and camera movement project the same authored cut volume from the current view.

Clicking the tables enters a bounded close view of the two tables, bench, chairs and tabletop objects. Six moving clipping planes trim the room during a 2.6-second, 24 fps stepped camera push with a constant field of view. An additional inclined plane cuts down through the surrounding surfaces and sweeps across the floor; the flat slab does not disappear all at once. The camera push starts after the outer planes enter the room, keeping the near wall bounded. Click again, use Room, or press Escape to reverse the same cuts. The parent map remains unchanged.

## Runtime

- Source library/review copies are omitted. Tiny bevels and weighted-normal modifiers are removed. Source geometry is welded and batched with vertex colors; the exported GLB is about 4.1 MB.
- On first load, 105,178 peripheral-clutter triangles are captured into 14 transparent, separately placed plates, sharing color and normal atlases. Perspective crops preserve the wide-camera projection. Alpha discard is consistent in color and normal passes. Originals and their geometry are released after capture.
- Architecture, services, furniture and central tabletop objects remain in 3D. Roughly 101k triangles remain per color pass. The displayed draw count now measures all passes directly, including shadow updates, rather than estimating from the color pass.
- Six 256-pixel cubemap faces are baked from the source exterior for the original clear glazing. The marked panes additionally use the existing disco garden photograph, sampled in two gently moving layers. The yellow-annotated apertures are projected onto their actual wall planes, offset inward to clear opaque privacy inserts, and batched into one mesh. No exterior tree geometry or exposed skybox is loaded.
- Central furniture is selected by its source hierarchy rather than spatially clipped triangles. Paper contours come from the boundaries of the original curled paper sheets. The surrounding objects are culled only after the planes have fully cut them away. Transparent light shafts and normal masks use single-pass double-sided rendering.
- Lighting uses a warm directional side light, restrained cool fill, a 2048px soft shadow map, soft table contact shading and three faint shafts with sparse dust. Glazing and garden portals do not cast opaque shadows. Shadow maps are cached while idle and updated as clipping planes move. Baked peripheral plates are captured without shadow-map work.
- Balanced caps at 40 fps / 1x resolution; Fine uses up to 1.5x; Light caps at 24 fps / .75x. Actual desktop preview measured around 36 fps in Balanced. Timing is device-dependent.
- Pause, document visibility, intersection visibility and parent visibility stop unnecessary frames. Reduced-motion preferences disable automatic texture motion and pointer movement.

The original disco PrintPass source is imported unchanged. The isolated study preserves more directional light and shadow contrast before its common navy/violet/pink paper screen. No light-shaft or color overlay is applied after the final print treatment. Local controls use their own storage key, `green-hour-in-the-life-of-v1`, leaving map settings intact.

## Rebuilding the asset

`tools/export-life.py` runs in a separate Blender background process against the supplied source. It does not save changes to the source or replace the user's live Blender scene. It writes the GLB, six cubemap faces and provenance manifest to this folder's assets directory. The source path can be supplied to Blender's `-b` argument.

The basic same-origin map bridge forwards navigation and accepts palette, motion, quality, wide/zoom and visibility messages. The new card is intentionally not registered in the parent map yet. Whole-stack layout and auxiliary threshold layers belong to the integration stage.

## Verification

Browser QA includes inspecting the live Netlify disco reference in wide and close views; checking the new world-space cuts at the midpoint in both directions; verifying the completed table view; viewing the actual side lighting before print mapping; and checking console errors, pause, and responsive framing. Existing map checks and bridge regression pass. No new content has been published.


## Pan controls
Drag the artwork to pan in standalone mode. Arrow keys pan; Home or double-click recenters. A drag does not trigger table zoom. Embedded mode forwards map dragging to the parent instead of moving both cameras.


Panning shifts the complete projection rigidly, preserving registration between baked props, their supporting furniture, shadows and light shafts. Pointer drift uses that same shift rather than lateral camera motion.


Latest pan correction: camera-based pan and pointer parallax are restored. Peripheral props remain real 3D in one merged batch instead of fixed-angle plates; window light bands lie on the receiving floor. This supersedes the earlier rigid-projection-pan and peripheral-baking notes above.


## Lens study
Adjust > Fisheye applies a radial barrel warp to the whole rendered card, consistently sampling color, depth and normals before the final print screen. The model is unchanged. Zero restores the rectilinear view; stronger values increase curvature. The setting persists. Table picking uses the matching inverse screen-to-source mapping. This is an economical card-warp approximation, not a true 213-degree equisolid panoramic render.


The brighter/wider composition starts at exposure +1.2 and a 1.12 horizontal card stretch. Adjust > Width controls the stretch without changing model geometry. Hit testing applies the same stretch and radial lens mapping. Existing lens and ink settings are preserved; brightness/width migrate once to the requested defaults.


Approved screenshot preset (approximate slider positions): Print, ink texture .70, drawing .50, light +1.3, fisheye .68, width 1.24, Balanced. Stored as composition revision 3; subsequent user edits remain saved.

