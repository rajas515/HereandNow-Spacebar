// H.264 in an ISO MP4 container, with explicit Rec.709 color metadata.
const bytes=(...parts)=>{const arrays=parts.map(p=>typeof p==='string'?new TextEncoder().encode(p):p);const out=new Uint8Array(arrays.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of arrays){out.set(p,offset);offset+=p.length;}return out;};
const u32=(...values)=>{const out=new Uint8Array(values.length*4),view=new DataView(out.buffer);values.forEach((v,i)=>view.setUint32(i*4,v));return out;};
const u16=(...values)=>{const out=new Uint8Array(values.length*2),view=new DataView(out.buffer);values.forEach((v,i)=>view.setUint16(i*2,v));return out;};
const zero=n=>new Uint8Array(n),box=(name,...data)=>{const body=bytes(...data);return bytes(u32(body.length+8),name,body);};
const full=(name,version,flags,...data)=>box(name,new Uint8Array([version,flags>>16,flags>>8,flags]),...data);
const matrix=u32(65536,0,0,0,65536,0,0,0,1073741824);
function mp4(samples,description,width,height){
 const duration=samples.length*1000;
 const ftyp=box('ftyp','isom',u32(512),'isomiso2avc1mp41');
 const media=box('mdat',...samples.map(s=>s.data));
 const mvhd=full('mvhd',0,0,u32(0,0,30000,duration,65536),u16(256,0),zero(8),matrix,zero(24),u32(2));
 const tkhd=full('tkhd',0,7,u32(0,0,1,0,duration),zero(8),u16(0,0,0,0),matrix,u32(width*65536,height*65536));
 const mdhd=full('mdhd',0,0,u32(0,0,30000,duration),u16(21956,0));
 const hdlr=full('hdlr',0,0,u32(0),'vide',zero(12),'VideoHandler\0');
 const avc1=box('avc1',zero(6),u16(1),zero(16),u16(width,height),u32(4718592,4718592,0),u16(1),zero(32),u16(24,65535),box('avcC',description),box('colr','nclx',u16(1,1,1),new Uint8Array([0])));
 const stsd=full('stsd',0,0,u32(1),avc1);
 const stts=full('stts',0,0,u32(1,samples.length,1000));
 const stsc=full('stsc',0,0,u32(1,1,samples.length,1));
 const stsz=full('stsz',0,0,u32(0,samples.length),u32(...samples.map(s=>s.data.length)));
 const stco=full('stco',0,0,u32(1,ftyp.length+8));
 const keys=samples.flatMap((s,i)=>s.key?[i+1]:[]);
 const stss=full('stss',0,0,u32(keys.length,...keys));
 const stbl=box('stbl',stsd,stts,stsc,stsz,stco,stss);
 const dinf=box('dinf',full('dref',0,0,u32(1),full('url ',0,1)));
 const minf=box('minf',full('vmhd',0,1,u16(0,0,0,0)),dinf,stbl);
 return new Blob([ftyp,media,box('moov',mvhd,box('trak',tkhd,box('mdia',mdhd,hdlr,minf)))],{type:'video/mp4'});
}
export async function downloadLoop(source,onProgress){
 if(!globalThis.VideoEncoder)throw Error('MP4 export needs a browser with video encoding support, such as Chrome or Edge.');
 const width=1920,height=1080,fps=30,count=14*fps;
 const config={codec:'avc1.640028',width,height,bitrate:3000000,bitrateMode:'variable',framerate:fps,latencyMode:'realtime',avc:{format:'avc'}};
 const support=await VideoEncoder.isConfigSupported(config);if(!support.supported)throw Error('This browser cannot encode H.264 MP4 at 1080p. Try Chrome or Edge.');
 const title=document.createElement('grave-title');title.paused=true;title.renderWidth=width;title.renderHeight=height;title.settings={...source.settings};title.style.cssText='position:fixed;left:-10000px;width:1920px;height:1080px;pointer-events:none';
 document.body.append(title);
 const samples=[];let description,error,encoder;
 try{
  const deadline=performance.now()+15000;
  while(!title.ready||!title.renderAt){if(performance.now()>deadline)throw Error('The title image could not be loaded for export.');await new Promise(r=>setTimeout(r,30));}
  encoder=new VideoEncoder({output(chunk,metadata){const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);samples.push({data,key:chunk.type==='key'});if(metadata?.decoderConfig?.description)description=new Uint8Array(metadata.decoderConfig.description);},error(e){error=e;}});
  encoder.configure(config);
  const canvas=title.shadowRoot.querySelector('canvas');
  for(let i=0;i<count;i++){
   if(error)throw error;
   title.renderAt(i/fps);
   const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1000000/fps),duration:Math.round(1000000/fps),colorSpace:{primaries:'bt709',transfer:'bt709',matrix:'rgb',fullRange:true}});
   try{encoder.encode(frame,{keyFrame:i%60===0});}finally{frame.close();}
   if(i%5===0){onProgress(Math.round((i+1)/count*100));await new Promise(r=>setTimeout(r,0));}
   if(encoder.encodeQueueSize>8)await encoder.flush();
  }
  await encoder.flush();if(error)throw error;if(!description||samples.length!==count)throw Error('The video encoder did not produce a complete loop.');
  const blob=mp4(samples,description,width,height),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='take-it-to-the-grave-loop.mp4';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);onProgress(100);return blob;
 }finally{if(encoder&&encoder.state!=='closed')encoder.close();title.remove();}
}
