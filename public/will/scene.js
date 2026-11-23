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
addAccent(host,stage,[[.0927,.4395],[.8204,.4395],[.6444,1.0311]],canvas);
const status=host.$('#status');
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
const paragraph='Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
function inscription(index,x,z,height){
  const plate=document.createElement('canvas');
  plate.width=512;
  plate.height=760;
  const pen=plate.getContext('2d');
  // Transparent between glyphs: only the recessed cuts sit on the stone.
  function carve(text,x,y){
    pen.fillStyle='#e7a9df';
    pen.fillText(text,x+2,y+3);
    pen.fillStyle='#0e0928';
    pen.fillText(text,x,y);
  }
  pen.font='bold 34px Georgia';
  carve('Will / '+(index+1),42,75);
  pen.font='bold 30px Georgia';
  let line='',y=145;
  for(const word of paragraph.split(' ')){
    if(pen.measureText(line+word).width>428){carve(line,42,y);y+=39;line='';}
    line+=word+' ';
  }
  carve(line,42,y);
  const texture=new THREE.CanvasTexture(plate);
  texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.39,.58),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
  mesh.position.set(x,height*.65,z+.2155);
  mesh.visible=false;
  textScene.add(mesh);
  return mesh;
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
    const body=box(scene,x,height/2,z,.43,height,.43,concrete);
    const stroke=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.438,height+.008,.438)),new THREE.LineBasicMaterial({color:'#ffd9f1'}));
    stroke.position.copy(body.position);
    stroke.visible=false;
    scene.add(stroke);
    pillars.push({body,stroke,text:inscription(pillars.length,x,z,height)});
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
    new THREE.Plane(new THREE.Vector3(0,0,1)),new THREE.Plane(new THREE.Vector3(0,0,-1))
  ];
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
    pillars.forEach((pillar,i)=>{pillar.stroke.visible=i===index;});
    canvas.style.cursor=index>=0||selected>=0?'pointer':'grab';
    wake();
  }
  function travel(to,after){
    transition={from:progress,to,start:performance.now(),after};
    wake();
  }
  function open(index){
    if(transition||index===selected)return;
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
    travel(0,()=>{selected=-1;highlight(-1);});
  }
  host.$('#back').onclick=close;
  host.$('#prev').onclick=()=>open((selected+pillars.length-1)%pillars.length);
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
      readingPosition.copy(readingTarget);
      readingPosition.x+=.49+retreat*.35;
      readingPosition.y+=.22+retreat*1.25;
      readingPosition.z+=1.22+retreat*2.35;
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
      renderer.clippingPlanes=cuts;
    }
    if(highlighted>=0)pillars[highlighted].stroke.visible=false;
    pass.render(scene,camera,time/1000);
    renderer.clippingPlanes=[];
    if(highlighted>=0){
      renderer.autoClear=false;
      renderer.clearDepth();
      const stroke=pillars[highlighted].stroke;
      stroke.visible=true;
      renderer.render(stroke,camera);
      renderer.autoClear=true;
    }
    if(pillar&&progress>.84&&!nextPillar){
      pillar.text.visible=true;
      renderer.autoClear=false;
      renderer.clearDepth();
      renderer.render(textScene,camera);
      renderer.autoClear=true;
      pillar.text.visible=false;
    }
    reader.hidden=selected<0||!!transition;
    const announcement=reader.hidden?'':'Pillar '+(selected+1)+'. '+paragraph;
    if(accessible.textContent!==announcement)accessible.textContent=announcement;
    canvas.dataset.pillar=String(selected);
    canvas.dataset.view=transition?'moving':selected<0?'room':'reading';
    canvas.dataset.state='ready';
    if(transition||!reduced||pan.distanceToSquared(wanted)>.00001)wake();
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
    }else if(selected<0&&!transition){
      highlight(hit(e));
      if(reduced)return;
      const rect=canvas.getBoundingClientRect();
      hover.set((e.clientX-rect.left)/rect.width*2-1,(e.clientY-rect.top)/rect.height*2-1);
      wake();
    }
  });
  canvas.addEventListener('pointerup',e=>{
    if(drag&&!drag.moved&&!transition){
      if(selected>=0)close();
      else {const index=hit(e);if(index>=0)open(index);}
    }
    drag=null;
  });
  for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
  canvas.addEventListener('pointerleave',()=>{hover.set(0,0);highlight(-1);});
  canvas.addEventListener('keydown',e=>{
    if(e.code==='Escape'){close();return;}
    if(selected>=0&&(e.code==='ArrowLeft'||e.code==='ArrowRight')){
      e.preventDefault();
      open((selected+pillars.length+(e.code==='ArrowLeft'?-1:1))%pillars.length);
      return;
    }
    const directions={ArrowLeft:[-.22,0],ArrowRight:[.22,0],ArrowUp:[0,-.22],ArrowDown:[0,.22]};
    if(directions[e.code]){e.preventDefault();move(...directions[e.code]);}
    if(e.code==='Home'){e.preventDefault();reset();}
  });
  host.$('#reset').addEventListener('click',()=>{close();reset();});
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
