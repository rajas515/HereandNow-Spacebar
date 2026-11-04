import * as THREE from './vendor/three.module.js';

export const PRINT_DEFAULTS=Object.freeze({"tint": 1, "riso": 0.7, "sketch": 0.4, "wobble": 0.4, "dotSize": 3.4, "paper": "#1a1d4a", "contrast": 0.84, "background": 0.97, "threshold": 0.35, "inkA": "#2939c2", "inkB": "#fd0280", "highlight": "#4b58c5"});
export const GRADE_DEFAULTS=Object.freeze({"ball": {"exposure": -0.26, "contrast": 1.21, "shadows": -0.65, "highlights": -0.59, "saturation": 1, "temperature": 0.18, "tint": 0.04, "value": 0.47}, "room": {"exposure": 1.12, "contrast": 0.25, "shadows": 0.97, "highlights": 0.31, "saturation": 1.37, "temperature": -0.2, "tint": 0.87, "value": 0.08}, "foliage": {"exposure": 2, "contrast": 1.96, "shadows": 0.64, "highlights": 0.12, "saturation": 1, "temperature": 0, "tint": -0.56, "value": 0.62}});
const rgb=hex=>new THREE.Vector3(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));

// Geometry normals and scene depth keep pencil contours attached to 3D forms.
export class PrintPass{
  constructor(renderer){
    this.renderer=renderer;
    this.settings={...PRINT_DEFAULTS};
    this.grades=JSON.parse(JSON.stringify(GRADE_DEFAULTS));
    this.color=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
    this.color.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.normal=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});
    this.normalMaterial=new THREE.MeshNormalMaterial({flatShading:true});
    this.normalMaterials=new WeakMap();
    this.normalBackground=new THREE.Color(.5,.5,1);
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.uniforms={
      uFaceDrawings:{value:0},uTransparentOutside:{value:0},uGlint0:{value:new THREE.Vector4()},uGlint1:{value:new THREE.Vector4()},
      tColor:{value:this.color.texture},tDepth:{value:this.color.depthTexture},tNormal:{value:this.normal.texture},
      uGradeBall0:{value:new THREE.Vector4()},uGradeBall1:{value:new THREE.Vector4()},uGradeRoom0:{value:new THREE.Vector4()},uGradeRoom1:{value:new THREE.Vector4()},uGradeFoliage0:{value:new THREE.Vector4()},uGradeFoliage1:{value:new THREE.Vector4()},
      uViewMix:{value:0},uCardSize:{value:new THREE.Vector2(.75,.82)},uCardCenter:{value:new THREE.Vector2(.5,.5)},
      uContrast:{value:PRINT_DEFAULTS.contrast},uBackground:{value:PRINT_DEFAULTS.background},uThreshold:{value:PRINT_DEFAULTS.threshold},
      uResolution:{value:new THREE.Vector2(1,1)},uPixelRatio:{value:1},uTime:{value:0},uNear:{value:.05},uFar:{value:90},
      uTint:{value:PRINT_DEFAULTS.tint},uRiso:{value:PRINT_DEFAULTS.riso},uSketch:{value:PRINT_DEFAULTS.sketch},uWobble:{value:PRINT_DEFAULTS.wobble},uDotSize:{value:PRINT_DEFAULTS.dotSize},
      uPaper:{value:rgb(PRINT_DEFAULTS.paper)},uInkA:{value:rgb(PRINT_DEFAULTS.inkA)},uInkB:{value:rgb(PRINT_DEFAULTS.inkB)},uHighlight:{value:rgb(PRINT_DEFAULTS.highlight)}
    };
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
      fragmentShader:`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tColor,tDepth,tNormal;
        uniform vec2 uResolution,uCardSize,uCardCenter;
        uniform float uFaceDrawings,uTransparentOutside;
        uniform float uViewMix,uContrast,uBackground,uThreshold;
        uniform float uPixelRatio,uTime,uNear,uFar,uTint,uRiso,uSketch,uWobble,uDotSize;
        uniform vec3 uPaper,uInkA,uInkB,uHighlight;
        uniform vec4 uGlint0,uGlint1;
        float sparkle(vec4 g,vec2 p){vec2 q=abs(p-g.xy*uResolution/uPixelRatio)/max(g.z,.01);q.x*=1.25;float shape=sqrt(q.x)+sqrt(q.y);return (1.0-smoothstep(.92,1.04,shape))*g.w;}
        uniform vec4 uGradeBall0,uGradeBall1,uGradeRoom0,uGradeRoom1,uGradeFoliage0,uGradeFoliage1;
        vec4 grade0(vec2 uv){float m=texture2D(tNormal,uv).a;return m>.8?uGradeBall0:(m>.25?uGradeFoliage0:uGradeRoom0);}
        vec4 grade1(vec2 uv){float m=texture2D(tNormal,uv).a;return m>.8?uGradeBall1:(m>.25?uGradeFoliage1:uGradeRoom1);}
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
        float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
        vec3 displayColor(vec2 uv){
          vec4 g=grade0(uv);
          vec3 x=texture2D(tColor,clamp(uv,.001,.999)).rgb*1.2*exp2(g.x);
          x=clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);
          x=pow(x,vec3(1.0/2.2));float v=dot(x,vec3(.2126,.7152,.0722));
          x+=g.z*.38*pow(1.0-v,2.0)+g.w*.38*pow(v,2.0);
          return clamp((x-.5)*g.y+.5+grade1(uv).w*.25,0.0,1.0);
        }
        float depthAt(vec2 uv){float z=texture2D(tDepth,clamp(uv,.001,.999)).x;return uNear*uFar/(uFar-z*(uFar-uNear));}
        float contour(vec2 uv,vec2 px){
          vec3 n=texture2D(tNormal,uv).rgb;
          float nd=0.0,dd=0.0;float d=depthAt(uv);
          vec2 o=px*(.65+uSketch*1.9);
          nd=max(nd,length(n-texture2D(tNormal,uv+vec2(o.x,0)).rgb));
          nd=max(nd,length(n-texture2D(tNormal,uv-vec2(o.x,0)).rgb));
          nd=max(nd,length(n-texture2D(tNormal,uv+vec2(0,o.y)).rgb));
          nd=max(nd,length(n-texture2D(tNormal,uv-vec2(0,o.y)).rgb));
          dd=max(dd,abs(depthAt(uv+vec2(o.x,0))-d)/max(d,.1));
          dd=max(dd,abs(depthAt(uv-vec2(o.x,0))-d)/max(d,.1));
          dd=max(dd,abs(depthAt(uv+vec2(0,o.y))-d)/max(d,.1));
          dd=max(dd,abs(depthAt(uv-vec2(0,o.y))-d)/max(d,.1));
          return max(smoothstep(.19,.48,nd),smoothstep(.014,.09,dd));
        }
        float screenDot(vec2 p,float coverage,float angle,float offset){
          mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
          vec2 grid=rot*(p+vec2(offset,-offset*.6))/uDotSize;
          vec2 cell=floor(grid);vec2 f=fract(grid)-.5;
          f+=(vec2(hash(cell),hash(cell+29.0))-.5)*.10*uRiso;
          float radius=sqrt(clamp(coverage,0.0,1.0))*.72;
          float aa=.45/uDotSize;
          return 1.0-smoothstep(radius-aa,radius+aa,length(f));
        }
        void main(){
          vec2 cardUv=(vUv-uCardCenter)/uCardSize+.5;
          float rectangle=step(0.0,cardUv.x)*step(cardUv.x,1.0)*step(0.0,cardUv.y)*step(cardUv.y,1.0);
          float cardMask=rectangle;
          vec2 cssPixel=gl_FragCoord.xy/uPixelRatio;
          vec2 px=uPixelRatio/uResolution;
          float phase=floor(uTime*8.0);
          vec2 boil=vec2(noise(cssPixel*.025+phase*vec2(.71,.43)),noise(cssPixel*.026+phase*vec2(-.37,.61)))-.5;
          vec2 warp=boil*px*uWobble*4.4;
          vec2 uv=clamp(cardUv+warp,.002,.998);
          vec3 original=displayColor(uv);
          float accent=step(.8,texture2D(tNormal,uv).a);
          cardMask=max(cardMask,rectangle*accent);
          float lum=clamp((luma(original)-.5)*uContrast+.5,0.0,1.0);
          float backgroundLum=clamp(lum*uBackground,0.0,1.0);
          float levels=mix(9.0,3.5,uSketch);
          vec3 toon=floor(original*levels+.5)/levels;
          vec3 base=mix(original,toon,uSketch*.55);
          float dark=1.0-mix(backgroundLum,lum,accent);
          float grain=hash(floor(cssPixel*1.4))-.5;
          float fiber=noise(cssPixel*vec2(.42,.018))-.5;
          float bgBand=floor(backgroundLum*4.0+.5)/4.0;
          vec3 backgroundInk=mix(uInkA*.42,uInkA,bgBand);
          float bgDots=screenDot(cssPixel,.70+backgroundLum*.25,.78,0.0);
          backgroundInk=mix(backgroundInk*.75,backgroundInk,mix(1.0,bgDots,uRiso*.55));
          float backgroundAccent=smoothstep(uThreshold+.12,uThreshold+.22,backgroundLum);
          backgroundInk=mix(backgroundInk,uInkB,backgroundAccent*.65);
          float bright=smoothstep(uThreshold-.055,uThreshold+.055,lum);
          // Keep the mirror sphere in the room's violet / pink ink family,
          // even when the page paper and global highlight swatches are dark.
          vec3 ballPink=mix(uInkB,vec3(.94,.015,.94),.65);
          vec3 ballLight=vec3(1.0,.84,.97);
          vec3 pinkInk=mix(mix(uInkA,ballPink,.58),ballPink,.3+lum*.7);
          float highlightDots=screenDot(cssPixel,bright,-.32,1.5*uRiso);
          pinkInk=mix(pinkInk,ballLight,mix(bright,highlightDots,uRiso*.65)*.92);
          vec3 printColor=mix(backgroundInk,pinkInk,accent);
          vec3 result=mix(base,printColor,uTint);
          vec4 cg=grade1(uv);
          result=mix(vec3(luma(result)),result,cg.x);
          result*=vec3(1.0+cg.y*.22+cg.z*.12,1.0-cg.z*.16,1.0-cg.y*.22+cg.z*.12);
          float faceInk=accent*clamp((1.0-texture2D(tNormal,uv).a)/.12,0.0,1.0)*uFaceDrawings;
          result=mix(result,uInkA*.28,smoothstep(.08,.8,faceInk)*.96);
          float edge=contour(uv,px);
          // Broken double strokes and hatching become stronger with sketchiness.
          float broken=.70+.30*noise(cssPixel*.18+phase*.37*uWobble);
          vec3 line=mix(base*.28,mix(uInkA*.27,uInkB*.34,accent),uTint);
          float pencil=edge*uSketch*broken;
          vec3 secondaryNormal=texture2D(tNormal,clamp(uv+vec2(1.9,-.7)*px*uRiso,.002,.998)).rgb;
          float ghost=length(secondaryNormal-texture2D(tNormal,uv).rgb);
          result=mix(result,mix(result,uInkB,.55),smoothstep(.25,.65,ghost)*uSketch*uRiso*.5);
          result=mix(result,line,clamp(pencil,0.0,.94));
          float hatchCoord=(cssPixel.x+cssPixel.y*.71+boil.x*uWobble*3.0)/5.5;
          float hatch=1.0-smoothstep(.04,.16,abs(fract(hatchCoord)-.5));
          result=mix(result,mix(line,uInkB,.35),hatch*smoothstep(.27,.65,dark)*uSketch*.17);
          float glint=max(sparkle(uGlint0,cssPixel),sparkle(uGlint1,cssPixel));
          result=mix(result,vec3(1.0),glint);
          // Final print pass: no color grade, outline or lighting runs after this.
          // The screen is fixed to the page, above every scene region and grade.
          float finalCoverage=clamp(.53+(1.0-luma(clamp(result,0.0,1.0)))*.29,.53,.84);
          float finalScreen=screenDot(cssPixel,finalCoverage,.7854,0.0);
          result=mix(result,uInkB,smoothstep(.25,.65,ghost)*uRiso*.16);
          vec3 printPaper=mix(uPaper,ballLight,accent*.85);
          result=mix(result,printPaper,(1.0-finalScreen)*uRiso*.78);
          result+=(grain*.075+fiber*.045)*uRiso;
          float dropout=step(.985,hash(floor(cssPixel*.8)))*uRiso*.30;
          result=mix(result,printPaper,dropout);
          float outside=max(1.0-cardMask,step(.999999,texture2D(tDepth,uv).x));
          result=mix(result,uPaper+grain*.012*uRiso,outside*(1.0-glint));
          float outputAlpha=mix(1.0,1.0-outside*(1.0-glint),uTransparentOutside);
          gl_FragColor=vec4(clamp(result,0.0,1.0)*outputAlpha,outputAlpha);
        }
      `});
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    for(const region of Object.keys(this.grades))this.syncGrade(region);
    this.resize();
  }
  syncGrade(region){const g=this.grades[region],key=region[0].toUpperCase()+region.slice(1);this.uniforms['uGrade'+key+'0'].value.set(g.exposure,g.contrast,g.shadows,g.highlights);this.uniforms['uGrade'+key+'1'].value.set(g.saturation,g.temperature,g.tint,g.value);}
  setGrade(region,name,value){this.grades[region][name]=value;this.syncGrade(region);}
  set(name,value){
    this.settings[name]=value;
    const names={tint:'uTint',riso:'uRiso',sketch:'uSketch',wobble:'uWobble',dotSize:'uDotSize',paper:'uPaper',inkA:'uInkA',inkB:'uInkB',highlight:'uHighlight',contrast:'uContrast',background:'uBackground',threshold:'uThreshold'};
    const uniform=this.uniforms[names[name]];
    if(typeof value==='string')uniform.value.copy(rgb(value));else uniform.value=value;
  }
  resize(){const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.color.setSize(size.x,size.y);this.normal.setSize(size.x,size.y);this.uniforms.uResolution.value.copy(size);this.uniforms.uPixelRatio.value=this.renderer.getPixelRatio();
    const aspect=size.x/size.y;this.uniforms.uCardSize.value.set(aspect<.85?.88:Math.min(.84,1.25/aspect),aspect<.85?.72:.82);
    this.uniforms.uCardCenter.value.set(aspect<.85?.5:.47,.51);
  }
  get cardSize(){return this.uniforms.uCardSize.value;}
  get cardCenter(){return this.uniforms.uCardCenter.value;}
  setPan(x,y){const aspect=this.uniforms.uResolution.value.x/this.uniforms.uResolution.value.y;this.uniforms.uCardCenter.value.set((aspect<.85?.5:.47)+x,.51-y);}
  setViewMix(value){this.uniforms.uViewMix.value=value;}
  render(scene,camera,time){
    this.uniforms.uTime.value=time;this.uniforms.uNear.value=camera.near;this.uniforms.uFar.value=camera.far;
    this.renderer.setRenderTarget(this.color);this.renderer.render(scene,camera);
    const stats={drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};
    {
      const hidden=[];scene.traverse(o=>{if(o.visible&&(o.isPoints||o.isSprite||(o.material&&(o.material.transparent||o.material.isMeshBasicMaterial)))){hidden.push(o);o.visible=false;}});
      const background=scene.background,override=scene.overrideMaterial,shadowUpdate=this.renderer.shadowMap.autoUpdate;
      const swapped=[];scene.traverse(o=>{if(o.isMesh&&o.visible&&o.material){
        const original=o.material;if(!this.normalMaterials.has(original)){
          const normal=new THREE.MeshNormalMaterial({flatShading:!!original.flatShading,side:original.side,transparent:true,opacity:original.userData.accent?1:(original.userData.foliage?.5:0),blending:THREE.NoBlending});
          if(original.alphaTest>0&&original.map){
            normal.onBeforeCompile=shader=>{shader.uniforms.cutoutMap={value:original.map};shader.vertexShader='varying vec2 vCutoutUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvCutoutUv=uv;');shader.fragmentShader='uniform sampler2D cutoutMap;varying vec2 vCutoutUv;\n'+shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\nif(texture2D(cutoutMap,vCutoutUv).a < ${original.alphaTest.toFixed(4)})discard;`);};
            normal.customProgramCacheKey=()=> 'chair-cutout-normal';
          }
          if(original.userData.faceAtlas){
            normal.onBeforeCompile=shader=>{
              shader.uniforms.faceDrawings={value:original.userData.faceAtlas};
              shader.vertexShader='attribute vec2 faceCell;varying vec2 vFaceDrawingUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvFaceDrawingUv=(uv*.94+.03+faceCell)/3.0;');
              shader.fragmentShader='uniform sampler2D faceDrawings;varying vec2 vFaceDrawingUv;\n'+shader.fragmentShader.replace('gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );','diffuseColor.a=1.0-(1.0-texture2D(faceDrawings,vFaceDrawingUv).r)*.12;\ngl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );');
            };
            normal.customProgramCacheKey=()=> 'mirror-face-ink-mask';
          }
          if(original.userData.floorGrade){
            const previous=normal.onBeforeCompile;
            normal.onBeforeCompile=shader=>{previous(shader);shader.vertexShader='varying vec3 gradeWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngradeWorld=(modelMatrix*vec4(position,1.)).xyz;');shader.fragmentShader='varying vec3 gradeWorld;\n'+shader.fragmentShader;
              if(original.userData.floorGrade)shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );','if(gradeWorld.y<.10)diffuseColor.a=.72;gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );');
            };normal.customProgramCacheKey=()=> 'floor-grade';
          }
          this.normalMaterials.set(original,normal);
        }
        swapped.push([o,original]);o.material=this.normalMaterials.get(original);
      }});
      scene.background=this.normalBackground;scene.overrideMaterial=null;this.renderer.shadowMap.autoUpdate=false;
      this.renderer.setRenderTarget(this.normal);this.renderer.render(scene,camera);
      swapped.forEach(([o,m])=>o.material=m);hidden.forEach(o=>o.visible=true);scene.background=background;scene.overrideMaterial=override;this.renderer.shadowMap.autoUpdate=shadowUpdate;
    }
    this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);return stats;
  }
}
