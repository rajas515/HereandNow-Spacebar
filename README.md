# Here and Now — Spacebar

A buildless collection of independent scene cards. Node 20+ is needed for local preview and checks; no package installation is needed.

```sh
npm start
```

Open http://127.0.0.1:4175/. Run `npm run build` before a pull request; it checks source syntax, local references and the map bridge. `public/` is both the editable website source and the deployment directory; the build validates it without generating files.

## Pages

| Card | Folder / route |
|---|---|
| Disco ball | public/disco/ · /disco/ |
| Architecture | public/architecture/ · /architecture/ |
| In the life of | public/in-the-life-of/ · /in-the-life-of/ |
| Skeletons in the closet | public/skeletons-in-the-closet/ · /skeletons-in-the-closet/ |
| Existing combined map | public/map/ · /map/ |
| Title studies | public/opening-title/ and public/take-it-to-the-grave/ |

Each card owns its scene code, styling and assets. `public/shared/` contains the local Three.js vendor, print pass, cutout helpers, map bridge and existing map studio settings. The architecture card currently imports the studio's DEFAULT_LAYOUT; the other renderers share print and vendor code. Skeletons also reads the adjacent-room GLB and the existing garden photograph. See docs/DEPENDENCIES.md before moving shared assets.

The existing combined map still includes only disco and architecture. Card completion and integration of the newer pages are later work. Browser-saved scene settings are local and are not automatically shared with teammates.

## Team workflow

Create a branch for one card, edit its folder, preview its direct route, then run the checks and open a pull request. Avoid editing other cards or shared helpers without explaining the impact. Keep exported web assets here; exchange large Blender originals separately and record the source model revision in a card README. Do not commit credentials. See CONTRIBUTING.md and docs/CLOUDFLARE.md.

## GitHub

This folder is prepared for a new repository; no remote, upload or deployment is configured yet. After creating the intended GitHub repository, commit the reviewed files and add its URL as origin. Use a private repository initially if the supplied assets should remain private. CI runs on pushes and pull requests.
