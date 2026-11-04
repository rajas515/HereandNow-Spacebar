import * as THREE from '../shared/vendor/three.module.js';
// Project a shared aperture through world space onto every receiving surface.
// No floating light cards: table/figure/floor all sample the same light field.
export function createDaylight(options={}){
 const windowZ=options.windowZ??-1.37;
 const direction={value:new THREE.Vector3(-.48,-.72,1)};
 return {update(pan){direction.value.set(-.48-pan.x*.045,-.72,1+pan.y*.025);},apply(material){
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=shader=>{
 previous(shader);shader.uniforms.dayDirection=direction;
 shader.vertexShader='varying vec3 dayWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ndayWorld=(modelMatrix*vec4(position,1.)).xyz;');
 shader.fragmentShader='varying vec3 dayWorld;uniform vec3 dayDirection;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
 float travel=(dayWorld.z-(${windowZ.toFixed(4)}))/dayDirection.z;
 vec3 aperturePoint=dayWorld-dayDirection*travel;
 float edge=.035+max(travel,0.)*.009;
 float paneX=abs(mod(aperturePoint.x+3.1,1.55)-.775);
 float pane=1.-smoothstep(.57-edge,.57+edge,paneX);
 float opening=smoothstep(.18,.18+edge,aperturePoint.y)*(1.-smoothstep(3.16-edge,3.16,aperturePoint.y));
 float crossbar=smoothstep(.035,.065,abs(aperturePoint.y-1.1))*smoothstep(.035,.065,abs(aperturePoint.y-2.2));
 float sides=1.-smoothstep(3.05,3.15,abs(aperturePoint.x));
 float daylight=pane*opening*crossbar*sides*step(0.,travel);
 outgoingLight*=mix(.34,1.65,daylight);
 outgoingLight+=diffuseColor.rgb*vec3(.32,.25,.16)*daylight;
 #include <opaque_fragment>`);
 };material.customProgramCacheKey=()=> 'world-pane-daylight-v1';material.needsUpdate=true;
 }};
}
