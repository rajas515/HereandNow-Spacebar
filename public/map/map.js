import {installStudio} from '../shared/studio.js';
let studio;let quality={fps:40,pixelRatio:1.0,detailFps:24};

const $=s=>document.querySelector(s);
const base=await(await fetch('../shared/defaults.json')).json();
let print={...base.print},grades=structuredClone(base.grades);
try{Object.assign(print,JSON.parse(localStorage.getItem('green-hour-cutout-print-v1')||'{}'));const saved=JSON.parse(localStorage.getItem('green-hour-cutout-grades-v1')||'null');if(saved)for(const r of Object.keys(grades))Object.assign(grades[r],saved[r]);}catch{}
const nodes=[{id:'disco',x:0,y:0,frame:$('#disco-frame'),ready:false,chapter:0},{id:'architecture',x:1.04,y:-.08,frame:$('#architecture-frame'),ready:false,chapter:0}];
const world=$('#world');let active=0,overview=false,paused=false,navigating=null;
let pan={x:0,y:0,z:1},target={...pan},dragging=false,lastDrag=null,selected='print',lastTime=performance.now();
const send=(node,data)=>node.frame.contentWindow?.postMessage({channel:'green-hour-map',...data},location.origin);
const broadcast=data=>nodes.forEach(n=>send(n,data));
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
function bound(){target.x=Math.max(-innerWidth*2.3,Math.min(innerWidth*.8,target.x));target.y=Math.max(-innerHeight,Math.min(innerHeight,target.y));}
function focusScene(index){active=Math.max(0,Math.min(nodes.length-1,index));overview=false;navigating=active;target.z=1;target.x=-nodes[active].x*innerWidth;target.y=-nodes[active].y*innerHeight;updateUI();}
function showOverview(){overview=true;navigating=null;target.z=innerWidth/innerHeight<.8?.42:.47;target.x=innerWidth*.5-(nodes[1].x*.5+.5)*innerWidth*target.z;target.y=innerHeight*.5-(nodes[1].y*.5+.5)*innerHeight*target.z;updateUI();}
function updateUI(){nodes.forEach((n,i)=>$('#go-'+n.id).setAttribute('aria-pressed',i===active));$('#map-overview').setAttribute('aria-pressed',overview);$('#scene-wide').setAttribute('aria-pressed',nodes[active].chapter===0);$('#scene-zoom').setAttribute('aria-pressed',nodes[active].chapter>0);}
$('#go-disco').onclick=()=>focusScene(0);$('#go-architecture').onclick=()=>focusScene(1);$('#previous-scene').onclick=()=>focusScene(active===0?1:0);$('#next-scene').onclick=()=>focusScene(active===0?1:0);$('#map-overview').onclick=()=>overview?focusScene(active):showOverview();
$('#scene-wide').onclick=()=>send(nodes[active],{type:'command',command:'wide'});
$('#scene-zoom').onclick=()=>{if(overview)focusScene(active);send(nodes[active],{type:'command',command:'zoom'});};
$('#motion-toggle').onclick=()=>{paused=!paused;$('#motion-toggle').setAttribute('aria-pressed',paused);$('#motion-toggle').setAttribute('aria-label',paused?'Resume motion':'Pause motion');$('#motion-toggle').innerHTML=paused?'<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>';broadcast({type:'command',command:'motion',paused});};
function dragDelta(dx,dy){navigating=null;target.x+=dx;target.y+=dy;overview=false;bound();}
function wheel(dx,dy,ctrl,shift){if(ctrl){const old=target.z;target.z=Math.max(.38,Math.min(1.25,target.z*Math.exp(-dy*.002)));const ratio=target.z/old;target.x=innerWidth/2+(target.x-innerWidth/2)*ratio;target.y=innerHeight/2+(target.y-innerHeight/2)*ratio;overview=target.z<.7;}else dragDelta(-(shift?dy:dx),shift?0:-dy);}
function key(code,shift=false){if(code==='Space'){$('#motion-toggle').click();return;}if(code==='Enter'){$('#scene-zoom').click();return;}if(code==='Home'){focusScene(active);return;}if(code==='Escape'){panel(false);send(nodes[active],{type:'command',command:'wide'});return;}if(code==='KeyM'){showOverview();return;}if(code==='Digit1'){focusScene(0);return;}if(code==='Digit2'){focusScene(1);return;}const d=shift?120:48;const moves={ArrowLeft:[d,0],ArrowRight:[-d,0],ArrowUp:[0,d],ArrowDown:[0,-d]};if(moves[code])dragDelta(...moves[code]);}
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.channel!=='green-hour-map')return;const n=nodes.find(n=>n.frame.contentWindow===e.source);if(!n)return;const m=e.data;if(m.type==='ready'){n.ready=true;send(n,{type:'palette',print,grades});if(studio)send(n,{type:'layout',layout:studio.getLayout(),quality:studio.getQuality()});send(n,{type:'command',command:'motion',paused});}if(m.type==='drag'){dragDelta(m.dx,m.dy);}if(m.type==='wheel')wheel(m.dx,m.dy,m.ctrl,m.shift);if(m.type==='key')key(m.code,m.shift);if(m.type==='state'){n.chapter=m.chapter;updateUI();}if(m.type==='begin'){dragging=true;world.classList.add('dragging');}if(m.type==='end'){dragging=false;world.classList.remove('dragging');}if(m.type==='focus')focusScene(nodes.indexOf(n));});
$('#map-viewport').addEventListener('pointerdown',e=>{if(e.target!==$('#map-viewport')&&e.target!==world)return;lastDrag=[e.clientX,e.clientY];dragging=true;e.currentTarget.setPointerCapture(e.pointerId);});
$('#map-viewport').addEventListener('pointermove',e=>{if(lastDrag){dragDelta(e.clientX-lastDrag[0],e.clientY-lastDrag[1]);lastDrag=[e.clientX,e.clientY];}});
$('#map-viewport').addEventListener('pointerup',()=>{lastDrag=null;dragging=false;});$('#map-viewport').addEventListener('pointercancel',()=>{lastDrag=null;dragging=false;});
$('#map-viewport').addEventListener('wheel',e=>{e.preventDefault();wheel(e.deltaX,e.deltaY,e.ctrlKey,e.shiftKey);},{passive:false});
window.addEventListener('keydown',e=>{if(e.target.closest('input,select,button,[contenteditable]'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','Escape','Digit1','Digit2','KeyM','Space','Enter'].includes(e.code)){e.preventDefault();key(e.code,e.shiftKey);}});
window.addEventListener('resize',()=>{if(overview)showOverview();else focusScene(active);});
function animate(now){requestAnimationFrame(animate);const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;const ease=1-Math.exp(-dt*(dragging?18:6));for(const k of ['x','y','z'])pan[k]+=(target[k]-pan[k])*ease;world.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${pan.z})`;
 let nearest=active,nearestD=Infinity;
 for(const [i,n]of nodes.entries()){
  const x=n.x*innerWidth,y=n.y*innerHeight,el=n.frame.parentElement;el.style.transform=`translate(${x}px,${y}px) rotate(${n.rotation||0}deg) scale(${n.size||1})`;
  const size=n.size||1;const screenX=pan.x+x*pan.z+innerWidth*pan.z*(1-size)/2,screenY=pan.y+y*pan.z+innerHeight*pan.z*(1-size)/2,w=innerWidth*pan.z*size,h=innerHeight*pan.z*size;
  const left=screenX+w*.12,right=screenX+w*.98,top=screenY+h*.04,bottom=screenY+h*.97;
  const area=Math.max(0,Math.min(innerWidth,right)-Math.max(0,left))*Math.max(0,Math.min(innerHeight,bottom)-Math.max(0,top));
  const visibility=Math.max(0,Math.min(1,area/((right-left)*(bottom-top))));
  const modal=document.querySelector('#map-settings');const covered=modal&&!modal.hidden&&!modal.classList.contains('live-preview');const viewport={type:'viewport',offsetX:Number((screenX/pan.z).toFixed(2)),offsetY:Number((screenY/pan.z).toFixed(2)),presence:Number(visibility.toFixed(3)),visible:!covered&&right>-100&&left<innerWidth+100&&bottom>-100&&top<innerHeight+100,dragging,overview,scale:Number(pan.z.toFixed(3))};const key=JSON.stringify(viewport);if(n.viewportKey!==key){send(n,viewport);n.viewportKey=key;}
  const d=Math.hypot(screenX+w/2-innerWidth/2,screenY+h/2-innerHeight/2);if(d<nearestD){nearestD=d;nearest=i;}
 }
 if(navigating!==null&&Math.hypot(pan.x-target.x,pan.y-target.y)<1)navigating=null;
 if(!overview&&navigating===null&&active!==nearest){active=nearest;updateUI();}
 document.body.dataset.mapState=JSON.stringify({active:nodes[active].id,overview,pan:{x:Math.round(pan.x),y:Math.round(pan.y),scale:Number(pan.z.toFixed(3))},ready:nodes.map(n=>({id:n.id,ready:n.ready,chapter:n.chapter}))});
}

studio=installStudio({nodes,broadcast,onSharedPrint(){syncGrades();syncPrint();},onSceneFocus(id){focusScene(nodes.findIndex(n=>n.id===id));},onFrameFocus(id,card){if(id==='disco'&&['wide','macro','backing'].includes(card))send(nodes[0],{type:'command',command:card==='macro'?'detail':'wide'});},onLayout(layout){document.body.dataset.frameLayout=JSON.stringify(layout);for(const n of nodes){const cfg=layout[n.id].stack;n.x=cfg.x/100;n.y=cfg.y/100;n.size=cfg.scale;n.rotation=cfg.rotation;n.viewportKey=null;}},onQuality(q){q.fps=Math.max(24,Math.min(60,q.fps));q.pixelRatio=Math.max(.75,Math.min(1.7,q.pixelRatio));q.detailFps=Math.max(12,Math.min(40,q.detailFps));quality=q;},onPrintReset(saved){if(saved.print)for(const [key,value]of Object.entries(saved.print))if(key in print&&((typeof value==='number'&&Number.isFinite(value))||(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))))print[key]=value;if(saved.grades)for(const region of Object.keys(grades))for(const key of Object.keys(grades[region]))if(Number.isFinite(saved.grades[region]?.[key]))grades[region][key]=saved.grades[region][key];syncGrades();syncPrint();}});
document.querySelectorAll('.dock button,.map-nodes button').forEach(b=>b.title=b.getAttribute('aria-label'));syncGrades();syncPrint();updateUI();requestAnimationFrame(animate);
