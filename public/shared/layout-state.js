export function mergeSavedLayout(defaults,saved){
 const result=structuredClone(defaults);
 for(const [id,cards]of Object.entries(result))for(const [key,cfg]of Object.entries(cards)){
  const old=saved?.[id]?.[key];if(!old)continue;
  for(const field of Object.keys(cfg))if(field!=='label'&&field!=='color'&&Number.isFinite(old[field]))cfg[field]=old[field];
  for(const field of Object.keys(cfg.color||{}))if(Number.isFinite(old.color?.[field]))cfg.color[field]=old.color[field];
 }
 return result;
}
