import {DEFAULT_LAYOUT} from '../shared/studio.js';
import {installMapBridge} from '../shared/map-bridge.js';
const MAP_EMBEDDED=parent!==window;let mapViewport={visible:true,presence:1,dragging:false};let mapBridge;let sceneLayout=structuredClone(DEFAULT_LAYOUT.disco),baseMapGrades,quality={fps:40,pixelRatio:1.0,detailFps:24};let lastMainDraw=0,lastDetailDraw=-1000,detailCacheKey='',backCacheKey='',layoutRevision=0;
if(MAP_EMBEDDED)document.documentElement.classList.add('map-embedded');
import * as THREE from '../shared/vendor/three.module.js';
import {GLTFLoader} from '../shared/vendor/GLTFLoader.js';
import {PrintPass,PRINT_DEFAULTS,GRADE_DEFAULTS} from '../shared/print-pass.js';

// Dimensions are in metres. The photographs supply surface detail; geometry
// supplies depth, silhouettes, parallax and the two authored camera compositions.
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const TRANSITION_FPS=24;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true,powerPreference:'high-performance'});
} catch (error) {
  $('#loading').hidden = true;
  $('#error').hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const cutRight=new THREE.Plane(new THREE.Vector3(-1,0,0),4.5),cutFront=new THREE.Plane(new THREE.Vector3(0,0,-1),4.5);
const printPass=new PrintPass(renderer);printPass.uniforms.uTransparentOutside.value=1;printPass.uniforms.uFaceDrawings.value=1;
const bakedCards=[];let ballCard,ballFrames=[];
let detailRenderer,detailPass,detailCamera,backRenderer,backPass,backScene,backCamera,ballSpin=0;const tileRest=[],tileLift=[];const hoverNormal=new THREE.Vector3(),detailNormal=new THREE.Vector3(0,0,1);const tileDummy=new THREE.Object3D();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f2efe8');
scene.fog = null;
const camera = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, .05, 90);
const world = new THREE.Group();
scene.add(world);
let seed=10421;
function rand(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646;}
function range(a,b){return a+(b-a)*rand();}
const photos = {};
async function loadPhoto(n){const image=new Image();image.src=`./assets/reference-${n}.jpg`;await image.decode();photos[n]=image;}

// UV texture sampling is deliberately separate from the room photographs:
// furniture and architecture remain independent, low-polygon 3D objects.
function sampled(n, rect, {repeat=[1,1],tint=null,size=512,grain=0}={}){
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');const image=photos[n];
  ctx.drawImage(image,rect[0]*image.width,rect[1]*image.height,rect[2]*image.width,rect[3]*image.height,0,0,size,size);
  if(tint){ctx.fillStyle=tint;ctx.fillRect(0,0,size,size);}
  if(grain){for(let i=0;i<5000;i++){ctx.fillStyle=`rgba(20,30,20,${rand()*grain})`;ctx.fillRect(rand()*size,rand()*size,1,1);}}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.MirroredRepeatWrapping;tex.repeat.set(...repeat);
  tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tex;
}
function material(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:.84,flatShading:true,...extra});}
function box(w,h,d,mat,x=0,y=0,z=0,parent=world){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function plane(w,h,mat,x,y,z,rotY=0,parent=world){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(x,y,z);m.rotation.y=rotY;m.receiveShadow=true;parent.add(m);return m;}
function rod(a,b,r,mat,parent=world,sides=6){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,av.distanceTo(bv),sides),mat);mesh.position.copy(av).add(bv).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());mesh.castShadow=true;parent.add(mesh);return mesh;}
function curved(points,r,mat,parent=world){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(path,24,r,5,false),mat);parent.add(mesh);return mesh;}

const hemi=new THREE.HemisphereLight('#fff9dc','#405b52',2.35);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff0bb',3.2);sun.position.set(-5,7,-6);sun.target.position.set(1,0,3);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.5,far:30});sun.shadow.bias=-.0004;sun.shadow.normalBias=.025;sun.shadow.radius=3;scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight('#d1e6e0',1.0);fill.position.set(4,3,6);scene.add(fill);

let chairAsset;
const importedChairs=[];
let ball,ballCore,tiles,mirrorSurface,mirrorCamera,cubeCamera,cubeTarget,catTail;
const ballPosition=new THREE.Vector3(-2.57,2.72,-2.5);
const movingLeaves=[],flecks=[],ribbons=[];
let frame=0,elapsed=0,paused=reducedMotion,close=false,transition=null,viewMix=0,hover=false;
const pointer=new THREE.Vector2(0,0),smoothPointer=new THREE.Vector2(0,0);
const panTarget=new THREE.Vector2(),panCurrent=new THREE.Vector2();
let panStart=null,isDragging=false;
function clampPan(){panTarget.x=THREE.MathUtils.clamp(panTarget.x,-innerWidth*.9,innerWidth*.9);panTarget.y=THREE.MathUtils.clamp(panTarget.y,-innerHeight*.9,innerHeight*.9);}
const pointerNDC=new THREE.Vector2(-20,-20);
const raycaster=new THREE.Raycaster();
let downPosition=null;
let overMainFrame=false;let faceAtlas;
const look=new THREE.Vector3();

