import * as THREE from '../shared/vendor/three.module.js';
import {gltfLoader} from '../shared/gltf.js';
import {PrintPass} from '../shared/print-pass.js';
import {addAccent} from '../shared/accent.js';


const assetUrl=path=>new URL(path,import.meta.url).href;

// Runs on the standalone page (pageHost) or inside the exhibition world.
export async function mount(host){
const canvas=host.$('#scene');
const stage=host.$('#stage');
// Blue accent shard behind the room (shared/accent.js, disco's backing), traced from the exhibition comp.
const roomShard=addAccent(host,stage,[[.0927,.4395],[.8204,.4395],[.6444,1.0311]],canvas);
// Reading: the room's shard wipes shut along two edges as the view zooms in (as disco's backing does)
// and a new one, behind the pillar, unfolds in its place; Exit plays it backwards.
const readingShard=addAccent(host,stage,[[.3498,.431],[.6471,.2852],[.6642,.4063],[.4814,.762]],canvas);readingShard.fold(0);
const status=host.$('#status');
if(host.world)host.documentElement.classList.add('in-exhibition');   // the exhibition runs its own Read / Exit around this card
let cardScale=1;   // in the exhibition: how large this card is drawn (the reading view is kept within the screen)
const scene=new THREE.Scene();
scene.background=new THREE.Color('#1a1d4a');
const camera=new THREE.PerspectiveCamera(34,1,.1,60);
const meshMaterials=new Map();
const cube=new THREE.BoxGeometry();
function material(color){
  if(!meshMaterials.has(color))meshMaterials.set(color,new THREE.MeshStandardMaterial({color,roughness:.87}));
  return meshMaterials.get(color);
}
function box(parent,x,y,z,w,h,d,finish){
  const mesh=new THREE.Mesh(cube,typeof finish==='string'?material(finish):finish);
  mesh.position.set(x,y,z);
  mesh.scale.set(w,h,d);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}

const foliageUniforms=[];
const pillars=[];
const textScene=new THREE.Scene();
// The will, read in order: whichever pillar a visitor opens, the next part of the will appears on
// it, so the text always reads from the beginning to the end (then starts again).
// Styles: title, sub, body, item (a bequest's heading), sign.
const WILL=[
  [{s:'title',t:'THE LAST WILL AND TESTAMENT'},{s:'sub',t:'Of the Late Exhibition Design'},{s:'body',t:'To all those who have been a part of my life,'},
   {s:'body',t:'Having lived a long, eventful, and chaotic life, I, Bachelors of Exhibition Design, being of sound mind, hereby declare this to be my Last Will and Testament.'}],
  [{s:'body',t:'It has been quite a journey. Over the years, I have accumulated many things: objects, materials, memories and lessons. As I prepare to depart, I wish to leave behind a few things for those who have made my life what it was. Some precious, some strange, but each is a part of me I hope you cherish.'},
   {s:'body',t:'I hereby leave the following in your care:'}],
  [{s:'item',t:'I. To Asif'},{s:'body',t:'The little Sunday Market television, which has already found its way home with him. I am pleased to know it is still in good hands.'},
   {s:'item',t:'II. To Abhirami'},{s:'body',t:'Her corkboard, in the hope that it continues to hold all the things worth putting up.'},
   {s:'item',t:'III. To Maulika'},{s:'body',t:'The mannequin leg she so lovingly took home with her on her final day. I trust it has found a permanent place in her life.'}],
  [{s:'item',t:'IV. To Aniket'},{s:'body',t:'The miniature purple chairs made by him, returned to their rightful creator.'},
   {s:'item',t:'V. To Urja'},{s:'body',t:'One movable board, for all the things that still need to be put up, moved around, and rethought.'},
   {s:'item',t:'VI. To Thommen'},{s:'body',t:'One black studio table, in the hope that it continues to witness many ideas taking shape.'}],
  [{s:'item',t:'VII. To Nikita'},{s:'body',t:'Her softboard, which perhaps knows her better than most. As she said, \u201cYou could always tell whatever phase I was going through by whatever was on my board.\u201d'},
   {s:'item',t:'VIII. To ENUGIS'},{s:'body',t:'The lockers with the hand painted caricatures, which have kept a piece of them in the studio for the past decade.'}],
  [{s:'item',t:'IX. To EXIT'},{s:'body',t:'The Exit signs'},{s:'item',t:'X. To Flexhib'},{s:'body',t:'Curved panel then and them'},{s:'item',t:'XI. To Spacebar'},{s:'body',t:'3D printer'},
   {s:'body',t:'And to everyone I have not mentioned by name, know that you have each inherited something from me, whether you realise it or not.'}],
  [{s:'body',t:'Perhaps it is the confidence to attempt the unfamiliar, to experiment, make mistakes, and learn through failure. Perhaps it is the courage to embrace your individuality, take on unfamiliar challenges, and build meaningful relationships along the way. Or perhaps, simply, it is the understanding that the best work often comes from working alongside people who see the world differently from you.'}],
  [{s:'body',t:'These are the things I leave behind that cannot be boxed up or passed on. They are yours to carry forward, in whatever form you choose.'},
   {s:'body',t:'I leave these things in your care, with the hope that they will continue to find new meaning, new purpose, and new homes.'},
   {s:'sign',t:'With love,'},{s:'sign',t:'Exhibition Design'}],
];
const plainPart=index=>WILL[index].map(block=>block.t).join(' ');
function inscription(x,z,height){
  const plate=document.createElement('canvas');
  plate.width=1024;
  plate.height=1520;
  const texture=new THREE.CanvasTexture(plate);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.39,.58),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
  mesh.position.set(x,height*.65,z+.2155);
  mesh.visible=false;
  mesh.userData={plate,texture};
  textScene.add(mesh);
  return mesh;
}
// Set one part of the will on a pillar's plate: pale lettering cut into the stone, a dark edge on
// its upper-left like a carved groove, large enough to read in the close view. A part that would
// overflow its plate is set a little smaller.
function writePart(mesh,index){
  const {plate,texture}=mesh.userData,pen=plate.getContext('2d');
  const left=70,width=884,bottom=plate.height-130;
  for(let k=1;k>.6;k*=.92){
    const font={title:`800 ${60*k}px Mulish,Arial,sans-serif`,sub:`italic 400 ${48*k}px Mulish,Arial,sans-serif`,body:`400 ${50*k}px Mulish,Arial,sans-serif`,item:`800 ${52*k}px Mulish,Arial,sans-serif`,sign:`italic 400 ${52*k}px Mulish,Arial,sans-serif`};
    const lead={title:70*k,sub:62*k,body:68*k,item:66*k,sign:66*k},after={title:8*k,sub:38*k,body:30*k,item:4*k,sign:4*k};
    pen.clearRect(0,0,plate.width,plate.height);
    const ink=(text,x,y)=>{pen.fillStyle='rgba(10,5,34,.85)';pen.fillText(text,x-2,y-2.5);pen.fillStyle='#ffe7f6';pen.fillText(text,x,y);};
    let y=124;
    for(const block of WILL[index]){
      pen.font=font[block.s];
      let line='';
      for(const word of block.t.split(' ')){
        const next=line?line+' '+word:word;
        if(pen.measureText(next).width>width&&line){ink(line,left,y);y+=lead[block.s];line=word;}else line=next;
      }
      ink(line,left,y);
      y+=lead[block.s]+after[block.s];
    }
    if(y<=bottom+lead.body){
      pen.font='800 30px Mulish,Arial,sans-serif';
      ink(`${index+1} / ${WILL.length}`,left,plate.height-64);
      break;
    }
  }
  texture.needsUpdate=true;
}

