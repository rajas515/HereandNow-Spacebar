// Same world-units-per-pixel as standalone drag. The off-axis view removes
// the flat reference-plane translation already supplied by the parent map.
export function mapCameraOffset(viewport,height,fov,eyeHeight,referenceHeight,limit){
 const units=2*Math.max(.05,eyeHeight-referenceHeight)*Math.tan(fov*Math.PI/360)/Math.max(1,height);
 const clamp=v=>Math.max(-limit,Math.min(limit,v));
 const x=viewport.overview?0:clamp(-(viewport.localPanX||0)*units),y=viewport.overview?0:clamp(-(viewport.localPanY||0)*units);
 return {x,y,offsetX:-x/units,offsetY:-y/units};
}
export function applyMapCamera(camera,pan,viewport,width,height,referenceHeight,limit){
 const result=mapCameraOffset(viewport,height,camera.fov,camera.position.y,referenceHeight,limit);
 pan.set(result.x,result.y);camera.setViewOffset(width,height,result.offsetX,result.offsetY,width,height);
 return result;
}
