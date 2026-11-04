# Contributing

1. Branch from main: `card/<card-name>-<change>`.
2. Work in the relevant public/<card>/ directory. Shared code changes must be tested in every dependent card.
3. Run `npm run build`. Preview desktop and narrow layouts; test drag, recenter, settings, clipping, both directions of transitions, and return from an offscreen/paused state.
4. Include screenshots, changed card routes, validation results and any asset-size changes in the pull request.
5. Review before merging. Do not integrate cards into the combined map unless that work is explicitly in scope.

Static checks do not replace browser/WebGL checks. Preserve the world-space cut, object registration during pan and each card's saved settings key. Do not use a viewport-fixed mask as a substitute for cutting the model. New camera insets must share treatment and focus while remaining anchored to their parent composition.
