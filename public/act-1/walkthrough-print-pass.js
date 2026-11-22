import * as THREE from '../shared/vendor/three.module.js';

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
      uIntroAspect:{value:600/387},tIntro:{value:null},uIntroSequence:{value:-1},tTitle:{value:null},uEndSequence:{value:-1},uScrollDecay:{value:0},uMemoryTime:{value:0},uRevealOrigin:{value:new THREE.Vector3()},uReveal:{value:1},uInverseViewProjection:{value:new THREE.Matrix4()},uFaceDrawings:{value:0},uTransparentOutside:{value:0},uGlint0:{value:new THREE.Vector4()},uGlint1:{value:new THREE.Vector4()},
      tColor:{value:this.color.texture},tDepth:{value:this.color.depthTexture},tNormal:{value:this.normal.texture},
      uGradeBall0:{value:new THREE.Vector4()},uGradeBall1:{value:new THREE.Vector4()},uGradeRoom0:{value:new THREE.Vector4()},uGradeRoom1:{value:new THREE.Vector4()},uGradeFoliage0:{value:new THREE.Vector4()},uGradeFoliage1:{value:new THREE.Vector4()},
      tFrameMask:{value:null},uThresholdAmount:{value:1},uFrameSize:{value:new THREE.Vector2(.84,.76)},uBreakoutDistance:{value:9},uViewMix:{value:0},uCardSize:{value:new THREE.Vector2(.75,.82)},uCardCenter:{value:new THREE.Vector2(.5,.5)},
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
        uniform sampler2D tColor,tDepth,tNormal,tTitle,tIntro;uniform float uEndSequence,uIntroSequence,uIntroAspect;
        uniform vec2 uResolution,uCardSize,uCardCenter,uFrameSize;uniform float uBreakoutDistance,uThresholdAmount;uniform sampler2D tFrameMask;
        uniform float uScrollDecay,uMemoryTime;uniform vec3 uRevealOrigin;uniform float uReveal;uniform mat4 uInverseViewProjection;uniform float uFaceDrawings,uTransparentOutside;
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
        float titleInk(vec2 p,float level){
          if(p.x<.004||p.x>.996||p.y<.004||p.y>.996)return 0.;
          float value=uIntroSequence>=0.?texture2D(tIntro,p).r:texture2D(tTitle,p).r;float edgeAA=max(fwidth(value)*1.15,.006);return smoothstep(0.,.012,level)*(1.-smoothstep(level-edgeAA,level+edgeAA,value));
        }
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
          vec2 cardUv=vUv;
          vec2 frameUv=(vUv-.5)*vec2(.84,.76)/uFrameSize+.5;
          float rectangle=texture2D(tFrameMask,frameUv).r;
          float cardMask=1.0; // Surfaces are clipped in world space before postprocessing.
          vec2 cssPixel=gl_FragCoord.xy/uPixelRatio;
          vec2 px=uPixelRatio/uResolution;
          float phase=floor(uTime*8.0);
          vec2 boil=vec2(noise(cssPixel*.025+phase*vec2(.71,.43)),noise(cssPixel*.026+phase*vec2(-.37,.61)))-.5;
          vec2 warp=boil*px*uWobble*4.4;
          vec2 uv=clamp(cardUv+warp,.002,.998);
          vec3 original=displayColor(uv);
          float accent=step(.8,texture2D(tNormal,uv).a);
          float foreground=step(.4,texture2D(tNormal,uv).a)*(1.0-smoothstep(uBreakoutDistance,uBreakoutDistance+2.0,depthAt(uv)));
          cardMask=max(cardMask,foreground);
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
          // Explicit three-ink threshold, driven by the baked light values.
          vec3 thresholdInk=lum<uThreshold*.55?uPaper:(lum<uThreshold?uInkA:uInkB);
          float inkDots=screenDot(cssPixel,.82,.7854,0.0);
          thresholdInk=mix(thresholdInk,uPaper,(1.0-inkDots)*uRiso*.35);
          thresholdInk=mix(thresholdInk,uPaper,edge*uSketch*.6);
          thresholdInk+=(grain*.035+fiber*.02)*uRiso;
          result=mix(result,thresholdInk,uThresholdAmount*uTint);
          float outside=max(1.0-cardMask,step(.999999,texture2D(tDepth,uv).x));
          result=mix(result,uPaper+grain*.012*uRiso,outside*(1.0-glint));
          float outputAlpha=mix(1.0,1.0-outside*(1.0-glint),uTransparentOutside);
          vec4 revealQ=uInverseViewProjection*vec4(uv*2.-1.,texture2D(tDepth,uv).x*2.-1.,1.);
          vec3 revealPoint=revealQ.xyz/max(abs(revealQ.w),.00001);
          vec3 doorDelta=revealPoint-uRevealOrigin;
          vec3 surfaceN=abs(normalize(cross(dFdx(revealPoint),dFdy(revealPoint))));
          vec2 onPlane;float planeDelay,planeSpeed,travelDistance;
          if(surfaceN.y>.65){
            onPlane=doorDelta.xz;
            bool ceiling=doorDelta.y>1.;
            planeDelay=ceiling?.24:.04;planeSpeed=ceiling?21.:25.;
            travelDistance=ceiling?length(onPlane-vec2(3.,-2.)):length(onPlane-vec2(-3.,2.));
          }else if(surfaceN.x>surfaceN.z){
            onPlane=doorDelta.zy;planeDelay=.14;planeSpeed=23.;
            travelDistance=abs(onPlane.x+2.)+abs(onPlane.y)*.45;
          }else{
            onPlane=doorDelta.xy;planeDelay=0.;planeSpeed=28.;
            travelDistance=length(onPlane*vec2(.85,1.));
          }
          vec2 liquidP=onPlane*2.1;
          float liquidNoise=0.,liquidAmp=.5;
          for(int i=0;i<4;i++){liquidNoise+=liquidAmp*noise(liquidP+uReveal*.2);liquidP*=2.03;liquidAmp*=.5;}
          float front=max(0.,uReveal-planeDelay)*planeSpeed-.6-travelDistance+(liquidNoise-.5)*2.4;
          float emerge=uReveal>=.999?1.:smoothstep(-.16,.16,front);
          vec3 wire=mix(uPaper,vec3(.88,.91,.95),contour(uv,px*.48));
          result=mix(wire,result,emerge);
          // A remembered surface loses certainty at its edges, without a hard vignette.
          vec2 memoryPlane=revealPoint.xy*.36+revealPoint.z*.19;
          float memoryNoise=noise(memoryPlane+vec2(uMemoryTime*.027,-uMemoryTime*.018));
          float periphery=smoothstep(.16,.62,length((uv-.5)*vec2(1.,.8)));
          float memoryAlpha=1.-periphery*(.17+.30*smoothstep(.28,.75,memoryNoise));
          float grey=luma(result);
          result=mix(vec3(grey),result,.82);
          result=mix(result,uPaper,.07+periphery*.09);
          float materialRegion=texture2D(tNormal,uv).a;
          float focalBoard=step(.15,materialRegion)*(1.-step(.35,materialRegion));
          float roomMemory=mix(1.-uScrollDecay*.46,1.,focalBoard);
          outputAlpha*=memoryAlpha*roomMemory;
          // The title component's tonal threshold is shared by the room and lettering.
          if(uEndSequence>=0.||uIntroSequence>=0.){
            float exitT=clamp(uEndSequence/3.1,0.,1.);
            float exitLevel=.84*(1.-exitT*exitT*(3.-2.*exitT));
            float roomValue=.012+lum*.76+noise(cssPixel*.026)*.055;
            float keep=step(.0001,exitLevel)*(1.-smoothstep(exitLevel-.004,exitLevel+.004,roomValue));
            float roomShift=.012+clamp((luma(displayColor(clamp(uv+vec2(.0025,-.0018),.002,.998)))-.5)*uContrast+.5,0.,1.)*.76+noise((cssPixel+vec2(2.,-1.))*.026)*.055;
            float fringe=step(.0001,exitLevel)*(1.-smoothstep(exitLevel-.004,exitLevel+.004,roomShift));
            float roomEdge=max(fringe-keep,0.);
            vec3 roomColor=mix(result,uInkB,roomEdge);
            float roomAlpha=step(.025,outputAlpha)*max(keep,fringe);
            // Same 4.5 s reveal, hold, and 3.1 s disintegration as opening-title/title.js.
            // Nine seconds for the shape transformation; the hold remains 1.5 s.
            float titleTime=uEndSequence<9.?max(0.,uEndSequence)*5.3/9.:
              (uEndSequence<10.5?5.3+(uEndSequence-9.):6.8+(uEndSequence-10.5)*3.1/4.);
            if(uIntroSequence>=0.)titleTime=uIntroSequence;
            float titleLevel=0.;
            if(titleTime>=.8&&titleTime<5.3){float r=(titleTime-.8)/4.5;titleLevel=.84*(1.-pow(1.-r*r,3.));}
            else if(titleTime<6.8&&titleTime>=5.3)titleLevel=.84;
            else if(titleTime<9.9&&titleTime>=6.8){float r=(titleTime-6.8)/3.1;float ease=r*r*r*(r*(r*6.-15.)+10.);titleLevel=.84*(1.-ease);}
            vec2 p=(vUv-.5)*uResolution;
            float artAspect=uIntroSequence>=0.?uIntroAspect:835./533.;
            float w=min(uResolution.x*.87,uResolution.y*.91*artAspect);
            float cycle=titleTime*.62831853;
            float angle=sin(cycle)*.006+sin(cycle*3.)*.002;
            p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
            p+=w*vec2(sin(cycle*2.)*.0017,cos(cycle)*.002);
            vec2 q=p/vec2(w,w/artAspect)+.5;q.y=1.-q.y;
            vec2 paper=q*vec2(835.,533.);
            float phaseTitle=titleTime*.65;
            vec2 boilTitle=vec2(noise(paper*.025+phaseTitle*vec2(.71,.43)),noise(paper*.026+phaseTitle*vec2(-.37,.61)))-.5;
            q+=boilTitle*vec2(1./835.,1./533.)*2.6;
            float a=titleInk(q,titleLevel);
            vec2 registration=vec2(.0025,-.0018)+vec2(sin(cycle*2.),cos(cycle*3.))*.00065;
            float titleEdge=max(titleInk(q+registration,titleLevel)-a,0.);
            float grainTitle=hash(floor(paper*1.4)),fiberTitle=noise(paper*.48);
            vec2 dotUV=mat2(.866,-.5,.5,.866)*paper/2.7;
            float dots=1.-smoothstep(.27,.45,length(fract(dotUV)-.5));
            float pits=smoothstep(.80,.96,grainTitle)*(.45+.55*fiberTitle);
            float coverage=clamp(.82+(fiberTitle-.5)*.32+(grainTitle-.5)*.20,0.,1.);
            vec3 printed=mix(uInkA*.64,uInkA*1.18,coverage);
            printed=mix(printed,uInkB,clamp((1.-dots)*.14+pits*.58,0.,1.));
            float inkCoverage=1.-smoothstep(.92,.995,grainTitle)*.72;
            float titleAlpha=max(a,titleEdge)*inkCoverage;
            vec3 titleColor=mix(uInkB,printed,a);
            // One threshold front transforms the existing silhouette into the glyphs.
            // At t=0 color and opacity are exactly the preceding studio frame.
            float morphT=clamp(uEndSequence/9.,0.,1.);
            // The liquid red-wipe grammar, projected independently onto each plane.
            vec2 wipePlane;float wipeDirection,wipePace;
            if(surfaceN.y>.65){
              wipePlane=revealPoint.xz*.18;
              wipeDirection=surfaceN.y>.65&&doorDelta.y>1.?-1.:1.;
              wipePace=doorDelta.y>1.?1.12:.91;
            }else if(surfaceN.x>surfaceN.z){
              wipePlane=revealPoint.zy*.23;wipeDirection=-1.;wipePace=1.04;
            }else{
              wipePlane=revealPoint.xy*.21;wipeDirection=1.;wipePace=.96;
            }
            vec2 wipeWarp=vec2(noise(wipePlane*1.8),noise(wipePlane*1.9+17.))-.5;
            float liquidWipe=noise(wipePlane*2.4+wipeWarp*.7)*.7+noise(wipePlane*4.8)*.3;
            float planeCoordinate=fract(wipePlane.x*wipeDirection*.21+wipePlane.y*.13+.5);
            float wipeOrder=clamp(planeCoordinate*.55+liquidWipe*.45,.02,.98);
            float wipeClock=pow(morphT,1./wipePace);
            float front=smoothstep(wipeOrder-.10,wipeOrder+.10,wipeClock);
            float base=morphT*morphT*(3.-2.*morphT);
            float morph=mix(base,front,sin(morphT*3.14159265)*.25);
            float roomPresent=1.-step(.99999,texture2D(tDepth,uv).x);
            float roomField=mix(-.30,.06+(1.-roomValue)*.43,roomPresent);
            // Extend the mask as white paper, using the same signed field on
            // both sides of the image edge. No rectangular domain cut.
            float borderDistance=min(min(q.x,1.-q.x),min(q.y,1.-q.y));
            float paperBorder=smoothstep(.004,.014,borderDistance);
            float letterValue=mix(1.,texture2D(tTitle,clamp(q,.004,.996)).r,paperBorder);
            float letterField=titleLevel-letterValue;
            float shapeField=mix(roomField,letterField,morph);
            float aa=max(fwidth(shapeField)*1.5,.005);
            float shape=smoothstep(-aa,aa,shapeField);
            float grainField=wipeOrder;
            float contourAA=max(fwidth(grainField)*1.25,.004);
            float ownership=smoothstep(grainField-contourAA,grainField+contourAA,wipeClock*1.12-.06);
            ownership=max(ownership,1.-roomPresent);
            float initialOpacity=outputAlpha;
            vec3 mergedColor=mix(result,titleColor,ownership);
            float mergedOpacity=mix(initialOpacity,inkCoverage,ownership);
            // Keep one cut silhouette all the way through; never crossfade masks.
            float finalPhase=smoothstep(.94,1.,morph);
            shape=max(shape,titleEdge*finalPhase);
            shape*=mix(1.,smoothstep(0.,.012,titleLevel),finalPhase);
            float alpha=shape*mergedOpacity;
            gl_FragColor=vec4(mergedColor*alpha,alpha);
            if(uIntroSequence>=0.){
              float introAlpha=max(a,titleEdge)*inkCoverage;
              float wireArrival=smoothstep(4.5,6.0,uIntroSequence);
              float wireLine=contour(uv,px*.48)*(1.-outside);
              float wireAlpha=wireLine*wireArrival*memoryAlpha*roomMemory;
              vec3 wireInk=vec3(.88,.91,.95);
              float materialArrival=smoothstep(4.8,8.8,uIntroSequence);
              float surfaceAlpha=outputAlpha*materialArrival;
              vec3 underColor=mix(wireInk*wireAlpha,result*surfaceAlpha,emerge);
              float underAlpha=mix(wireAlpha,surfaceAlpha,emerge);
              gl_FragColor=vec4(titleColor*introAlpha+underColor*(1.-introAlpha),introAlpha+underAlpha*(1.-introAlpha));
            }
          }else gl_FragColor=vec4(clamp(result,0.0,1.0)*outputAlpha,outputAlpha);
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
  resize(){const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.color.setSize(size.x,size.y);this.normal.setSize(Math.max(1,Math.round(size.x*.7)),Math.max(1,Math.round(size.y*.7)));this.uniforms.uResolution.value.copy(size);this.uniforms.uPixelRatio.value=this.renderer.getPixelRatio();
    const aspect=size.x/size.y;this.uniforms.uCardSize.value.set(aspect<.85?.88:Math.min(.84,1.25/aspect),aspect<.85?.72:.82);
    this.uniforms.uCardCenter.value.set(aspect<.85?.5:.47,.51);
  }
  get cardSize(){return this.uniforms.uCardSize.value;}
  get cardCenter(){return this.uniforms.uCardCenter.value;}
  setPan(x,y){const aspect=this.uniforms.uResolution.value.x/this.uniforms.uResolution.value.y;this.uniforms.uCardCenter.value.set((aspect<.85?.5:.47)+x,.51-y);}
  setViewMix(value){this.uniforms.uViewMix.value=value;}
  prepareNormals(scene){
    this.normalPairs=[];
    const room=new THREE.MeshNormalMaterial({side:THREE.DoubleSide,transparent:true,opacity:0,blending:THREE.NoBlending});
    const foreground=new THREE.MeshNormalMaterial({side:THREE.DoubleSide,transparent:true,opacity:.65,blending:THREE.NoBlending});
    scene.traverse(o=>{if(o.isMesh)this.normalPairs.push([o,o.material,o.userData.breakout?foreground:room]);});
  }
  render(scene,camera,time){
    this.uniforms.uInverseViewProjection.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
    this.uniforms.uTime.value=time;this.uniforms.uNear.value=camera.near;this.uniforms.uFar.value=camera.far;
    this.renderer.setRenderTarget(this.color);this.renderer.render(scene,camera);
    const stats={drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};
    const background=scene.background,override=scene.overrideMaterial;
    scene.background=this.normalBackground;scene.overrideMaterial=null;
    for(const [o,,normal]of this.normalPairs)o.material=normal;
    this.renderer.setRenderTarget(this.normal);this.renderer.render(scene,camera);
    for(const [o,original]of this.normalPairs)o.material=original;
    scene.overrideMaterial=override;scene.background=background;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene,this.camera);
    return stats;
  }
}
