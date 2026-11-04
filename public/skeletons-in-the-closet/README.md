# Skeletons in the closet

Standalone main card: http://127.0.0.1:4174/skeletons-in-the-closet/

Run `node serve.mjs` from the scene-map root. No installation or build step is required. This is a separate page in the existing project; the master map is unchanged. There is no zoom stage, zoom button, table click or threshold inset.

## Source and composition

The supplied `lab-studio-pinup.blend` provides the workshop geometry, furniture, papers, pinups, storage and textured mannequin. The top-down view follows its Photograph matched perspective camera: approximately (-.033, -.096, 7.146) in Blender coordinates, with a small source-matched tilt. The reference's curved room appearance is recreated with the shared adjustable whole-card lens warp; this is a lightweight barrel approximation, not a true hemispherical camera.

The source Blender file is not changed. `tools/export-skeletons.py` performs a background export, omitting subpixel bevels and weighted-normal/subdivision work, reducing curve resolution, welding static meshes and batching vertex colors. Textured hero meshes retain their UVs and materials, with images capped at 1024 pixels. The exported GLB is 2,530,492 bytes and about 67,072 triangles across six source mesh groups. See assets/manifest.json.

## Rendering contract

- Real 3D props are retained, so they stay attached to furniture during lateral camera panning. No fixed-angle prop plates are used.
- Camera pan and subtle pointer movement follow the same approach as In the life of. Drag uses pointer capture and a threshold. Arrow keys pan. Home or double-click recenters. Embedded map dragging remains parent-owned.
- Fisheye, width, ink texture, drawing, light, quality and Print/Original controls use a separate storage key: `green-hour-skeletons-in-the-closet-v1`.
- Navy/violet/pink grading and the final paper/riso screen are shared with the existing card. The lens samples color, normals and depth consistently before the screen.
- The bounded stage volume is fixed in world coordinates, shared by color, normals/depth and shadow casters. It has its own outline and room bounds; it does not reuse the old room's silhouette or moving zoom planes.
- Glazing uses the existing disco foliage photograph in a bounded shader with restrained movement. It does not cast an opaque-window shadow or spill outside the model.
- Warm side lighting, a restrained cool fill, a cached 2048px soft shadow map, ground-projected light bands and soft table contact shading supply depth. Projected bands remain on the floor during pan. All lighting is treated by the final print pass.
- Balanced caps at 40 fps / 1x. Fine uses up to 1.5x; Light uses .75x and 24 fps. In the initial local preview, Balanced measured around 36 fps / 15 draws. Performance depends on viewport and device.
- Paused, hidden and offscreen cards stop rendering. Reduced-motion preferences disable automatic movement. Shadow maps are cached and invalidated when the authored cut volume changes.

## Shared dependencies and handoff

Uses the local Three.js vendor files, disco PrintPass, validated map bridge, and the now-parameterized composition/clipping/lighting helpers from In the life of. Existing helper defaults retain the old card's behavior. Future integration should register this page as another iframe/node and wire layout settings, rather than copying or flattening its renderer.

## Verification

Syntax checks and the existing map-bridge regression pass. Browser checks cover source-color rendering, print rendering, lens persistence, reset, pan/recenter, no zoom on click, paused frame counts, responsive framing and console errors. The source model and existing master-map navigation remain untouched. No publication was performed.


## Window and light revision
Right glazing alone contains the garden. Its view ray intersects a distant garden plane, so camera translation changes the view rather than sliding a fixed wall print. Top glazing samples a 256px cube captured once from the actual In the life of model. Both window shaders discard the exterior side, including in the normal pass, so looking from outside leaves clear openings.

The complete room silhouette has wider camera framing (68-degree base field of view) and expanded world cut bounds. Drag cancellation also clears missed releases.

A shadowed, pane-patterned spotlight replaces flat floor light bands. It illuminates actual receiving surfaces, with object occlusion and softer pane edges. Its source shifts with lateral exploration to change the entry angle; this is an authored lighting response rather than a full physical daylight simulation. Shadow maps refresh when that source changes. There is no animated dust or suspended shaft card. Floor, room, furniture and windows have independent exposure and warmth controls; the floor mask follows actual floor geometry through the lens and normal pass.

