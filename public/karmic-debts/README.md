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
- **Paper cut-out** (`cutout.js`), the way In the Life Of and the disco room cut theirs: the wide
  annotation is a hard-edged mask with a fibrous paper edge, projected from the un-orbited wide camera
  onto the world, so its edges stay on the surfaces and slide as the view orbits. Zooming in, straight
  world clipping planes (left, partition depth, front of the table, top) sweep in one after another,
  stepped with the zoom; the camera push starts once they have entered the room. They stop on the close
  annotation, measured into the room (`CLOSE_PLANES`): the room shell takes them tight, the furniture
  around the table a looser set, so the stool and the bench end stay whole past the shell's cut.
  Each plane starts at the edge of what the wide view keeps (not far outside the room), so the sweep
  moves in step with the zoom from its first frame. In the wide view the partition is cut by a straight
  vertical plane through the purple door (`right`), not by the mask.
  Colour, normal/depth and shadow passes share the cut. Card-local; the shared cutout is untouched.
- **Built like the other room cards (disco, Will):** the shared print pass; the model's own
  materials made matte; a warm sun through the partition with a 2048 soft shadow map (cached,
  redrawn only when tuning changes), sky/ground fill. No garden here: the partition is plain
  frosted grey glass (its own grade, `glass*`; it lets the light through and casts no shadow).
- **Purple door** (from the reference photo), added by the export in the partition bay nearest the
  view: lavender leaf, lever handle on the left, overhead closer, frosted transom light above; the
  two low rails no longer cross that bay. Brightness: `door`.
- **Weight:** 0.7 MB model (Draco, 512 px WebP textures), ~20k triangles drawn, 69 draw calls per
  frame across the colour and normal passes (was 151 before the props were merged). The room and the
  table props are each merged per material; the props (house-of-cards castle, loose cards, deck, mug,
  saucer, ashtray, wallet) stay their own group for the coming interaction and print in the pink
  accent ink (like the disco ball). The 2048 shadow map redraws only while the cut moves or tuning
  changes. On the standalone page the canvas reports `data-draw-calls`, `data-triangles`, `data-fps`.
- Soft orbit about the point looked at (`orbit`): the exhibition pan turns the view, the pointer a little.
- Look controls in `TUNING` for the final colour audit: `riso`, `sketch`, `light`, `sun`, grades for
  the room, the frosted glass and the table props, and material brightness (`walls`, `floor`, `wood`,
  `furniture`, `props`, `glass`, `door`). On the standalone page the shared "Tune framing & look" panel edits them;
  "Copy settings" gives the object to paste back.
- Not in the model, from the sketch: the vase with a flower on the table.
