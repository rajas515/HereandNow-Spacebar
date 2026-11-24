import {LetterReveal} from './letter-reveal.js';
import * as THREE from '../shared/vendor/three.module.js';
import objectContour from './frame-outline.js';
import {DRACOLoader} from '../shared/vendor/DRACOLoader.js';
import {GLTFLoader} from '../shared/vendor/GLTFLoader.js';
import {mergeGeometries} from '../shared/vendor/BufferGeometryUtils.js';
import {PrintPass} from './walkthrough-print-pass.js';

const assetUrl=path=>new URL(path,import.meta.url).href;

// Runs on the standalone page (pageHost) or as the opening of the exhibition world.
// In the world there is no page scroll: host.scroll supplies the 0-1 progress instead.
export async function mount(host){
const $=id=>host.$('#'+id);
const letter=new LetterReveal(host);
const defaults={mode:'print',riso:.7,sketch:.4,wobble:.4,dotSize:3.4,tint:1,contrast:.84,background:.97,threshold:.35,thresholdAmount:1,paper:'#1a1d4a',inkA:'#2939c2',inkB:'#fd0280',highlight:'#4b58c5',exposure:0,lens:0,width:1,quality:'balanced',frameWidth:.84,frameHeight:.76,breakout:9};
const settings={...defaults};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer=host.createRenderer({canvas:$('scene'),alpha:true,antialias:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.background=null;
const driftingFragments=new THREE.Scene();
let flakeAnchors=null;
const camera=new THREE.PerspectiveCamera(50,16/9,.04,1000);
renderer.shadowMap.enabled=false;
const pass=new PrintPass(renderer);
pass.uniforms.uLensStrength={value:0};pass.uniforms.uCardStretch={value:1};
pass.material.fragmentShader='uniform float uLensStrength,uCardStretch;\n'+pass.material.fragmentShader;
pass.material.fragmentShader=pass.material.fragmentShader.replace('vec2 cardUv=vUv;',`vec2 cardUv=vUv;
float lensAspect=uResolution.x/uResolution.y;
cardUv.x=(cardUv.x-.5)/uCardStretch+.5;
vec2 lensPoint=(cardUv-.5)*vec2(lensAspect,1.);
float lensRadius=dot(lensPoint,lensPoint);
lensPoint*=(1.+uLensStrength*lensRadius)/(1.+uLensStrength*.16);
cardUv=lensPoint/vec2(lensAspect,1.)+.5;`);
pass.uniforms.uTransparentOutside.value=1;
pass.material.needsUpdate=true;
let data,mixer,actions=[],ready=false,paused=false,time=0,target=0,raf=0,lastTick=0,dirty=true,lastDoorTime=-1;
let cameraMode='scroll';
const introDuration=9.9,roomDuration=20,titleDuration=14.5,storyDuration=introDuration+roomDuration+titleDuration+letter.duration;
// Tell the exhibition where the opening ends (the letter begins) so it can play it by itself.
if(host.scroll)host.scroll.timeline={opening:introDuration+roomDuration+titleDuration,noteEnd:introDuration+roomDuration+titleDuration+letter.revealDuration,total:storyDuration};
let storyTime=0,storyTarget=0;
let revealStart=0,endSequenceStart=0;
const titleMask=new THREE.TextureLoader().load(assetUrl('./lettering.png'),()=>invalidate());
titleMask.flipY=false;pass.uniforms.tTitle.value=titleMask;
const introLoader=new THREE.TextureLoader();
const introOptions={calligraphy:{path:assetUrl('./intro-lettering.png'),aspect:600/387},serif:{path:assetUrl('./intro-serif.png'),aspect:2}};
const introTextures={};let introChoice='calligraphy';
function chooseIntro(name,replay=false){introChoice=name;const option=introOptions[name];const texture=option.path?introTextures[name]||(introTextures[name]=introLoader.load(option.path,()=>invalidate())):blankIntro;texture.flipY=false;pass.uniforms.tIntro.value=texture;pass.uniforms.uIntroAspect.value=option.aspect;if(replay&&ready)seek(0);invalidate();}
// The opening question is plain text, set like the curatorial note (Georgia, lilac ink,
// each word arriving in pink and settling), timed by the story instead of scroll.
// The calligraphy graphic is kept in the shader's slot as blank paper, so the room still
// arrives underneath on the same schedule.
introOptions.text={path:null,aspect:2};
const blankIntro=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);blankIntro.needsUpdate=true;
const question=document.createElement('p');question.id='intro-question';question.setAttribute('aria-label','How did you know Exhib?');
question.innerHTML='<span class="line">'+'How did you know Exhib?'.split(' ').map(w=>`<span aria-hidden="true">${w}</span>`).join(' ')+'</span>';
(host.body||document.body).append(question);
const questionWords=[...question.firstChild.children];
const QUESTION={start:.8,step:.32,ink:.85,holdUntil:6.4,fadeOut:1.6};
function updateQuestion(t){   // t: seconds into the story
 const on=introChoice==='text'&&t<QUESTION.holdUntil+QUESTION.fadeOut;
 question.hidden=!on;if(!on)return;
 const fade=1-THREE.MathUtils.smoothstep(t,QUESTION.holdUntil,QUESTION.holdUntil+QUESTION.fadeOut);
 questionWords.forEach((w,i)=>{const k=THREE.MathUtils.clamp((t-QUESTION.start-i*QUESTION.step)/QUESTION.ink,0,1),e=1-Math.pow(1-k,3);
  w.style.opacity=(e*fade).toFixed(3);w.style.color=`color-mix(in srgb,#fd0280 ${Math.round((1-e)*100)}%,#808ff5)`;w.style.filter=`blur(${((1-e)*3).toFixed(2)}px)`;});
}
chooseIntro('text');
$('intro-choice').onchange=event=>chooseIntro(event.target.value,true);
let drawCount=0,drawTotal=0,lastCaption='',batchCount=0,sourceCalls=0,adaptiveScale=1;
const pointer=new THREE.Vector2(),parallax=new THREE.Vector2();
const tiltQ=new THREE.Quaternion(),tiltEuler=new THREE.Euler();
$('viewport').addEventListener('pointermove',event=>{if(reduced||host.world||event.pointerType==='touch')return;   // no pointer drift in the exhibition
const r=$('viewport').getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);wake();},{passive:true});
$('viewport').addEventListener('pointerleave',()=>{pointer.set(0,0);wake();});
const aP=new THREE.Vector3(),bP=new THREE.Vector3(),aQ=new THREE.Quaternion(),bQ=new THREE.Quaternion();
// In the exhibition, Act I rests while it is off screen (host.scroll.visible) and wakes on return.
const onScreen=()=>!host.scroll||host.scroll.visible!==false;
function wake(){if(ready&&!raf&&!document.hidden&&onScreen())raf=requestAnimationFrame(tick);}
function invalidate(){dirty=true;wake();}
function progress(){return host.scroll?host.scroll.progress:THREE.MathUtils.clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight),0,1);}
function scrollToProgress(fraction){if(host.scroll)host.scroll.set(fraction);else window.scrollTo({top:fraction*Math.max(1,document.documentElement.scrollHeight-innerHeight),behavior:'instant'});}
function readScroll(){if(!ready||paused||cameraMode!=='scroll')return;storyTarget=progress()*storyDuration;wake();}
if(host.scroll)host.scroll.onChange=readScroll;else window.addEventListener('scroll',readScroll,{passive:true});
window.addEventListener('resize',()=>{resize();readScroll();});
function resize(){
 if(!data)return;
 const rect=$('viewport').getBoundingClientRect();
 const w=rect.width*1.12,h=w/data.aspect;
 const quality={low:.7,balanced:1.25,high:1.5}[settings.quality];
 renderer.setPixelRatio(Math.min(devicePixelRatio,quality)*adaptiveScale);
 renderer.setSize(Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),false);
 pass.resize();pass.cardSize.set(1,1);pass.cardCenter.set(.5,.5);
 camera.aspect=data.aspect;camera.updateProjectionMatrix();invalidate();
}
new ResizeObserver(resize).observe($('viewport'));
function configure(){
 const printed=settings.mode==='print';
 for(const key of ['riso','sketch','wobble','dotSize','tint','contrast','background','threshold','paper','inkA','inkB','highlight'])pass.set(key,settings[key]);
 if(!printed){pass.set('tint',0);pass.set('riso',0);pass.set('sketch',0);pass.set('wobble',0);}
 if(reduced)pass.set('wobble',0);
 pass.uniforms.uThresholdAmount.value=printed?settings.thresholdAmount:0;
 pass.uniforms.uLensStrength.value=settings.lens;pass.uniforms.uCardStretch.value=settings.width;
 pass.uniforms.uFrameSize.value.set(settings.frameWidth,settings.frameHeight);pass.uniforms.uBreakoutDistance.value=settings.breakout;
 for(const region of ['room','ball','foliage'])for(const [name,value]of Object.entries({exposure:settings.exposure,contrast:1.08,shadows:0,highlights:0,saturation:1,temperature:0,tint:0,value:0}))pass.setGrade(region,name,value);
 renderer.toneMappingExposure=1.05*Math.pow(2,settings.exposure);
 host.documentElement.style.setProperty('--print-paper',settings.paper);
 $('print').setAttribute('aria-pressed',String(printed));$('material').setAttribute('aria-pressed',String(!printed));
 for(const [key,value]of Object.entries(settings)){const input=host.$('[data-setting="'+key+'"]');if(input){input.value=value;const out=input.parentElement.querySelector('output');if(out)out.value=typeof value==='number'?value.toFixed(2):value;}}
 invalidate();
}
const outlinePoints=[];
const outlineCanvas=document.createElement('canvas');outlineCanvas.width=1024;outlineCanvas.height=576;
const outlineContext=outlineCanvas.getContext('2d');
const outlineTexture=new THREE.CanvasTexture(outlineCanvas);outlineTexture.minFilter=THREE.LinearFilter;outlineTexture.magFilter=THREE.LinearFilter;outlineTexture.generateMipmaps=false;
pass.uniforms.tFrameMask.value=outlineTexture;
const stageProjection={value:new THREE.Matrix4()},stageView={value:new THREE.Matrix4()};
const erosionTime={value:0},scrollDecay={value:0},finalBounds={value:new THREE.Vector4(0,3,-3,7)};
const revealProgress={value:0},revealMin={value:new THREE.Vector3()},revealExtent={value:new THREE.Vector3(1,1,1)};
const stageMask={value:outlineTexture},stageSize={value:new THREE.Vector2(.84,.76)},stageDepth={value:11};
function attachStageCut(material,foreground,finalBoard=false){
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{stageProjection,stageView,stageMask,stageSize,stageDepth,revealProgress,revealMin,revealExtent,erosionTime,scrollDecay,finalBounds});
  shader.vertexShader='uniform float erosionTime;uniform mat4 stageProjection,stageView;uniform sampler2D stageMask;varying float vPeelAge;varying float vPeelEdge;varying vec3 vStagePoint;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('void main() {','void main() {\n vStagePoint=(modelMatrix*vec4(position,1.0)).xyz;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec4 peelQ=stageProjection*vec4(vStagePoint,1.);
   vec2 peelUv=peelQ.xy/max(.001,peelQ.w)*.5+.5;
   float edgeRing=(texture2D(stageMask,peelUv+vec2(.04,0.)).r+texture2D(stageMask,peelUv-vec2(.04,0.)).r+texture2D(stageMask,peelUv+vec2(0.,.055)).r+texture2D(stageMask,peelUv-vec2(0.,.055)).r)*.25;
   float seed=fract(sin(dot(floor(vStagePoint*2.),vec3(12.9898,78.233,37.719)))*43758.5453);
   vPeelAge=fract(erosionTime*.045+seed);
   vPeelEdge=smoothstep(.06,.7,1.-edgeRing)*smoothstep(.22,.48,length(peelUv-.5));
   vec2 outward=normalize(peelUv-.5+vec2(.0001));
   vec3 lift=transpose(mat3(stageView))*vec3(outward*.7,.25);
   float curl=sin(vPeelAge*3.14159)*.16;
   transformed+=transpose(mat3(modelMatrix))*(lift*vPeelAge*vPeelAge+normal*curl)*vPeelEdge;
  `);

  shader.fragmentShader=`varying float vPeelAge;varying float vPeelEdge;uniform vec4 finalBounds;uniform float scrollDecay;uniform float erosionTime;uniform float revealProgress;uniform vec3 revealMin,revealExtent;
float revealHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float revealNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(revealHash(i),revealHash(i+vec2(1,0)),f.x),mix(revealHash(i+vec2(0,1)),revealHash(i+vec2(1,1)),f.x),f.y);}
`+'varying vec3 vStagePoint;uniform mat4 stageProjection,stageView;uniform sampler2D stageMask;uniform vec2 stageSize;uniform float stageDepth;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('void main() {',`void main() {
   vec4 stageQ=stageProjection*vec4(vStagePoint,1.0);
   vec2 stageUv=stageQ.xy/max(stageQ.w,.00001)*.5+.5;
   stageUv=(stageUv-.5)*vec2(.84,.76)/stageSize+.5;
   float objectDepth=-(stageView*vec4(vStagePoint,1.0)).z;
   bool keepObject=${foreground?'true':'false'}&&objectDepth<stageDepth;
   if(!keepObject&&(stageQ.w<=0.||any(lessThan(stageUv,vec2(0.)))||any(greaterThan(stageUv,vec2(1.)))||texture2D(stageMask,stageUv).r<.5))discard;
   // Erosion reaches inward from the cut silhouette; the room centre stays intact.
   float maskRing=0.;
   maskRing+=texture2D(stageMask,stageUv+vec2(.055,0.)).r;
   maskRing+=texture2D(stageMask,stageUv-vec2(.055,0.)).r;
   maskRing+=texture2D(stageMask,stageUv+vec2(0.,.075)).r;
   maskRing+=texture2D(stageMask,stageUv-vec2(0.,.075)).r;
   float boundary=1.-maskRing*.25;
   float outer=smoothstep(.25,.65,length((stageUv-.5)*vec2(1.,.8)));
   float edgeWeight=max(boundary,outer);
   ${finalBoard?`if(abs(vStagePoint.x-3.34375)>.15)discard;
   vec2 boardUv=vec2((vStagePoint.y-finalBounds.x)/max(.01,finalBounds.y-finalBounds.x),(vStagePoint.z-finalBounds.z)/max(.01,finalBounds.w-finalBounds.z));
   edgeWeight=max(edgeWeight,smoothstep(.34,.5,max(abs(boardUv.x-.5),abs(boardUv.y-.5))));`:''}
   
   float decay=${finalBoard?'0.':(foreground?'scrollDecay*.48':'scrollDecay*.59')};
   float decayNoise=revealNoise(vStagePoint.xy*1.2+vStagePoint.z*.43)*.6+revealNoise(vStagePoint.yz*3.1-vStagePoint.x*.37)*.4;
   if(decay>0.&&decay>mix(.05,.98,clamp(decayNoise*.75+(1.-edgeWeight)*.25,0.,1.)))discard;
   vec3 drift=vec3(erosionTime*.045,erosionTime*.025,-erosionTime*.035);
   vec3 bigP=vStagePoint*.7+drift;
   vec3 smallP=vStagePoint*2.8+drift*1.4;
   vec3 fineP=vStagePoint*11.+drift*2.;
   float bigBlob=revealNoise(bigP.xy+bigP.z*.43)*.65+revealNoise(bigP.yz-bigP.x*.3)*.35;
   float smallBlob=revealNoise(smallP.xy+smallP.z*.37);
   float fineDust=revealNoise(fineP.yz+fineP.x*.41);
   // Overlapping scales distort the same front instead of isolated round holes.
   vec2 warp=vec2(revealNoise(smallP.xy+bigP.z),revealNoise(smallP.yz-bigP.x))-.5;
   float torn=revealNoise(bigP.xy+bigP.z*.43+warp*1.8)*.57+smallBlob*.28+fineDust*.15;
   float edgeCut=mix(.005,${finalBoard?'.34':'.44'},edgeWeight);
   float burnFront=edgeCut+vPeelEdge*smoothstep(.35,.95,vPeelAge)*.18;
   if(torn<burnFront||(fineDust<.12&&edgeWeight>.25)||(vPeelEdge>.4&&vPeelAge>.88))discard;
  `);
 };
 material.customProgramCacheKey=()=> 'world-attached-frame-'+foreground+'-'+finalBoard;
 material.needsUpdate=true;
}
function prepareStageCut(){
 const bounds=new THREE.Box3().setFromObject(scene);revealMin.value.copy(bounds.min);bounds.getSize(revealExtent.value);
 const materials=new Map();
 scene.traverse(o=>{
  if(!o.isMesh)return;
  const foreground=!!o.userData.breakout;
  const convert=material=>{const finalBoard=!!material.userData.finalBoard;const key=material.uuid+':'+foreground;if(!materials.has(key)){const copy=material.clone();attachStageCut(copy,foreground,finalBoard);materials.set(key,copy);}return materials.get(key);};
  o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);
 });
 pass.prepareNormals(scene);
 for(const pair of pass.normalPairs){const [o,original,normal]=pair;const copy=normal.clone();if(original.userData.finalBoard)copy.opacity=.25;attachStageCut(copy,!!o.userData.breakout,!!original.userData.finalBoard);pair[2]=copy;}
}
const outlineVertex=new THREE.Vector3(),outlineWorld=new THREE.Vector3();
let outlineTarget=null,outlineCurrent=null,outlineFrom=null,frameBucket=-1,frameTransition=1;
const cutCamera=camera.clone(),cutFrom=camera.clone(),cutTo=camera.clone();
function sampleCutCamera(at,out){
 const f=THREE.MathUtils.clamp(at*data.fps,0,data.samples.length-1),i=Math.floor(f),t=f-i;
 const a=data.samples[i],b=data.samples[Math.min(i+1,data.samples.length-1)];
 out.position.fromArray(a.p).lerp(new THREE.Vector3().fromArray(b.p),t);
 out.quaternion.fromArray(a.q).slerp(new THREE.Quaternion().fromArray(b.q),t);
 out.fov=THREE.MathUtils.lerp(a.fov,b.fov,t)*1.12;out.near=a.near;out.far=a.far;out.aspect=camera.aspect;
 out.updateProjectionMatrix();out.updateMatrixWorld();
}
// The cut-out frame follows the camera in small steps (every 2.5% of the path), each blended
// slowly from wherever the previous blend had reached, so its edges flow rather than jump.
const OUTLINE_STEPS=40,OUTLINE_BLEND=.7;
function selectFrame(){
 const bucket=Math.min(OUTLINE_STEPS,Math.floor(time/data.duration*OUTLINE_STEPS+.000001));
 if(bucket===frameBucket&&cutTo.aspect===camera.aspect)return;
 const first=frameBucket<0;frameBucket=bucket;
 sampleCutCamera(bucket/OUTLINE_STEPS*data.duration,cutTo);
 updateOutline(cutTo,bucket/OUTLINE_STEPS*data.duration);
 outlineFrom=outlineCurrent?.map(p=>p.slice())||outlineTarget.map(p=>p.slice());
 cutFrom.copy(first?cutTo:cutCamera);frameTransition=first?1:0;
 host.documentElement.dataset.frameSection=String(bucket*100/OUTLINE_STEPS);
}

const OUTLINE_COUNT=64;
function resampleContour(hull){
 const lengths=hull.map((p,i)=>Math.hypot(p[0]-hull[(i+1)%hull.length][0],p[1]-hull[(i+1)%hull.length][1]));
 const total=lengths.reduce((a,b)=>a+b,0),result=[];let edge=0,offset=0;
 for(let i=0;i<OUTLINE_COUNT;i++){const d=total*i/OUTLINE_COUNT;while(edge<lengths.length-1&&offset+lengths[edge]<d){offset+=lengths[edge++];}const a=hull[edge],b=hull[(edge+1)%hull.length],t=(d-offset)/Math.max(.0001,lengths[edge]);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}return result;
}
function alignContour(points){
 if(!outlineCurrent)return points;
 let best=0,bestError=Infinity;
 for(let shift=0;shift<OUTLINE_COUNT;shift++){let error=0;for(let i=0;i<OUTLINE_COUNT;i++){const a=outlineCurrent[i],b=points[(i+shift)%OUTLINE_COUNT];error+=(a[0]-b[0])**2+(a[1]-b[1])**2;}if(error<bestError){bestError=error;best=shift;}}
 return points.map((_,i)=>points[(i+best)%OUTLINE_COUNT]);
}
function architecturalContour(hull){
 const points=hull.map(p=>p.slice());
 for(let pass=0;pass<6&&points.length>6;pass++){
  let changed=false;
  for(let i=points.length-1;i>=0&&points.length>6;i--){
   const a=points[(i+points.length-1)%points.length],p=points[i],b=points[(i+1)%points.length];
   const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   const distance=length?Math.abs((b[0]-a[0])*(a[1]-p[1])-(a[0]-p[0])*(b[1]-a[1]))/length:0;
   if(distance<8){points.splice(i,1);changed=true;}
  }
  if(!changed)break;
 }
 return points;
}
function drawOutline(hull){
 const w=outlineCanvas.width,h=outlineCanvas.height;
 if(flakeAnchors){for(let i=0;i<flakeAnchors.count;i++){const point=hull[i%hull.length];flakeAnchors.setXY(i,point[0]/w,1.-point[1]/h);}flakeAnchors.needsUpdate=true;}
 outlineContext.fillStyle='#000';outlineContext.fillRect(0,0,w,h);
 outlineContext.fillStyle='#fff';outlineContext.strokeStyle='#fff';outlineContext.lineWidth=2;outlineContext.lineJoin='miter';outlineContext.miterLimit=2;
 const corners=architecturalContour(hull);
 outlineContext.beginPath();outlineContext.moveTo(...corners[0]);
 for(let i=1;i<corners.length;i++)outlineContext.lineTo(...corners[i]);
 outlineContext.closePath();outlineContext.fill();outlineContext.stroke();outlineTexture.needsUpdate=true;
}
function animateOutline(dt){
 if(!outlineTarget)return false;
 frameTransition=Math.min(1,frameTransition+dt/OUTLINE_BLEND);
 const t=frameTransition*frameTransition*(3-2*frameTransition);
 outlineCurrent=outlineTarget.map((p,i)=>[THREE.MathUtils.lerp(outlineFrom[i][0],p[0],t),THREE.MathUtils.lerp(outlineFrom[i][1],p[1],t)]);
 drawOutline(outlineCurrent);
 cutCamera.copy(cutTo);cutCamera.position.lerpVectors(cutFrom.position,cutTo.position,t);cutCamera.quaternion.slerpQuaternions(cutFrom.quaternion,cutTo.quaternion,t);
 cutCamera.fov=THREE.MathUtils.lerp(cutFrom.fov,cutTo.fov,t);cutCamera.updateProjectionMatrix();cutCamera.updateMatrixWorld();
 stageProjection.value.multiplyMatrices(cutCamera.projectionMatrix,cutCamera.matrixWorldInverse);stageView.value.copy(cutCamera.matrixWorldInverse);
 stageSize.value.set(settings.frameWidth,settings.frameHeight);stageDepth.value=settings.breakout+2;
 return frameTransition<1;
}
function prepareOutline(){
 scene.updateMatrixWorld(true);outlinePoints.length=0;
 scene.traverse(o=>{if(!o.isMesh||!o.userData.breakout)return;const positions=o.geometry.getAttribute('position');const step=Math.max(1,Math.ceil(positions.count/48));for(let i=0;i<positions.count;i+=step)outlinePoints.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld));});
}
function updateOutline(frameCamera=camera,frameTime=time){
 const view=frameCamera.matrixWorldInverse,points=[],cells=new Set();
 const w=outlineCanvas.width,h=outlineCanvas.height;
 // Opening cut traced from the supplied entrance annotation (1383 x 717).
 if(frameTime<data.duration*.08){
  const opening=[[146,90],[173,84],[250,65],[286,67],[305,89],[366,63],[364,39],[373,38],[386,61],[485,55],[692,58],[913,58],[931,79],[1018,75],[1135,55],[1253,46],[1235,130],[1235,295],[1246,451],[1255,510],[1253,633],[1178,609],[1064,593],[939,586],[942,662],[752,659],[607,642],[461,623],[342,619],[350,597],[215,643],[201,589],[187,579],[90,615],[72,602],[118,575],[204,551],[213,466],[210,375],[205,259],[199,144],[148,141]];
  outlineTarget=alignContour(resampleContour(opening.map(([x,y])=>[x/1383*w,y/717*h])));return;
 }
 for(const point of outlinePoints){
  outlineWorld.copy(point).applyMatrix4(view);
  if(outlineWorld.z>=-.05||-outlineWorld.z>settings.breakout+3)continue;
  outlineVertex.copy(point).project(frameCamera);
  if(Math.abs(outlineVertex.x)>1.04||Math.abs(outlineVertex.y)>1.04)continue;
  const x=(outlineVertex.x*.5+.5)*w,y=(.5-outlineVertex.y*.5)*h;
  const key=Math.round(x/4)+','+Math.round(y/4);if(cells.has(key))continue;cells.add(key);points.push([x,y]);
 }
 if(points.length<3)return;
 let hull=objectContour(points,12,60);if(hull.length>1&&hull[0][0]===hull.at(-1)[0]&&hull[0][1]===hull.at(-1)[1])hull=hull.slice(0,-1);
 if(hull.length<3)return;
 const area=hull.reduce((sum,p,i)=>{const q=hull[(i+1)%hull.length];return sum+p[0]*q[1]-q[0]*p[1];},0);if(area<0)hull.reverse();
 hull=hull.map(p=>[w*.5+(p[0]-w*.5)*.87,h*.5+(p[1]-h*.5)*.87]);
 outlineTarget=alignContour(resampleContour(hull));
}

function applyCamera(){
 const frame=THREE.MathUtils.clamp(time*data.fps,0,data.samples.length-1),index=Math.floor(frame),alpha=frame-index;
 const a=data.samples[index],b=data.samples[Math.min(index+1,data.samples.length-1)];
 camera.position.copy(aP.fromArray(a.p).lerp(bP.fromArray(b.p),alpha));
 camera.quaternion.copy(aQ.fromArray(a.q).slerp(bQ.fromArray(b.q),alpha));
 camera.fov=THREE.MathUtils.lerp(a.fov,b.fov,alpha)*1.12;camera.near=a.near;camera.far=a.far;
 // Derive framing from the scroll camera only, before pointer parallax.
 camera.updateProjectionMatrix();camera.updateMatrixWorld();selectFrame();
 tiltEuler.set(parallax.y*.018,-parallax.x*.025,0);camera.quaternion.multiply(tiltQ.setFromEuler(tiltEuler));
 camera.translateX(parallax.x*.13);camera.translateY(parallax.y*.08);
 camera.updateMatrixWorld();
 // Doors stop changing after their short opening clip. The sampled camera does not need a second mixer track.
 const doorTime=Math.min(time,Math.max(0,...actions.map(a=>a.getClip().duration)));
 if(doorTime!==lastDoorTime){for(const a of actions){a.enabled=true;a.paused=false;}mixer?.setTime(doorTime);lastDoorTime=doorTime;renderer.shadowMap.needsUpdate=true;}
 const frameNumber=Math.min(data.frameEnd,data.frameStart+Math.floor(time*data.fps+.00001));
 const label=(paused?'PAUSED / ':'SCROLL / ')+String(Math.round(time/data.duration*100)).padStart(2,'0')+'%';
 if(label!==lastCaption){$('caption').textContent=label;lastCaption=label;}
 $('scene').setAttribute('aria-label','Studio camera frame '+frameNumber+' of '+data.frameEnd+'. Scroll to explore.');
 $('wide').setAttribute('aria-pressed',String(time<data.duration*.5));$('table-view').setAttribute('aria-pressed',String(time>=data.duration*.5));
}
function seek(fraction){if(!ready)return;storyTarget=storyTime=THREE.MathUtils.clamp(fraction,0,1)*storyDuration;target=time=THREE.MathUtils.clamp((storyTime-introDuration)/roomDuration,0,1)*data.duration;scrollToProgress(fraction);applyCamera();invalidate();}
$('wide').onclick=()=>seek(0);$('table-view').onclick=()=>seek(.7);
$('print').onclick=()=>{settings.mode='print';configure();};$('material').onclick=()=>{settings.mode='material';configure();};
$('motion').onclick=()=>{paused=!paused;$('motion').textContent=paused?'Resume':'Pause';$('motion').setAttribute('aria-pressed',String(paused));$('motion').setAttribute('aria-label',paused?'Resume scroll animation':'Pause scroll animation');if(paused)target=time;else readScroll();applyCamera();invalidate();};
$('settings').onclick=()=>{const open=$('controls').hidden;$('controls').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));$('settings').querySelector('span').textContent=open?'−':'＋';};
function buildReferenceControls(){
 const panel=$('controls');panel.innerHTML='';
 const palette=[['Paper','paper'],['Ink A','inkA'],['Ink B','inkB'],['Highlight / ink C','highlight']];
 for(const [label,key]of palette){const row=document.createElement('label');row.textContent=label;const input=document.createElement('input');input.type='color';input.dataset.setting=key;input.setAttribute('aria-label',label);input.value=settings[key];input.oninput=()=>{settings[key]=input.value;configure();};row.append(input);panel.append(row);}
 const ranges=[['Dot size','dotSize',1,8,.1],['Tint','tint',0,1,.01],['Riso','riso',0,1,.01],['Sketch','sketch',0,1,.01],['Wobble','wobble',0,1,.01],['Contrast','contrast',.25,2,.01],['Background value','background',0,2,.01],['Threshold','threshold',.05,.95,.01],['Threshold amount','thresholdAmount',0,1,.01],['Light','exposure',-2,2,.01],['Fisheye','lens',0,1.2,.01],['Width','width',.9,1.3,.01],['Frame width','frameWidth',.55,.96,.01],['Frame height','frameHeight',.5,.94,.01],['Breakout depth','breakout',2,16,.1]];
 for(const [label,key,min,max,step]of ranges){const row=document.createElement('label');const title=document.createElement('span');title.textContent=label;const out=document.createElement('output');out.value=settings[key].toFixed(2);title.append(out);const input=document.createElement('input');Object.assign(input,{type:'range',min,max,step,value:settings[key]});input.dataset.setting=key;input.setAttribute('aria-label',label);input.oninput=()=>{settings[key]=Number(input.value);configure();};row.append(title,input);panel.append(row);}
 const quality=document.createElement('label');quality.textContent='Quality';const select=document.createElement('select');select.id='quality';select.setAttribute('aria-label','Quality');for(const [value,label]of [['balanced','Balanced'],['high','Fine'],['low','Light']])select.add(new Option(label,value));select.onchange=()=>{settings.quality=select.value;adaptiveScale=1;drawCount=drawTotal=0;resize();};quality.append(select);panel.append(quality);
 const reset=document.createElement('button');reset.id='reset';reset.textContent='Reset study';panel.append(reset);const metrics=document.createElement('output');metrics.id='metrics';panel.append(metrics);
}
buildReferenceControls();
$('reset').onclick=()=>{Object.assign(settings,defaults);adaptiveScale=1;configure();resize();seek(0);};
$('retry').onclick=()=>location.reload();
document.addEventListener('visibilitychange',()=>{lastTick=0;if(!document.hidden)invalidate();});
document.addEventListener('keydown',event=>{if(['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName))return;if(event.code==='Home'){event.preventDefault();seek(0);}if(event.code==='End'){event.preventDefault();seek(1);}});
// Bake only static transforms, then merge compatible geometry by material. Animated hinges retain their hierarchy.
function batchStatic(root,clips){
 const animated=new Set();for(const clip of clips)for(const track of clip.tracks){const parsed=THREE.PropertyBinding.parseTrackName(track.name);const object=THREE.PropertyBinding.findNode(root,parsed.nodeName);if(object)object.traverse(o=>animated.add(o));}
 root.traverse(o=>{if(/door.*hinge/i.test(o.name))o.traverse(child=>animated.add(child));});
 host.documentElement.dataset.animatedMeshCount=String([...animated].filter(o=>o.isMesh).length);
 root.updateMatrixWorld(true);const buckets=new Map(),originals=[];
 root.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||o.morphTargetInfluences||animated.has(o)||Array.isArray(o.material))return;
 sourceCalls++;const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);
 const signature=Object.entries(g.attributes).map(([k,a])=>k+':'+a.itemSize+':'+a.normalized).sort().join(',')+':'+!!g.index;
 g.computeBoundingBox();const center=g.boundingBox.getCenter(new THREE.Vector3());
 const furniture=/chair|table|desk|bench|stool|extinguisher|mannequin|pile|project|stationery|beam|runner|rib|fan|cabinet|locker|pin.board/i.test(o.name);
 const cell=[center.x,center.y,center.z].map(v=>Math.floor(v/4)).join(',');
 const key=o.material.uuid+'|'+signature+'|'+cell+'|'+furniture;
 if(!buckets.has(key))buckets.set(key,{material:o.material,geometries:[],furniture});buckets.get(key).geometries.push(g);originals.push(o);
 });
 const group=new THREE.Group();group.name='WebGL static material batches';
 for(const {material,geometries,furniture}of buckets.values()){
 const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);
 if(!geometry)throw new Error('Static geometry could not be batched.');
 geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.name='Static / '+material.name;mesh.userData.breakout=furniture;mesh.frustumCulled=true;mesh.castShadow=!material.transparent;mesh.receiveShadow=true;group.add(mesh);
 if(geometries.length>1)geometries.forEach(g=>g.dispose());
 }
 for(const o of originals)o.removeFromParent();scene.add(group);batchCount=group.children.length;
}
function tick(now){
 raf=0;if(!ready||document.hidden||!onScreen())return;
 const dt=lastTick?Math.min((now-lastTick)/1000,.1):1/60;lastTick=now;
 const revealing=!reduced&&now-revealStart<5200;
 revealProgress.value=reduced?1:THREE.MathUtils.clamp((now-revealStart-450)/4600,0,1);
 pass.uniforms.uReveal.value=revealProgress.value;
 scrollDecay.value=THREE.MathUtils.smoothstep(time/data.duration,.08,.98);
 erosionTime.value=reduced?0:(storyTime>=introDuration+roomDuration?erosionTime.value:now/1000);
 pass.uniforms.uMemoryTime.value=erosionTime.value;
 pass.uniforms.uScrollDecay.value=scrollDecay.value;
 dirty=true;
 if(revealing)dirty=true;
 if(cameraMode==='auto'&&!paused)storyTarget=Math.min(storyDuration,storyTarget+dt);
 const distance=storyTarget-storyTime;
 const moving=!paused&&Math.abs(distance)>.00001;
 if(moving)storyTime=reduced||Math.abs(distance)<.001?storyTarget:THREE.MathUtils.lerp(storyTime,storyTarget,1-Math.exp(-dt*18));
 target=time=THREE.MathUtils.clamp((storyTime-introDuration)/roomDuration,0,1)*data.duration;
 host.scroll?.doorSound?.(storyTime >= introDuration && storyTime < introDuration+roomDuration ? time : -1);
 if(cameraMode==='auto'&&!paused)scrollToProgress(storyTime/storyDuration);
 const pointerMoving=parallax.distanceToSquared(pointer)>.000001;
 if(pointerMoving)parallax.lerp(pointer,1-Math.exp(-dt*14));
 if(moving||pointerMoving){applyCamera();dirty=true;}
 pass.uniforms.uIntroSequence.value=storyTime<introDuration?storyTime:-1;updateQuestion(storyTime);
 host.scroll?.openingSound?.(storyTime<introDuration?storyTime:-1);
 revealProgress.value=THREE.MathUtils.clamp((storyTime-4.8)/6.2,0,1);pass.uniforms.uReveal.value=revealProgress.value;
 const endSequence=storyTime>=introDuration+roomDuration?storyTime-introDuration-roomDuration:-1;
 pass.uniforms.uEndSequence.value=endSequence;
 host.scroll?.titleSound?.(endSequence);
 host.scroll?.backgroundSound?.(storyTime, endSequence);
 host.documentElement.dataset.storyProgress=(storyTime/storyDuration).toFixed(4);
 host.documentElement.dataset.endSequence=endSequence<0?'inactive':endSequence<9?'shape-morph':endSequence<10.5?'title':endSequence<14.5?'title-disintegration':'finished';
 if(endSequence>=titleDuration){letter.start(now);letter.update(endSequence-titleDuration);}else letter.stop();
 host.scroll?.letterSound?.(letter.active ? letter.revealedCharacters : 0, letter.active && endSequence-titleDuration < letter.revealDuration);
 const outlineMoving=animateOutline(dt);
 if(outlineMoving)dirty=true;
 if(dirty&&!letter.active){
 const before=performance.now();
 pass.render(scene,camera,reduced?0:time);
 renderer.autoClear=false;renderer.clearDepth();renderer.render(driftingFragments,camera);renderer.autoClear=true;
 const ms=performance.now()-before;drawCount++;if(drawCount>3)drawTotal+=ms;
 host.documentElement.dataset.renderedFrames=String(drawCount);
 host.documentElement.dataset.lastFrameCpuMs=ms.toFixed(2);
 if(drawCount%20===0){$('metrics').textContent=batchCount+' batches / '+(drawTotal/Math.max(1,drawCount-3)).toFixed(1)+' ms CPU';
 if(settings.quality==='balanced'&&drawTotal/Math.max(1,drawCount-3)>22&&adaptiveScale>.75){adaptiveScale=.75;resize();}}
 dirty=false;
 }
 if(letter.active||moving||pointerMoving||outlineMoving||(endSequenceStart&&now-endSequenceStart<10500)||!reduced||(cameraMode==='auto'&&!paused&&storyTarget<storyDuration))wake();else lastTick=0;
}
function cleanStudyTexture(){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#e8e6df';ctx.fillRect(0,0,512,512);
 // Quiet monochrome process drawings, without photographic collage blocks.
 ctx.strokeStyle='#999a96';ctx.lineWidth=1.5;
 for(let row=0;row<3;row++)for(let col=0;col<2;col++){
  const x=40+col*238,y=48+row*150;
  ctx.strokeRect(x,y,154,78);ctx.strokeRect(x+15,y+12,116,49);
  ctx.beginPath();ctx.moveTo(x,y+78);ctx.lineTo(x+25,y+95);ctx.lineTo(x+177,y+95);ctx.lineTo(x+154,y+78);
  ctx.moveTo(x+25,y+95);ctx.lineTo(x+25,y+104);ctx.lineTo(x+177,y+104);ctx.lineTo(x+177,y+95);ctx.stroke();
  ctx.fillStyle='#b7b7b1';for(let j=0;j<3;j++)ctx.fillRect(x,y+116+j*6,100-j*17,1);
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
async function load(){
 try{
 data=await(await fetch(assetUrl('./walkthrough-baked-camera.json'))).json();resize();configure();
 const dracoLoader=new DRACOLoader().setDecoderPath(assetUrl('../shared/vendor/draco/')).setDecoderConfig({type:'wasm'}).setWorkerLimit(2);
 const gltf=await new GLTFLoader().setDRACOLoader(dracoLoader).loadAsync(assetUrl('./walkthrough-baked.glb'),p=>{$('loadProgress').textContent=p.total?Math.round(p.loaded/p.total*100)+'%':(p.loaded/1e6).toFixed(1)+' MB';});
 dracoLoader.dispose();
 const root=gltf.scene;
 const studyTexture=cleanStudyTexture();const bakedMaterials=new Map();root.traverse(o=>{if(!o.isMesh)return;const convert=m=>{if(bakedMaterials.has(m))return bakedMaterials.get(m);const glass=(m.transmission||0)>0;const basic=new THREE.MeshBasicMaterial({name:m.name+' / baked',color:m.color,map:m.map,vertexColors:true,side:m.side,transparent:m.transparent||glass,opacity:glass?.16:m.opacity,alphaTest:m.alphaTest,depthWrite:glass?false:m.depthWrite});if(/Scanned design process sheets/i.test(m.name)){basic.map=studyTexture;basic.color.set('#deddd6');}
 if(/Observed pinboard surface|Beige pinup wall/i.test(m.name)){basic.map=null;basic.vertexColors=false;basic.color.set('#a9a18c');}
 bakedMaterials.set(m,basic);return basic;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});
 const entrance=root.getObjectByName('Left door hinge');
 if(entrance){root.updateMatrixWorld(true);const origin=new THREE.Box3().setFromObject(entrance).getCenter(new THREE.Vector3());pass.uniforms.uRevealOrigin.value.copy(origin);}
 root.traverse(o=>{if(/Long.softboard.wall/i.test(o.name)){root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(o);finalBounds.value.set(box.min.y,box.max.y,box.min.z,box.max.z);}if(!o.isMesh)return;if(/Long.softboard.wall|Pinup.project.cluster|Old.pinup.residue|Wall.A4.pinned.sheet|Wall.paper.pin/i.test(o.name)){const keep=m=>{const copy=m.clone();copy.userData.finalBoard=!/ceiling/i.test(m.name);return copy;};o.material=Array.isArray(o.material)?o.material.map(keep):keep(o.material);}});
 scene.add(root);batchStatic(root,gltf.animations);
 prepareStageCut();prepareOutline();renderer.shadowMap.needsUpdate=true;
 mixer=new THREE.AnimationMixer(root);
 for(const clip of gltf.animations){if(clip.name==='Video inspection')continue;const a=mixer.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();actions.push(a);}
 revealStart=performance.now();ready=true;storyTime=storyTarget=progress()*storyDuration;target=time=THREE.MathUtils.clamp((storyTime-introDuration)/roomDuration,0,1)*data.duration;applyCamera();$('loading').hidden=true;host.documentElement.dataset.ready='true';
 host.documentElement.dataset.cameraEnd=String(data.frameEnd);
 host.documentElement.dataset.batches=String(batchCount);host.documentElement.dataset.sourceDrawCalls=String(sourceCalls);

 $('metrics').textContent=sourceCalls+' meshes → '+batchCount+' material batches';invalidate();
 }catch(error){console.error(error);$('loading').hidden=true;$('error').hidden=false;}
}
scrollToProgress(0);
await load();

function updateCameraModeUI(){
 $('camera-scroll').setAttribute('aria-pressed',String(cameraMode==='scroll'));
 $('camera-auto').setAttribute('aria-pressed',String(cameraMode==='auto'));
 $('camera-pause').hidden=cameraMode!=='auto';
 $('camera-pause').textContent=paused?'Play':'Pause';
 host.documentElement.dataset.cameraMode=cameraMode;
}
$('camera-scroll').onclick=()=>{if(!ready)return;cameraMode='scroll';paused=false;seek(storyTime/storyDuration);updateCameraModeUI();};
$('camera-auto').onclick=()=>{if(!ready)return;cameraMode='auto';paused=false;if(storyTime>=storyDuration-.02)seek(0);storyTarget=storyTime;updateCameraModeUI();invalidate();};
$('camera-pause').onclick=()=>{paused=!paused;storyTarget=storyTime;updateCameraModeUI();invalidate();};
updateCameraModeUI();
}
