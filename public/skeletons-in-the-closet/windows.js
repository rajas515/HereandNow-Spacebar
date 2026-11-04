import * as THREE from '../shared/vendor/three.module.js';
import {GLTFLoader} from '../shared/vendor/GLTFLoader.js';
import {createDaylight} from './daylight.js';

async function captureStudio(renderer){
 const room=(await new GLTFLoader().loadAsync('./assets/adjacent-aligned.glb?v=combined1')).scene;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#c5c8be');
 const daylight=createDaylight({windowZ:-10.9});
 room.traverse(o=>{if(o.isMesh){o.material.side=THREE.DoubleSide;o.material.roughness=.85;daylight.apply(o.material);o.castShadow=true;o.receiveShadow=true;if(o.name==='window-portals')o.visible=false;}});scene.add(room);
 scene.add(new THREE.HemisphereLight('#fff5df','#46535b',.45));const sun=new THREE.DirectionalLight('#ffefce',3);sun.target.position.set(-1.55,0,-6.176);sun.position.set(1.33,4.32,-12.176);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:25});sun.shadow.normalBias=.025;scene.add(sun,sun.target);
 const target=new THREE.WebGLCubeRenderTarget(256,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});const camera=new THREE.CubeCamera(.05,40,target);camera.position.set(-1.55,1.65,-6.176);scene.add(camera);
 const tone=renderer.toneMapping,shadows=renderer.shadowMap.enabled;renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;
 camera.update(renderer,scene);renderer.toneMapping=tone;renderer.shadowMap.enabled=shadows;
 room.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});
 // Read once into ordinary images so both renderer contexts own valid cubes.
 const images=[];
 for(let face=0;face<6;face++){
  const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels,face);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),256,256),0,0);images.push(canvas);
 }
 target.dispose();const cube=new THREE.CubeTexture(images);cube.needsUpdate=true;return cube;
}

function windowMaterial(cube){
 const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,depthWrite:true,uniforms:{backgroundCube:{value:cube}},
 vertexShader:`varying vec3 windowWorld;void main(){windowWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform samplerCube backgroundCube;varying vec3 windowWorld;void main(){gl_FragColor=vec4(textureCube(backgroundCube,normalize(windowWorld-cameraPosition)).rgb,1.);}`});
 material.userData.foliage=true;return material;
}
export async function createWindowBackgrounds(renderer){
 const [studio,image]=await Promise.all([captureStudio(renderer),new THREE.ImageLoader().loadAsync('../disco/assets/garden.jpg')]);
 const gardenFace=document.createElement('canvas');gardenFace.width=gardenFace.height=512;gardenFace.getContext('2d').drawImage(image,0,0,512,512);
 const garden=new THREE.CubeTexture([gardenFace,gardenFace,gardenFace,gardenFace,gardenFace,gardenFace]);garden.colorSpace=THREE.SRGBColorSpace;garden.needsUpdate=true;
 return {garden:windowMaterial(garden),studio:windowMaterial(studio)};
}
