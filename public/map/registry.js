export const CARDS=Object.freeze([
 {id:'disco',label:'Disco ball',zoom:true},
 {id:'architecture',label:'Architecture',zoom:true},
 {id:'in-the-life-of',label:'In the life of',zoom:true},
 {id:'skeletons-in-the-closet',label:'Skeletons in the closet',zoom:false},
 {id:'opening-title',label:'Opening title',zoom:false},
 {id:'take-it-to-the-grave',label:'Take it to the grave',zoom:false}
]);
export function sceneBounds(nodes,w=1,h=1){const rects=nodes.map(n=>screenRect(n,{x:0,y:0,z:1},w,h));return {left:Math.min(...rects.map(r=>r.left/w)),right:Math.max(...rects.map(r=>r.right/w)),top:Math.min(...rects.map(r=>r.top/h)),bottom:Math.max(...rects.map(r=>r.bottom/h))};}
export function overviewPose(nodes,w,h){const b=sceneBounds(nodes,w,h),z=Math.min(.65,.87/(b.right-b.left),.80/(b.bottom-b.top));return {z,x:w/2-(b.left+b.right)*w*z/2,y:h/2-(b.top+b.bottom)*h*z/2};}
export function screenRect(node,pan,w,h){const size=node.size||1,a=(node.rotation||0)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));const width=size*pan.z*(w*c+h*s),height=size*pan.z*(h*c+w*s),cx=pan.x+(node.x+.5)*w*pan.z,cy=pan.y+(node.y+.5)*h*pan.z;return {left:cx-width/2,right:cx+width/2,top:cy-height/2,bottom:cy+height/2,width,height,cx,cy};}
export function presence(rect,w,h){return Math.max(0,Math.min(w,rect.right)-Math.max(0,rect.left))*Math.max(0,Math.min(h,rect.bottom)-Math.max(0,rect.top))/Math.max(1,rect.width*rect.height);}

// Camera displacement in the card's own unscaled, unrotated CSS pixels.
export function localCardOffset(node,pan,w,h){
 const x=pan.x+(node.x+.5)*w*pan.z-w/2,y=pan.y+(node.y+.5)*h*pan.z-h/2;
 const scale=Math.max(.001,pan.z*(node.size||1)),a=(node.rotation||0)*Math.PI/180;
 return {x:(x*Math.cos(a)+y*Math.sin(a))/scale,y:(-x*Math.sin(a)+y*Math.cos(a))/scale};
}
