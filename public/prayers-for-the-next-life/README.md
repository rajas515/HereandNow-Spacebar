# 09 — Prayers for the Next Life

Source: `three_lockers_equal.blend` (Nov 2026): three lockers (CENTER blue graffiti, LEFT and
RIGHT dark), each with eight bottom-hinged drop-down doors. `tools/export-prayers.py` writes
`assets/lockers.glb` (Draco, fronts as WebP, all doors closed); the blend stays outside the repo.
For web weight the export skips the millimetre bevels and decimates the dense round hardware
(hinge knuckles, pins, screws, pulls): about 509k → 130k vertices, 4.2 → 1.9 MB.

- **Doors are already rigged in the blend.** Every door's parts hang under a
  "Door NN | bottom hinge pivot" empty, and the blend opens a door by turning that empty about X
  (driver: `open_amount * 100°`). The GLB keeps those nodes, so the card opens a door by setting
  `hinge.rotation.x` (positive = outward). No armature needed.
- On load the ~825 small parts are merged per door and per material (and the cabinets likewise),
  so each door stays one movable node with a handful of meshes.
- The blend's camera is orthographic; the print pass needs perspective depth, so the card looks
  along the same line from `CAMERA_DISTANCE` away with a narrow lens (nearly flat, with a little
  real depth for the orbit). Framing keeps the camera's full width or height on any frame.
- Hover: the door under the pointer eases open `peek` degrees on a lightly under-damped spring,
  with the pointer cursor, as a hint. Clicking does nothing yet: the next step is a full open
  (towards `FULL_OPEN`) and a letter sliding out to read.
- Soft orbit (`orbit`), same as Reflections: the exhibition pan turns the view, the pointer a little.
- `TUNING` at the top of scene.js; on the standalone page the shared "Tune framing" panel
  (`shared/tuning-panel.js`) edits it live, and "Copy settings" gives the object to paste back.
- Look controls (in `TUNING`, for the final colour audit): print `riso`/`sketch`, `light` (scales all
  lamps), print-pass grades for the lockers (room region) and the graffiti fronts (foliage region),
  and per-material brightness (`blueSteel`, `darkSteel`, `hardware`, `graffiti`).
