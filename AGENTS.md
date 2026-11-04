# Project instructions

Each card has an independent page in public/<card>/. Preserve standalone routes and the existing /map/ page. The newer cards are not yet integrated into that map. Do not merge them unless requested.

Keep shared rendering in public/shared/. Test every dependent card after changes there. Preserve model-aligned cuts across color, normals/depth and shadow passes; keep props and lighting attached during camera pan. Preserve saved settings keys. Card insets remain focused on their subject and follow their parent composition.

Run npm run build and perform browser/WebGL checks for visual changes. Keep .blend sources, zip archives, screenshots and temporary exports outside the runtime/repository. Exported GLBs, textures and source scripts belong here. Never commit credentials or deploy without the task authorizing it.