## Combined-room alignment (November 4)
`tools/export-adjacent.py` reads studio-combined.blend and derives its exact transform into this card from the matching white desk in lab-studio-pinup.blend. It exports only the adjacent studio collections, excluding review assets and the ceiling slab. A one-time 256px cubemap capture uses this aligned asset; box-projected view rays keep architectural scale anchored rather than applying an arbitrary panorama scale. This is an approximation for interior objects at varying depths, not a full second live room.

The workshop export removes Large weathered privacy panel and trims the floor and its tile joints at Blender Y=1.395, just behind the top glazing. Both source blend files remain untouched. The spotlight now aims from the shared wall across the table/mannequin, with stronger illumination and narrower pane separators.

## Dramatic daylight treatment
`daylight.js` projects broad diagonal window apertures through world space onto the actual materials, including the table, mannequin and floor. It darkens unlit regions and raises warm light within the projected panes before printing. Pane edges soften with travel distance, and crossbars break up the light. Pan adjusts the common projection direction, preserving surface registration. This is an authored light field layered with the existing real shadows, not a physical volumetric simulation or a suspended plane. No additional draw calls or textures are required.

The top world clipping plane now ends at Z=-1.395 (the shared glazed wall), removing all protruding surfaces beyond it in color, normal/depth and shadow passes. Daylight and the spotlight both slope toward the opposite side, matching the latest annotated arrow.

Adjacent studio capture now shares the main room's negative-X daylight slope, with its aperture at the far studio wall. The capture uses matching directional illumination and a one-time 1024px shadow map; the runtime still retains only the cubemap.

Mannequin inset: a small exterior camera through the right glazing, rendered from the same scene and materials. It follows pan at reduced amplitude and shares print/grade controls and the main render lifecycle. The inset render is limited to its displayed resolution; it adds no second model download.

Window pan correction: outside-view transparency applies only below the glazing height, so the overhead camera crossing a wall during pan does not abruptly discard the portal. Box projection guards zero ray components. Inset follows a projected room anchor through the same lens, uses a fixed mannequin target and bounded tiny viewpoint offsets, and subtly varies its cut edge.

Portal stability revision: clipped materials preserve their original shader cache identity, including distinct cube and 2D portal programs. Overhead portal rays stay directed into their intended background at extreme pan angles. The mannequin card moves 10px left and uses the disco opposing-edge fold and sampled edge boil on a slanted quadrilateral; folding reverses as the frame returns.

The mannequin inset no longer folds or hides: it remains open while following the parent. Glazing export now uses one inward-facing quad per actual pane (16 studio and 18 exterior triangles), with a 12mm inward offset to avoid overlapping skins. Portal materials use the opaque depth/normal path with matched exterior discard; clear exterior views no longer leave an invisible normal occluder.

## Window backgrounds: clean replacement
`windows.js` replaces studio-window.js entirely. Both materials now use one unconditional samplerCube lookup of the world-space viewing ray. There is no box intersection, camera-side discard, transparency switching, ray sign correction, or wall-coordinate UV projection. The garden photo is resized once to square cube faces. The aligned adjacent studio is captured once, copied to six ordinary square images, and its temporary render target is disposed. This makes the cube usable by independent renderer contexts without sharing a live GPU render target. Only the mannequin detail render omits the two background surfaces to retain the view through the frames at the actual figure.

Main cut: cut-outline.js traces the cyan annotation and maps it through the inverse authored lens into a fixed world-camera cut. It follows the room during pan and affects color, normals/depth and shadow casters consistently. The mannequin inset temporarily bypasses only this silhouette mask, retaining its own card outline and the room's physical bounds.

Latest cyan revision restores the shared top wall to the dotted line and deepens the right glazing notch along the solid line. The fixed world anchor and lower/left silhouette are retained.
