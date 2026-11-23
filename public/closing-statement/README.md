# 10 — Closing Statement / Reflections

Source: `Mirror Composition.blend` (Nov 2026), scene "Floating mirror composition": eleven floating
mirrors seen through its "Reference composition" camera. `tools/export-reflections.py` writes
`assets/mirrors.glb` (bevels applied, Draco, camera included); the blend stays outside the repo.

- The composition and camera are used as authored. The card keeps the reference framing on any
  frame (full width on narrower frames, full height on wider ones).
- Frames take our violet-charcoal palette; each "Polished mirror silver" face is a live planar
  reflection (explicitly updated once per frame, oblique-clipped at the glass) printed in the
  accent (pink / violet) ink region of the shared print pass.
- The pointer stays the normal cursor. While it is over the card, every mirror the cursor's ray
  meets shows an arrow near the cursor. Its mirror image is built first as a decal on the glass
  plane that looks, from the viewer, like an upright cursor of `arrowSize` with its tip under the
  pointer; it is sunk `arrowFloat` (scaled by how squarely the mirror faces the viewer) behind
  the glass, so each mirror's tilt shifts it slightly off the cursor; then it is reflected through
  the glass plane to place the real arrow, seen only by that mirror's reflection camera. A light
  fill with a dark rim keeps it readable, since the print pass inks the glass by brightness.
  With the pointer away nothing extra shows. The mirrors also see a dim violet sky with one soft
  lamp (layer 1, reflections only).
- Framing: `TUNING` at the top of scene.js (composition rotation, offset, scale, camera zoom, arrow size and float, orbit range). On the standalone page a temporary "Tune framing" panel edits these live
  (kept in that browser); "Copy settings" gives the object to paste over `TUNING`.
- Soft orbit (`orbit`, degrees): the camera turns a little around the composition's centre. In
  the exhibition the world pan drives it (via `host.installMapBridge` viewport `localPanX/Y`), so a
  card off to one side is seen slightly from that side; the pointer adds a smaller turn. Eased.
- Full frame rate while the pointer moves, 30 fps otherwise; stops drawing off screen.
- Look controls (in `TUNING`, for the final colour audit): print `riso`/`sketch`, `light`, `sky`
  (brightness of what the mirrors see), print-pass grades for the frames (room region) and the
  glass (ball / accent region), and `frameTone` (frame material brightness).
