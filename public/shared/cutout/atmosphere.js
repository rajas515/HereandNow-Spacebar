import * as THREE from '../vendor/three.module.js';

export function addAtmosphere(scene,options={}){
  const time={value:0},beams=[];
  for(const [z,width,strength] of options.beams||[[-1.1,.42,.18],[1.35,.62,.14],[3.05,.30,.08]]){
    // Ground-projected window light stays on the receiving floor under camera
    // motion; a suspended flat shaft would expose its card-like construction.
    const windowX=options.windowX??3.80;
    const vertices=options.direction==='top'?[z-width/2,.018,options.windowZ??-1.9,z+width/2,.018,options.windowZ??-1.9,z+.7+width,.018,2.65,z+.7-width,.018,2.65]:[windowX,.018,z-width/2,windowX,.018,z+width/2,-1.7,.018,z-2.6+width,-1.7,.018,z-2.6-width];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
    const material=new THREE.ShaderMaterial({transparent:true,forceSinglePass:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{time,strength:{value:strength}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 vUv;uniform float time,strength;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          float edge=pow(max(0.,sin(vUv.x*3.14159)),1.6);
          float lengthFade=smoothstep(0.,.18,vUv.y)*(1.-smoothstep(.92,1.,vUv.y));
          float dust=step(.997,hash(floor(vUv*vec2(95.,220.)+vec2(time*.1,time*.6))));
          gl_FragColor=vec4(vec3(.96,.82,.68),edge*lengthFade*strength*(.90+dust*.85));
        }`
    });
    const mesh=new THREE.Mesh(geometry,material);mesh.name='window-light-shaft';mesh.renderOrder=2;scene.add(mesh);beams.push(mesh);
  }
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,18,64,64,64);
  gradient.addColorStop(0,'rgba(16,17,38,.42)');gradient.addColorStop(.55,'rgba(16,17,38,.20)');gradient.addColorStop(1,'rgba(16,17,38,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(shadowCanvas);
  for(const [x,z] of options.contacts||[[.2,-.65],[.2,1.36]]){
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.65,2.20),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:.55,toneMapped:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.012,z);shadow.name='floor-contact-shadow';scene.add(shadow);
  }
  return {update(t){time.value=t;},beams};
}
