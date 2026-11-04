// Cyan annotation traced in its supplied image coordinates.
const trace=[[107,59],[129,54],[258.8,22.46],[321.7,9.17],[343.39,7.96],[441.0,4.33],[494.14,4.33],[560.3,9.17],[614.52,15.21],[668.75,22.46],[693.69,30.92],[779.37,29.71],[695.86,91.33],[698.03,179.53],[818.41,125.16],[816,158],[821,257],[823,339],[814,406],[804,457],[789,456],[746,435],[704,433],[588,446],[610,472],[611,481],[583,478],[566,468],[553,450],[278,444],[263,481],[236,476],[215,484],[159,476],[148,447],[142,410],[125,347],[118,307],[118,251],[125,206],[136,150],[98,125],[111,96],[114,79]];
export function roomCutOutline(){
 // Map annotation to the centered authored composition, then undo the print
 // lens. The resulting silhouette is projected from a fixed world camera.
 const aspect=1.42,lens=.58,stretch=1.12;
 return trace.map(([x,y])=>{
  let u=.017+(x-56)/770*.90,v=.235+(y-14)/470*.765;
  let px=(u-.5)/stretch*aspect,py=v-.5;
  const scale=(1+lens*(px*px+py*py))/(1+lens*.16);
  return [.5+px*scale/aspect,.5+py*scale];
 });
}
