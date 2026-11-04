import bpy,json,time,math,tempfile,hashlib
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[1]/'public'/'skeletons-in-the-closet'/'assets';OUT.mkdir(parents=True,exist_ok=True)
TEMP=OUT.parents[2]/'tools'/'skeleton-export-temp';TEMP.mkdir(parents=True,exist_ok=True);tempfile.tempdir=str(TEMP)
s=bpy.context.scene;started=time.time()
for o in s.objects:
 for m in o.modifiers:
  if m.type in {'BEVEL','WEIGHTED_NORMAL','SUBSURF'}:m.show_viewport=False;m.show_render=False
 if o.type=='CURVE':o.data.resolution_u=5;o.data.bevel_resolution=0
for im in bpy.data.images:
 if max(im.size)>1024:
  factor=1024/max(im.size);im.scale(max(1,int(im.size[0]*factor)),max(1,int(im.size[1]*factor)))
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();groups={};heroes=[]
# Trim only the surplus beyond the shared glazed wall, in export memory.
import bmesh
for o in s.objects:
 if o.name=='Large weathered privacy panel':o.hide_render=True
 if o.type=='MESH' and (o.name=='Concrete studio floor' or o.name.startswith('Floor tile joint')):
  bm=bmesh.new();bm.from_mesh(o.data);bm.transform(o.matrix_world)
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,1.395,0),plane_no=(0,1,0),clear_outer=True,clear_inner=False)
  bm.transform(o.matrix_world.inverted());bm.to_mesh(o.data);bm.free()
obs=[o for o in s.objects if o.type in {'MESH','CURVE','FONT'} and not o.hide_render]
for o in obs:
 ev=o.evaluated_get(deps);me=ev.to_mesh();mw=o.matrix_world
 if o.name in {'Plane','Mannequin textured low poly'}:
  copy=me.copy();copy.transform(mw);heroes.append((o.name,copy));ev.to_mesh_clear();continue
 collection=next((c.name for c in o.users_collection),'')
 for p in me.polygons:
  mat=me.materials[p.material_index] if me.materials else None;name=mat.name if mat else ''
  key='windows-right' if o.name.startswith('Exterior window pane') else 'windows-studio' if 'glass' in name.lower() and 'monitor' not in name.lower() else 'room' if collection=='Architecture' else 'objects'
  # One inward-facing aperture surface per pane, not two overlapping box skins.
  # Preserve frosted inserts as room geometry rather than garden/room portals.
  if o.name=='Tall pale insert':key='room'
  if key in {'windows-right','windows-studio'}:
   normal=mw.to_3x3()@p.normal
   if key=='windows-right' and normal.x>-.9:continue
   if key=='windows-studio' and normal.y>-.9:continue
  node=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.use_nodes else None
  color=tuple(node.inputs['Base Color'].default_value) if node else tuple(mat.diffuse_color) if mat else (.04,.03,.05,1)
  g=groups.setdefault(key,{'verts':[],'faces':[],'colors':[]});ids=[]
  for idx in p.vertices:ids.append(len(g['verts']));g['verts'].append(tuple(mw@me.vertices[idx].co))
  g['faces'].append(ids);g['colors'].append(color)
 ev.to_mesh_clear()
web=bpy.data.scenes.new('Skeletons in the closet web');bpy.context.window.scene=web
for name,g in groups.items():
 me=bpy.data.meshes.new(name);me.from_pydata(g['verts'],[],g['faces']);me.update();attr=me.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
 for p,c in zip(me.polygons,g['colors']):
  for li in p.loop_indices:attr.data[li].color=c
 mat=bpy.data.materials.new('web '+name);mat.use_nodes=True;nt=mat.node_tree;node=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');vc=nt.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';nt.links.new(vc.outputs['Color'],node.inputs['Base Color']);node.inputs['Roughness'].default_value=.86;me.materials.append(mat)
 ob=bpy.data.objects.new(name,me);web.collection.objects.link(ob);bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
for name,me in heroes:
 ob=bpy.data.objects.new('hero-'+name,me);web.collection.objects.link(ob)
bpy.ops.export_scene.gltf(filepath=str(OUT/'studio.glb'),export_format='GLB',use_active_scene=True,export_cameras=False,export_lights=False,export_yup=True,export_normals=False)
manifest={'source':'lab-studio-pinup.blend','sourceSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'sourceObjects':len(obs),'bytes':(OUT/'studio.glb').stat().st_size,'meshes':{o.name:{'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)} for o in web.objects},'seconds':round(time.time()-started,2)}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('SKELETON_EXPORT',json.dumps(manifest),flush=True)
