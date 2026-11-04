// Standalone component: import this module, then add <grave-title>.
export const DEFAULT_SETTINGS=Object.freeze({paper:'#1e1128',ink:'#2e29c4',accent:'#ff006e',edge:true,wobble:1,grain:1,riso:1,bloom:0,bloomRadius:1});
const asset=new URL('./lettering.png',import.meta.url);
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D lettering;uniform vec2 resolution;uniform float threshold;uniform float time;uniform float transparent;uniform vec3 paperColor,inkColor,accentColor;uniform float edgeEnabled,wobble,grainAmount,riso,bloom,bloomRadius;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float ink(vec2 p,float level){if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)return 0.;float v=texture2D(lettering,p).r;return step(.0001,level)*(1.-smoothstep(level-.004,level+.004,v));}
void main(){
 float phase=floor(mod(time,10.)*8.);float cycle=time*.62831853;
 vec2 p=(uv-.5)*resolution;float w=min(resolution.x*.87,resolution.y*1.42);
 // A small whole-print sway plus the same eight-frame ink boil used by the rooms.
 float angle=(sin(cycle)*.006+sin(cycle*3.)*.002)*wobble;
 p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
 p+=w*wobble*vec2(sin(cycle*2.)*.0017,cos(cycle)*.002);
 vec2 q=p/vec2(w,w*533./835.)+.5;q.y=1.-q.y;
 vec2 paper=q*vec2(835.,533.);
 vec2 boil=vec2(noise(paper*.025+phase*vec2(.71,.43)),noise(paper*.026+phase*vec2(-.37,.61)))-.5;
 q+=boil*vec2(1./835.,1./533.)*2.6*wobble;
 float grain=hash(floor(paper*1.4));float fiber=noise(paper*.48);
 vec3 bg=paperColor;bg+=((grain-.5)*.075+(fiber-.5)*.028)*grainAmount;
 float a=ink(q,threshold);vec2 registration=vec2(.0025,-.0018)+vec2(sin(cycle*2.),cos(cycle*3.))*.00065;
 float fringe=ink(q+registration,threshold);
 float edge=max(fringe-a,0.)*edgeEnabled;
 // Broken ink coverage and two angled dot screens keep the fill visibly printed.
 vec2 dotUV=mat2(.866,-.5,.5,.866)*paper/2.7;
 float dots=1.-smoothstep(.27,.45,length(fract(dotUV)-.5));
 float pits=smoothstep(.80,.96,grain)*(.45+.55*fiber);
 float coverage=clamp(.82+(fiber-.5)*.32+(grain-.5)*.20,0.,1.);
 vec3 blue=inkColor;vec3 pink=accentColor;
 vec3 printed=mix(blue,mix(blue*.64,blue*1.18,coverage),riso);printed=mix(printed,pink,clamp(((1.-dots)*.14+pits*.58)*riso,0.,1.));
 float inkCoverage=1.-smoothstep(.92,.995,grain)*.72*min(riso,1.);
 vec3 color=mix(bg,pink,edge*inkCoverage);color=mix(color,printed,a*inkCoverage);
 float halo=0.;
 if(bloom>.001){for(int i=0;i<12;i++){float theta=float(i)*.5235988;vec2 direction=vec2(cos(theta),sin(theta));halo+=ink(q+direction*vec2(1./835.,1./533.)*bloomRadius*3.,threshold)*.055;halo+=ink(q+direction*vec2(1./835.,1./533.)*bloomRadius*8.,threshold)*.028;}}
 color+=blue*halo*bloom*.65;
 float alpha=max(max(a,edge)*inkCoverage,clamp(halo*bloom*.65,0.,1.));gl_FragColor=vec4(color,mix(1.,alpha,transparent));
}`;
export class GraveTitle extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this.shadowRoot.innerHTML='<style>:host{display:block;position:relative}canvas{width:100%;height:100%;display:block}</style><canvas role="img" aria-label="Take it to the grave, animated calligraphy"></canvas>';this._paused=matchMedia('(prefers-reduced-motion: reduce)').matches;this._threshold=this._paused?.84:0;this.elapsed=0;this.settings={...DEFAULT_SETTINGS};}
 connectedCallback(){if(this.gl)return;const canvas=this.shadowRoot.querySelector('canvas'),gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false});if(!gl){this.shadowRoot.innerHTML='<p>WebGL is required to preview the title.</p>';return;}this.gl=gl;
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const uniforms=Object.fromEntries(['resolution','threshold','time','transparent','paperColor','inkColor','accentColor','edgeEnabled','wobble','grainAmount','riso','bloom','bloomRadius'].map(k=>[k,gl.getUniformLocation(program,k)]));
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 const image=new Image();image.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);this.ready=true;};image.src=asset.href;
 // A smooth asymmetric curve gives the reveal a long, gentle deceleration.
 let previous=0;const smooth=x=>x*x*(3-2*x), reveal=x=>1-Math.pow(1-x*x,3);
 const draw=()=>{ const dpr=Math.min(devicePixelRatio,2),w=this.renderWidth||Math.round(this.clientWidth*dpr),h=this.renderHeight||Math.round(this.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}if(this.ready){const settings=this.settings;for(const [uniform,key] of [['paperColor','paper'],['inkColor','ink'],['accentColor','accent']]){const hex=settings[key];gl.uniform3f(uniforms[uniform],...([1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)));}for(const [uniform,key] of [['wobble','wobble'],['grainAmount','grain'],['riso','riso'],['bloom','bloom'],['bloomRadius','bloomRadius']])gl.uniform1f(uniforms[uniform],settings[key]);gl.uniform1f(uniforms.edgeEnabled,settings.edge?1:0);gl.uniform2f(uniforms.resolution,w,h);gl.uniform1f(uniforms.threshold,this._threshold);gl.uniform1f(uniforms.time,this.elapsed);gl.uniform1f(uniforms.transparent,this.hasAttribute('transparent')?1:0);gl.drawArrays(gl.TRIANGLES,0,6);}};
 this.renderAt=seconds=>{this.elapsed=seconds;const t=seconds%14;this._threshold=t<.8?0:t<5.3?.84*reveal((t-.8)/4.5):t<10.3?.84:t<13.4?.84*(1.-smooth((t-10.3)/3.1)):0;draw();};
 const frame=now=>{if(!this.isConnected)return;const dt=previous?Math.min((now-previous)/1000,.1):0;previous=now;if(!this._paused){this.elapsed+=dt;const t=this.elapsed%14;this._threshold=t<.8?0:t<5.3?.84*reveal((t-.8)/4.5):t<10.3?.84:t<13.4?.84*(1.-smooth((t-10.3)/3.1)):0;}
 draw();this.dispatchEvent(new CustomEvent('thresholdchange',{detail:this._threshold}));this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);
 }
 disconnectedCallback(){cancelAnimationFrame(this.frame);this.gl?.getExtension('WEBGL_lose_context')?.loseContext();this.gl=null;}
 get paused(){return this._paused}set paused(value){this._paused=Boolean(value)}
 get threshold(){return this._threshold}set threshold(value){this._threshold=Math.max(0,Math.min(.98,Number(value)));this._paused=true;}
 replay(){this.elapsed=0;this._paused=false;}
}
customElements.define('grave-title',GraveTitle);

