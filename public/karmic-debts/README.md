# 08 — Karmic Debts

Source: `studio_room.blend` (Nov 2026), the studio room. `tools/export-karmic.py` writes
`assets/studio.glb` (all visible meshes, modifiers applied, WebP textures, Draco; ~0.7 MB,
17k vertices). The blend's lights and its "Reference view" camera are not used; the blend stays
outside the repo.

- **View:** the corner from the reference sketch: back plaster wall on the left, the glass
  partition on the right, the two benches along them and the round table with the house of cards
  in front. The camera is a new composition (`camX/Y/Z`, `lookX/Y/Z`, `lens` in `TUNING`,
  metres with y up = the blend's x, z, -y). Plain perspective, no fisheye. The frame keeps the
  1.4 home shape's height on wider frames and its width on narrower ones.
- **Two views, like the disco ball zoom:** wide (the sketch corner) and close (pushed in on the
  table). Clicking the table goes in; the "Zoom out" button (bottom centre, close view only),
  Escape or a click away from the table comes back (clicks on
  the table in the close view are kept for the coming interaction); Enter toggles. The move takes
  2.6 s, stepped at 24 fps with cubic easing, blending camera position, look-at point and lens;
  the orbit eases to 40% in the close view. Close camera: `closeCam*`, `closeLook*`, `closeLens`.
- **Paper cut-out** (`cutout.js`), as in the other room cards: the annotated wide and close
  outlines (`WIDE_OUTLINE`, `CLOSE_OUTLINE`, image pixels of a 1.4 card) become soft fields, and every
  surface keeps or drops its pixels by projecting its world position through the camera each outline
  was drawn from (the un-orbited wide and close views). The cut lives on the geometry, so with the orbit
  its edges slide along walls, floor and furniture. During the zoom the two fields blend by the zoom
  amount (stepped with it), so the outline morphs from the corner to the table across the surfaces.
  Colour, normal/depth and shadow passes share the cut. Card-local, so the shared cutout is untouched.
- **Built like the other room cards (disco, Will):** the shared print pass; the model's own
  materials made matte; a warm sun through the partition with a 2048 soft shadow map (cached,
  redrawn only when tuning changes), sky/ground fill. No garden here: the partition is plain
  frosted grey glass (its own grade, `glass*`; it lets the light through and casts no shadow).
- **Purple door** (from the reference photo), added by the export in the partition bay nearest the
  view: lavender leaf, lever handle on the left, overhead closer, frosted transom light above; the
  two low rails no longer cross that bay. Brightness: `door`.
- The room is merged per material (~20 draw calls). The table props (house-of-cards castle,
  loose cards, deck, mug, saucer, ashtray, wallet) stay separate objects for the coming
  interaction, and print in the pink accent ink (like the disco ball) so they read as the focus.
- Soft orbit about the point looked at (`orbit`): the exhibition pan turns the view, the pointer a little.
- Look controls in `TUNING` for the final colour audit: `riso`, `sketch`, `light`, `sun`, grades for
  the room, the frosted glass and the table props, and material brightness (`walls`, `floor`, `wood`,
  `furniture`, `props`, `glass`, `door`). On the standalone page the shared "Tune framing & look" panel edits them;
  "Copy settings" gives the object to paste back.
- Not in the model, from the sketch: the vase with a flower on the table.
