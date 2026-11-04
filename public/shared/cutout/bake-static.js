import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

// Independently placed paper plates share two atlases and a single draw call.
// Capture before printing; cached normals retain the original interior contours.
export function bakePerimeter(renderer,scene,camera,room,printPass){
  const originals=[];room.traverse(o=>{if(o.isMesh&&o.name.startsWith('details-perimeter-'))originals.push(o);});
  if(!originals.length)return;
  const grid=Math.ceil(Math.sqrt(originals.length)),size=2048,tile=Math.floor(size/grid);
  const color=new THREE.WebGLRenderTarget(size,size,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  const normal=new THREE.WebGLRenderTarget(size,size,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  const oldTarget=renderer.getRenderTarget(),oldColor=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha();
  const bg=scene.background,override=scene.overrideMaterial,auto=renderer.autoClear;
  const shadows=renderer.shadowMap.enabled;renderer.shadowMap.enabled=false;
  const all=[];room.traverse(o=>{if(o.isMesh||o.isLine){all.push([o,o.visible]);o.visible=false;}});
  scene.background=null;renderer.autoClear=false;renderer.setClearColor(0,0);
  for(const rt of [color,normal]){renderer.setRenderTarget(rt);renderer.setScissorTest(false);renderer.clear();}
  const capture=camera.clone();
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),forward=new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion);
  const normalMat=new THREE.MeshNormalMaterial({flatShading:true,side:THREE.DoubleSide});
  const plates=[];
  room.updateMatrixWorld(true);
  originals.forEach((o,index)=>{
    const box=new THREE.Box3().setFromObject(o),center=box.getCenter(new THREE.Vector3());
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const v=new THREE.Vector3(x,y,z).project(camera),dx=v.x,dy=v.y;
      minX=Math.min(minX,dx);maxX=Math.max(maxX,dx);minY=Math.min(minY,dy);maxY=Math.max(maxY,dy);
    }
    const midX=(minX+maxX)/2,midY=(minY+maxY)/2;
    const spanX=(maxX-minX)*1.04,spanY=(maxY-minY)*1.04;
    const depth=center.clone().sub(camera.position).dot(forward)*-1;
    const half=depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const width=spanX*half*camera.aspect,height=spanY*half;
    const plateCenter=camera.position.clone().addScaledVector(forward,-depth).addScaledVector(right,midX*half*camera.aspect).addScaledVector(up,midY*half);
    const fullH=10000,fullW=fullH*camera.aspect;
    capture.setViewOffset(fullW,fullH,(midX-spanX/2+1)/2*fullW,(1-midY-spanY/2)/2*fullH,spanX/2*fullW,spanY/2*fullH);
    capture.updateMatrixWorld();
    const x=index%grid*tile,y=Math.floor(index/grid)*tile;
    o.visible=true;
    for(const [rt,mat] of [[color,null],[normal,normalMat]]){
      renderer.setRenderTarget(rt);renderer.setViewport(x,y,tile,tile);renderer.setScissor(x,y,tile,tile);renderer.setScissorTest(true);scene.overrideMaterial=mat;renderer.render(scene,capture);
    }
    o.visible=false;
    const g=new THREE.PlaneGeometry(width,height);g.applyQuaternion(camera.quaternion);g.translate(...plateCenter.toArray());
    const uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(x+2+uv.getX(i)*(tile-4))/size,(y+2+uv.getY(i)*(tile-4))/size);
    plates.push(g);
  });
  scene.background=bg;scene.overrideMaterial=override;renderer.autoClear=auto;renderer.setScissorTest(false);renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldColor,oldAlpha);
  renderer.shadowMap.enabled=shadows;
  const dimensions=renderer.getDrawingBufferSize(new THREE.Vector2());renderer.setViewport(0,0,dimensions.x,dimensions.y);
  all.forEach(([o,v])=>{o.visible=v;});
  const material=new THREE.MeshStandardMaterial({map:color.texture,color:0,emissive:0xffffff,emissiveMap:color.texture,alphaTest:.025,side:THREE.DoubleSide,roughness:1});
  const normals=new THREE.ShaderMaterial({uniforms:{plateColor:{value:color.texture},plateNormal:{value:normal.texture}},side:THREE.DoubleSide,blending:THREE.NoBlending,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv;uniform sampler2D plateColor,plateNormal;void main(){if(texture2D(plateColor,vUv).a<.025)discard;gl_FragColor=vec4(texture2D(plateNormal,vUv).rgb,0.);}'
  });
  printPass.normalMaterials.set(material,normals);
  const mesh=new THREE.Mesh(mergeGeometries(plates),material);mesh.name='perimeter-paper-plates';scene.add(mesh);
  plates.forEach(g=>g.dispose());normalMat.dispose();
  let removed=0;
  originals.forEach(o=>{removed+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3;o.geometry.dispose();o.material.dispose();o.removeFromParent();});
  return {plates:originals.length,removedTriangles:removed,atlasSize:size,retainedTargets:[color,normal]};
}
