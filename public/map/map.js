import {adoptMapPreset} from '../shared/map-preset.js';
try{adoptMapPreset(localStorage);}catch{}
import {installStudio} from '../shared/studio.js';
import {CARDS,sceneBounds,overviewPose,screenRect,presence,localCardOffset} from './registry.js';
const $=s=>document.querySelector(s),world=$('#world'),viewport=$('#map-viewport');
const base=await(await fetch('../shared/defaults.json')).json();
let print={...base.print},grades=structuredClone(base.grades);
try{Object.assign(print,JSON.parse(localStorage.getItem('green-hour-cutout-print-v1')||'{}'));const saved=JSON.parse(localStorage.getItem('green-hour-cutout-grades-v1')||'null');if(saved)for(const r of Object.keys(grades))Object.assign(grades[r],saved[r]);}catch{}
let studio,quality={fps:40,pixelRatio:1,detailFps:24},active=0,overview=false,paused=false,navigating=null,selected='print';
let pan={x:0,y:0,z:1},target={...pan},dragging=false,lastDrag=null,lastTime=0,raf=0,loadTimer=0,lastLoad=0;
const nodes=CARDS.map(card=>{const el=document.createElement('section');el.className='scene-node';el.dataset.id=card.id;const placeholder=document.createElement('div');placeholder.className='scene-placeholder';placeholder.textContent=card.label;el.append(placeholder);world.append(el);const button=document.createElement('button');button.id='go-'+card.id;button.textContent=card.label;button.setAttribute('aria-label','Go to '+card.label);button.onclick=()=>focusScene(nodes.findIndex(n=>n.id===card.id));$('.map-nodes').append(button);return {...card,el,frame:null,ready:false,chapter:0,x:0,y:0,size:1,rotation:0};});
const send=(node,data)=>{if(node.frame)node.frame.contentWindow?.postMessage({channel:'green-hour-map',...data},location.origin);};
const broadcast=data=>nodes.forEach(n=>send(n,data));
function wake(){if(!raf&&!document.hidden)raf=requestAnimationFrame(animate);}
function sizeFrame(n){if(!n.frame)return;const h=Math.min(innerHeight,innerWidth/1.42);n.frame.style.height=h+'px';n.frame.style.top=(innerHeight-h)/2+'px';}
function mount(n){if(n.frame)return;const frame=document.createElement('iframe');frame.id=n.id+'-frame';frame.title=n.label;frame.src='../'+n.id+'/?map=1';n.frame=frame;n.el.append(frame);sizeFrame(n);lastLoad=performance.now();frame.onload=()=>{n.viewportKey=null;wake();};}
function syncPrint(){
  for(const [id,key]of Object.entries({'paper-color':'paper','ink-a-color':'inkA','ink-b-color':'inkB','highlight-color':'highlight','dot-size':'dotSize',tint:'tint',riso:'riso',sketch:'sketch',wobble:'wobble',contrast:'contrast','background-value':'background','highlight-threshold':'threshold'}))if($('#'+id))$('#'+id).value=print[key];
  document.documentElement.style.setProperty('--paper',print.paper);document.documentElement.style.setProperty('--ink',print.inkA);document.documentElement.style.setProperty('--pink',print.inkB);
  document.querySelectorAll('input[type=range]').forEach(input=>input.style.setProperty('--fill',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`));
  broadcast({type:'palette',print,grades});document.body.dataset.printSettings=JSON.stringify(print);document.body.dataset.colorGrades=JSON.stringify(grades);
}
for(const [id,key]of Object.entries({'paper-color':'paper','ink-a-color':'inkA','ink-b-color':'inkB','highlight-color':'highlight','dot-size':'dotSize',tint:'tint',riso:'riso',sketch:'sketch',wobble:'wobble',contrast:'contrast','background-value':'background','highlight-threshold':'threshold'}))$('#'+id)?.addEventListener('input',e=>{print[key]=e.target.type==='color'?e.target.value:Number(e.target.value);syncPrint();try{localStorage.setItem('green-hour-cutout-print-v1',JSON.stringify(print));}catch{}});
function syncGrades(){for(const key of Object.keys(grades.ball))if($('#grade-'+key))$('#grade-'+key).value=grades[selected==='print'?'ball':selected][key];}
for(const name of ['print','ball','room','foliage'])$('#target-'+name).onclick=()=>{selected=name;$('#print-controls').hidden=name!=='print';$('#grade-controls').hidden=name==='print';for(const n of ['print','ball','room','foliage']){$('#target-'+n).classList.toggle('active',n===name);$('#target-'+n).setAttribute('aria-pressed',n===name);}syncGrades();syncPrint();};
for(const name of Object.keys(grades.ball))$('#grade-'+name).addEventListener('input',e=>{grades[selected==='print'?'ball':selected][name]=Number(e.target.value);syncPrint();try{localStorage.setItem('green-hour-cutout-grades-v1',JSON.stringify(grades));}catch{}});
$('#reset-style').onclick=()=>{print={...base.print};grades=structuredClone(base.grades);syncGrades();syncPrint();try{localStorage.removeItem('green-hour-cutout-print-v1');localStorage.removeItem('green-hour-cutout-grades-v1');}catch{}};
function panel(open){studio?.open(open);}
$('#settings-toggle').onclick=()=>panel(document.querySelector('#map-settings')?.hidden!==false);$('#close-panel').onclick=()=>panel(false);
function bound(){const b=sceneBounds(nodes,innerWidth,innerHeight);target.z=Math.max(.12,Math.min(1.6,target.z));target.x=Math.max(innerWidth*.15-b.right*innerWidth*target.z,Math.min(innerWidth*.85-b.left*innerWidth*target.z,target.x));target.y=Math.max(innerHeight*.15-b.bottom*innerHeight*target.z,Math.min(innerHeight*.85-b.top*innerHeight*target.z,target.y));}
function focusScene(index){active=Math.max(0,Math.min(nodes.length-1,index));overview=false;navigating=active;target={z:1,x:-nodes[active].x*innerWidth,y:-nodes[active].y*innerHeight};mount(nodes[active]);updateUI();wake();}
function showOverview(){overview=true;navigating=null;target=overviewPose(nodes,innerWidth,innerHeight);updateUI();wake();}
function updateUI(){nodes.forEach((n,i)=>$('#go-'+n.id).setAttribute('aria-pressed',String(i===active)));$('#map-overview').setAttribute('aria-pressed',String(overview));$('#scene-wide').setAttribute('aria-pressed',String(nodes[active].chapter===0));$('#scene-zoom').setAttribute('aria-pressed',String(nodes[active].chapter>0));$('#scene-zoom').disabled=!nodes[active].zoom;$('#active-card-name').textContent=nodes[active].label;}
$('#previous-scene').onclick=()=>focusScene((active+nodes.length-1)%nodes.length);$('#next-scene').onclick=()=>focusScene((active+1)%nodes.length);$('#map-overview').onclick=()=>overview?focusScene(active):showOverview();
$('#scene-wide').onclick=()=>send(nodes[active],{type:'command',command:'wide'});
$('#scene-zoom').onclick=()=>{if(!nodes[active].zoom)return;if(overview)focusScene(active);send(nodes[active],{type:'command',command:'zoom'});};
$('#motion-toggle').onclick=()=>{paused=!paused;$('#motion-toggle').setAttribute('aria-pressed',String(paused));$('#motion-toggle').setAttribute('aria-label',paused?'Resume motion':'Pause motion');broadcast({type:'command',command:'motion',paused});wake();};
function dragDelta(dx,dy){navigating=null;target.x+=dx;target.y+=dy;overview=false;bound();wake();}
function wheel(dx,dy,ctrl,shift){if(ctrl){const old=target.z;target.z=Math.max(.12,Math.min(1.6,target.z*Math.exp(-dy*.002)));const ratio=target.z/old;target.x=innerWidth/2+(target.x-innerWidth/2)*ratio;target.y=innerHeight/2+(target.y-innerHeight/2)*ratio;overview=target.z<.7;bound();updateUI();wake();}else dragDelta(-(shift?dy:dx),shift?0:-dy);}
function key(code,shift=false){if(code==='Space')return $('#motion-toggle').click();if(code==='Enter')return $('#scene-zoom').click();if(code==='Home')return focusScene(active);if(code==='Escape'){panel(false);send(nodes[active],{type:'command',command:'wide'});return;}if(code==='KeyM')return showOverview();if(/^Digit[1-6]$/.test(code))return focusScene(Number(code.slice(-1))-1);const d=shift?120:48;const moves={ArrowLeft:[d,0],ArrowRight:[-d,0],ArrowUp:[0,d],ArrowDown:[0,-d]};if(moves[code])dragDelta(...moves[code]);}
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.channel!=='green-hour-map')return;const n=nodes.find(n=>n.frame&&n.frame.contentWindow===e.source);if(!n)return;const m=e.data;if(m.type==='ready'){n.ready=true;n.el.dataset.ready='true';send(n,{type:'palette',print,grades});if(studio)send(n,{type:'layout',layout:studio.getLayout(),quality});send(n,{type:'command',command:'motion',paused});n.viewportKey=null;n.qualityKey=null;wake();}if(m.type==='drag')dragDelta(m.dx,m.dy);if(m.type==='wheel')wheel(m.dx,m.dy,m.ctrl,m.shift);if(m.type==='key')key(m.code,m.shift);if(m.type==='state'){n.chapter=m.chapter;updateUI();}if(m.type==='begin'){dragging=true;world.classList.add('dragging');}if(m.type==='end'){dragging=false;world.classList.remove('dragging');wake();}if(m.type==='focus')focusScene(nodes.indexOf(n));});
viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;lastDrag=[e.screenX,e.screenY];dragging=true;viewport.setPointerCapture(e.pointerId);});
viewport.addEventListener('pointermove',e=>{if(lastDrag){if(!(e.buttons&1)){lastDrag=null;dragging=false;return;}dragDelta(e.screenX-lastDrag[0],e.screenY-lastDrag[1]);lastDrag=[e.screenX,e.screenY];}});
const endDrag=()=>{lastDrag=null;dragging=false;world.classList.remove('dragging');wake();};for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,endDrag);window.addEventListener('blur',endDrag);
viewport.addEventListener('wheel',e=>{e.preventDefault();wheel(e.deltaX,e.deltaY,e.ctrlKey,e.shiftKey);},{passive:false});
window.addEventListener('keydown',e=>{if(e.target.closest('input,select,button,[contenteditable]'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','Escape','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','KeyM','Space','Enter'].includes(e.code)){e.preventDefault();key(e.code,e.shiftKey);}});
window.addEventListener('resize',()=>{nodes.forEach(n=>{n.transformKey=null;sizeFrame(n);});if(overview)showOverview();else focusScene(active);});
document.addEventListener('visibilitychange',()=>{lastTime=0;nodes.forEach(n=>{n.viewportKey=null;if(document.hidden)send(n,{type:'viewport',visible:false,presence:0});});wake();});
function animate(now){
 raf=0;if(document.hidden)return;const dt=lastTime?Math.min(.05,(now-lastTime)/1000):.016;lastTime=now;const ease=1-Math.exp(-dt*(dragging?18:8));let moving=false;
 for(const k of ['x','y','z']){const distance=target[k]-pan[k];if(Math.abs(distance)>(k==='z'?.0001:.1)){pan[k]+=distance*ease;moving=true;}else pan[k]=target[k];}
 world.style.transform=`translate3d(${pan.x}px,${pan.y}px,0) scale(${pan.z})`;
 const modal=$('#map-settings'),covered=modal&&!modal.hidden&&!modal.classList.contains('live-preview');let nearest=active,distance=Infinity;const waiting=[];
 for(const [i,n]of nodes.entries()){
  const transform=`translate3d(${n.x*innerWidth}px,${n.y*innerHeight}px,0) rotate(${n.rotation||0}deg) scale(${n.size||1})`;if(n.transformKey!==transform){n.el.style.transform=transform;n.transformKey=transform;}
  const r=screenRect(n,pan,innerWidth,innerHeight),visibility=presence(r,innerWidth,innerHeight),visible=!covered&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;
  const d=Math.hypot(r.cx-innerWidth/2,r.cy-innerHeight/2);if(d<distance){distance=d;nearest=i;}
  if(!n.frame&&!covered&&r.right>-innerWidth*.3&&r.left<innerWidth*1.3&&r.bottom>-innerHeight*.3&&r.top<innerHeight*1.3)waiting.push({n,d});
  const overviewScale=overview?.65:1,renderQuality={...quality,fps:overview?Math.min(24,quality.fps):quality.fps,pixelRatio:Math.max(.45,quality.pixelRatio*overviewScale),detailFps:overview?12:quality.detailFps};
  if(n.frame){const qualityKey=JSON.stringify(renderQuality);if(n.qualityKey!==qualityKey&&studio){send(n,{type:'layout',layout:studio.getLayout(),quality:renderQuality});n.qualityKey=qualityKey;}
   const local=localCardOffset(n,pan,innerWidth,innerHeight);
   const state={type:'viewport',localPanX:Number(local.x.toFixed(2)),localPanY:Number(local.y.toFixed(2)),offsetX:Math.round((r.cx-innerWidth*pan.z/2)/pan.z),offsetY:Math.round((r.cy-innerHeight*pan.z/2)/pan.z),presence:Number(visibility.toFixed(2)),visible,dragging,overview,scale:Number(pan.z.toFixed(2))};const key=JSON.stringify(state);if(n.viewportKey!==key){send(n,state);n.viewportKey=key;}
  }
 }
 if(waiting.length){waiting.sort((a,b)=>a.d-b.d);if(now-lastLoad>180)mount(waiting[0].n);clearTimeout(loadTimer);loadTimer=setTimeout(wake,190);}
 if(navigating!==null&&!moving)navigating=null;if(!overview&&navigating===null&&nearest!==active){active=nearest;updateUI();}
 $('#map-load-status').textContent=`${nodes.filter(n=>n.frame).length} / ${nodes.length} cards loaded`;
 document.body.dataset.mapState=JSON.stringify({active:nodes[active].id,overview,pan:{x:Math.round(pan.x),y:Math.round(pan.y),scale:Number(pan.z.toFixed(3))},ready:nodes.map(n=>({id:n.id,loaded:!!n.frame,ready:n.ready,chapter:n.chapter}))});
 if(moving)wake();
}
studio=installStudio({nodes,broadcast,onSharedPrint(){syncGrades();syncPrint();},onSceneFocus(id){focusScene(nodes.findIndex(n=>n.id===id));},onFrameFocus(id,card){if(id==='disco'&&['wide','macro','backing'].includes(card))send(nodes[0],{type:'command',command:card==='macro'?'detail':'wide'});},onLayout(layout){document.body.dataset.frameLayout=JSON.stringify(layout);for(const n of nodes){const cfg=layout[n.id].stack;n.x=cfg.x/100;n.y=cfg.y/100;n.size=cfg.scale;n.rotation=cfg.rotation;n.viewportKey=null;n.qualityKey=null;}if(overview)showOverview();else if(navigating!==null)focusScene(active);wake();},onQuality(q){q.fps=Math.max(24,Math.min(60,q.fps));q.pixelRatio=Math.max(.75,Math.min(1.7,q.pixelRatio));q.detailFps=Math.max(12,Math.min(40,q.detailFps));quality=q;nodes.forEach(n=>n.qualityKey=null);wake();},onPrintReset(saved){if(saved.print)for(const [key,value]of Object.entries(saved.print))if(key in print&&((typeof value==='number'&&Number.isFinite(value))||(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))))print[key]=value;if(saved.grades)for(const region of Object.keys(grades))for(const key of Object.keys(grades[region]))if(Number.isFinite(saved.grades[region]?.[key]))grades[region][key]=saved.grades[region][key];syncGrades();syncPrint();}});

new MutationObserver(wake).observe($('#map-settings'),{attributes:true,attributeFilter:['hidden','class']});
document.querySelectorAll('.dock button,.map-nodes button').forEach(b=>b.title=b.getAttribute('aria-label'));syncGrades();syncPrint();updateUI();focusScene(0);