async function build(){
  const [garden,chair]=await Promise.all([
    new THREE.TextureLoader().loadAsync(assetUrl('../disco/assets/garden.webp?v=webp1')),
    gltfLoader().loadAsync(assetUrl('../disco/assets/purple-chair.glb?v=draco1'))
  ]);
  garden.wrapS=THREE.MirroredRepeatWrapping;
  garden.wrapT=THREE.MirroredRepeatWrapping;
  garden.needsUpdate=true;
  const timber='#635674',frame='#35314d',concrete='#a5a0af',desktop='#d6c2cc';
  box(scene,0,-.09,0,8,.18,7,concrete);
  for(const x of [-2,0,2])box(scene,x,.001,0,.018,.007,7,timber);
  for(const z of [-1.75,0,1.75])box(scene,0,.001,z,8,.007,.018,timber);
  function windows(length,x,z,angle){
    const wall=new THREE.Group();
    wall.position.set(x,0,z);
    wall.rotation.y=angle;
    scene.add(wall);
    // Match Disco's two virtual garden depths behind the bounded glazing.
    const uniforms={garden:{value:garden},time:{value:0},side:{value:angle?1:0}};
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
    const aperture=new THREE.Mesh(new THREE.PlaneGeometry(length-.28,2.63),mat);
    aperture.position.set(0,1.58,-.055);
    wall.add(aperture);
    foliageUniforms.push(uniforms);
    for(const y of [.24,2.91])box(wall,0,y,.018,length,.10,.15,frame);
    box(wall,0,3.14,.03,length,.36,.27,concrete);
    for(let i=1;i<4;i++)box(wall,length*(i/4-.5),1.64,.06, .07,3.29,.22,frame);
  }
  windows(8,0,-3.5,0);
  windows(7,-4,0,Math.PI/2);
  for(const [x,z,height] of [
    [-3.88,-3.38,3.32], [3.88,-3.38,3.32],
    [-3.88,3.38,3.32], [3.88,3.38,2.92]
  ]){
    // Each pillar has its own material, so the one under the pointer can glow up into the pink.
    const body=box(scene,x,height/2,z,.43,height,.43,new THREE.MeshStandardMaterial({color:concrete,roughness:.87,emissive:'#ff8ad8',emissiveIntensity:0}));
    pillars.push({body,glow:0,text:inscription(x,z,height)});
    box(scene,x,height+.025,z,.46,.05,.46,'#c6bac8');
  }
  box(scene,4.14,1.28,3.34,.04,.33,.22,desktop);
  for(let i=0;i<3;i++)box(scene,4.17,1.28,3.27+i*.065,.025,.08,.022,frame);

  const bounds=new THREE.Box3().setFromObject(chair.scene);
  const normalized=new THREE.Group();
  const scale=.91/bounds.getSize(new THREE.Vector3()).y;
  const center=bounds.getCenter(new THREE.Vector3());
  chair.scene.scale.multiplyScalar(scale);
  chair.scene.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z).multiplyScalar(scale));
  chair.scene.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
  normalized.add(chair.scene);
  function station(x,z,angle,width){
    const group=new THREE.Group();
    group.position.set(x,0,z);
    group.rotation.y=angle;
    scene.add(group);
    box(group,0,.76,0,width,.08,.77,desktop);
    for(const dx of [-1,1])for(const dz of [-1,1])box(group,dx*(width/2-.08),.36,dz*.31,.055,.72,.055,timber);
    box(group,.08,.813,-.04,.43,.026,.31,frame);
    box(group,.08,.977,-.192,.43,.32,.033,frame).rotation.x=-.13;
    box(group,.08,.98,-.169,.369,.255,.006,'#ada4c5').rotation.x=-.13;
    box(group,.08,.83,-.01,.33,.005,.15,'#888097');
    const paper=box(group,-width*.29,.808,.08,.28,.008,.21,'#f2dfdb');
    paper.rotation.y=.22;
    box(group,width*.32,.85,-.18,.085,.10,.088,'#a7799c');
    const seat=normalized.clone(true);
    seat.position.set(width*.03,0,.74);
    seat.rotation.y=Math.PI-.13;
    group.add(seat);
  }
  station(-3.33,1.62,Math.PI/2,1.69);
  station(-3.27,-.62,Math.PI/2,1.84);
  station(-1.73,-2.78,0,1.85);
  station(.85,-2.61,0,2.18);
  station(2.68,-1.03,-.20,1.69);
  // Communal drafting island leaves circulation around the window desks.
  station(-.42,.45,-.12,2.45);
  const worktop=box(scene,-.42,.76,-.19,2.43,.08,.62,desktop);
  worktop.rotation.y=-.12;
  for(const x of [-1.48,.65])box(scene,x,.36,-.38,.055,.72,.055,timber);
  for(const [x,z,turn] of [[-.95,-.20,.15],[-.49,-.24,-.22],[.37,-.11,.32]]){
    box(scene,x,.809,z,.36,.018,.26,'#efe2e5').rotation.y=turn;
  }
  box(scene,.09,.823,-.2,.41,.045,.27,'#736783').rotation.y=.20;
  const oppositeSeat=normalized.clone(true);
  oppositeSeat.position.set(-.12,0,-.98);
  scene.add(oppositeSeat);
  const mirror=new THREE.Group();
  mirror.position.set(-3.66,0,2.83);
  mirror.rotation.y=Math.PI/2;
  mirror.rotation.x=-.13;
  scene.add(mirror);
  box(mirror,0,.91,0,.58,1.83,.045,frame);
  box(mirror,0,.91,.026,.50,1.73,.012,'#8e9ba9');

  scene.add(new THREE.HemisphereLight('#eee4ef','#554362',1.5));
  const sun=new THREE.DirectionalLight('#fff0da',3);
  sun.position.set(-4,7,-3);
  sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:22});
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.normalBias=.022;
  scene.add(sun);
}

