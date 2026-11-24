import * as THREE from '../shared/vendor/three.module.js';
import {PrintPass} from '../shared/print-pass.js';
import {installComposition} from '../shared/cutout/composition.js';
import {CORNER_TRACE,outlinePoint} from './cut-outline.js';
// The inset (and the confession bubble under it) are pinned to a room corner: each frame its point is
// projected through the current camera and lens, and the pair keep the layout measured on the card's
// own page relative to it, in stage-height units. Panning, the exhibition's wider frame and its world
// pan all leave them on that corner.
export const PIN={inset:{x:-.245,y:-.648,width:.412,height:.47},bubble:{x:-.118,y:-.214,width:.483}};
export function createMannequinInset(scene,mainPass,stage,mainCamera,clipping,createRenderer=options=>new THREE.WebGLRenderer(options),onPin=()=>{}){
 const canvas=document.createElement('canvas');canvas.id='mannequin-inset';canvas.setAttribute('aria-label','Detail view of the mannequin through the studio window');stage.append(canvas);
 const renderer=createRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.localClippingEnabled=true;
 const pass=new PrintPass(renderer);installComposition(pass);pass.normalMaterials=mainPass.normalMaterials;
 const restCamera=mainCamera.clone();restCamera.position.set(-.033,7.146,.096);restCamera.lookAt(.318,0,.106);restCamera.updateMatrixWorld(true);
 const anchor=new THREE.Vector3(-2.7,.7,1.6);
 function screenPoint(cam,settings,point=anchor){const p=point.clone().project(cam);const aspect=mainCamera.aspect;let x=p.x*.5*aspect,y=p.y*.5;const radius=Math.hypot(x,y);let r=radius;const strength=Number(settings.lens);for(let i=0;i<6;i++)r=radius*(1.+strength*.16)/(1.+strength*r*r);const ratio=radius>0?r/radius:1;return new THREE.Vector2(x*ratio/aspect*Number(settings.width),-y*ratio);}
 const camera=new THREE.PerspectiveCamera(19,1,.06,35);const size=new THREE.Vector2();
 // The room corner the inset and bubble are pinned to: the outline's lower-left point, traced from
 // the outline's own camera (the authored 1.42 composition) onto the floor.
 let corner=null;
 function findCorner(){const cam=restCamera.clone();cam.aspect=1.42;cam.fov=mainCamera.fov;cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
  const [u,v]=outlinePoint(CORNER_TRACE),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(u*2-1,1-v*2),cam);
  // On the room's near cut face (world z = 3.2, the stage clipping bound), where the silhouette's corner is.
  const p=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,-1),3.2),p)?p:anchor.clone();}
 return {render(pan,pointer,time,settings){
 const r=canvas.getBoundingClientRect();const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));renderer.getSize(size);if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();pass.resize();}
 // Fixed portrait target; only millimetric viewpoint changes for depth.
 camera.position.set(4.4+pointer.x*.012+Math.tanh(pan.x)*.018,1.9,-.4+Math.tanh(pan.y)*.012);camera.lookAt(-2.49,1.40,.10);

 for(const [k,v] of Object.entries(mainPass.settings))pass.set(k,v);
 for(const region of Object.keys(mainPass.grades))for(const [k,v] of Object.entries(mainPass.grades[region]))pass.setGrade(region,k,v);
 pass.uniforms.uLensStrength.value=.12;pass.uniforms.uCardStretch.value=1;
 restCamera.aspect=mainCamera.aspect;restCamera.fov=mainCamera.fov;restCamera.updateProjectionMatrix();mainCamera.updateMatrixWorld(true);
 const delta=screenPoint(mainCamera,settings).sub(screenPoint(restCamera,settings)),bounds=stage.getBoundingClientRect();
 corner??=findCorner();void delta,bounds;
 const W=stage.clientWidth,H=stage.clientHeight,at=screenPoint(mainCamera,settings,corner);
 const cx=W/2+at.x*W+pointer.x*.5,cy=H/2+at.y*H+pointer.y*.5;
 // Offsets and size from the Adjust panel (Position), falling back to PIN.
 const ix=settings.insetX??PIN.inset.x,iy=settings.insetY??PIN.inset.y,is=settings.insetSize??1;
 Object.assign(canvas.style,{left:'0',top:'0',bottom:'auto',width:PIN.inset.width*is*H+'px',height:PIN.inset.height*is*H+'px'});
 canvas.style.transform=`translate(${cx+ix*H}px,${cy+iy*H}px)`;
 onPin(cx,cy,H);
 // Keep the authored card open at every pan offset.
 const open=1,corners=[[0,6],[68,0],[100,95],[23,100]];
 const points=[],phase=Math.floor(time*8);
 for(let e=0;e<4;e++)for(let j=0;j<24;j++){const t=j/24,a=corners[e],b=corners[(e+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.max(.001,Math.hypot(dx,dy));const noise=Math.sin(j*12.9898+e*78.233+phase*6.713)*.23*open;points.push(`${a[0]+dx*t-dy/len*noise}% ${a[1]+dy*t+dx/len*noise}%`);}
 canvas.style.clipPath=`polygon(${points.join(',')})`;canvas.dataset.openness=open.toFixed(3);canvas.style.visibility='visible';

 // The detail camera looks through the aperture at the actual figure.
 const panes=[];scene.traverse(o=>{if(o.name==='windows-right'||o.name==='windows-studio'){panes.push([o,o.visible]);o.visible=false;}});
 clipping.setSilhouetteEnabled(false);
 try{pass.render(scene,camera,time);}finally{clipping.setSilhouetteEnabled(true);for(const [o,visible] of panes)o.visible=visible;}
 }};
}


