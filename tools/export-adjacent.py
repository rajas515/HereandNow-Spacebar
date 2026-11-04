"""Portable, non-destructive export from the supplied studio panorama."""
import bpy, json, math, time
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'skeletons-in-the-closet'/'assets'
OUT.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene
started=time.time()
# Tiny manufactured bevels are subpixel in this card. Keep the authored meshes.
for o in s.objects:
    for m in o.modifiers:
        if m.type in {'BEVEL','WEIGHTED_NORMAL','SUBSURF'}: m.show_viewport=False; m.show_render=False
    if o.type=='CURVE': o.data.resolution_u=5; o.data.bevel_resolution=0
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
# Derive the exact common coordinate transform from the same desk in both files.
combinedDesk=bpy.data.objects['White laminate desktop'].matrix_world.copy()
with bpy.data.libraries.load('C:/Users/hp/Downloads/lab-studio-pinup.blend',link=False) as (src,dst):dst.objects=['White laminate desktop']
originalDesk=dst.objects[0]
alignment=originalDesk.matrix_basis@combinedDesk.inverted()
print('ALIGNMENT',list(map(list,alignment)),flush=True)
groups={}
stats={}
paper_edges=[]
for prefix,label in [('01','architecture'),('02','furniture'),('03','desk-details'),('04','services')]:
    collection=next(c for c in bpy.data.collections if c.name.startswith(prefix))
    obs=[o for o in collection.all_objects if o.type in {'MESH','CURVE','FONT'} and not o.hide_render and o.name!='White ceiling slab']
    stats[label]=len(obs)
    for o in obs:
        root=o
        while root.parent is not None:root=root.parent
        central_furniture=label=='furniture' and root.name.startswith(('C01','C02','C03','C seat ','Loose chair entrance'))
        ev=o.evaluated_get(deps)
        me=ev.to_mesh()
        if not me:continue
        mw=o.matrix_world
        coords=[tuple(alignment@mw@v.co) for v in me.vertices]
        if o.name.startswith('Curled paper sheet') and -1.5<root.matrix_world.translation.x<1.8 and -2.5<root.matrix_world.translation.y<2.3:
            counts={}
            for face in o.data.polygons:
                ids=list(face.vertices)
                for a,b in zip(ids,ids[1:]+ids[:1]):
                    edge=tuple(sorted((a,b)));counts[edge]=counts.get(edge,0)+1
            for (a,b),count in counts.items():
                if count==1:
                    for idx in (a,b):
                        x,y,z=mw@o.data.vertices[idx].co;paper_edges.extend((x,z+.003,-y))
        for poly in me.polygons:
            mat=me.materials[poly.material_index] if me.materials else None
            name=mat.name if mat else ''
            if name=='Clear slightly green window glass': key='window-portals'
            elif name=='Blue green opaque glazing panels' and label=='architecture': key='foliage-panels'
            elif label=='furniture':
                key='central-furniture' if central_furniture else label
            elif label=='desk-details':
                center=mw@poly.center
                key='details-central' if -1.5<center.x<1.8 and -2.5<center.y<2.3 else 'details-perimeter-%d-%d'%(math.floor(center.x/2.5),math.floor(center.y/2.5))
            else:key=label
            p=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.use_nodes else None
            color=tuple(p.inputs['Base Color'].default_value) if p else tuple(mat.diffuse_color) if mat else (.035,.025,.05,1)
            g=groups.setdefault(key,{'verts':[],'faces':[],'colors':[],'source':0})
            # Keep source indexing locally, deduplicate after collection with merge by distance.
            ids=[]
            for idx in poly.vertices:
                ids.append(len(g['verts']));g['verts'].append(coords[idx])
            g['faces'].append(ids);g['colors'].append(color)
        ev.to_mesh_clear()

export_scene=bpy.data.scenes.new('In the life of • web export')
bpy.context.window.scene=export_scene
for name,g in groups.items():
    me=bpy.data.meshes.new(name);me.from_pydata(g['verts'],[],g['faces']);me.update()
    color=me.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
    for poly,c in zip(me.polygons,g['colors']):
        for li in poly.loop_indices:color.data[li].color=c
    ob=bpy.data.objects.new(name,me);export_scene.collection.objects.link(ob)
    mat=bpy.data.materials.new('web • '+name);mat.use_nodes=True
    p=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Color'
    mat.node_tree.links.new(attr.outputs['Color'],p.inputs['Base Color']);p.inputs['Roughness'].default_value=.86
    me.materials.append(mat)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    # Weld identical corners, retaining per-corner color and hard silhouettes.
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.object.mode_set(mode='OBJECT')
    ob.select_set(False)
bpy.ops.export_scene.gltf(filepath=str(OUT/'adjacent-aligned.glb'),export_format='GLB',use_active_scene=True,export_cameras=False,export_lights=False,export_yup=True,export_materials='EXPORT',export_attributes=False,export_normals=False)
manifest={'source':'studio-combined.blend','sourceObjects':stats,'meshes':{o.name:{'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)} for o in export_scene.objects},'bytes':(OUT/'adjacent-aligned.glb').stat().st_size,'seconds':round(time.time()-started,2),'camera':{'position':[.159,3.258,.284],'up':[-1,0,0],'target':[.159,0,.284],'fov':122}}
(OUT/'adjacent-manifest.json').write_text(json.dumps(manifest,indent=2))
(OUT/'paper-edges.json').write_text(json.dumps(paper_edges,separators=(',',':')))
print('LIFE_EXPORT',json.dumps(manifest),flush=True)

