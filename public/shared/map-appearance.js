// Apply neutral-by-default stack adjustments after the card's own treatment.
export function applyMapAppearance(pass,color={},print={}){
 for(const [key,value] of Object.entries(print))if(key in pass.settings)pass.set(key,value);
 for(const region of Object.keys(pass.grades))for(const [key,value] of Object.entries(color)){
  if(!(key in pass.grades[region])||!Number.isFinite(value))continue;
  const current=pass.grades[region][key];pass.setGrade(region,key,['contrast','saturation'].includes(key)?current*value:current+value);
 }
 if(pass.uniforms.uFloor0){const a=pass.uniforms.uFloor0.value,b=pass.uniforms.uFloor1.value;a.x+=color.exposure||0;a.y*=color.contrast??1;a.z+=color.shadows||0;a.w+=color.highlights||0;b.x*=color.saturation??1;b.y+=color.temperature||0;b.z+=color.tint||0;b.w+=color.value||0;}
}
