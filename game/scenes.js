import LEVELS from './assets/levels.json' with {type:'json'};
import {WORLD,samplePath} from './world.js';
export const SCENE_COUNT=6;
export const PANELS_PER_SCENE=3;
export const SCENE_LENGTH=WORLD.totalLength/SCENE_COUNT;
const panelLength=SCENE_LENGTH/PANELS_PER_SCENE;
export const PANELS=Array.from({length:SCENE_COUNT*PANELS_PER_SCENE},(_,i)=>{
  const sceneIndex=Math.floor(i/PANELS_PER_SCENE),source=LEVELS[sceneIndex%2?'level2':'level1'];
  // Per-image floor baselines align the artwork and all mask platforms at scene joins.
  const floors=source.platforms.filter(p=>p.x2-p.x1>source.width*.2 && p.y1>source.height*.7);
  const baseline=floors.reduce((sum,p)=>sum+p.y1,0)/floors.length;
  return {index:i,sceneIndex,source,baseline,start:i*panelLength,length:panelLength,pixelScale:panelLength/source.width,
    image:sceneIndex%2?'level2.png':'level1.png'};
});
export function worldAt(s,h=0) {
  const p=samplePath(s/WORLD.totalLength);
  return {...p,x:p.x+p.nx*h,y:p.y+p.ny*h,s,h};
}
export const COLLIDERS=[];
for(const panel of PANELS) for(const [platformIndex,line] of panel.source.platforms.entries()) {
  const start=panel.start+line.x1*panel.pixelScale,end=panel.start+line.x2*panel.pixelScale;
  const h=(panel.baseline-line.y1)*panel.pixelScale;
  const add=(s0,s1,depth=0)=>{
    const a=worldAt(s0,h),b=worldAt(s1,h),mid=(s0+s1)/2,m=worldAt(mid,h);
    if(depth<10 && (Math.hypot(b.x-a.x,b.y-a.y)>.3 || Math.hypot(m.x-(a.x+b.x)/2,m.y-(a.y+b.y)/2)>.02)) {
      add(s0,mid,depth+1);add(mid,s1,depth+1);return;
    }
    COLLIDERS.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,radius:line.halfThickness*panel.pixelScale,s0,s1,
      id:`${panel.index}:${platformIndex}:${s0}`,platformId:`${panel.index}:${platformIndex}`,
      sceneIndex:panel.sceneIndex,tileIndex:panel.index,platformIndex});
  };
  const steps=Math.max(1,Math.ceil((end-start)/.25));
  for(let j=0;j<steps;j++) add(start+(end-start)*j/steps,start+(end-start)*(j+1)/steps);
}
export function floorPoint(s) {
  const panel=PANELS[Math.min(PANELS.length-1,Math.floor(s/panelLength))];
  const px=(s-panel.start)/panel.pixelScale;
  const floor=panel.source.platforms.filter(p=>p.x1<=px&&p.x2>=px).sort((a,b)=>Math.abs(a.y1-panel.baseline)-Math.abs(b.y1-panel.baseline))[0];
  const h=(panel.baseline-floor.y1+floor.halfThickness)*panel.pixelScale+WORLD.radius;
  return worldAt(s,h);
}
export const SPAWN=floorPoint(.8);
export const GOAL=floorPoint(WORLD.totalLength-.8);
