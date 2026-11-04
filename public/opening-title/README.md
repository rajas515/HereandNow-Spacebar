# Take it to the grave — opening asset

Open `/opening-title/` on the existing preview server. Add `?clean` for the uninterrupted title with no controls. The loop lasts 14 seconds: 0.8 seconds empty, 4.5 seconds of threshold reveal with an extended ease-out, 5 seconds fully readable, 3.1 seconds of threshold erosion, and 0.6 seconds empty. The supplied lettering is used directly; no substitute font or tracing.

To integrate later, copy this folder, import `title.js` as a module, and place `<grave-title style="width:100%;height:100%"></grave-title>` in the desired container. Add the `transparent` attribute to composite over another scene. Set `.paused`, `.threshold` (0–0.98), or call `.replay()` to direct it. The `thresholdchange` event reports the current value in `detail`. Reduced-motion preferences show a static readable title until Play or Replay is selected.

The blue ink, magenta registration edge, and purple grain are drawn in a WebGL pass. Threshold is applied to the source image luminance, preserving the uneven disappearance of the original calligraphy. No external dependencies or network resources.

The side panel controls background, lettering and accent colors, edge highlight, wobble, paper noise, riso texture, bloom strength and spread. Settings persist in this browser and Reset restores defaults. H hides all controls. Embedders can edit the component's settings object; DEFAULT_SETTINGS is exported from title.js.

Download full loop exports an exact 420-frame, 14-second 1920x1080 H.264 MP4 at 30 fps. It snapshots the current palette and effects, renders frames through the same shader, and tags Rec.709 video colors. Export uses browser WebCodecs; no uploads or external encoders. Controls are excluded.
