import {applyMapCamera} from '../shared/map-camera.js';
import {applyMapAppearance} from '../shared/map-appearance.js';
import * as THREE from '../shared/vendor/three.module.js';
import {gltfLoader} from '../shared/gltf.js';
import {PrintPass} from '../shared/print-pass.js';
import {addAccent} from '../shared/accent.js';
import {bakePerimeter} from '../shared/cutout/bake-static.js';
import {installComposition,foliageMaterial,buildWindowApertures,WIDE_OUTLINE} from '../shared/cutout/composition.js';
import {createStageClipping} from '../shared/cutout/stage-clipping.js';
import {addAtmosphere} from '../shared/cutout/atmosphere.js';
import {mergeGeometries} from '../shared/vendor/BufferGeometryUtils.js';

const assetUrl=path=>new URL(path,import.meta.url).href;

// Runs on the standalone page (pageHost) or inside the exhibition world.
export async function mount(host){
let mapViewportState={};
let mapColor={},mapPrint={},mapBridge;

const $=s=>host.$(s),canvas=$('#scene'),stage=$('#stage');
// Blue accent shard behind the room (shared/accent.js, disco's backing), traced from the exhibition comp.
addAccent(host,stage,[[.902,-.424],[.788,.997],[.774,1.309],[.18,1.045],[.296,.103]],canvas);
const embedded=host.embedded;
if(embedded)host.documentElement.classList.add('map-embedded');
const KEY='green-hour-in-the-life-of-v1';
const defaults={mode:'print',riso:.7,sketch:.5,exposure:1.3,lens:.68,width:1.24,compositionRevision:3,quality:'balanced'};
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{}
let settings={...defaults,...saved};
// Adopt the newly requested brighter/wider starting composition once, retaining
// subsequent adjustments and all unrelated saved settings.
if(saved.compositionRevision!==3){settings.mode='print';settings.riso=.7;settings.sketch=.5;settings.exposure=1.3;settings.lens=.68;settings.width=1.24;settings.quality='balanced';settings.compositionRevision=3;try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused=reduced,visible=true,loaded=false,dirty=true,raf=0,lastDraw=0,time=0,drawCount=0,perfStart=performance.now();
let quality={fps:40,pixelRatio:1},presence=1;
let close=false,viewMix=0,transition=null,gardenMaterial;
let wideFov=122;
const pointer=new THREE.Vector2(),smooth=new THREE.Vector2(),rest=new THREE.Vector2();
const pan=new THREE.Vector2();
let renderer,pass,stageClipping,atmosphere;
const scene=new THREE.Scene();scene.background=new THREE.Color('#1a1d4a');
const camera=new THREE.PerspectiveCamera(122,1,.05,55);camera.up.set(-1,0,0);
const target=new THREE.Vector3(.159,0,.284),base=new THREE.Vector3(.159,3.258,.284);
scene.add(new THREE.HemisphereLight('#f8f0e2','#34394d',.85));
const sun=new THREE.DirectionalLight('#ffe1b5',3.8);sun.position.set(8,5.8,7);sun.target.position.set(-.4,.4,-.6);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:30});sun.shadow.bias=-.0002;sun.shadow.normalBias=.012;sun.shadow.radius=3;
scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight('#b4c2ef',.32);fill.position.set(-4,5,-3);scene.add(fill);
let cube,room;
const raycaster=new THREE.Raycaster(),hitPoint=new THREE.Vector3();
const tablePlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.78);
const centralNames=new Set(['central-furniture','details-central','table-paper-ink']);
function setView(value){
  if(close===value&&!transition)return;
  close=value;transition={from:viewMix,to:value?1:0,start:performance.now()};
  if(reduced){viewMix=value?1:0;transition=null;}
  $('#wide').setAttribute('aria-pressed',String(!value));$('#table-view').setAttribute('aria-pressed',String(value));
  $('.caption').textContent=value?'02 / ON THE TABLE':'01 / THE STUDIO';
  canvas.setAttribute('aria-label',value?'Close overhead view of the worktables. Click or press Escape to return to the room.':'Overhead studio. Click the worktables or press Enter to move closer.');
  mapBridge?.state(value?1:0);dirty=true;wake();
}
function tableHit(event){
  const r=canvas.getBoundingClientRect();
  const aspect=r.width/r.height;
  const p=new THREE.Vector2(((event.clientX-r.left)/r.width-.5)/Number(settings.width)*aspect,.5-(event.clientY-r.top)/r.height);
  p.multiplyScalar((1+Number(settings.lens)*p.lengthSq())/(1+Number(settings.lens)*.16));
  raycaster.setFromCamera(new THREE.Vector2(p.x/aspect*2,p.y*2),camera);
  if(!raycaster.ray.intersectPlane(tablePlane,hitPoint))return false;
  return hitPoint.x>-.95&&hitPoint.x<1.35&&hitPoint.z>-1.75&&hitPoint.z<2.40;
}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}}
function configure(){
  if(!pass)return;
  const printed=settings.mode==='print';
  pass.uniforms.uLensStrength.value=Number(settings.lens);
  pass.uniforms.uCardStretch.value=Number(settings.width);
  for(const k of ['riso','sketch'])pass.set(k,printed?Number(settings[k]):0);
  pass.set('tint',printed?1:0);pass.set('wobble',printed?.25:0);
  pass.set('threshold',.56);pass.set('contrast',1.05);
  // Independent grades: the disco room's exposure is not appropriate to this asset.
  for(const region of ['room','ball','foliage']){
    const values={exposure:region==='foliage'?-.35:region==='ball'?-.15:0,contrast:1.12,shadows:-.08,highlights:0,saturation:1,temperature:0,tint:0,value:0};
    for(const [name,value] of Object.entries(values))pass.setGrade(region,name,value+(name==='exposure'?Number(settings.exposure):0));
  }
  renderer.toneMappingExposure=1.1*Math.pow(2,Number(settings.exposure));
  $('#print').setAttribute('aria-pressed',settings.mode==='print');$('#material').setAttribute('aria-pressed',settings.mode==='material');
  for(const key of ['riso','sketch','exposure','lens','width','quality'])$('#'+key).value=settings[key];
  applyMapAppearance(pass,mapColor,mapPrint);
 dirty=true;wake();
}
function resize(){
  if(!renderer)return;
  const {width,height}=stage.getBoundingClientRect();
  const dpr=settings.quality==='high'?1.5:settings.quality==='low'?.75:quality.pixelRatio;
  renderer.setPixelRatio(Math.min(devicePixelRatio,dpr));renderer.setSize(width,height,false);
  camera.aspect=width/height;camera.updateProjectionMatrix();pass.resize();
  pass.uniforms.uCardSize.value.set(1,1);pass.uniforms.uCardCenter.value.set(.5,.5);
  // Fit the complete authored landscape in narrow viewports without orbiting it.
  camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(122/2))*Math.max(1,1.4/camera.aspect)));
  wideFov=camera.fov;
  if(stageClipping){const anchor=camera.clone();anchor.clearViewOffset();anchor.position.copy(base);anchor.lookAt(target);anchor.updateProjectionMatrix();stageClipping.setAnchor(anchor);}
  camera.updateProjectionMatrix();dirty=true;wake();
}
function wake(){if(!raf&&loaded&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
function tick(now){
  raf=0;if(!visible||document.hidden||!loaded)return;
  const moving=!paused&&!reduced;
  const destination=paused||reduced?rest:pointer;
  const easing=smooth.distanceTo(destination)>.0008;
  if(!dirty&&!moving&&!easing&&!transition)return;
  const interval=1000/(settings.quality==='low'?24:quality.fps);
  if(now-lastDraw<interval){wake();return;}
  const dt=Math.min(.1,(now-lastDraw)/1000||.025);lastDraw=now;
  if(moving)time+=dt;
  if(transition){
    const stepped=Math.floor((now-transition.start)/1000*24)/24;
    const t=THREE.MathUtils.clamp(stepped/2.6,0,1),ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    viewMix=THREE.MathUtils.lerp(transition.from,transition.to,ease);
    if(t===1)transition=null;
  }
  smooth.lerp(destination,1-Math.exp(-dt*7));
  // Let the outer planes enter the room before the near wall fills the frame.
  const cameraMix=THREE.MathUtils.smoothstep(viewMix,.18,1);
  camera.position.copy(base);camera.position.y=THREE.MathUtils.lerp(base.y,2.22,cameraMix);
  camera.fov=wideFov;camera.updateProjectionMatrix();
  if(embedded)applyMapCamera(camera,pan,mapViewportState,stage.clientWidth,stage.clientHeight,.75,4);
  const parallax=THREE.MathUtils.lerp(.11,.025,viewMix);
  camera.position.x+=smooth.y*parallax+pan.y;
  camera.position.z+=smooth.x*parallax-pan.x;
  camera.lookAt(target.clone().add(new THREE.Vector3(pan.y,0,-pan.x)));
  pass.setViewMix(viewMix);
  if(gardenMaterial)gardenMaterial.uniforms.time.value=time;
  atmosphere?.update(time);stageClipping?.update(viewMix);
  // Cull only after the world-space planes have completely removed these surfaces.
  room.traverse(o=>{if(o.isMesh)o.visible=viewMix<1||centralNames.has(o.name);});
  for(const o of scene.children)if(o.name==='perimeter-paper-plates'||o.name==='window-light-shaft'||o.name==='floor-contact-shadow')o.visible=viewMix<1;
  {
    renderer.toneMapping=THREE.NoToneMapping;
    renderer.info.reset();
    const stats=pass.render(scene,camera,time);
    canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(stats.triangles);
  }
  drawCount++;if(now-perfStart>1200){$('#metrics').value=`${Math.round(drawCount*1000/(now-perfStart))} fps · ${canvas.dataset.drawCalls} draws · ${Math.round(Number(canvas.dataset.triangles)/1000)}k triangles`;drawCount=0;perfStart=now;}
  if(embedded){canvas.dataset.renderedMapGrades=JSON.stringify(pass.grades);canvas.dataset.mapCamera=JSON.stringify({pan:pan.toArray(),view:camera.view});}
 canvas.dataset.state='ready';canvas.dataset.mode=settings.mode;canvas.dataset.renderedSettings=JSON.stringify(settings);canvas.dataset.frames=String(Number(canvas.dataset.frames||0)+1);canvas.dataset.presence=String(presence);
  canvas.dataset.view=close?'table':'wide';canvas.dataset.viewMix=viewMix.toFixed(4);canvas.dataset.outline=JSON.stringify(WIDE_OUTLINE);canvas.dataset.foliage=String(!!gardenMaterial);
  if(stageClipping)canvas.dataset.renderedClipping=JSON.stringify(stageClipping.state);
  canvas.dataset.clipPhase=viewMix>.35&&viewMix<.70?'middle':viewMix===1?'close':viewMix===0?'wide':'moving';
  dirty=false;if(moving||easing||transition)wake();
}
// A cubemap is sampled only on the source window surfaces. It never becomes
// the scene background or a large billboard exposed outside the room.
function portalMaterial(){return new THREE.ShaderMaterial({uniforms:{garden:{value:cube},origin:{value:new THREE.Vector3(.159,1.8,.284)}},side:THREE.DoubleSide,
  vertexShader:'varying vec3 worldPoint;void main(){worldPoint=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldPoint,1.);}',
  fragmentShader:'uniform samplerCube garden;uniform vec3 origin;varying vec3 worldPoint;void main(){vec3 ray=normalize(worldPoint-cameraPosition);vec3 p=cameraPosition+ray*12.;vec3 color=textureCube(garden,normalize(p-origin)).rgb;gl_FragColor=vec4(color*.85,1.);}'
});}
async function init(){
  try{
    renderer=host.createRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
    renderer.info.autoReset=false;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;pass=new PrintPass(renderer);installComposition(pass);pass.uniforms.uTransparentOutside.value=1;   // the accent shows around the room
    const [gltf,garden,foliage,paperEdges]=await Promise.all([gltfLoader().loadAsync(assetUrl('./assets/studio.glb?v=draco1')),new THREE.CubeTextureLoader().loadAsync(['px','nx','py','ny','pz','nz'].map(f=>assetUrl(`./assets/garden-${f}.webp?v=webp1`))),new THREE.TextureLoader().loadAsync(assetUrl('../disco/assets/garden.webp?v=webp1')),fetch(assetUrl('./assets/paper-edges.json')).then(r=>{if(!r.ok)throw Error('Paper contours could not load');return r.json();})]);
    foliage.wrapS=foliage.wrapT=THREE.MirroredRepeatWrapping;foliage.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());gardenMaterial=foliageMaterial(foliage);
    cube=garden;cube.colorSpace=THREE.SRGBColorSpace;room=gltf.scene;
    room.traverse(o=>{if(!o.isMesh)return;
      if(o.name==='window-portals'){o.material.dispose();o.material=portalMaterial();o.material.userData.foliage=true;}
      else if(o.name==='foliage-panels'){o.material.dispose();o.material=gardenMaterial;}
      else{o.material.roughness=.88;o.material.side=THREE.DoubleSide;o.material.flatShading=true;o.material.userData.accent=['details-central','central-furniture'].includes(o.name);}
      o.castShadow=['architecture','furniture','central-furniture','details-central','services'].includes(o.name);o.receiveShadow=!o.material.isShaderMaterial;
      o.frustumCulled=true;
    });
    const aperture=room.getObjectByName('foliage-panels');
    canvas.dataset.foliageApertures=String(aperture?.geometry.attributes.position.count||0);
    const paperInk=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(paperEdges,3)),new THREE.LineBasicMaterial({color:'#50224c',toneMapped:false}));
    paperInk.name='table-paper-ink';room.add(paperInk);
    scene.add(room);loaded=true;configure();resize();
    camera.position.copy(base);camera.lookAt(target);camera.updateMatrixWorld(true);
    room.add(buildWindowApertures(camera,gardenMaterial));
    renderer.toneMapping=THREE.NoToneMapping;
    // Lateral camera exploration requires actual prop depth. Keep these meshes
    // in 3D, batching their identical vertex-colour materials into one draw.
    const peripheral=[];room.traverse(o=>{if(o.isMesh&&o.name.startsWith('details-perimeter-'))peripheral.push(o);});
    if(peripheral.length){
      const combined=new THREE.Mesh(mergeGeometries(peripheral.map(o=>o.geometry)),peripheral[0].material);
      combined.name='peripheral-props-3d';combined.castShadow=true;combined.receiveShadow=true;room.add(combined);
      peripheral.forEach(o=>{o.removeFromParent();o.geometry.dispose();if(o.material!==combined.material)o.material.dispose();});
    }
    atmosphere=addAtmosphere(scene);
    stageClipping=createStageClipping(renderer,scene,pass);stageClipping.setAnchor(camera);stageClipping.update(0);
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    await renderer.compileAsync(scene,camera);await renderer.compileAsync(pass.scene,pass.camera);
    $('#loading').hidden=true;wake();
  }catch(error){console.error(error);$('#loading').hidden=true;$('#error').hidden=false;canvas.dataset.state='error';}
}
$('#retry').onclick=()=>location.reload();
$('#wide').onclick=()=>setView(false);$('#table-view').onclick=()=>setView(true);
for(const mode of ['print','material'])$('#'+mode).onclick=()=>{settings.mode=mode;persist();configure();};
function motionButton(){ $('#motion').textContent=paused?'Resume':'Pause';$('#motion').setAttribute('aria-pressed',String(paused));$('#motion').setAttribute('aria-label',paused?'Resume scene motion':'Pause scene motion'); }
$('#motion').onclick=()=>{paused=!paused;motionButton();dirty=true;wake();};
motionButton();
$('#settings').onclick=()=>{const open=$('#controls').hidden;$('#controls').hidden=!open;$('#settings').setAttribute('aria-expanded',String(open));};
for(const key of ['riso','sketch','exposure','lens','width','quality'])$('#'+key).addEventListener('input',e=>{settings[key]=key==='quality'?e.target.value:Number(e.target.value);persist();configure();if(key==='quality')resize();});
$('#reset').onclick=()=>{settings={...defaults};persist();configure();resize();};
let pointerDown=null;
canvas.addEventListener('pointerdown',e=>{if(e.button===0){pointerDown={x:e.screenX,y:e.screenY,lastX:e.screenX,lastY:e.screenY,dragged:false};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointerup',e=>{if(pointerDown&&!pointerDown.dragged&&Math.hypot(e.screenX-pointerDown.x,e.screenY-pointerDown.y)<6&&(close||tableHit(e)))setView(!close);pointerDown=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);canvas.style.cursor='grab';});
canvas.addEventListener('pointercancel',()=>{pointerDown=null;});
canvas.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();setView(false);}if(e.code==='Enter'){e.preventDefault();setView(!close);}});
canvas.addEventListener('pointermove',e=>{if(pointerDown&&!embedded){if(Math.hypot(e.screenX-pointerDown.x,e.screenY-pointerDown.y)>6)pointerDown.dragged=true;if(pointerDown.dragged){const r=canvas.getBoundingClientRect(),units=2*(camera.position.y-.75)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/r.height;pan.x=THREE.MathUtils.clamp(pan.x-(e.screenX-pointerDown.lastX)*units,-4,4);pan.y=THREE.MathUtils.clamp(pan.y-(e.screenY-pointerDown.lastY)*units,-4,4);dirty=true;wake();canvas.style.cursor='grabbing';}pointerDown.lastX=e.screenX;pointerDown.lastY=e.screenY;return;}canvas.style.cursor=close?'zoom-out':tableHit(e)?'zoom-in':'grab';if(paused||reduced)return;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,(e.clientY-r.top)/r.height*2-1);wake();});
canvas.addEventListener('dblclick',()=>{pan.set(0,0);dirty=true;wake();});
// Tell the exhibition when the pointer is over the worktables (where a click moves closer),
// so its Enter cursor shows only there.
let overTables=null;const reportTables=over=>{if(over!==overTables){overTables=over;mapBridge?.hover?.(over);}};
canvas.addEventListener('pointermove',e=>{if(!pointerDown)reportTables(!close&&tableHit(e));},{passive:true});
canvas.addEventListener('pointerleave',()=>reportTables(false));
canvas.addEventListener('keydown',e=>{const moves={ArrowLeft:[-.2,0],ArrowRight:[.2,0],ArrowUp:[0,-.2],ArrowDown:[0,.2]};if(moves[e.code]){e.preventDefault();pan.add(new THREE.Vector2(...moves[e.code]));pan.clampScalar(-4,4);dirty=true;wake();}if(e.code==='Home'){pan.set(0,0);dirty=true;wake();}});
canvas.addEventListener('pointerleave',()=>{pointer.set(0,0);wake();});
document.addEventListener('visibilitychange',()=>{lastDraw=0;dirty=true;wake();});
new ResizeObserver(resize).observe(stage);
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;dirty=true;wake();}).observe(stage);
mapBridge=host.installMapBridge({viewport:m=>{visible=m.visible!==false;presence=m.presence??1;mapViewportState=m;dirty=true;wake();},palette:m=>{mapPrint=m.print||{};configure();dirty=true;wake();},command:m=>{if(m.command==='motion'){paused=!!m.paused;motionButton();}if(m.command==='wide')setView(false);if(m.command==='zoom')setView(!close);dirty=true;wake();},layout:m=>{quality={...quality,...m.quality};mapColor=m.layout?.['in-the-life-of']?.stack?.color||{};configure();if(renderer)resize();},dragEnd:()=>{pointerDown=null;},click:e=>{if(close||tableHit(e))setView(!close);pointerDown=null;}});
await init();
}
