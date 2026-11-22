# Project instructions

Each card has an independent page in public/<card>/. Preserve standalone routes and the existing /map/ page. The /map/ page includes all six existing pages via its registry. Keep the standalone entry pages intact and register future cards with placement defaults and appropriate map adapters.

Keep shared rendering in public/shared/. Test every dependent card after changes there. Preserve model-aligned cuts across color, normals/depth and shadow passes; keep props and lighting attached during camera pan. Preserve saved settings keys. Card insets remain focused on their subject and follow their parent composition.

Run npm run build and perform browser/WebGL checks for visual changes. Keep .blend sources, zip archives, screenshots and temporary exports outside the runtime/repository. Exported GLBs, textures and source scripts belong here. Never commit credentials or deploy without the task authorizing it.

The /exhibition/ page runs every card on one shared renderer with no iframes. Card scripts export `mount(host)` and must not reach the page directly: use the host API described in README (host.$, host.createRenderer, host.createGL, host.installMapBridge, host.embedded, host.documentElement, host.body, host.innerWidth/innerHeight) and resolve assets with `new URL(path, import.meta.url)`. Check a card on its own page, in /map/ and in /exhibition/ after changes.