function buildRoom(){
  const tealMap=sampled(7,[.32,.47,.30,.12],{tint:'rgba(64,151,131,.28)',grain:.08});
  const paleMap=sampled(1,[.28,.04,.29,.14],{tint:'rgba(223,226,211,.38)'});
  const concreteMap=sampled(1,[.43,.88,.13,.10],{repeat:[2.5,2.5],tint:'rgba(136,147,134,.4)'});
  const tableMap=sampled(5,[.40,.52,.29,.16],{tint:'rgba(219,223,209,.34)'});
  const bambooMap=sampled(7,[.35,.65,.35,.07],{repeat:[3,1]});
  const darkMap=sampled(10,[.33,.02,.10,.20],{tint:'rgba(13,27,24,.56)'});
  const woodMap=sampled(5,[.26,.43,.05,.12],{repeat:[1,2],tint:'rgba(134,69,29,.25)'});
  const teal=material('#c3e0cb',{map:tealMap});
  const steel=material('#34413a',{map:darkMap,roughness:.62,metalness:.22});
  const white=material('#ede9d9',{map:paleMap,emissive:'#c7c6af',emissiveIntensity:.24});
  const floor=material('#c6cbba',{map:concreteMap});
  const table=material('#e5e5d4',{map:tableMap});
  const bamboo=material('#c7a778',{map:bambooMap});
  const wood=material('#c79a67',{map:woodMap,roughness:.65});
  const metal=material('#8c9991',{roughness:.54,metalness:.55});
  const purple=material('#745291',{roughness:.65});
  const rope=material('#a99e7b');
  box(6.15,.24,4.25,floor,-.775,-.13,-1.125);
  box(6.19,.12,4.29,material('#565258'),-.775,-.29,-1.125);
  // Real slab seams, rather than a grid printed on a flat background.
  const seam=material('#626f64');
  for(let x=-3.7;x<2.3;x+=2.1)box(.012,.004,4.20,seam,x,.002,-1.125);
  for(let z=-3.1;z<1.0;z+=2.15)box(6.10,.004,.012,seam,-.775,.003,z);
  // Window wall modules: lower turquoise panels, black steel muntins and transoms.
  function wall(parent,width){
    const count=4,bay=width/count;
    for(let i=0;i<count;i++){
      const x=-width/2+bay*(i+.5);
      box(bay-.06,.65,.09,teal,x,.36,0,parent);
      box(bay-.06,.59,.075,teal,x,3.69,0,parent);
      for(const y of [.05,.72,1.68,2.62,3.35,4.05])box(bay,.055,.115,steel,x,y,0,parent);
      box(bay+.03,.11,.25,steel,x,.76,.035,parent);
      box(.065,4.15,.12,steel,x-bay/2,2.06,0,parent);
      // Very faint glass; the garden itself is modelled behind it.
      const glass=new THREE.MeshPhysicalMaterial({color:'#b5d6b6',transparent:true,opacity:.035,roughness:.3,depthWrite:false,side:THREE.DoubleSide});
      plane(bay-.08,2.55,glass,x,2.04,-.015,0,parent);
    }
    box(.09,4.15,.14,steel,width/2,2.06,0,parent);
  }
  const back=new THREE.Group();back.position.set(-.65,0,-3.2);back.userData.foldedWall=true;world.add(back);wall(back,6.3);
  const left=new THREE.Group();left.position.set(-3.8,0,-.8);left.rotation.y=Math.PI/2;left.userData.foldedWall=true;world.add(left);wall(left,4.8);
  box(.25,4.22,.29,steel,-3.69,2.09,-3.1);
  box(6.4,.16,.22,white,-.65,4.16,-3.16);
  box(.22,.16,4.9,white,-3.75,4.16,-.8);
  // Bamboo blind on the left: a low-poly roll with individual dark bindings.
  const blind=new THREE.Group();blind.position.set(-3.65,3.22,-.8);blind.rotation.y=Math.PI/2;world.add(blind);
  box(4.4,.25,.10,bamboo,0,0,0,blind);
  rod([-2.24,-.14,.04],[2.24,-.14,.04],.10,material('#b7b09a',{map:bambooMap}),blind,12);
  for(let i=0;i<46;i++)box(.012,.28,.013,rope,-2.2+i*.096,0,.069,blind);
  for(let i=0;i<5;i++)box(.027,.28,.02,steel,-1.8+i*.85,0,.08,blind);
  curved([[-3.5,3.3,1.4],[-3.4,3.04,.8],[-3.4,3.12,-1.1],[-2.55,3.56,-2.58],[.4,3.37,-3.05]],.013,rope);
  // Full-length leaning mirror, reflecting geometry rather than the photographer.
  const mirror=new THREE.Group();mirror.position.set(-3.31,1.51,-2.39);mirror.rotation.set(-.04,.43,-.026);world.add(mirror);
  box(.80,2.9,.065,steel,0,0,0,mirror);
  const mirrorTarget=new THREE.WebGLRenderTarget(512,1024);
  mirrorCamera=new THREE.PerspectiveCamera(46,.5,.1,50);mirrorCamera.layers.enable(1);
  mirrorSurface=plane(.66,2.74,new THREE.MeshBasicMaterial({map:mirrorTarget.texture,color:'#b9c7b4'}),0,0,.038,0,mirror);
  mirrorSurface.userData.target=mirrorTarget;
  // A socket and switch on the corner post.
  box(.15,.39,.09,white,-3.39,1.36,-2.98);
  for(let i=0;i<3;i++){box(.07,.035,.014,metal,-3.39,1.47-i*.1,-2.922);for(let j=0;j<2;j++)box(.012,.02,.012,steel,-3.412+j*.045,1.45-i*.1,-2.91);}
  // Tables: thin laminate tops, painted steel aprons and square tube legs.
  function worktable(x,z,w,d,angle=0){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;world.add(g);box(w,.07,d,table,0,1.12,0,g);box(w-.06,.14,d-.04,metal,0,1.02,0,g);for(const a of [-1,1])for(const b of [-1,1])box(.055,1.01,.055,metal,a*(w/2-.10),.5,b*(d/2-.1),g);return g;}
  const rightTable=worktable(.65,-.55,2.55,1.53,-.04);
  worktable(2.83,-.65,1.65,1.53,-.04);
  const leftTable=worktable(-2.7,1.85,1.72,1.18,.075);
  // Working papers, notebook, pen, a red and ochre carton and a folded cloth.
  const paper=material('#e8e1c9'),red=material('#b34446'),ochre=material('#b08035');
  const sheet=box(.64,.007,.84,paper,.40,1.166,.05,rightTable);sheet.rotation.y=.16;
  const ink=material('#b65e57');
  for(let i=0;i<4;i++)box(.50,.002,.015,ink,.42,1.172,-.27+i*.12,rightTable);
  const book=box(.30,.065,.42,red,.45,1.2,-.21,rightTable);book.rotation.y=-.24;
  box(.27,.047,.39,paper,.45,1.2,-.21,rightTable);
  box(.31,.006,.43,red,.45,1.227,-.21,rightTable);
  const tray=new THREE.Group();tray.position.set(-.47,1.16,-.26);tray.rotation.y=.19;rightTable.add(tray);
  box(.55,.018,.38,ochre,0,0,0,tray);for(const x of [-.27,.27])box(.013,.16,.38,red,x,.08,0,tray);for(const z of [-.18,.18])box(.55,.16,.012,ochre,0,.08,z,tray);
  plane(.25,.10,material('#d7b86a'),0,.1,.189,0,tray);
  rod([-.7,1.18,.29],[-.48,1.18,.18],.017,red,rightTable);
  rod([.81,1.18,-.48],[.98,1.18,-.36],.010,steel,rightTable);
  box(.10,.022,.15,material('#a6b77b'),1.05,1.17,-.54,rightTable);
  const cloth=material('#63715b');
  for(let i=0;i<5;i++){const fold=box(.35,.04,.20,cloth,-.07+i*.055,1.19+i*.013,-.49+Math.sin(i)*.07,rightTable);fold.rotation.set(.08*i,.55*i,.09*i);}
  box(.54,.013,.66,paper,-.28,1.165,0,leftTable);
  box(.20,.028,.28,ochre,-.42,1.19,-.1,leftTable);
  // The blue bag from the reference on the adjacent table.
  const bag=new THREE.Mesh(new THREE.CylinderGeometry(.25,.19,.60,4,1,true),material('#3f7995',{side:THREE.DoubleSide}));bag.rotation.y=Math.PI/4;bag.position.set(2.85,1.46,-.8);world.add(bag);
  curved([[2.82,1.70,-.8],[2.83,1.87,-.8],[3.11,1.87,-.8],[3.13,1.70,-.8]],.012,material('#bad0cc'));
  // The supplied glTF chair is in metres. Match its seat to the 1.12 m tables.
  for(const [x,z,angle] of [[-.45,.75,2.5],[-2.18,-1.48,1.15]]){
    const g=new THREE.Group();g.name='Imported purple chair';
    const model=chairAsset.clone(true);const bounds=new THREE.Box3().setFromObject(model);
    const scale=1.43;model.scale.setScalar(scale);
    model.position.set(-(bounds.min.x+bounds.max.x)*.5*scale,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*.5*scale);
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    g.add(model);g.position.set(x,0,z);g.rotation.y=angle;world.add(g);importedChairs.push(g);
  }
  // A tiny quiet observer from the wide composition sketch.
  const cat=new THREE.Group();cat.position.set(-2.4,0,.85);cat.rotation.y=.35;world.add(cat);
  const fur=material('#443f35'),muzzle=material('#b4ab90');
  const body=new THREE.Mesh(new THREE.IcosahedronGeometry(.22,1),fur);body.scale.set(.8,1.65,1);body.position.y=.34;cat.add(body);
  const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.16,0),fur);head.position.set(0,.69,-.025);cat.add(head);
  for(const x of [-.11,.11]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.075,.18,3),fur);ear.position.set(x,.83,-.02);cat.add(ear);box(.055,.16,.10,muzzle,x*.65,.08,-.13,cat);}
  catTail=new THREE.Group();cat.add(catTail);curved([[.13,.12,.10],[.42,.13,.24],[.49,.45,.30],[.38,.64,.32]],.035,fur,catTail);
  // Small wall marks and paper scraps give the room a lived-in scale.
  for(let i=0;i<25;i++){const m=box(range(.012,.06),range(.006,.025),.003,material('#6a9180'),range(-3.4,4.2),range(.12,.60),-3.145);m.rotation.z=range(-1,1);}
}

