
export function installMapBridge(adapter){
 if(window.parent===window)return;
 const post=data=>parent.postMessage({channel:'green-hour-map',...data},location.origin);
 let down=null,moved=false;
 const interactive=e=>!!e.target.closest('button,input,select,summary,[contenteditable]');
 document.addEventListener('pointerdown',e=>{if(e.button!==0||interactive(e))return;down={x:e.screenX,y:e.screenY,lastX:e.screenX,lastY:e.screenY};moved=false;try{document.documentElement.setPointerCapture(e.pointerId);}catch{}post({type:'begin'});},true);
 document.addEventListener('pointermove',e=>{if(!down)return;const dx=e.screenX-down.lastX,dy=e.screenY-down.lastY;if(Math.hypot(e.screenX-down.x,e.screenY-down.y)>5)moved=true;if(moved)post({type:'drag',dx,dy});down.lastX=e.screenX;down.lastY=e.screenY;},true);
 document.addEventListener('pointerup',e=>{if(!down)return;const click=!moved&&!interactive(e);down=null;post({type:'end'});if(!click){adapter.dragEnd?.();e.stopImmediatePropagation();return;}adapter.click?.(e);},true);
 document.addEventListener('pointercancel',()=>{down=null;adapter.dragEnd?.();post({type:'end'});},true);
 document.addEventListener('wheel',e=>{if(interactive(e))return;e.preventDefault();e.stopImmediatePropagation();const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;post({type:'wheel',dx:e.deltaX*unit,dy:e.deltaY*unit,ctrl:e.ctrlKey,shift:e.shiftKey});},{passive:false,capture:true});
 document.addEventListener('keydown',e=>{if(interactive(e))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','Escape','KeyM','Digit1','Digit2','Space','Enter'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();post({type:'key',code:e.code,shift:e.shiftKey});}},true);
 window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.channel!=='green-hour-map')return;const m=e.data;if(m.type==='layout')adapter.layout?.(m);if(m.type==='viewport')adapter.viewport?.(m);if(m.type==='palette')adapter.palette?.(m);if(m.type==='command')adapter.command?.(m);});
 post({type:'ready'});
 return {state:chapter=>post({type:'state',chapter}),focus:()=>post({type:'focus'})};
}
