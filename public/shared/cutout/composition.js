import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

// Traced from the user's white annotation, in image coordinates. The outline
// follows the window returns, ceiling offcuts and projecting work surfaces.
export const WIDE_OUTLINE=[
  [.043,.035],[.122,.094],[.118,.060],[.193,.066],[.232,.128],
  [.286,.128],[.260,.075],[.780,.101],[.744,.151],[.835,.164],
  [.835,.405],[.929,.412],[.932,.538],[.963,.555],[.960,.661],
  [.875,.731],[.940,.786],[.940,.929],[.985,.986],[.090,.982],
  [.175,.870],[.175,.810],[.160,.810],[.160,.737],[.145,.737],
  [.145,.630],[.085,.665],[.090,.292],[.140,.331],[.150,.212],[.025,.102]
];

export function installComposition(pass){
  pass.uniforms.uLensStrength={value:.45};
  pass.uniforms.uCardStretch={value:1.12};
  pass.material.fragmentShader='uniform float uLensStrength,uCardStretch;\n'+pass.material.fragmentShader;
  pass.material.fragmentShader=pass.material.fragmentShader.replace(
    'vec2 cardUv=(vUv-uCardCenter)/uCardSize+.5;',
    `vec2 cardUv=(vUv-uCardCenter)/uCardSize+.5;
    float lensAspect=uResolution.x/uResolution.y;
    cardUv.x=(cardUv.x-.5)/uCardStretch+.5;
    vec2 lensPoint=(cardUv-.5)*vec2(lensAspect,1.);
    float lensRadius=dot(lensPoint,lensPoint);
    lensPoint*= (1.+uLensStrength*lensRadius)/(1.+uLensStrength*.16);
    cardUv=lensPoint/vec2(lensAspect,1.)+.5;`
  );
  // Keep directional shading before the common paper screen. Boundaries and
  // room removal now happen on the actual geometry, never in this compositor.
  pass.material.fragmentShader=pass.material.fragmentShader.replace(
    'float hatchCoord=',
    'result*=mix(.52,1.10,smoothstep(.10,.90,lum));\nfloat hatchCoord='
  );
  pass.material.needsUpdate=true;
}

export function foliageMaterial(map,options={}){
  const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{garden:{value:map},time:{value:0},windowSide:{value:options.side??-1}},
    vertexShader:`varying vec3 point;void main(){point=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);}`,
    fragmentShader:`varying vec3 point;uniform sampler2D garden;uniform float time,windowSide;
      void main(){
        float side=windowSide<-.5?step(3.7,abs(point.x)):windowSide;
        float horizontal=mix(point.x,point.z,side);
        float pan=mix(cameraPosition.x,cameraPosition.z,side);
        vec2 uv=vec2(horizontal/8.0+.5+pan*.012,point.y*.18+.20);
        vec2 farUv=uv+vec2(sin(time*.21+uv.y*9.)*.001,0.);
        vec2 nearUv=uv*1.12+vec2(.12+sin(time*.48+uv.y*12.)*.003,cos(time*.30)*.001);
        float mask=smoothstep(.25,.75,sin(uv.x*19.)*sin(uv.y*13.)*.5+.5);
        vec3 c=mix(texture2D(garden,farUv).rgb,texture2D(garden,nearUv).rgb,mask*.22);
        gl_FragColor=vec4(pow(c,vec3(2.2)),1.);
      }`
  });material.userData.foliage=true;return material;
}

// The yellow drawing specifies these visible apertures. Project each corner
// back onto its actual wall, then offset inward by 3cm so existing opaque
// privacy inserts cannot cover the distant garden. The quads stay in 3D.
export function buildWindowApertures(camera,material){
  const left=[
    [[.056,.216],[.15,.248],[.15,.352],[.056,.30]],
    [[.095,.72],[.153,.698],[.15,.773],[.09,.79]],
    [[.113,.83],[.168,.79],[.167,.88],[.11,.915]]
  ];
  const lower=[
    [[.13,.97],[.205,.918],[.24,.923],[.205,.986]],
    [[.236,.958],[.285,.96],[.28,.99],[.22,.99]],
    [[.36,.96],[.4,.936],[.415,.957],[.4,.99]],
    [[.55,.92],[.615,.925],[.625,.995],[.56,.995]],
    [[.63,.919],[.695,.92],[.73,.995],[.65,.995]],
    [[.72,.94],[.79,.921],[.83,.995],[.77,.995]],
    [[.815,.93],[.86,.919],[.91,.987],[.88,.995]]
  ];
  const ray=new THREE.Raycaster(),parts=[];
  for(const [quads,plane] of [[left,new THREE.Plane(new THREE.Vector3(0,0,1),-4.66)],[lower,new THREE.Plane(new THREE.Vector3(1,0,0),-3.86)]]){
    for(const quad of quads){
      const vertices=[];
      for(const [x,y] of quad){ray.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);const point=new THREE.Vector3();ray.ray.intersectPlane(plane,point);vertices.push(...point.toArray());}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();parts.push(g);
    }
  }
  const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name='annotated-window-apertures';parts.forEach(g=>g.dispose());return mesh;
}
