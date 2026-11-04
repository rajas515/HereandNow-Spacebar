# Source asset handoff

Large authoring files remain outside this repository. Current scripts expect these input models:

- export-life.py: studio-panorama-v3.blend
- export-skeletons.py: lab-studio-pinup.blend
- export-adjacent.py: studio-combined.blend, plus lab-studio-pinup.blend to derive the matching desk transform.

Run Blender in a separate background process with the desired source file open and the relevant script passed to --python. Scripts write to public/<card>/assets and do not save the input blend. Update the source paths in export-adjacent.py for your machine. The supplied assets can be previewed without Blender.

Disco assets and architecture image meshes are retained from the original Green Hour package. Keep existing licensing/provenance notes with any replacement assets.
