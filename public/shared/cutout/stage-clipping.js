import * as THREE from '../vendor/three.module.js';
import {WIDE_OUTLINE} from './composition.js';

const CENTRAL=new Set(['central-furniture','details-central','table-paper-ink']);

export function createStageClipping(renderer,scene,pass,options={}){
  const outline=options.outline||WIDE_OUTLINE;
  const mask=document.createElement('canvas');mask.width=mask.height=1024;
  const ctx=mask.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,1024,1024);
  ctx.fillStyle='white';ctx.beginPath();
  outline.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x*1024,y*1024);else ctx.lineTo(x*1024,y*1024);});ctx.closePath();ctx.fill();
  // Small deterministic fibre irregularities remain attached to the cut volume.
  ctx.lineWidth=1.1;ctx.strokeStyle='black';
  outline.forEach(([x,y],i)=>{
    const b=outline[(i+1)%outline.length],dx=(b[0]-x)*1024,dy=(b[1]-y)*1024,len=Math.hypot(dx,dy);
    for(let j=2;j<len;j+=5){const t=j/len;ctx.fillStyle=Math.sin(j*7.1+i)>0?'black':'white';ctx.fillRect(x*1024+dx*t-.6,y*1024+dy*t-.6,1.2,1.2);}
  });
  const cutTexture=new THREE.CanvasTexture(mask);cutTexture.minFilter=THREE.LinearFilter;cutTexture.generateMipmaps=false;
  const uniforms={stageCutEnabled:{value:1},stageCut:{value:cutTexture},stageProjection:{value:new THREE.Matrix4()}};
  const planes=[
    new THREE.Plane(new THREE.Vector3(1,0,0),5.05),new THREE.Plane(new THREE.Vector3(-1,0,0),4.35),
    new THREE.Plane(new THREE.Vector3(0,0,1),5.1),new THREE.Plane(new THREE.Vector3(0,0,-1),5.1),
    new THREE.Plane(new THREE.Vector3(0,1,0),.4),new THREE.Plane(new THREE.Vector3(0,-1,0),4.05)
  ];
  const roomHeight=new THREE.Plane(new THREE.Vector3(-.13,-1,-.085).normalize(),5.1),roomPlanes=[...planes,roomHeight];
  if(options.bounds)planes.forEach((p,i)=>p.constant=options.bounds[i]);
  if(options.roomHeight!==undefined)roomHeight.constant=options.roomHeight;
  renderer.localClippingEnabled=true;
  renderer.clippingPlanes=[];
  const attached=new WeakSet();
  const main=/void\s+main\s*\(\s*\)\s*\{/;
  function attachMaterial(material,background=false){
    material.clippingPlanes=background?roomPlanes:planes;material.clipShadows=true;
    if(attached.has(material))return;attached.add(material);
    if(material.isShaderMaterial)material.clipping=true;
    const before=material.onBeforeCompile;
    const originalProgramKey=material.customProgramCacheKey();
    const shaderIdentity=material.isShaderMaterial?material.vertexShader+material.fragmentShader:originalProgramKey;
    material.onBeforeCompile=function(shader,...args){
      before.call(this,shader,...args);Object.assign(shader.uniforms,uniforms);
      const custom=!shader.vertexShader.includes('clipping_planes_pars_vertex');
      shader.vertexShader='varying vec3 vStagePoint;\n'+(custom?'#include <clipping_planes_pars_vertex>\n':'')+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace(main,`void main(){
        vStagePoint=(modelMatrix*vec4(position,1.0)).xyz;
        ${custom?'vec4 mvPosition=modelViewMatrix*vec4(position,1.0);\n#include <clipping_planes_vertex>':''}
      `);
      shader.fragmentShader=`varying vec3 vStagePoint;uniform sampler2D stageCut;uniform mat4 stageProjection;uniform float stageCutEnabled;
        ${custom?'#include <clipping_planes_pars_fragment>':''}
        void keepStageSurface(){
          if(stageCutEnabled<.5)return;
          vec4 q=stageProjection*vec4(vStagePoint,1.0);
          vec2 uv=q.xy/max(q.w,.00001)*.5+.5;
          if(q.w<=0.0||any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0)))||texture2D(stageCut,uv).r<.5)discard;
        }\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace(main,`void main(){
        keepStageSurface();
        ${custom?'#include <clipping_planes_fragment>':''}
      `);
    };
    material.customProgramCacheKey=()=>`life-world-cut-v1-${material.type}-${shaderIdentity}-${material.alphaTest>0?'alpha':'solid'}`;
    material.needsUpdate=true;
  }
  function attachObject(o){
    if(o.userData.sourceOnly)return;
    if(!(o.isMesh||o.isLine)||!o.material)return;
    const original=o.material,background=!CENTRAL.has(o.name);
    attachMaterial(original,background);
    if(o.isMesh&&!original.transparent){
      let normal=pass.normalMaterials.get(original);
      if(!normal){
        normal=new THREE.MeshNormalMaterial({flatShading:!!original.flatShading,side:original.side,transparent:true,opacity:original.userData.accent?1:original.userData.foliage?.5:0,blending:THREE.NoBlending});
        pass.normalMaterials.set(original,normal);
      }
      normal.forceSinglePass=true;
      attachMaterial(normal,background);
    }
    if(o.isMesh&&o.castShadow){
      o.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide,map:original.map,alphaTest:original.alphaTest});
      attachMaterial(o.customDepthMaterial,background);
    }
  }
  scene.traverse(attachObject);
  let lastMix=-1;
  return {
    setSilhouetteEnabled(enabled){uniforms.stageCutEnabled.value=enabled?1:0;},
    setAnchor(camera){camera.updateMatrixWorld(true);uniforms.stageProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);renderer.shadowMap.needsUpdate=true;},
    update(mix){
      if(Math.abs(lastMix-mix)<.000001)return;lastMix=mix;
      const progress=THREE.MathUtils.clamp((mix-.04)/.91,0,1);
      const phase=(start,end)=>THREE.MathUtils.clamp((progress-start)/(end-start),0,1);
      planes[0].constant=THREE.MathUtils.lerp(5.05,1.55,phase(0,.95));
      planes[1].constant=THREE.MathUtils.lerp(4.35,1.98,phase(.08,1));
      planes[2].constant=THREE.MathUtils.lerp(5.1,3.0,phase(.04,.97));
      planes[3].constant=THREE.MathUtils.lerp(5.1,2.84,phase(0,.94));
      // The inclined room plane sweeps across the floor instead of deleting
      // the entire horizontal slab on a single frame.
      planes[4].constant=.4;
      planes[5].constant=THREE.MathUtils.lerp(4.05,1.14,phase(0,.48));
      roomHeight.constant=THREE.MathUtils.lerp(5.1,-.80,phase(.12,1));
      renderer.shadowMap.needsUpdate=true;
    },
    get state(){return {space:'world',bounds:planes.map(p=>Number(p.constant.toFixed(4))),roomHeight:Number(roomHeight.constant.toFixed(4))};}
  };
}