try{
  const renderer=host.createRenderer({canvas,antialias:true,alpha:true});
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.autoUpdate=false;
  const pass=new PrintPass(renderer);pass.uniforms.uTransparentOutside.value=1;   // the accent shows around the room
  pass.set('riso',.62);
  pass.set('sketch',.46);
  pass.set('wobble',.22);
  for(const region of ['room','ball','foliage']){
    pass.setGrade(region,'exposure',region==='foliage'?.35:.25);
    pass.setGrade(region,'contrast',1.05);
    pass.setGrade(region,'shadows',.05);
    pass.setGrade(region,'highlights',0);
    pass.setGrade(region,'saturation',1);
    pass.setGrade(region,'temperature',0);
    pass.setGrade(region,'tint',0);
    pass.setGrade(region,'value',0);
  }
  await build();
  const pan=new THREE.Vector2(),wanted=new THREE.Vector2(),hover=new THREE.Vector2();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drag,raf=0,visible=true,lastDraw=-Infinity;
  let selected=-1,highlighted=-1,progress=0,transition;
  const accessible=document.createElement('p');
  accessible.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
  accessible.setAttribute('aria-live','polite');
  stage.append(accessible);
  const reader=host.$('#reader');
  const raycaster=new THREE.Raycaster();
  const widePosition=new THREE.Vector3(),wideTarget=new THREE.Vector3();
  const readingPosition=new THREE.Vector3(),readingTarget=new THREE.Vector3();
  const cuts=[
    new THREE.Plane(new THREE.Vector3(1,0,0)),new THREE.Plane(new THREE.Vector3(-1,0,0)),
    new THREE.Plane(new THREE.Vector3(0,0,1)),new THREE.Plane(new THREE.Vector3(0,0,-1)),
    new THREE.Plane(new THREE.Vector3(0,1,0)),new THREE.Plane(new THREE.Vector3(0,-1,0))
  ];
  const UP=new THREE.Vector3(0,1,0),viewDir=new THREE.Vector3(),orbit=new THREE.Vector2(),edge=new THREE.Vector3();
  const prevButton=host.$('#prev'),nextButton=host.$('#next');
  const SLICE=.84;   // the reading card: the pillar from just above to just below its plate, as tall as the screen
  const buttons=host.$('.pillars');
  pillars.forEach((pillar,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent='Pillar '+(index+1);
    button.onclick=()=>open(index);
    buttons.append(button);
  });
  function hit(event){
    const rect=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    const object=raycaster.intersectObjects(scene.children,true).find(item=>item.object.isMesh)?.object;
    return pillars.findIndex(pillar=>pillar.body===object);
  }
  function highlight(index){
    highlighted=index;
    canvas.style.cursor=index>=0||selected>=0?'pointer':'grab';
    wake();
  }
  function travel(to,after){
    transition={from:progress,to,start:performance.now(),after};
    wake();
  }
  let part=-1,lastPillar=2;   // the part of the will last shown; each opening shows the next (or, stepping back, the previous)
  function open(index,step=1){
    if(transition||index===selected)return;
    part=(part+step+WILL.length)%WILL.length;
    const plate=pillars[index].text,shown=part;
    writePart(plate,shown);
    const face='400 50px Mulish';
    if(document.fonts&&!document.fonts.check(face))document.fonts.load(face).then(()=>{if(part===shown)writePart(plate,shown);});
    lastPillar=index;
    if(selected>=0){
      transition={between:index,start:performance.now()};
      wake();
      return;
    }
    selected=index;
    highlight(-1);
    travel(1);
  }
  function close(){
    if(selected<0)return;
    travel(0,()=>{selected=-1;highlight(-1);bridgeLink?.state?.('room');});   // the exhibition brings the title back now
  }
  host.$('#back').onclick=close;
  host.$('#prev').onclick=()=>open((selected+pillars.length-1)%pillars.length,-1);
  host.$('#next').onclick=()=>open((selected+1)%pillars.length);
  function wake(){
    if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(draw);
  }
  function draw(time){
    raf=0;
    if(!visible||document.hidden)return;
    if(!reduced&&time-lastDraw<1000/30){wake();return;}
    lastDraw=time;
    for(const uniforms of foliageUniforms)uniforms.time.value=reduced?0:time/1000;
    pan.lerp(wanted,.20);
    let nextPillar=null;
    let glide=0;
    let retreat=0;
    if(transition?.between!==undefined){
      const amount=reduced?1:THREE.MathUtils.clamp((time-transition.start)/1050,0,1);
      if(amount===1){
        selected=transition.between;
        transition=null;
      }else{
        nextPillar=pillars[transition.between];
        glide=THREE.MathUtils.smoothstep(amount,0,1);
        retreat=Math.sin(Math.PI*glide);
      }
    }else if(transition){
      const {from,to,start,after}=transition;
      const t=reduced?1:Math.min(1,Math.floor((time-start)*.024)/36);
      progress=THREE.MathUtils.lerp(from,to,THREE.MathUtils.smoothstep(t,0,1));
      if(t>=1){transition=null;after?.();}
    }
    widePosition.set(10.7+pan.x+hover.x*.17,7.8+hover.y*.10,12+pan.y);
    wideTarget.set(pan.x*.45,1.35,pan.y*.45);
    camera.position.copy(widePosition);
    camera.lookAt(wideTarget);
    renderer.clippingPlanes=[];
    const pillar=pillars[selected];
    if(pillar){
      readingTarget.copy(pillar.text.position);
      if(nextPillar)readingTarget.lerp(nextPillar.text.position,glide);
      // Stand back so the slice fills the screen's height exactly (the card may be drawn larger than
      // the screen in the exhibition), with a soft orbit around the pillar while reading.
      const distance=1.22*SLICE*Math.max(1,cardScale)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));   // 1.22: the slanted view adds height; keep both cuts on screen
      // Soft orbit: the pointer swings the view a little around the pillar, eased.
      orbit.lerp(hover,reduced?1:.08);
      const sway=reduced?0:orbit.x*.3,bob=reduced?0:-orbit.y*.05;
      viewDir.set(.49,.22,1.22).normalize().applyAxisAngle(UP,sway);
      readingPosition.copy(readingTarget).addScaledVector(viewDir,distance);
      readingPosition.x+=retreat*.35;
      readingPosition.y+=bob+retreat*1.25;
      readingPosition.z+=retreat*2.35;
      readingTarget.y-=retreat*.92;
      // Slice the room toward the chosen pillar before advancing past foreground objects.
      const cut=THREE.MathUtils.smoothstep(progress,0,.72);
      const push=THREE.MathUtils.smoothstep(progress,.16,1);
      camera.position.lerp(readingPosition,push);
      camera.lookAt(wideTarget.lerp(readingTarget,push));
      const x=readingTarget.x,z=readingTarget.z-.2155;
      const margin=.225+retreat*2.7;
      cuts[0].constant=THREE.MathUtils.lerp(4.4,-x+margin,cut);
      cuts[1].constant=THREE.MathUtils.lerp(4.4,x+margin,cut);
      cuts[2].constant=THREE.MathUtils.lerp(3.9,-z+margin,cut);
      cuts[3].constant=THREE.MathUtils.lerp(3.9,z+margin,cut);
      const half=SLICE/2+retreat*3;
      cuts[4].constant=THREE.MathUtils.lerp(10,-(readingTarget.y-half),cut);
      cuts[5].constant=THREE.MathUtils.lerp(10,readingTarget.y+half,cut);
      renderer.clippingPlanes=cuts;
    }
    // The hovered pillar's exposure rises until the print turns it pink; the others ease back.
    let glowing=false;
    pillars.forEach((p,i)=>{const aim=i===highlighted?1:0;p.glow+=(aim-p.glow)*(reduced?1:.22);if(Math.abs(aim-p.glow)<.01)p.glow=aim;else glowing=true;p.body.material.emissiveIntensity=p.glow*2.6;});
    pass.render(scene,camera,time/1000);
    renderer.clippingPlanes=[];
    if(pillar&&progress>.84&&!nextPillar){
      pillar.text.visible=true;
      renderer.autoClear=false;
      renderer.clearDepth();
      renderer.render(textScene,camera);
      renderer.autoClear=true;
      pillar.text.visible=false;
    }
    roomShard.fold(1-THREE.MathUtils.smoothstep(progress,.05,.5));
    readingShard.fold(THREE.MathUtils.smoothstep(progress,.45,.95));
    reader.hidden=selected<0||!!transition;
    if(!reader.hidden&&pillar){   // Back and Next sit just off the pillar's sides, following it as the view orbits
      // The pillar's outline on screen at the plate's height (all four corners, so a side face that
      // swings into view is cleared too); the buttons sit just outside it, at the size of the
      // exhibition's other controls however large this card is drawn.
      const W=stage.clientWidth,Hs=stage.clientHeight,{x:px,y:py,z:pz}=pillar.text.position,cz=pz-.2155;
      let minX=Infinity,maxX=-Infinity,sumY=0;
      for(const [dx,dz] of [[-.215,-.215],[.215,-.215],[-.215,.215],[.215,.215]]){edge.set(px+dx,py,cz+dz).project(camera);const sx=(edge.x+1)/2*W;minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);sumY+=(1-edge.y)/2*Hs;}
      const shrink=1/Math.max(1,cardScale),y=(sumY/4).toFixed(1)+'px';
      prevButton.style.left=(minX-18).toFixed(1)+'px';prevButton.style.top=y;prevButton.style.transform=`translate(-100%,-50%) scale(${shrink})`;
      nextButton.style.left=(maxX+18).toFixed(1)+'px';nextButton.style.top=y;nextButton.style.transform=`translate(0,-50%) scale(${shrink})`;
    }
    const announcement=reader.hidden||part<0?'':`Part ${part+1} of ${WILL.length}. `+plainPart(part);
    if(accessible.textContent!==announcement)accessible.textContent=announcement;
    canvas.dataset.pillar=String(selected);
    canvas.dataset.view=transition?'moving':selected<0?'room':'reading';
    canvas.dataset.state='ready';
    if(transition||glowing||!reduced||pan.distanceToSquared(wanted)>.00001)wake();
  }
  function resize(){
    const {width,height}=stage.getBoundingClientRect();
    if(!width||!height)return;
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    pass.resize();
    pass.cardSize.set(1,1);
    pass.cardCenter.set(.5,.5);
    wake();
  }
  function move(x,y){
    wanted.x=THREE.MathUtils.clamp(wanted.x+x,-1.65,1.65);
    wanted.y=THREE.MathUtils.clamp(wanted.y+y,-1.35,1.35);
    wake();
  }
  function reset(){wanted.set(0,0);hover.set(0,0);wake();}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(drag){
      drag.moved ||= Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5;
      if(drag.moved&&selected<0&&!transition){
        highlight(-1);
        move((e.clientX-drag.x)*.014,(e.clientY-drag.y)*.014);
      }
      drag.x=e.clientX;
      drag.y=e.clientY;
    }else{
      if(selected<0&&!transition)highlight(hit(e));
      if(reduced)return;
      const rect=canvas.getBoundingClientRect();
      hover.set((e.clientX-rect.left)/rect.width*2-1,(e.clientY-rect.top)/rect.height*2-1);
      wake();
    }
  });
  canvas.addEventListener('pointerup',e=>{
    if(drag&&!drag.moved&&!transition){
      if(selected>=0){if(!host.world)close();}
      else if(!host.world){const index=hit(e);if(index>=0)open(index);}
    }
    drag=null;
  });
  for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
  canvas.addEventListener('pointerleave',()=>{hover.set(0,0);highlight(-1);});
  canvas.addEventListener('keydown',e=>{
    if(e.code==='Escape'){close();return;}
    if(selected>=0&&(e.code==='ArrowLeft'||e.code==='ArrowRight')){
      e.preventDefault();
      const back=e.code==='ArrowLeft';
      open((selected+pillars.length+(back?-1:1))%pillars.length,back?-1:1);
      return;
    }
    const directions={ArrowLeft:[-.22,0],ArrowRight:[.22,0],ArrowUp:[0,-.22],ArrowDown:[0,.22]};
    if(directions[e.code]){e.preventDefault();move(...directions[e.code]);}
    if(e.code==='Home'){e.preventDefault();reset();}
  });
  host.$('#reset').addEventListener('click',()=>{close();reset();});
  // The exhibition: Read opens the next part (on the pillar under the pointer, or the next one);
  // Back / Next step through the parts; Exit returns to the room.
  const bridgeLink=host.world?host.installMapBridge({
    viewport:m=>{const next=m.cardScale||1;if(next!==cardScale){cardScale=next;wake();}},
    command:m=>{
      if(m.command==='read'&&selected<0)open(highlighted>=0?highlighted:(lastPillar+1)%pillars.length);
      if(m.command==='wide')close();
    }
  }):null;
  document.addEventListener('visibilitychange',wake);
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;wake();}).observe(stage);
  new ResizeObserver(resize).observe(stage);
  renderer.shadowMap.needsUpdate=true;
  status.hidden=true;
  resize();
}catch(error){
  console.error(error);
  status.textContent='The studio could not load. Reload to try again.';
}
}