function buildGarden(){
  // Window portals project view rays onto virtual garden layers 5 and 15 metres
  // beyond the glazing. Only the bounded aperture renders; there is no side spill.
  const map=sampled('garden',[0,0,1,1],{size:2048});
  scene.userData.gardenUniforms=[];
  for(const side of [0,1]){
    const uniforms={garden:{value:map},time:{value:0},side:{value:side}};
    const mat=new THREE.ShaderMaterial({uniforms,side:THREE.FrontSide,toneMapped:true,clipping:true,
      vertexShader:`#include <clipping_planes_pars_vertex>
      varying vec3 worldPoint;void main(){worldPoint=(modelMatrix*vec4(position,1.0)).xyz;vec4 mvPosition=viewMatrix*vec4(worldPoint,1.0);gl_Position=projectionMatrix*mvPosition;
      #include <clipping_planes_vertex>
      }`,
      fragmentShader:`#include <clipping_planes_pars_fragment>
      varying vec3 worldPoint;uniform sampler2D garden;uniform float time,side;
      vec2 projectLayer(vec3 ray,float distance){
        float origin=mix(cameraPosition.z,cameraPosition.x,side);
        float axis=mix(ray.z,ray.x,side);float t=(-distance-origin)/min(axis,-.001);
        vec3 p=cameraPosition+ray*t;
        return vec2(mix(p.x,-p.z,side)/18.0+.5,p.y/11.0+.12);
      }
      void main(){
        #include <clipping_planes_fragment>
        vec3 ray=normalize(worldPoint-cameraPosition);
        vec2 farUv=projectLayer(ray,18.0),nearUv=projectLayer(ray,8.0);
        farUv+=vec2(sin(time*.21+farUv.y*9.0)*.001,0.0);
        nearUv+=vec2(sin(time*.48+nearUv.y*12.0)*.003,cos(time*.3)*.001);
        vec3 farColor=texture2D(garden,farUv).rgb;
        vec3 nearColor=texture2D(garden,nearUv*1.12+vec2(.12,0)).rgb;
        float foliageMask=smoothstep(.25,.75,sin(nearUv.x*19.0)*sin(nearUv.y*13.0)*.5+.5);
        vec3 color=mix(farColor,nearColor,foliageMask*.22);
        gl_FragColor=vec4(pow(color,vec3(2.2)),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    mat.userData.foliage=true;
    if(side===0)plane(6.24,2.6,mat,-.65,2.03,-3.23);
    else plane(4.75,2.6,mat,-3.83,2.03,-.8,Math.PI/2);
    scene.userData.gardenUniforms.push(uniforms);
  }
}

function buildBall(){
  // Photographic reflection cards sit on a separate render layer. They fill the
  // open side of the cutaway only in mirrors, grounding reflections in the space.
  for(const data of [{n:1,w:10,h:5,x:.3,y:2,z:6.4,ry:Math.PI},{n:5,w:10,h:5,x:6.3,y:2,z:.6,ry:-Math.PI/2}]){
    const map=new THREE.Texture(photos[data.n]);map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;
    const card=plane(data.w,data.h,new THREE.MeshBasicMaterial({map,color:'#c6cabe',side:THREE.DoubleSide}),data.x,data.y,data.z,data.ry);card.layers.set(1);
  }
  cubeTarget=new THREE.WebGLCubeRenderTarget(256,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  cubeCamera=new THREE.CubeCamera(.06,60,cubeTarget);cubeCamera.layers.enable(1);cubeCamera.position.copy(ballPosition);scene.add(cubeCamera);
  ball=new THREE.Group();ball.position.copy(ballPosition);world.add(ball);
  ballCore=new THREE.Mesh(new THREE.SphereGeometry(.435,24,16),material('#25332d',{metalness:.85,roughness:.2}));ball.add(ballCore);
  const tileData=[];const rows=10,radius=.445;
  const rowCounts=[4,8,12,16,20,20,16,12,8,4];
  for(let row=0;row<rows;row++){
    const theta=(row+.5)/rows*Math.PI,n=rowCounts[row];
    for(let col=0;col<n;col++){
      const phi=(col+(row%2)*.5)/n*Math.PI*2;
      tileData.push({theta,phi,w:2*Math.PI*radius*Math.sin(theta)/n*.91,h:Math.PI*radius/rows*.90});
    }
  }
  const mat=new THREE.MeshStandardMaterial({color:'#e9eee4',map:faceAtlas,metalness:1,roughness:.075,envMap:cubeTarget.texture,envMapIntensity:1.04,flatShading:true});
  mat.userData.faceAtlas=faceAtlas;
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec2 faceCell;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=(uv*.94+.03+faceCell)/3.0;');
  };
  mat.customProgramCacheKey=()=> 'nine-face-mirror-atlas';
  tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,tileData.length);
  const cells=new Float32Array(tileData.length*2);
  tileData.forEach((t,i)=>{const face=i%9;cells[i*2]=face%3;cells[i*2+1]=2-Math.floor(face/3);});
  tiles.geometry.setAttribute('faceCell',new THREE.InstancedBufferAttribute(cells,2));
  const dummy=new THREE.Object3D(),normal=new THREE.Vector3();
  tileData.forEach((t,i)=>{
    normal.set(Math.sin(t.theta)*Math.cos(t.phi),Math.cos(t.theta),Math.sin(t.theta)*Math.sin(t.phi));dummy.position.copy(normal).multiplyScalar(radius);dummy.lookAt(dummy.position.clone().add(normal));dummy.scale.set(t.w,t.h,.008);dummy.updateMatrix();tiles.setMatrixAt(i,dummy.matrix);tileRest.push({normal:normal.clone(),w:t.w,h:t.h});tileLift.push(0);
    const tint=new THREE.Color().setRGB(range(.70,1),range(.73,1),range(.70,.98));tiles.setColorAt(i,tint);
  });tiles.instanceMatrix.needsUpdate=true;tiles.castShadow=true;ball.add(tiles);
  const dark=material('#525e52',{metalness:.7,roughness:.4});
  rod([-2.57,3.62,-2.5],[-2.57,3.18,-2.5],.009,dark);
  const loop=new THREE.Mesh(new THREE.TorusGeometry(.055,.009,5,12),dark);loop.position.set(-2.57,3.20,-2.5);world.add(loop);
  // The purple ribbon is modelled as a small angular strip, not a billboard.
  const ribbonMat=material('#9476a1',{side:THREE.DoubleSide});
  for(let side=0;side<2;side++){
    const ribbon=plane(.046,.34,ribbonMat,-2.57+(side-.5)*.065,3.49,-2.5+.02);ribbon.rotation.z=side?.2:-.18;ribbons.push(ribbon);
  }
  const key=new THREE.PointLight('#fff9dd',3.5,7,2);key.position.set(-.6,3.3,-.8);scene.add(key);
  // A handful of optical glints, tied to the rotation of the real tiled ball.
  const glintCanvas=document.createElement('canvas');glintCanvas.width=glintCanvas.height=128;const ctx=glintCanvas.getContext('2d');const gradient=ctx.createRadialGradient(64,64,0,64,64,63);gradient.addColorStop(0,'rgba(255,253,220,1)');gradient.addColorStop(.10,'rgba(255,253,220,.9)');gradient.addColorStop(.35,'rgba(255,250,205,.2)');gradient.addColorStop(1,'rgba(255,250,205,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);ctx.fillStyle='rgba(255,255,235,.95)';ctx.fillRect(63,20,2,88);ctx.fillRect(20,63,88,2);
  const glintMap=new THREE.CanvasTexture(glintCanvas);
  for(let i=0;i<4;i++){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glintMap,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));sprite.scale.setScalar(.2);ball.add(sprite);sprite.userData.phase=i*1.73;flecks.push(sprite);}
}

const reflectionSpots=[];let reflectionBatch,reflectionOpacity;
function buildAtmosphere(){
  const particles=170,positions=new Float32Array(particles*3);
  for(let i=0;i<particles;i++){positions[i*3]=range(-3.6,4);positions[i*3+1]=range(.2,4);positions[i*3+2]=range(-3,4);}
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const points=new THREE.Points(geom,new THREE.PointsMaterial({color:'#fff9cf',size:.012,transparent:true,opacity:.46,depthWrite:false}));scene.add(points);scene.userData.dust=points;
  const glow=document.createElement('canvas');glow.width=glow.height=64;const ctx=glow.getContext('2d');const grad=ctx.createRadialGradient(32,32,2,32,32,32);grad.addColorStop(0,'rgba(255,255,230,.58)');grad.addColorStop(.35,'rgba(255,252,205,.3)');grad.addColorStop(1,'rgba(255,252,205,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);const map=new THREE.CanvasTexture(glow);
  for(let i=0;i<43;i++){
    const m=new THREE.Object3D();m.material={opacity:range(.15,.38)};
    if(i<24){m.rotation.x=-Math.PI/2;m.position.set(range(-3.5,4),.012,range(-2.8,4.8));}else{m.position.set(range(-3.3,4),range(.2,4),-3.128);}
    m.scale.set(range(.05,.16),range(.07,.20),1);m.userData.base=m.position.clone();m.userData.phase=range(0,6.28);reflectionSpots.push(m);
  }
  const spotMaterial=new THREE.MeshBasicMaterial({map,color:'#faffc6',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  spotMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute float reflectionOpacity;varying float vReflectionOpacity;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvReflectionOpacity=reflectionOpacity;');shader.fragmentShader='varying float vReflectionOpacity;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a*=vReflectionOpacity;\n#include <opaque_fragment>');};
  reflectionBatch=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),spotMaterial,reflectionSpots.length);reflectionBatch.frustumCulled=false;
  reflectionOpacity=new THREE.InstancedBufferAttribute(new Float32Array(reflectionSpots.length),1);reflectionBatch.geometry.setAttribute('reflectionOpacity',reflectionOpacity);
  reflectionSpots.forEach((m,i)=>{m.updateMatrix();reflectionBatch.setMatrixAt(i,m.matrix);reflectionOpacity.setX(i,m.material.opacity);});world.add(reflectionBatch);
}

function combineStaticGeometry(){
  // Batch repeated architectural surfaces by material. The silhouette stays
  // low-poly while animated objects remain independent of these static batches.
  scene.updateMatrixWorld(true);
  const animated=new Set([ball,catTail,mirrorSurface,...importedChairs,...ribbons,...movingLeaves.map(x=>x.mesh),...reflectionSpots]);
  const groups=new Map();
  world.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.material.isMeshStandardMaterial||mesh.material.transparent||mesh.layers.mask!==1)return;
    for(let p=mesh;p;p=p.parent)if(animated.has(p)||!p.visible)return;
    const mat=mesh.material,key=JSON.stringify([mat.color.getHex(),mat.map?.uuid,mat.roughness,mat.metalness,mat.emissive?.getHex(),mat.emissiveIntensity,mat.side,mat.flatShading]);if(!groups.has(key))groups.set(key,{mat,meshes:[]});groups.get(key).meshes.push(mesh);
  });
  for(const {mat,meshes} of groups.values()){
    if(meshes.length<2)continue;
    const geometries=meshes.map(m=>(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld));
    const merged=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['normal',3],['uv',2]]){
      const length=geometries.reduce((n,g)=>n+g.attributes[name].array.length,0),data=new Float32Array(length);let offset=0;
      for(const g of geometries){data.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
      merged.setAttribute(name,new THREE.BufferAttribute(data,size));
    }
    merged.computeBoundingSphere();const batch=new THREE.Mesh(merged,mat);batch.castShadow=true;batch.receiveShadow=true;world.add(batch);
    meshes.forEach(m=>m.removeFromParent());geometries.forEach(g=>g.dispose());
  }
}

function updateReflections(){
  ball.visible=false;flecks.forEach(f=>f.visible=false);
  // The standing mirror gets a view back into the modelled studio.
  mirrorSurface.visible=false;
  mirrorCamera.position.set(-3.0,1.55,-2.2);mirrorCamera.lookAt(.65,1.15,-.5);
  renderer.setRenderTarget(mirrorSurface.userData.target);renderer.render(scene,mirrorCamera);renderer.setRenderTarget(null);mirrorSurface.visible=true;
  cubeCamera.update(renderer,scene);ball.visible=true;flecks.forEach(f=>f.visible=true);
}

const widePosition=new THREE.Vector3(5.05,3.055,7.675);
const wideTarget=new THREE.Vector3(-.8,1.9,-.5);
const closePosition=new THREE.Vector3(-1.6,3.1,-1.0);
const closeTarget=new THREE.Vector3(-2.65,2.72,-2.5);
function cameraPose(){
  const portrait=innerWidth/innerHeight<.85;
  camera.aspect=innerWidth/innerHeight*printPass.cardSize.x/printPass.cardSize.y;
  const wide=widePosition.clone().sub(wideTarget).multiplyScalar((portrait?.95:.82)*Math.max(1,.95/camera.aspect)/1.3).add(wideTarget);
  // A straight push-in keeps the cutout plates at their authored viewing angle.
  const direction=wide.clone().sub(wideTarget).normalize();
  const closePush=closeTarget.clone().addScaledVector(direction,1.85);
  camera.position.lerpVectors(wide,closePush,viewMix);
  const parallax=paused?0:(1-viewMix)*.10+viewMix*.035;
  camera.position.x+=smoothPointer.x*parallax;
  camera.position.y+=smoothPointer.y*parallax*.55;
  camera.position.x+=panCurrent.x/innerWidth*.55;camera.position.y-=panCurrent.y/innerHeight*.35;
  look.lerpVectors(wideTarget,closeTarget,viewMix);
  look.x+=panCurrent.x/innerWidth*.16;look.y-=panCurrent.y/innerHeight*.10;

  look.x+=smoothPointer.x*.07;look.y+=smoothPointer.y*.045;
  camera.lookAt(look);
  camera.fov=74;camera.updateProjectionMatrix();
}

function setView(next){
  if(close===next&&!transition)return;
  close=next;mapBridge?.state(next?1:0);transition={from:viewMix,to:next?1:0,start:performance.now(),duration:reducedMotion?400:2600};
  $('#wide-view').classList.toggle('active',!next);$('#close-view').classList.toggle('active',next);
  $('#wide-view').setAttribute('aria-pressed',String(!next));$('#close-view').setAttribute('aria-pressed',String(next));
}
function toggleMotion(){paused=!paused;$('#motion-toggle').setAttribute('aria-pressed',String(paused));$('#motion-toggle').setAttribute('aria-label',paused?'Resume motion':'Pause motion');$('#motion-toggle').innerHTML=paused?'<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>';}
$('#wide-view').addEventListener('click',()=>setView(false));$('#close-view').addEventListener('click',()=>setView(true));
$('#motion-toggle').addEventListener('click',toggleMotion);
$('#recenter-canvas').addEventListener('click',()=>{panTarget.set(0,0);pointer.set(0,0);});
function showPanel(show){$('#style-panel').hidden=!show;$('#settings-toggle').setAttribute('aria-expanded',String(show));$('#settings-toggle').classList.toggle('active',show);}
$('#settings-toggle').addEventListener('click',()=>showPanel($('#style-panel').hidden));$('#close-panel').addEventListener('click',()=>showPanel(false));
const styleInputs={tint:'#tint',riso:'#riso',sketch:'#sketch',wobble:'#wobble',dotSize:'#dot-size',paper:'#paper-color',inkA:'#ink-a-color',inkB:'#ink-b-color',highlight:'#highlight-color',contrast:'#contrast',background:'#background-value',threshold:'#highlight-threshold'};
const settingsKey='green-hour-cutout-print-v1';
function syncStyle(){
  for(const [name,selector] of Object.entries(styleInputs)){
    const input=$(selector);input.value=printPass.settings[name];
    if(input.type==='range')input.style.setProperty('--fill',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);
  }
  document.documentElement.style.setProperty('--paper',printPass.settings.paper);document.documentElement.style.setProperty('--ink',printPass.settings.inkA);document.documentElement.style.setProperty('--pink',printPass.settings.inkB);
  canvas.dataset.printSettings=JSON.stringify(printPass.settings);
}
try{
  const saved=JSON.parse(localStorage.getItem(settingsKey)||'null');
  if(saved&&typeof saved==='object')for(const [name,selector] of Object.entries(styleInputs)){
    const input=$(selector),value=saved[name];
    if(input.type==='color'&&typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))printPass.set(name,value);
    if(input.type==='range'&&typeof value==='number'&&Number.isFinite(value))printPass.set(name,Math.max(Number(input.min),Math.min(Number(input.max),value)));
  }
}catch{}
for(const [name,selector] of Object.entries(styleInputs))$(selector).addEventListener('input',e=>{
  printPass.set(name,e.target.type==='range'?Number(e.target.value):e.target.value);syncStyle();try{localStorage.setItem(settingsKey,JSON.stringify(printPass.settings));}catch{}
});
$('#reset-style').addEventListener('click',()=>{resetGrades();for(const [name,value] of Object.entries(PRINT_DEFAULTS))printPass.set(name,value);syncStyle();try{localStorage.removeItem(settingsKey);}catch{}});
syncStyle();
let selectedGrade='ball';
const gradeNames=['exposure','value','contrast','shadows','highlights','saturation','temperature','tint'];
const gradeKey='green-hour-cutout-grades-v1';
function syncGradeUI(){for(const name of gradeNames){const input=$('#grade-'+name);input.value=printPass.grades[selectedGrade][name];input.style.setProperty('--fill',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);}canvas.dataset.colorGrades=JSON.stringify(printPass.grades);}
function selectGrade(region){
  const isPrint=region==='print';$('#print-controls').hidden=!isPrint;$('#grade-controls').hidden=isPrint;
  for(const target of ['print','ball','room','foliage']){$('#target-'+target).classList.toggle('active',target===region);$('#target-'+target).setAttribute('aria-pressed',String(target===region));}
  if(!isPrint){selectedGrade=region;syncGradeUI();}
}
function resetGrades(){for(const [region,g] of Object.entries(GRADE_DEFAULTS))for(const [name,value] of Object.entries(g))printPass.setGrade(region,name,value);syncGradeUI();try{localStorage.removeItem(gradeKey);}catch{}}
try{const saved=JSON.parse(localStorage.getItem(gradeKey)||'null');if(saved)for(const region of ['ball','room','foliage'])for(const name of gradeNames){const v=saved[region]?.[name],input=$('#grade-'+name);if(typeof v==='number'&&Number.isFinite(v))printPass.setGrade(region,name,Math.max(Number(input.min),Math.min(Number(input.max),v)));}}catch{}
for(const name of gradeNames)$('#grade-'+name).addEventListener('input',e=>{printPass.setGrade(selectedGrade,name,Number(e.target.value));syncGradeUI();try{localStorage.setItem(gradeKey,JSON.stringify(printPass.grades));}catch{}});
for(const target of ['print','ball','room','foliage'])$('#target-'+target).addEventListener('click',()=>selectGrade(target));syncGradeUI();
$('#retry').addEventListener('click',()=>location.reload());
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#experience').requestFullscreen();}catch{}});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){setView(false);showPanel(false);}
  if(e.target instanceof HTMLInputElement)return;
  const step=e.shiftKey?120:48;const arrows={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]};
  if(arrows[e.code]){e.preventDefault();panTarget.x+=arrows[e.code][0];panTarget.y+=arrows[e.code][1];clampPan();}
  if(e.code==='Home'){e.preventDefault();panTarget.set(0,0);}
  if(e.code==='KeyP')showPanel($('#style-panel').hidden);
  if(e.code==='Enter'&&e.target===canvas){e.preventDefault();setView(!close);}
  if(e.code==='Digit1')setView(false);if(e.code==='Digit2')setView(true);
  if(e.code==='Space'&&(e.target===document.body||e.target===canvas)){e.preventDefault();toggleMotion();}
});
function hitsMainFrame(){
  return raycaster.intersectObjects(world.children,true).some(hit=>{
    if(!hit.object.isMesh)return false;
    for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
    return true;
  });
}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return new THREE.Vector2(((e.clientX-r.left)/r.width-printPass.cardCenter.x)/printPass.cardSize.x*2,((1-(e.clientY-r.top)/r.height)-printPass.cardCenter.y)/printPass.cardSize.y*2);}
canvas.addEventListener('pointermove',e=>{
  if(panStart){const dx=e.clientX-panStart.x,dy=e.clientY-panStart.y;if(Math.hypot(dx,dy)>5)isDragging=true;if(isDragging){if(!MAP_EMBEDDED){panTarget.set(panStart.px+dx,panStart.py+dy);clampPan();}canvas.style.cursor='grabbing';}}
  pointerNDC.copy(canvasPoint(e));pointer.set(THREE.MathUtils.clamp(pointerNDC.x,-1,1),THREE.MathUtils.clamp(pointerNDC.y,-1,1));
});
canvas.addEventListener('pointerleave',()=>{overMainFrame=false;if(!panStart){pointer.set(0,0);pointerNDC.set(-20,-20);}});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;downPosition=[e.clientX,e.clientY];panStart={x:e.clientX,y:e.clientY,px:panTarget.x,py:panTarget.y};isDragging=false;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',e=>{const dragged=isDragging;panStart=null;isDragging=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);canvas.style.cursor='grab';if(dragged||!downPosition||Math.hypot(e.clientX-downPosition[0],e.clientY-downPosition[1])>8){downPosition=null;return;}if(MAP_EMBEDDED&&mapViewport.overview){mapBridge?.focus();downPosition=null;return;}raycaster.setFromCamera(canvasPoint(e),camera);if(!close&&hitsMainFrame()){setView(true);}else if(ballCore&&raycaster.intersectObject(ballCore,false).length)setView(!close);downPosition=null;});
canvas.addEventListener('pointercancel',()=>{panStart=null;isDragging=false;downPosition=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;if(e.shiftKey){panTarget.x-=e.deltaY*unit;}else{panTarget.x-=e.deltaX*unit;panTarget.y-=e.deltaY*unit;}clampPan();},{passive:false});
window.addEventListener('resize',()=>{renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);printPass.resize();camera.aspect=innerWidth/innerHeight;cameraPose();});
document.addEventListener('visibilitychange',()=>{last=performance.now();});
let last=performance.now();
const labelProjected=new THREE.Vector3();let perfStart=performance.now(),perfFrames=0;
function animate(now){
  requestAnimationFrame(animate);
  if(document.hidden||(MAP_EMBEDDED&&!mapViewport.visible)){last=now;perfStart=now;perfFrames=0;return;}
  const mainInterval=1000/(mapViewport.overview?Math.min(quality.fps,24):quality.fps);if(now-lastMainDraw<mainInterval-.5)return;
  lastMainDraw=now-((now-lastMainDraw)%mainInterval);const dt=Math.min((now-last)/1000,.1);last=now;
  if(!paused)elapsed+=dt;
  if(transition){let t=Math.min(1,Math.floor((now-transition.start)/(1000/TRANSITION_FPS))*(1000/TRANSITION_FPS)/transition.duration);t=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;viewMix=THREE.MathUtils.lerp(transition.from,transition.to,t);if(now-transition.start>=transition.duration){viewMix=transition.to;transition=null;}}
  smoothPointer.lerp(pointer,1-Math.exp(-dt*2.5));
  panCurrent.lerp(panTarget,1-Math.exp(-dt*9));printPass.setPan(panCurrent.x/innerWidth,panCurrent.y/innerHeight);
  printPass.cardSize.y=THREE.MathUtils.lerp(.94,.82,viewMix);
  cameraPose();
  if(ball){
    if(scene.userData.gardenUniforms)scene.userData.gardenUniforms.forEach(u=>{u.time.value=elapsed;});
    ball.traverse(o=>{if(o.isMesh)o.material.userData.accent=true;});
    ribbons.forEach(o=>{o.material.userData.accent=true;});
    ballSpin+=paused?0:dt*(hover?.025:.19);ball.rotation.y=ballSpin;
    updateTileHover(dt);
    if(ballCard){ballCard.quaternion.copy(camera.quaternion);ballCard.material.map=ballFrames[Math.floor(elapsed*12)%ballFrames.length].texture;ballCard.rotation.z=Math.sin(elapsed*.42)*.012;}
    ball.rotation.z=Math.sin(elapsed*.42)*.012;
    movingLeaves.forEach(({mesh,phase,base})=>{mesh.rotation.z=base+Math.sin(elapsed*.65+phase)*.025;});
    ribbons.forEach((r,i)=>r.rotation.z=(i?.2:-.18)+Math.sin(elapsed*1.1+i)*.05);
    if(catTail)catTail.rotation.y=Math.sin(elapsed*.8)*.11;
    if(scene.userData.dust){const positions=scene.userData.dust.geometry.attributes.position;for(let i=0;i<positions.count;i++){if(!paused){positions.array[i*3]+=Math.sin(elapsed*.3+i)*dt*.009;positions.array[i*3+1]+=dt*.009;if(positions.array[i*3+1]>4.1)positions.array[i*3+1]=.1;}}positions.needsUpdate=true;}
    flecks.forEach((f,i)=>{const a=elapsed*.37+f.userData.phase;f.position.set(Math.sin(a)*.35,Math.sin(a*1.7)*.25,Math.cos(a)*.34);const pulse=Math.pow(Math.max(0,Math.sin(elapsed*1.3+i*1.9)),12);f.material.opacity=pulse*.8;f.scale.setScalar(.13+pulse*.16);});
    reflectionSpots.forEach((m,i)=>{m.position.x=m.userData.base.x+Math.sin(elapsed*.13+m.userData.phase)*.28;m.position.z=m.userData.base.z+(i<24?Math.cos(elapsed*.11+i)*.20:0);m.material.opacity=(.18+Math.sin(elapsed*.9+i)*.12);m.updateMatrix();reflectionBatch.setMatrixAt(i,m.matrix);reflectionOpacity.setX(i,m.material.opacity);});if(reflectionBatch){reflectionBatch.instanceMatrix.needsUpdate=true;reflectionOpacity.needsUpdate=true;}
    // Only a small sphere is ray-tested; 960+ tiles are never picked individually.
    if(frame%4===0){raycaster.setFromCamera(pointerNDC,camera);hover=raycaster.intersectObject(ballCore,false).length>0;overMainFrame=!close&&hitsMainFrame();canvas.style.cursor=isDragging?'grabbing':(hover||overMainFrame)?'pointer':'grab';}
    labelProjected.copy(ballPosition).project(camera);
  }
  const cut=Math.max(0,Math.min(1,(viewMix-.08)/.86));cutRight.constant=THREE.MathUtils.lerp(4.5,-1.7,cut);cutFront.constant=THREE.MathUtils.lerp(4.5,-2.0,cut);renderer.clippingPlanes=viewMix>0?[cutRight,cutFront]:[];
  printPass.setViewMix(viewMix);
  setWhiteGlints(printPass,camera);
  const renderStats=printPass.render(scene,camera,elapsed);renderDetailFrame();frame++;perfFrames++;if(canvas.dataset.layoutRevision!==String(layoutRevision)){canvas.dataset.renderedLayout=JSON.stringify(sceneLayout);canvas.dataset.layoutRevision=String(layoutRevision);}
  if(now-perfStart>=1000){canvas.dataset.performance=JSON.stringify({fps:Number((perfFrames*1000/(now-perfStart)).toFixed(1)),drawCalls:renderStats.drawCalls,triangles:renderStats.triangles,pixelRatio:renderer.getPixelRatio(),detailFps:quality.detailFps});perfStart=now;perfFrames=0;}
  if(frame%60===0){
    window.__greenHour={ready:true,approach:'baked-paper-cutouts',cards:bakedCards.length,transitionFps:TRANSITION_FPS,pan:{x:Math.round(panCurrent.x),y:Math.round(panCurrent.y)},view:close?'close':'wide',transitioning:!!transition,motion:!paused,tiles:tiles.count,...renderStats,textureSources:Object.keys(photos).length,importedChairs:importedChairs.length,ballScreen:{x:Math.round((labelProjected.x*.5*printPass.cardSize.x+printPass.cardCenter.x)*innerWidth),y:Math.round((1-(labelProjected.y*.5*printPass.cardSize.y+printPass.cardCenter.y))*innerHeight)}};
    canvas.dataset.sceneState=JSON.stringify({...window.__greenHour,rotation:Number(ball.rotation.y.toFixed(3))});
  }
}


// Independent RGBA plates, captured before print treatment. These are real
// two-triangle planes in world space: no live furniture meshes are rendered.
function bakeCutoutStage(){
  scene.updateMatrixWorld(true);
  const originalBackground=scene.background,oldTarget=renderer.getRenderTarget();
  const oldTone=renderer.toneMapping,oldShadows=renderer.shadowMap.enabled;
  const visibility=world.children.map(o=>[o,o.visible]);
  const facing=camera.quaternion.clone();
  const right=new THREE.Vector3(1,0,0).applyQuaternion(facing);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(facing);
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(facing);
  const candidates=world.children.filter(o=>o.isGroup&&!o.userData.foldedWall&&o!==ball&&!ribbons.includes(o));
  function bake(object,accent=false,size=1024){
    const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3());
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<8;i++){
      const v=new THREE.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).sub(center);
      const x=v.dot(right),y=v.dot(up);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    const w=(maxX-minX)*1.035,h=(maxY-minY)*1.035;
    const bakeCamera=new THREE.OrthographicCamera(-w/2,w/2,h/2,-h/2,.01,80);
    bakeCamera.position.copy(center).addScaledVector(forward,25);bakeCamera.quaternion.copy(facing);bakeCamera.updateMatrixWorld();
    const target=new THREE.WebGLRenderTarget(Math.max(64,Math.round(size*w/Math.max(w,h))),Math.max(64,Math.round(size*h/Math.max(w,h))),{type:THREE.HalfFloatType});
    for(const [o]of visibility)o.visible=o===object;
    object.visible=true;scene.background=null;renderer.setClearColor(0,0);renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=false;
    renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,bakeCamera);
    const mat=new THREE.MeshBasicMaterial({map:target.texture,transparent:true,alphaTest:.025,side:THREE.DoubleSide,depthWrite:true});
    if(accent)mat.userData.accent=true;
    const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);card.position.copy(center);card.quaternion.copy(facing);card.name='Baked cutout: '+(object.name||'studio object');card.userData.bakedTarget=target;
    return card;
  }
  const replacements=candidates.map(o=>[o,bake(o)]);
  for(const [o,v]of visibility)o.visible=v;
  for(const [source,card]of replacements){source.visible=false;world.add(card);bakedCards.push(card);}
  ball.visible=true;
  // Thin architecture is retained as the folded corner of the paper set.
  // The furniture, chairs and props have no rendered thickness.
  scene.background=originalBackground;renderer.toneMapping=oldTone;renderer.shadowMap.enabled=oldShadows;renderer.setRenderTarget(oldTarget);renderer.setClearColor(originalBackground,1);
  canvas.dataset.cutoutCards=String(bakedCards.length);
}



function setWhiteGlints(pass,viewCamera){
  const right=new THREE.Vector3(1,0,0).applyQuaternion(viewCamera.quaternion);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(viewCamera.quaternion);
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(viewCamera.quaternion);
  const viewport=pass.renderer.getSize(new THREE.Vector2());
  for(let i=0;i<2;i++){
    const phase=((elapsed-(i?4.2:1.0))%7.5+7.5)%7.5;
    const pulse=phase<1.05?Math.pow(Math.sin(phase/1.05*Math.PI),.7):0;
    const sign=i?-1:1;
    const point=ballPosition.clone().addScaledVector(right,sign*.335).addScaledVector(up,sign*.30).addScaledVector(forward,.13);
    point.project(viewCamera);
    const center=ballPosition.clone().project(viewCamera),edge=ballPosition.clone().addScaledVector(up,.445).project(viewCamera);
    const radius=Math.abs(edge.y-center.y)*.5*viewport.y*pass.cardSize.y;
    pass.uniforms['uGlint'+i].value.set(point.x*.5*pass.cardSize.x+pass.cardCenter.x,point.y*.5*pass.cardSize.y+pass.cardCenter.y,THREE.MathUtils.clamp(radius*.34,5,25)*( .75+pulse*.25),pulse);
  }
}

function buildDetailFrame(){
  const holder=document.createElement('aside');holder.id='detail-frame';holder.setAttribute('aria-label','Live disco ball detail');
  const backing=document.createElement('aside');backing.id='composition-card';backing.setAttribute('aria-hidden','true');const backCanvas=document.createElement('canvas');backing.append(backCanvas);$('#experience').append(backing);
  backRenderer=new THREE.WebGLRenderer({canvas:backCanvas,antialias:true});backRenderer.setPixelRatio(Math.min(devicePixelRatio,quality.pixelRatio));backRenderer.setSize(600,500,false);
  backScene=new THREE.Scene();backCamera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10);backCamera.position.z=2;
  backScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:'#222978'})));
  backPass=new PrintPass(backRenderer);backPass.cardSize.set(1,1);backPass.cardCenter.set(.5,.5);
  const detailCanvas=document.createElement('canvas');detailCanvas.setAttribute('aria-label','Ball portrait and lifted mirror tile macro');holder.append(detailCanvas);$('#experience').append(holder);
  detailRenderer=new THREE.WebGLRenderer({canvas:detailCanvas,antialias:true,alpha:false});detailRenderer.setPixelRatio(Math.min(devicePixelRatio,quality.pixelRatio));detailRenderer.setSize(420,300,false);detailRenderer.outputColorSpace=THREE.SRGBColorSpace;detailRenderer.toneMapping=THREE.ACESFilmicToneMapping;detailRenderer.toneMappingExposure=1.2;
  ball.visible=false;cubeCamera.update(detailRenderer,scene);ball.visible=true;
  detailPass=new PrintPass(detailRenderer);detailPass.uniforms.uFaceDrawings.value=1;detailPass.uniforms.uCardSize.value.set(1,1);detailPass.uniforms.uCardCenter.value.set(.5,.5);
  detailCamera=new THREE.PerspectiveCamera(38,1.4,.005,60);
}
function updateTileHover(dt){
  ball.updateMatrixWorld(true);raycaster.setFromCamera(pointerNDC,camera);
  const hit=(isDragging||mapViewport.dragging)?null:raycaster.intersectObject(ballCore,false)[0];
  hover=!!hit;
  const local=hit?ball.worldToLocal(hit.point.clone()).normalize():ball.worldToLocal(camera.position.clone()).normalize();
  hoverNormal.copy(local);detailNormal.lerp(local,1-Math.exp(-dt*8)).normalize();
  let peak=0;
  tileRest.forEach((t,i)=>{
    const distance=t.normal.distanceTo(hoverNormal);
    const goal=hit?.12*Math.exp(-distance*distance/.18):0;
    tileLift[i]+=(goal-tileLift[i])*(1-Math.exp(-dt*(goal>tileLift[i]?12:6)));
    peak=Math.max(peak,tileLift[i]);
    tileDummy.position.copy(t.normal).multiplyScalar(.445+tileLift[i]);tileDummy.lookAt(tileDummy.position.clone().add(t.normal));tileDummy.rotateX(tileLift[i]*2.2);tileDummy.scale.set(t.w,t.h,.008);tileDummy.updateMatrix();tiles.setMatrixAt(i,tileDummy.matrix);
  });tiles.instanceMatrix.needsUpdate=true;
  canvas.dataset.tileHover=JSON.stringify({active:!!hit,lift:Number(peak.toFixed(3))});
}
// Move the actual opposing sides of a quadrilateral toward an oblique seam.
// Each side and corner has its own easing; the two cards use different edge pairs.
function foldCardEdges(corners,open,variant=0){
  const q=corners.map(p=>p.slice());
  if(variant)q.push(q.shift());
  const shut=1-THREE.MathUtils.clamp(open,0,1);
  const mix=(a,b,t)=>[THREE.MathUtils.lerp(a[0],b[0],t),THREE.MathUtils.lerp(a[1],b[1],t)];
  const seamA=mix(q[0],q[3],variant?.63:.42),seamB=mix(q[1],q[2],variant?.38:.61);
  const folded=[mix(q[0],seamA,Math.pow(shut,variant?1.55:.72)),mix(q[1],seamB,Math.pow(shut,variant?1.1:.96)),mix(q[2],seamB,Math.pow(shut,variant?.62:1.8)),mix(q[3],seamA,Math.pow(shut,variant?.9:1.35))];
  if(variant)folded.unshift(folded.pop());
  return folded;
}

function mixedGrade(base,local){const out={...base};for(const [key,value]of Object.entries(local||{}))out[key]=['contrast','saturation'].includes(key)?out[key]*value:out[key]+value;return out;}
function gradeFrame(pass,local,solid=false){
 const neutral={exposure:0,contrast:1,shadows:0,highlights:0,saturation:1,temperature:0,tint:0,value:0};
 for(const region of ['ball','room','foliage']){let g=solid?neutral:(baseMapGrades||printPass.grades)[region];g=mixedGrade(g,sceneLayout.stack.color);g=mixedGrade(g,local);for(const [key,value]of Object.entries(g))pass.setGrade(region,key,value);}
}
function setQuality(next){const ratio=Math.min(devicePixelRatio,next.pixelRatio)*(mapViewport.overview?.65:1);quality=next;if(renderer.getPixelRatio()!==ratio){renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);printPass.resize();if(detailRenderer){detailRenderer.setPixelRatio(ratio);detailRenderer.setSize(420,300,false);detailPass.resize();detailPass.cardSize.set(1,1);detailPass.cardCenter.set(.5,.5);backRenderer.setPixelRatio(ratio);backRenderer.setSize(600,500,false);backPass.resize();backPass.cardSize.set(1,1);backPass.cardCenter.set(.5,.5);backCacheKey='';}}}
function renderDetailFrame(){
  if(!detailRenderer)return;
  const n=detailNormal.clone().transformDirection(ball.matrixWorld);
  const cfg=viewMix>=.5?sceneLayout.macro:sceneLayout.wide;
  const target=ballPosition.clone().addScaledVector(n,THREE.MathUtils.lerp(0,.51,viewMix));
  const portraitOffset=new THREE.Vector3(.8,.38,1.3).normalize();
  const direction=portraitOffset.lerp(n,viewMix).normalize();
  detailCamera.position.copy(target).addScaledVector(direction,THREE.MathUtils.lerp(1.65,.40,viewMix)/(cfg.zoom||1));detailCamera.lookAt(target);detailCamera.updateProjectionMatrix();
  const colorKey=JSON.stringify([printPass.settings,baseMapGrades,sceneLayout]);
  if(colorKey!==detailCacheKey){for(const [key,value]of Object.entries(printPass.settings))detailPass.set(key,value);gradeFrame(detailPass,cfg.color);detailCacheKey=colorKey;}
  // The detail camera updates at a lower rate than the main interaction.
  if(performance.now()-lastDetailDraw>=1000/quality.detailFps){const detailNow=performance.now();lastDetailDraw=detailNow-((detailNow-lastDetailDraw)%(1000/quality.detailFps));gradeFrame(detailPass,cfg.color);detailPass.setViewMix(0);setWhiteGlints(detailPass,detailCamera);detailRenderer.clippingPlanes=[];detailPass.render(scene,detailCamera,elapsed);}
  const holder=$('#detail-frame');
  const macro=viewMix>=.5;
  // Both opposing edges meet before the new plate changes shape and position.
  const openness=macro?THREE.MathUtils.clamp((viewMix-.58)/.42,0,1):THREE.MathUtils.clamp((.42-viewMix)/.42,0,1);
  // Measure the visible portion of the main card against its centered area.
  // A detail plate folds away as its parent composition leaves the viewport.
  const cx=printPass.cardCenter.x,cy=1-printPass.cardCenter.y;
  const cw=printPass.cardSize.x,ch=printPass.cardSize.y;
  const visibleW=Math.max(0,Math.min(1,cx+cw/2)-Math.max(0,cx-cw/2));
  const visibleH=Math.max(0,Math.min(1,cy+ch/2)-Math.max(0,cy-ch/2));
  const visibility=THREE.MathUtils.clamp(visibleW*visibleH/(cw*ch),0,1);
  const presence=THREE.MathUtils.smoothstep(MAP_EMBEDDED?mapViewport.presence:visibility,.12,.94);
  const plateOpen=openness*presence;
  holder.style.setProperty('--detail-scale',`${(.3+.7*presence)*(cfg.scale||1)}`);
  holder.dataset.presence=presence.toFixed(3);
  holder.firstElementChild.style.clipPath='none';
  const narrow=innerWidth/innerHeight<.85;holder.style.left=cfg.x+'%';holder.style.top=narrow?(innerHeight*.5+(cfg.y-50)*innerWidth/100)+'px':cfg.y+'%';holder.style.width=`min(${cfg.width}vw,${390*cfg.width/(macro?38:34)}px)`;holder.style.setProperty('--detail-tilt',`${cfg.rotation+smoothPointer.x*.8}deg`);
  const depth=cfg.depth;
  const shiftX=panCurrent.x*depth+smoothPointer.x*(macro?5:3);
  const shiftY=panCurrent.y*depth+smoothPointer.y*(macro?3:2);
  holder.style.setProperty('--detail-shift-x',`${shiftX}px`);
  holder.style.setProperty('--detail-shift-y',`${shiftY}px`);
  holder.dataset.pan=JSON.stringify({x:Math.round(shiftX),y:Math.round(shiftY),depth});
  // Sample each side of the quadrilateral to make the silhouette itself boil.
  // This sits outside the printed canvas, so it also roughens the outer boundary.
  const corners=foldCardEdges(macro?[[0,13],[94,0],[100,86],[8,100]]:[[0,36],[100,0],[93,100],[19,80]],plateOpen,0);
  const edgePhase=Math.floor(elapsed*8);
  const amplitude=printPass.settings.wobble*(1.2+printPass.settings.sketch*2.5);
  const width=holder.clientWidth||300,height=holder.clientHeight||200;
  const points=[];
  for(let edge=0;edge<4;edge++){
    const a=corners[edge],b=corners[(edge+1)%4];
    const dx=(b[0]-a[0])*width/100,dy=(b[1]-a[1])*height/100,len=Math.max(.001,Math.hypot(dx,dy));
    for(let step=0;step<24;step++){
      const t=step/24;
      const wave=Math.sin(step*12.9898+edge*78.233+edgePhase*6.713)*43758.5453;
      const jitter=((wave-Math.floor(wave))-.5)*2*amplitude*plateOpen;
      points.push(`${(a[0]+(b[0]-a[0])*t-dy/len*jitter/width*100).toFixed(3)}% ${(a[1]+(b[1]-a[1])*t+dx/len*jitter/height*100).toFixed(3)}%`);
    }
  }
  holder.style.clipPath=`polygon(${points.join(',')})`;
  holder.dataset.view=macro?'tile-macro':'ball-portrait';holder.dataset.wipe=openness.toFixed(2);
  const backing=$('#composition-card');
  const backCfg=sceneLayout.backing;backing.style.left=backCfg.x+'%';backing.style.top=narrow?(innerHeight*.5+(backCfg.y-50)*innerWidth/100)+'px':backCfg.y+'%';backing.style.width=backCfg.width+'%';backing.style.height=narrow?(backCfg.height*innerWidth/100)+'px':backCfg.height+'%';
  backing.style.transform=`translate(${panCurrent.x*backCfg.depth}px,${panCurrent.y*backCfg.depth}px) rotate(${backCfg.rotation}deg) scale(${(.3+.7*presence)*(backCfg.scale||1)})`;
  backing.firstElementChild.style.clipPath='none';
  backing.style.visibility=macro?'hidden':'visible';
  const backOpen=Math.pow(plateOpen,1.28);
  const backCorners=foldCardEdges([[24,0],[100,46],[15,100],[0,43]],backOpen,1),backPoints=[];
  for(let edge=0;edge<4;edge++){const a=backCorners[edge],b=backCorners[(edge+1)%4];for(let j=0;j<32;j++){const t=j/32,jitter=Math.sin(j*17.17+edge*83+edgePhase*13)*amplitude*.13*backOpen;backPoints.push(`${a[0]+(b[0]-a[0])*t+jitter}% ${a[1]+(b[1]-a[1])*t+jitter}%`);}}
  backing.style.clipPath=`polygon(${backPoints.join(',')})`;
  if(colorKey!==backCacheKey){for(const [key,value]of Object.entries(printPass.settings))backPass.set(key,value);backPass.set('tint',0);backPass.set('sketch',0);gradeFrame(backPass,{...backCfg.color,exposure:backCfg.color.exposure-.35},true);backPass.render(backScene,backCamera,elapsed);backCacheKey=colorKey;}
}

async function init(){
  try{
    await Promise.all(Array.from({length:10},(_,i)=>loadPhoto(i+1)));
    const garden=new Image();garden.src='./assets/garden.jpg';try{await garden.decode();photos.garden=garden;}catch{}
    faceAtlas=await new THREE.TextureLoader().loadAsync('./assets/face-drawings-atlas.png');faceAtlas.colorSpace=THREE.SRGBColorSpace;faceAtlas.anisotropy=8;
    chairAsset=(await new GLTFLoader().loadAsync('./assets/purple-chair.glb')).scene;
    buildGarden();buildRoom();buildBall();buildAtmosphere();cameraPose();updateReflections();bakeCutoutStage();combineStaticGeometry();buildDetailFrame();
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    await renderer.compileAsync(scene,camera);
    await renderer.compileAsync(printPass.scene,printPass.camera);
    if(reducedMotion){paused=false;toggleMotion();}
    $('#loading').classList.add('loaded');
    window.__greenHour={ready:true,view:'wide',tiles:tiles.count,textureSources:10};
    requestAnimationFrame(animate);
  }catch(error){console.error('Scene initialization failed:',error);$('#loading').hidden=true;$('#error').hidden=false;}
}

if(MAP_EMBEDDED)mapBridge=installMapBridge({
 dragEnd(){panStart=null;isDragging=false;downPosition=null;canvas.style.cursor='grab';},
 viewport(m){const changed=!!mapViewport.overview!==!!m.overview;mapViewport=m;if(changed)setQuality(quality);panTarget.set(THREE.MathUtils.clamp(m.offsetX*.10,-innerWidth*.18,innerWidth*.18),THREE.MathUtils.clamp(m.offsetY*.10,-innerHeight*.18,innerHeight*.18));},
 layout(m){sceneLayout=structuredClone(m.layout.disco);layoutRevision++;canvas.dataset.appliedLayout=JSON.stringify(sceneLayout);setQuality(m.quality);if(baseMapGrades)gradeFrame(printPass,{});detailCacheKey='';backCacheKey='';},
 palette(m){baseMapGrades=structuredClone(m.grades);for(const [key,value]of Object.entries(m.print))if(key in printPass.settings)printPass.set(key,value);for(const [region,grade]of Object.entries(m.grades))for(const [key,value]of Object.entries(grade))printPass.setGrade(region,key,value);gradeFrame(printPass,{});syncStyle();syncGradeUI();},
 command(m){if(m.command==='detail')setView(true);if(m.command==='wide')setView(false);if(m.command==='zoom')setView(!close);if(m.command==='motion'&&paused!==m.paused)toggleMotion();}
});
init();
