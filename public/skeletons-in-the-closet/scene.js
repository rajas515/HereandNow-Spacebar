import {applyMapCamera} from '../shared/map-camera.js';
import {applyMapAppearance} from '../shared/map-appearance.js';
import * as THREE from '../shared/vendor/three.module.js';
import {gltfLoader} from '../shared/gltf.js';
import {PrintPass} from '../shared/print-pass.js';
import {installComposition} from '../shared/cutout/composition.js';
import {createStageClipping} from '../shared/cutout/stage-clipping.js';
import {addAtmosphere} from '../shared/cutout/atmosphere.js';
import {roomCutOutline} from './cut-outline.js';
import {createWindowBackgrounds} from './windows.js';
import {createDaylight} from './daylight.js';
import {createMannequinInset} from './mannequin-inset.js';
import {createConfessions} from './confessions.js';

const assetUrl=path=>new URL(path,import.meta.url).href;

// Runs on the standalone page (pageHost) or inside the exhibition world.
export async function mount(host){
let mapViewportState={};
let mapColor={},mapPrint={},mapBridge;

let mannequinInset,lastInsetDraw=0,confessions;
const daylight=createDaylight();
const $=s=>host.$(s),canvas=$('#scene'),stage=$('#stage'),embedded=host.embedded;
if(embedded)host.documentElement.classList.add('map-embedded');
const KEY='green-hour-skeletons-in-the-closet-v1';
const defaults={mode:'print',riso:.7,sketch:.5,exposure:1.3,lens:.68,width:1.12,quality:'balanced',floorLight:-.35,roomLight:0,objectLight:-.15,windowLight:-.35,floorWarmth:-.15,roomWarmth:0,objectWarmth:.08,windowWarmth:-.1,
 // Zoom card (mannequin inset) and confession card, placed from the room-corner marker in stage-height units.
 insetX:-.195,insetY:-.375,insetSize:1,bubbleX:-.005,bubbleY:-.145,bubbleSize:1};
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{}
let settings={...defaults,...saved},paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const reduced=paused,pan=new THREE.Vector2(),pointer=new THREE.Vector2(),smooth=new THREE.Vector2(),rest=new THREE.Vector2();
const scene=new THREE.Scene();scene.background=new THREE.Color('#1a1d4a');
const camera=new THREE.PerspectiveCamera(68,1,.05,65);camera.up.set(0,0,-1);
const base=new THREE.Vector3(-.033,7.146,.096),target=new THREE.Vector3(.318,0,.106);
scene.add(new THREE.HemisphereLight('#f8f0e2','#34394d',.22));
const sun=new THREE.SpotLight('#ffe8ce',48,25,.92,.06,1.4);sun.position.set(2,4.4,-3.8);sun.target.position.set(0,.4,.4);sun.castShadow=true;
const aperture=document.createElement('canvas');aperture.width=aperture.height=256;const apertureContext=aperture.getContext('2d');apertureContext.fillStyle='#020202';apertureContext.fillRect(0,0,256,256);apertureContext.fillStyle='#ffffff';for(let i=0;i<3;i++)apertureContext.fillRect(7+i*86,12,62,232);sun.map=new THREE.CanvasTexture(aperture);
let lightPanX=Infinity,lightPanZ=Infinity;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.5,far:30});sun.shadow.bias=-.0002;sun.shadow.normalBias=.012;sun.shadow.radius=3;scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight('#b4c2ef',.12);fill.position.set(-4,6,4);scene.add(fill);
let renderer,pass,clipping,garden,atmosphere,loaded=false,dirty=true,visible=true,raf=0,last=0,time=0,frames=0,perfStart=performance.now(),perfFrames=0,quality={fps:40,pixelRatio:1};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}}
function wake(){if(!raf&&loaded&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
function configure(){
 if(!pass)return;const printed=settings.mode==='print';
 pass.uniforms.uLensStrength.value=Number(settings.lens);pass.uniforms.uCardStretch.value=Number(settings.width);
 for(const k of ['riso','sketch'])pass.set(k,printed?Number(settings[k]):0);
 pass.set('tint',printed?1:0);pass.set('wobble',printed?.25:0);pass.set('threshold',.56);pass.set('contrast',1.05);
 for(const region of ['room','ball','foliage'])for(const [k,v] of Object.entries({exposure:Number(settings.exposure)+Number(region==='ball'?settings.objectLight:region==='foliage'?settings.windowLight:settings.roomLight),contrast:1.12,shadows:-.08,highlights:0,saturation:1,temperature:Number(region==='ball'?settings.objectWarmth:region==='foliage'?settings.windowWarmth:settings.roomWarmth),tint:0,value:0}))pass.setGrade(region,k,v);
 pass.uniforms.uFloor0.value.set(Number(settings.exposure)+Number(settings.floorLight),1.05,-.02,.08);pass.uniforms.uFloor1.value.set(.8,Number(settings.floorWarmth),-.12,0);
 $('#print').setAttribute('aria-pressed',String(printed));$('#material').setAttribute('aria-pressed',String(!printed));
 for(const k of ['riso','sketch','exposure','lens','width','quality','floorLight','roomLight','objectLight','windowLight','floorWarmth','roomWarmth','objectWarmth','windowWarmth','insetX','insetY','insetSize','bubbleX','bubbleY','bubbleSize'])$('#'+k).value=settings[k];applyMapAppearance(pass,mapColor,mapPrint);
 dirty=true;wake();
}
function resize(){
 if(!renderer)return;const r=stage.getBoundingClientRect(),ratio=settings.quality==='high'?1.5:settings.quality==='low'?.75:quality.pixelRatio;
 renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;
 camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(68/2))*Math.max(1,1.4/camera.aspect)));camera.updateProjectionMatrix();pass.resize();pass.cardSize.set(1,1);pass.cardCenter.set(.5,.5);
 if(clipping){const anchor=camera.clone();anchor.clearViewOffset();anchor.fov=camera.fov;anchor.updateProjectionMatrix();anchor.position.copy(base);anchor.lookAt(target);anchor.updateMatrixWorld(true);clipping.setAnchor(anchor);}dirty=true;wake();
}
function tick(now){
 raf=0;if(!visible||document.hidden||!loaded)return;
 const destination=paused||reduced?rest:pointer,moving=!paused&&!reduced,easing=smooth.distanceTo(destination)>.0008;
 if(!dirty&&!moving&&!easing)return;
 if(now-last<1000/(settings.quality==='low'?24:quality.fps)){wake();return;}
 const dt=Math.min(.1,(now-last)/1000||.025);last=now;if(moving)time+=dt;smooth.lerp(destination,1-Math.exp(-dt*7));
 if(embedded){camera.position.copy(base);applyMapCamera(camera,pan,mapViewportState,stage.clientWidth,stage.clientHeight,.8,5);}
 camera.position.copy(base).add(new THREE.Vector3(pan.x+smooth.x*.11,0,pan.y+smooth.y*.08));camera.lookAt(target.clone().add(new THREE.Vector3(pan.x,0,pan.y)));
 
 atmosphere?.update(time);daylight.update(pan);
 if(Math.abs(pan.x-lightPanX)+Math.abs(pan.y-lightPanZ)>.015){sun.position.set(2+pan.x*.5,4.4,-3.8+pan.y*.22);sun.target.position.set(pan.x*.08,.4,.4);renderer.shadowMap.needsUpdate=true;lightPanX=pan.x;lightPanZ=pan.y;}
 renderer.toneMapping=THREE.NoToneMapping;renderer.info.reset();pass.render(scene,camera,time);
 if(now-lastInsetDraw>=1000/(quality.detailFps||24)){mannequinInset?.render(pan,smooth,time,settings);lastInsetDraw=now;}
 if(embedded){canvas.dataset.renderedMapGrades=JSON.stringify(pass.grades);canvas.dataset.mapCamera=JSON.stringify({pan:pan.toArray(),view:camera.view});}
 canvas.dataset.state='ready';canvas.dataset.renderedSettings=JSON.stringify(settings);canvas.dataset.pan=JSON.stringify(pan.toArray());canvas.dataset.frames=String(++frames);canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.zoom='disabled';
 perfFrames++;if(now-perfStart>1200){$('#metrics').value=`${Math.round(perfFrames*1000/(now-perfStart))} fps Ã‚· ${renderer.info.render.calls} draws`;perfFrames=0;perfStart=now;}
 dirty=false;if(moving||easing)wake();
}
async function init(){try{
 renderer=host.createRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 pass=new PrintPass(renderer);installComposition(pass);
 pass.uniforms.uFloor0={value:new THREE.Vector4()};pass.uniforms.uFloor1={value:new THREE.Vector4()};
 pass.material.fragmentShader='uniform vec4 uFloor0,uFloor1;\n'+pass.material.fragmentShader;
 pass.material.fragmentShader=pass.material.fragmentShader.replace('return m>.8?uGradeBall0:','return m>.65&&m<.79?uFloor0:m>.8?uGradeBall0:').replace('return m>.8?uGradeBall1:','return m>.65&&m<.79?uFloor1:m>.8?uGradeBall1:');
 const [asset,windows]=await Promise.all([gltfLoader().loadAsync(assetUrl('./assets/studio.glb?v=draco1')),createWindowBackgrounds(renderer)]);
 garden=windows.garden;const studioWindow=windows.studio;
 asset.scene.traverse(o=>{if(!o.isMesh)return;
  if(o.name==='windows-right'){o.geometry.translate(-.012,0,0);o.material.dispose();o.material=garden;o.castShadow=false;}
  else if(o.name==='windows-studio'){o.geometry.translate(0,0,.012);o.material.dispose();o.material=studioWindow;o.castShadow=false;}
  else{for(const m of Array.isArray(o.material)?o.material:[o.material]){m.side=THREE.DoubleSide;m.roughness=.86;m.flatShading=true;m.userData.accent=o.name==='objects'||o.name.startsWith('hero-');m.userData.floorGrade=o.name==='room';daylight.apply(m);}o.castShadow=true;o.receiveShadow=true;}
 });
 scene.add(asset.scene);
 // Keep hero materials separate for their original textures, while sharing the
 // mask/grade path. No fixed-angle prop plates are used with lateral pan.
 asset.scene.traverse(o=>{if(o.isMesh&&Array.isArray(o.material)){
  const materials=o.material,groups=o.geometry.groups.slice();
  for(const g of groups){const geo=o.geometry.clone();geo.clearGroups();geo.setDrawRange(g.start,g.count);const mesh=new THREE.Mesh(geo,materials[g.materialIndex]);mesh.name='hero-'+g.materialIndex;mesh.castShadow=true;mesh.receiveShadow=true;mesh.matrix.copy(o.matrix);mesh.matrixAutoUpdate=false;o.parent.add(mesh);}o.visible=false;o.userData.sourceOnly=true;
 }});
 configure();resize();camera.position.copy(base);camera.lookAt(target);camera.updateMatrixWorld(true);
 atmosphere=addAtmosphere(scene,{beams:[],contacts:[[-1.02,.82],[1.53,.72]]});
 const outline=roomCutOutline();
 clipping=createStageClipping(renderer,scene,pass,{outline,bounds:[4,4,1.395,3.2,.5,9],roomHeight:10});
 const anchor=camera.clone();anchor.clearViewOffset();anchor.fov=camera.fov;anchor.updateProjectionMatrix();clipping.setAnchor(anchor);
 renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 await renderer.compileAsync(scene,camera);await renderer.compileAsync(pass.scene,pass.camera);
 mannequinInset=createMannequinInset(scene,pass,stage,camera,clipping,host.createRenderer,(x,y,h)=>confessions?.pin(x,y,h,settings));
 // Confess to unlock a confession: a speech bubble from the mannequin inset (confessions.js).
 confessions=createConfessions(host,stage);
 loaded=true;$('#loading').hidden=true;dirty=true;wake();
}catch(error){console.error(error);$('#loading').hidden=true;$('#error').hidden=false;canvas.dataset.state='error';}}
for(const mode of ['print','material'])$('#'+mode).onclick=()=>{settings.mode=mode;persist();configure();};
for(const k of ['riso','sketch','exposure','lens','width','quality','floorLight','roomLight','objectLight','windowLight','floorWarmth','roomWarmth','objectWarmth','windowWarmth','insetX','insetY','insetSize','bubbleX','bubbleY','bubbleSize'])$('#'+k).addEventListener('input',e=>{settings[k]=k==='quality'?e.target.value:Number(e.target.value);persist();configure();if(k==='quality')resize();});
$('#settings').onclick=()=>{const open=$('#controls').hidden;$('#controls').hidden=!open;$('#settings').setAttribute('aria-expanded',String(open));};
function motion(){ $('#motion').textContent=paused?'Resume':'Pause';$('#motion').setAttribute('aria-label',paused?'Resume scene motion':'Pause scene motion');$('#motion').setAttribute('aria-pressed',String(paused));}
$('#motion').onclick=()=>{paused=!paused;motion();dirty=true;wake();};motion();
$('#copy-position').onclick=async()=>{const text=JSON.stringify(Object.fromEntries(['insetX','insetY','insetSize','bubbleX','bubbleY','bubbleSize'].map(k=>[k,settings[k]])),null,2);try{await navigator.clipboard.writeText(text);$('#copy-position').textContent='Copied';}catch{prompt('Copy these values',text);}setTimeout(()=>{$('#copy-position').textContent='Copy position';},1500);};
$('#reset').onclick=()=>{settings={...defaults};pan.set(0,0);persist();configure();resize();};$('#retry').onclick=()=>location.reload();
let down=null;
canvas.addEventListener('pointerdown',e=>{if(e.button===0){down={x:e.screenX,y:e.screenY,lastX:e.screenX,lastY:e.screenY,moved:false};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();if(down&&(e.buttons&1)===0)down=null;if(down&&!embedded){if(Math.hypot(e.screenX-down.x,e.screenY-down.y)>6)down.moved=true;if(down.moved){const units=2*(base.y-.8)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/r.height;pan.x-= (e.screenX-down.lastX)*units;pan.y-=(e.screenY-down.lastY)*units;pan.clampScalar(-5,5);canvas.style.cursor='grabbing';dirty=true;wake();}down.lastX=e.screenX;down.lastY=e.screenY;return;}if(!paused&&!reduced){pointer.set((e.clientX-r.left)/r.width*2-1,(e.clientY-r.top)/r.height*2-1);wake();}});
canvas.addEventListener('pointerup',e=>{down=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);canvas.style.cursor='grab';});canvas.addEventListener('pointercancel',()=>{down=null;});canvas.addEventListener('lostpointercapture',()=>{down=null;});window.addEventListener('blur',()=>{down=null;});
canvas.addEventListener('pointerleave',()=>{pointer.set(0,0);wake();});
function recenter(){pan.set(0,0);dirty=true;wake();}canvas.addEventListener('dblclick',recenter);
canvas.addEventListener('keydown',e=>{const moves={ArrowLeft:[-.2,0],ArrowRight:[.2,0],ArrowUp:[0,-.2],ArrowDown:[0,.2]};if(moves[e.code]){e.preventDefault();pan.add(new THREE.Vector2(...moves[e.code]));pan.clampScalar(-5,5);dirty=true;wake();}if(e.code==='Home'){e.preventDefault();recenter();}});
new ResizeObserver(resize).observe(stage);new IntersectionObserver(([e])=>{visible=e.isIntersecting;dirty=true;wake();}).observe(stage);
document.addEventListener('visibilitychange',()=>{last=0;dirty=true;wake();});
mapBridge=host.installMapBridge({viewport:m=>{visible=m.visible!==false;mapViewportState=m;dirty=true;wake();},palette:m=>{mapPrint=m.print||{};configure();dirty=true;wake();},layout:m=>{quality={...quality,...m.quality};mapColor=m.layout?.['skeletons-in-the-closet']?.stack?.color||{};configure();resize();},dragEnd:()=>{down=null;},command:m=>{if(m.command==='motion'){paused=!!m.paused;motion();}if(m.command==='wide')recenter();dirty=true;wake();}});
await init();
}
