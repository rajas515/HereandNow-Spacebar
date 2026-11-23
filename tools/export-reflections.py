"""Non-destructive export of the floating mirror composition (Mirror Composition.blend)
for the Closing Statement / Reflections card. Run with the blend open:
  blender -b "Mirror Composition.blend" --python tools/export-reflections.py
Writes public/closing-statement/assets/mirrors.glb (meshes with bevels applied, plus the
'Reference composition' camera). The input blend is not saved."""
import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'closing-statement' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
s = bpy.context.scene
for o in s.objects:
    o.select_set(o.type in {'MESH', 'CAMERA'} and not o.hide_render)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'mirrors.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_cameras=True, export_lights=False, export_yup=True,
    export_materials='EXPORT', export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6, export_draco_position_quantization=16,
    export_draco_normal_quantization=12)
print('EXPORTED', OUT / 'mirrors.glb')
