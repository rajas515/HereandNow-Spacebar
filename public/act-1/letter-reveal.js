const paragraphs=[
"Dear all,",
"We have gathered here today to mourn the tragic passing of our beloved Exhibition Design, following a long and courageous battle against the architects of its demise. A cherished sanctuary for all who found their way through its doors, an anchor to most, and an old friend to others, Exhib was like a world of its own.",
"While we mourn this loss, we also come together to honour and celebrate a life well lived. A life dedicated to cultivating a safe space for young, curious minds to learn, grow, question, and create. A life shaped by the stories lived within its walls and the memories they left behind.",
"For nearly five decades, Exhibition Design has been a valuable part of this community, this nation, and the ever-evolving realm of design. Through its people and their work, it has shaped how stories are told, spaces are experienced, and ideas are brought to life. Its legacy lives on in the exhibitions created, the boundaries pushed, and the countless ways its graduates have contributed to the world beyond these walls.",
"As we come together to bid Exhib a fond farewell, we take this opportunity to cherish everything it is, everything it gave us, and everything it leaves behind.",
"So come one, come all, as we reminisce, laugh, reflect, and pay our respects. Let’s remember Exhib in all its forms: the brilliant, the bizarre, the chaotic and the unforgettable. For every life is made up of stories, and this one belongs to us."
];
export class LetterReveal{
 // host (optional): draw through the exhibition's shared renderer and live in the card's document.
 constructor(host={}){
  this.root=host.documentElement||document.documentElement;
  this.active=false;this.started=0;this.words=[];
  this.el=document.createElement('section');this.el.id='memorial-letter';this.el.hidden=true;this.el.setAttribute('aria-label','A farewell to Exhibition Design');
  this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');this.el.append(this.canvas);
  const readable=document.createElement('div');readable.className='letter-readable';for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;readable.append(p);}this.el.append(readable);(host.body||document.body).append(this.el);
  this.gl=host.createGL?host.createGL(this.canvas,{alpha:false,antialias:false}):this.canvas.getContext('webgl',{alpha:false,antialias:false});this.init();
  this.el.addEventListener('wheel',()=>{this.manualUntil=performance.now()+6000;},{passive:true});this.el.addEventListener('touchstart',()=>{this.manualUntil=performance.now()+6000;},{passive:true});
  window.addEventListener('resize',()=>{if(this.active)this.layout();});
 }
 init(){const g=this.gl;const compile=(type,source)=>{const s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s;};
  const p=g.createProgram();g.attachShader(p,compile(g.VERTEX_SHADER,`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`));
  g.attachShader(p,compile(g.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;uniform sampler2D mask,order;uniform float elapsed,total;uniform vec2 resolution;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float ink(vec2 q){vec4 m=texture2D(mask,q);float index=texture2D(order,q).r*255.+texture2D(order,q).g*65280.;float t=clamp((elapsed-.65-index*.215)/.85,0.,1.);float level=.84*(1.-pow(1.-t*t,3.));float exit=clamp((elapsed-total-8.)/4.,0.,1.);level*=1.-exit*exit*(3.-2.*exit);vec2 paper=q*resolution;float value=(1.-m.a)+m.a*(.035+noise(paper*.09)*.42+noise(paper*.38)*.15);return smoothstep(0.,.015,level)*(1.-smoothstep(level-.012,level+.012,value));}
void main(){vec2 q=vec2(uv.x,1.-uv.y);vec2 paper=q*resolution;float phase=elapsed*.65;vec2 boil=vec2(noise(paper*.025+phase*vec2(.71,.43)),noise(paper*.026+phase*vec2(-.37,.61)))-.5;q+=boil/resolution*.65;
float a=ink(q);float fringe=max(ink(q+vec2(1.5,-1.)/resolution)-a,0.);float grain=hash(floor(paper*1.4));float coverage=1.-smoothstep(.94,.999,grain)*.50;
vec3 bg=vec3(.102,.114,.290);vec3 blue=vec3(.50,.56,.96),pink=vec3(.992,.008,.502);float last=texture2D(mask,q).r;vec3 fill=mix(blue,pink,last);fill=mix(fill,pink,smoothstep(.87,.99,grain)*.18);vec3 c=mix(bg,pink,fringe*coverage);c=mix(c,fill,a*coverage);gl_FragColor=vec4(c,1.);}`));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));g.useProgram(p);this.program=p;
  const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),g.STATIC_DRAW);const loc=g.getAttribLocation(p,'position');g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,2,g.FLOAT,false,0,0);
  this.u=Object.fromEntries(['elapsed','total','resolution'].map(k=>[k,g.getUniformLocation(p,k)]));this.textures=['mask','order'].map((name,i)=>{const t=g.createTexture();g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,name==='order'?g.NEAREST:g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,name==='order'?g.NEAREST:g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.uniform1i(g.getUniformLocation(p,name),i);return t;});
 }
 layout(){
  const width=Math.min(950,innerWidth-56),font=innerWidth<650?25:33,line=font*1.55,pad=innerHeight*.48;
  const measure=document.createElement('canvas').getContext('2d');measure.font=`400 ${font}px Georgia, Times New Roman, serif`;
  this.words=[];let y=pad+font,index=0;
  paragraphs.forEach((para,pi)=>{let x=0;for(const word of para.split(/\s+/)){const w=measure.measureText(word).width;if(x+w>width){x=0;y+=line;}this.words.push({word,x,y,w,index:index++,last:pi===paragraphs.length-1});x+=w+measure.measureText(' ').width;}y+=line*(pi===0?1.1:1.8);});
  const height=Math.ceil(y+innerHeight*.55);this.canvas.style.width=width+'px';this.canvas.style.height=height+'px';this.canvas.width=Math.round(width*1.5);this.canvas.height=Math.round(height*1.5);
  const masks=[0,1].map(()=>{const c=document.createElement('canvas');c.width=this.canvas.width;c.height=this.canvas.height;return c;});
  masks.forEach((c,j)=>{const ctx=c.getContext('2d');ctx.scale(1.5,1.5);ctx.font=measure.font;for(const word of this.words){ctx.fillStyle=j?`rgb(${word.index%256},${Math.floor(word.index/256)},0)`:(word.last?'#ff0000':'#000000');if(j)ctx.fillRect(word.x-1,word.y-font-2,word.w+3,line);else ctx.fillText(word.word,word.x,word.y);}});
  const g=this.gl;g.viewport(0,0,this.canvas.width,this.canvas.height);masks.forEach((c,i)=>{g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,this.textures[i]);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,c);});g.uniform2f(this.u.resolution,this.canvas.width,this.canvas.height);
 }
 start(now){if(this.active)return;this.active=true;this.started=now;this.el.hidden=false;this.el.scrollTop=0;this.manualUntil=0;this.layout();this.root.dataset.letter='revealing';}
 stop(){if(!this.active)return;this.active=false;this.el.hidden=true;this.root.dataset.letter='hidden';}
 get revealDuration(){return paragraphs.join(' ').split(/\s+/).length*.215+1.5;}
 get duration(){return this.revealDuration+12;}
 update(seconds){if(!this.active)return;const elapsed=Math.max(0,seconds);const g=this.gl;g.useProgram(this.program);g.uniform1f(this.u.elapsed,elapsed);g.uniform1f(this.u.total,this.revealDuration);g.drawArrays(g.TRIANGLES,0,6);
  const index=Math.max(0,Math.min(this.words.length-1,Math.floor((elapsed-.65)/.215)));const word=this.words[index];
  // Page progress drives both the words and their vertical journey. No nested scroll.
  const travel=Math.max(0,elapsed-1.5)/Math.max(1,this.revealDuration-1.5);
  const last=this.words[this.words.length-1];const offset=Math.max(0,last.y-innerHeight*.68)*Math.min(1,travel);
  this.canvas.style.transform=`translateY(${-offset}px)`;
  this.root.dataset.letterWord=String(index+1);this.root.dataset.letter=elapsed>=this.duration?'empty':elapsed>=this.revealDuration+8?'dissolving':elapsed>=this.revealDuration?'reading':'revealing';
 }
}
