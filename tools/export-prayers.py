"""Non-destructive export of the three lockers (three_lockers_equal.blend) for the
Prayers for the Next Life card. Run with the blend open:
  blender -b three_lockers_equal.blend --python tools/export-prayers.py
Writes public/prayers-for-the-next-life/assets/lockers.glb: the three locker collections with
modifiers applied, every door kept under its "bottom hinge pivot" empty (the card turns that
node about X to open the door, as the blend's driver does: open_amount * 100 deg), the
photographed fronts as WebP, and the orthographic "Camera". The studio floor and lights are
left out. All doors are exported closed. The input blend is not saved."""
import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'prayers-for-the-next-life' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
s = bpy.context.scene

# Close every door (the controls drive the hinge pivots).
for o in s.objects:
    if 'DOOR CONTROLS' in o.name:
        if o.animation_data:
            o.animation_data.action = None
        for k in list(o.keys()):
            if k.startswith('Door_') and k.endswith('_Open'):
                o[k] = 0.0
bpy.context.view_layer.update()

lockers = [c for c in bpy.data.collections if c.name.split(' |')[0] in {'CENTER', 'LEFT', 'RIGHT'}]

# Web weight: millimetre bevels and the many-segment round hardware (hinge knuckles, pins,
# screws, pulls) are a pixel or two in this card, yet were ~95% of the vertices.
# Skip the bevels and decimate dense small parts; the blend itself is not saved.
for c in lockers:
    for o in c.all_objects:
        if o.type != 'MESH':
            continue
        for m in o.modifiers:
            if m.type == 'BEVEL':
                m.show_viewport = m.show_render = False
        if len(o.data.vertices) > 150 and max(o.dimensions) < .12:
            d = o.modifiers.new('web decimate', 'DECIMATE')
            d.ratio = .2
bpy.context.view_layer.update()
keep = set()
for c in lockers:
    for o in c.all_objects:
        if not o.hide_render and o.type in {'MESH', 'EMPTY'} and 'DOOR CONTROLS' not in o.name:
            keep.add(o)
camera = s.camera
for o in s.objects:
    o.select_set(o in keep or o == camera)

bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'lockers.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_cameras=True, export_lights=False, export_yup=True, export_extras=True,
    export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82,
    export_animations=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12)

print('EXPORTED', OUT / 'lockers.glb')
