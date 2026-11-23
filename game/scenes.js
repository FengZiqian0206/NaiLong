import LEVELS from './assets/levels.json?v=20261123b' with {type:'json'};
import {WORLD,samplePath,SCENE_COUNT,SCENE_LENGTH,TRANSITION_LENGTH} from './world.js?v=20261123b';

export {SCENE_COUNT,SCENE_LENGTH};
const sectorLength=SCENE_LENGTH+TRANSITION_LENGTH;
const placeholder={width:2172,height:724,platforms:[{x1:0,y1:558,x2:2172,y2:558,halfThickness:3}]};

export const PANELS=Array.from({length:SCENE_COUNT},(_,index)=>{
  const level=LEVELS['level'+(index+1)];
  const source=level ?? placeholder;
  const floors=source.platforms.filter(line=>line.x2-line.x1>source.width*.2 && line.y1>source.height*.7);
  const baseline=floors.reduce((sum,line)=>sum+line.y1,0)/floors.length;
  return {index,sceneIndex:index,source,baseline,start:sectorLength*index,
    length:SCENE_LENGTH,pixelScale:SCENE_LENGTH/source.width,
    image:level?'level'+(index+1)+'.png':null,isPlaceholder:!level};
});

function heightAt(panel,line,pixelX) {
  const t=(pixelX-line.x1)/(line.x2-line.x1);
  const y=line.y1+(line.y2-line.y1)*t;
  return (panel.baseline-y)*panel.pixelScale;
}

function edgeFloor(panel,atEnd) {
  return panel.source.platforms.filter(line=>line.x2-line.x1>panel.source.width*.2 &&
    (atEnd?line.x2>=panel.source.width-16:line.x1<=1))
    .sort((a,b)=>Math.abs(a.y1-panel.baseline)-Math.abs(b.y1-panel.baseline))[0];
}

export const TRANSITIONS=PANELS.map((panel,index)=>{
  const next=PANELS[(index+1)%SCENE_COUNT];
  const exit=edgeFloor(panel,true),entry=edgeFloor(next,false);
  const start=panel.start+panel.length,end=(index+1)*sectorLength;
  const exitTop=heightAt(panel,exit,exit.x2)+exit.halfThickness*panel.pixelScale;
  const entryTop=heightAt(next,entry,entry.x1)+entry.halfThickness*next.pixelScale;
  return {index,start,end,length:end-start,exitTop,entryTop,
    // The connector reaches the original mask stroke if it ends a few pixels early.
    groundStart:Math.min(start,panel.start+(exit.x2+1)*panel.pixelScale),
    image:index<2?'transition-'+(index+1)+'-'+(index+2)+'.jpg':null};
});

function wrapDistance(s) {
  if(s>=0 && s<WORLD.totalLength) return s;
  return ((s%WORLD.totalLength)+WORLD.totalLength)%WORLD.totalLength;
}
export function sceneAt(s) {
  return Math.min(SCENE_COUNT-1,Math.floor(wrapDistance(s)/sectorLength));
}
export function panelAt(s) {
  const panel=PANELS[sceneAt(s)];
  return wrapDistance(s)<panel.start+panel.length?panel:null;
}
export function transitionAt(s) {
  return panelAt(s)?null:TRANSITIONS[sceneAt(s)];
}
export function transitionTop(transition,s) {
  const t=Math.max(0,Math.min(1,(s-transition.start)/transition.length));
  const ease=t*t*(3-2*t);
  return transition.exitTop+(transition.entryTop-transition.exitTop)*ease;
}
export function worldAt(s,h=0) {
  const path=samplePath(s/WORLD.totalLength);
  return {...path,x:path.x+path.nx*h,y:path.y+path.ny*h,s,h};
}

export const COLLIDERS=[];
function addCollider(start,end,height,radius,metadata) {
  const add=(s0,s1,depth=0)=>{
    const a=worldAt(s0,height(s0)),b=worldAt(s1,height(s1)),mid=(s0+s1)/2;
    const m=worldAt(mid,height(mid));
    if(depth<10 && (Math.hypot(b.x-a.x,b.y-a.y)>.3 || Math.hypot(m.x-(a.x+b.x)/2,m.y-(a.y+b.y)/2)>.02)) {
      add(s0,mid,depth+1);
      add(mid,s1,depth+1);
      return;
    }
    COLLIDERS.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,radius,s0,s1,...metadata,id:metadata.platformId+':'+s0});
  };
  const steps=Math.max(1,Math.ceil((end-start)/.25));
  for(let j=0;j<steps;j++) add(start+(end-start)*j/steps,start+(end-start)*(j+1)/steps);
}
for(const panel of PANELS) for(const [platformIndex,line] of panel.source.platforms.entries()) {
  const start=panel.start+line.x1*panel.pixelScale,end=panel.start+line.x2*panel.pixelScale;
  addCollider(start,end,s=>heightAt(panel,line,(s-panel.start)/panel.pixelScale),line.halfThickness*panel.pixelScale,
    {platformId:panel.index+':'+platformIndex,sceneIndex:panel.index,tileIndex:panel.index,platformIndex});
}
for(const transition of TRANSITIONS) {
  addCollider(transition.groundStart,transition.end,s=>transitionTop(transition,s)-.15,.15,
    {platformId:'transition:'+transition.index,sceneIndex:transition.index,tileIndex:-1,platformIndex:-1});
}
export function floorPoint(s) {
  s=wrapDistance(s);
  const transition=transitionAt(s);
  if(transition) return worldAt(s,transitionTop(transition,s)+WORLD.radius);
  const panel=panelAt(s);
  const px=(s-panel.start)/panel.pixelScale;
  const floor=panel.source.platforms.filter(line=>line.x1-1e-8<=px && line.x2+1e-8>=px)
    .sort((a,b)=>Math.abs(heightAt(panel,a,px))-Math.abs(heightAt(panel,b,px)))[0];
  if(floor) return worldAt(s,heightAt(panel,floor,px)+floor.halfThickness*panel.pixelScale+WORLD.radius);
  const connector=TRANSITIONS[panel.index];
  if(s>=connector.groundStart) return worldAt(s,connector.exitTop+WORLD.radius);
  throw new RangeError('The requested route position is in a mask gap.');
}
export const SPAWN=floorPoint(.8);
export const GOAL=floorPoint(WORLD.totalLength-.8);
