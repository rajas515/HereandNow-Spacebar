"""Non-destructive export of studio_room.blend for the Karmic Debts card. Run with the blend open:
  blender -b studio_room.blend --python tools/export-karmic.py
Writes public/karmic-debts/assets/studio.glb: every visible mesh with modifiers applied, its
textures as WebP, Draco geometry. The blend's lights and its "Reference view" camera are left out:
the card lights the room itself and frames the corner from the sketch (see TUNING in scene.js).
Adds the purple door (reference photo) in the partition bay nearest that view.
The input blend is not saved."""
import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'karmic-debts' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
s = bpy.context.scene

# The purple door (from the reference photo) in the partition bay nearest the sketch camera,
# between "Partition mullion.006" and ".007", under "Partition transom.006".
# The two low rails no longer run across that bay; its glass keeps only the transom light above.
DOOR_Y = (-2.148, -1.353)
for name in ('Partition transom.004', 'Partition transom.005'):
    o = s.objects[name]
    o.scale.y *= (2.18 - DOOR_Y[1]) / 4.36
    o.location.y = (2.18 + DOOR_Y[1]) / 2
glass = s.objects['Smoked glass panel.005']
glass.scale.z *= (2.6 - 2.235) / 2.6
glass.location.z = (2.6 + 2.235) / 2

def material(name, rgb, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m

def box(name, x, y, z, mat):
    """Axis-aligned box from (min, max) ranges in metres."""
    me = bpy.data.meshes.new(name)
    (x0, x1), (y0, y1), (z0, z1) = x, y, z
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(v, [], f)
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    s.collection.objects.link(o)
    return o

paint = material('purple_door_paint', (.30, .26, .78), .55)
steel = bpy.data.materials.get('brushed_steel')
box('Purple door leaf', (2.3075, 2.3525), (DOOR_Y[0] + .008, DOOR_Y[1] - .008), (.01, 2.155), paint)
# Lever handle on the room side, near the left edge as seen from inside, lever pointing inward.
box('Door lever plate', (2.296, 2.3075), (-1.452, -1.408), (.88, 1.10), steel)
box('Door lever', (2.278, 2.296), (-1.555, -1.418), (1.005, 1.027), steel)
box('Door lever neck', (2.278, 2.296), (-1.44, -1.418), (1.0, 1.03), steel)
# Overhead door closer at the hinge side, with its arm.
box('Door closer body', (2.272, 2.3075), (-2.06, -1.80), (2.07, 2.135), steel)
box('Door closer arm', (2.262, 2.28), (-1.83, -1.62), (2.10, 2.115), steel)
bpy.context.view_layer.update()

for o in s.objects:
    o.select_set(o.type == 'MESH' and not o.hide_render)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'studio.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_cameras=False, export_lights=False, export_yup=True,
    export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82,
    export_animations=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12)
print('EXPORTED', OUT / 'studio.glb')
