import LEVELS from './assets/levels.json' with {type:'json'};
import {WORLD,samplePath} from './world.js?v=20261120f';
export const SCENE_COUNT=6;
export const PANELS_PER_SCENE=1;
export const SCENE_LENGTH=WORLD.totalLength/(SCENE_COUNT+.2);
export const TRANSITION={start:SCENE_LENGTH,end:SCENE_LENGTH*1.2,length:SCENE_LENGTH*.2};
const placeholder={width:2172,height:724,platforms:[{x1:0,x2:2172,y1:558,y2:558,halfThickness:3}]};
export const PANELS=Array.from({length:SCENE_COUNT},(_,sceneIndex)=>{
  const source=sceneIndex<2?LEVELS[`level${sceneIndex+1}`]:placeholder;
  // Per-image floor baselines align the artwork and all mask platforms at scene joins.
  const floors=source.platforms.filter(p=>p.x2-p.x1>source.width*.2 && p.y1>source.height*.7);
  const baseline=floors.reduce((sum,p)=>sum+p.y1,0)/floors.length;
  return {index:sceneIndex,sceneIndex,source,baseline,start:SCENE_LENGTH*(sceneIndex+(sceneIndex? .2:0)),
    length:SCENE_LENGTH,pixelScale:SCENE_LENGTH/source.width,
    image:sceneIndex<2?`level${sceneIndex+1}.png`:null,isPlaceholder:sceneIndex>=2};
});
// The garden path between the two supplied scenes has its own space on the route.
export function panelAt(s) {
  return PANELS.find(panel=>s>=panel.start && s<=panel.start+panel.length) ?? null;
}
export function sceneAt(s) {
  return panelAt(s)?.sceneIndex ?? (s<TRANSITION.end?0:SCENE_COUNT-1);
}
export function worldAt(s,h=0) {
  const p=samplePath(s/WORLD.totalLength);
  return {...p,x:p.x+p.nx*h,y:p.y+p.ny*h,s,h};
}
export const COLLIDERS=[];
function addCollider(start,end,height,radius,metadata) {
  const add=(s0,s1,depth=0)=>{
    const a=worldAt(s0,height(s0)),b=worldAt(s1,height(s1)),mid=(s0+s1)/2,m=worldAt(mid,height(mid));
    if(depth<10 && (Math.hypot(b.x-a.x,b.y-a.y)>.3 || Math.hypot(m.x-(a.x+b.x)/2,m.y-(a.y+b.y)/2)>.02)) {
      add(s0,mid,depth+1);add(mid,s1,depth+1);return;
    }
    COLLIDERS.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,radius,s0,s1,...metadata,id:`${metadata.platformId}:${s0}`});
  };
  const steps=Math.max(1,Math.ceil((end-start)/.25));
  for(let j=0;j<steps;j++) add(start+(end-start)*j/steps,start+(end-start)*(j+1)/steps);
}
for(const panel of PANELS) for(const [platformIndex,line] of panel.source.platforms.entries()) {
  const start=panel.start+line.x1*panel.pixelScale,end=panel.start+line.x2*panel.pixelScale;
  const h=(panel.baseline-line.y1)*panel.pixelScale;
  addCollider(start,end,()=>h,line.halfThickness*panel.pixelScale,{platformId:`${panel.index}:${platformIndex}`,
    sceneIndex:panel.sceneIndex,tileIndex:panel.index,platformIndex});
}
function edgeTop(panel,atEnd) {
  const line=panel.source.platforms.find(p=>atEnd?p.x2>=panel.source.width-1:p.x1===0);
  return (panel.baseline-line.y1+line.halfThickness)*panel.pixelScale;
}
export function transitionTop(s) {
  const t=Math.max(0,Math.min(1,(s-TRANSITION.start)/TRANSITION.length)),ease=t*t*(3-2*t);
  return edgeTop(PANELS[0],true)*(1-ease)+edgeTop(PANELS[1],false)*ease;
}
addCollider(TRANSITION.start,TRANSITION.end,s=>transitionTop(s)-.15,.15,
  {platformId:'transition',sceneIndex:0,tileIndex:-1,platformIndex:-1});
export function floorPoint(s) {
  s=Math.max(0,Math.min(WORLD.totalLength,s));
  if(s>=TRANSITION.start && s<=TRANSITION.end) return worldAt(s,transitionTop(s)+WORLD.radius);
  const panel=panelAt(s) ?? PANELS.at(-1);
  const px=(s-panel.start)/panel.pixelScale;
  const floor=panel.source.platforms.filter(p=>p.x1<=px&&p.x2>=px).sort((a,b)=>Math.abs(a.y1-panel.baseline)-Math.abs(b.y1-panel.baseline))[0];
  if(!floor) throw new RangeError('The requested route position is in a mask gap.');
  const h=(panel.baseline-floor.y1+floor.halfThickness)*panel.pixelScale+WORLD.radius;
  return worldAt(s,h);
}
export const SPAWN=floorPoint(.8);
export const GOAL=floorPoint(WORLD.totalLength-.8);
