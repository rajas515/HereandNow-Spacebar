# Here and Now — Spacebar



A buildless collection of independent scene cards. Node 20+ is needed for local preview and checks; no package installation is needed.



```sh

npm start

```



Open http://127.0.0.1:4180/. Run `npm run build` before a pull request; it checks source syntax, local references and the map bridge. `public/` is both the editable website source and the deployment directory; the build validates it without generating files.



## Pages



| Card | Folder / route |

|---|---|

| Disco ball | public/disco/ · /disco/ |

| Architecture | public/architecture/ · /architecture/ |

| In the life of | public/in-the-life-of/ · /in-the-life-of/ |

| Skeletons in the closet | public/skeletons-in-the-closet/ · /skeletons-in-the-closet/ |

| Combined map | public/map/ · /map/ |

| Title studies | public/opening-title/ and public/take-it-to-the-grave/ |



Each card owns its scene code, styling and assets. `public/shared/` contains the local Three.js vendor, print pass, cutout helpers, map bridge and existing map studio settings. The architecture card currently imports the studio's DEFAULT_LAYOUT; the other renderers share print and vendor code. Skeletons also reads the adjacent-room GLB and the existing garden photograph. See docs/DEPENDENCIES.md before moving shared assets.



The combined map now includes all six existing pages. Open /map/ to explore them together. Card completion can continue independently on each standalone route. Browser-saved scene settings are local and are not automatically shared with teammates.



## Team workflow



Create a branch for one card, edit its folder, preview its direct route, then run the checks and open a pull request. Avoid editing other cards or shared helpers without explaining the impact. Keep exported web assets here; exchange large Blender originals separately and record the source model revision in a card README. Do not commit credentials. See CONTRIBUTING.md and docs/CLOUDFLARE.md.



## GitHub



This folder is prepared for a new repository; no remote, upload or deployment is configured yet. After creating the intended GitHub repository, commit the reviewed files and add its URL as origin. Use a private repository initially if the supplied assets should remain private. CI runs on pushes and pull requests.


## Combined map controls

Use the six named navigation buttons, previous/next, or keys 1–6 to focus a card. Drag or use the trackpad to pan. Ctrl-wheel changes map scale; M or the overview button fits all cards, including custom placements. Home recenters the active card. Zoom applies to disco, architecture and the worktable studio; it is disabled for the single-view workshop and title studies.

Open Shared print controls, then a card tab. Horizontal/vertical position, scale and rotation place the whole card. Existing disco and architecture subframe controls remain. Color/value controls affect the selected stack; title studies expose their supported exposure, value, contrast and saturation adjustments. Settings persist locally and can be exported/imported with Save settings and Load settings. Older two-card saves retain their placements and receive defaults for the four additional pages.

The map transform loop sleeps when navigation settles. Iframes load near the view, retain state after loading, and receive visibility messages so hidden scenes stop drawing. Overview uses lower render resolution and frame/detail caps. Title studies also skip offscreen draws. Narrow screens keep the inner card viewport in landscape rather than stretching its composition. Performance depends on the device and the number of visible cards; loaded cards retain GPU resources so returning does not restart them.

## Adopted map preset and camera motion

The starting layout, print and quality values now match `docs/presets/green-hour-2026-11-14.json` (the supplied settings export). The map adopts this revision once per browser; subsequent adjustments remain saved normally. Reset uses this supplied layout.

The studio and workshop use the standalone drag camera's world-units-per-pixel calculation in the combined map. Parent displacement is converted into each card's own scale and rotation. An off-axis projection cancels only the reference-plane translation already supplied by the map, leaving the actual depth parallax. Overview retains the authored centered views. Disco no longer adds a second print-canvas translation inside its parent; its camera and inset depth movement remain.

## Exhibition (one renderer, no iframes)

Open /exhibition/. It opens on Act I (`public/act-1`, see its README): scrolling plays its sequence, and once it dissolves to empty paper scrolling pans straight down into Act II, whose chapters are listed in `public/exhibition/chapters.js` (title, card folder, world position, scale). Drag pans anywhere, Ctrl+scroll or pinch zooms within a fixed range (`ZOOM` in exhibition.js), M or Map zooms out to its limit, ←/→ jump between chapters, and the minimap jumps to a room.

To rearrange, open /exhibition/?arrange: drag a card to move it, Alt+scroll over it to resize it, then press Copy layout and paste the result over `chapters.js`. Until then the arrangement is kept only in that browser; Reset discards it.

All cards draw through one shared WebGL renderer (`public/exhibition/world-gl.js`). Each card keeps its own scene code and print pass, but renders into an offscreen surface the size of its frame; the world then places those images, so print dots and grain look exactly as on the card's own page. The card's page markup and CSS load into a shadow root where the iframe used to be. A drag always pans the world; clicks and hover reach the card.

Card scripts are modules exporting `mount(host)` (see `public/shared/card-host.js`). The standalone page and the /map/ iframes call `mount(pageHost())`; the exhibition passes its own host. In card code use `host.$`/`host.$$` instead of `document.querySelector`, `host.createRenderer(options)` instead of `new THREE.WebGLRenderer`, `host.createGL(canvas, attributes)` for raw WebGL, `host.installMapBridge`, `host.embedded`, `host.documentElement`, `host.body` and `host.innerWidth`/`host.innerHeight`, and load assets with `new URL(path, import.meta.url)` so paths resolve from the card folder.
