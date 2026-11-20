import assert from 'node:assert/strict';
import {WORLD,PHYSICS,createPlayer,resetPlayer,stepPlayer,nearestSurface,samplePath} from './physics.js';
import {nearestPath} from './world.js';
import {COLLIDERS,SPAWN,GOAL,PANELS,worldAt} from './scenes.js';

const dt=PHYSICS.fixedDt;
assert.equal(WORLD.scale,3);
assert.equal(WORLD.radius,.62,'art replacement preserves character size');
assert.ok(samplePath(0).x<0 && samplePath(0).tx>.99,'mirrored world starts left and runs right');
assert.ok(Math.abs(samplePath(0).x+830/18*WORLD.scale)<1e-8);
assert.ok(Math.abs(samplePath(1).x-72/18*WORLD.scale)<1e-8);
assert.ok(Math.abs(WORLD.totalLength/WORLD.scale-417.4814)<.05);
const groups=new Map();
let maxSpacing=0;
for(const segment of COLLIDERS) {
  maxSpacing=Math.max(maxSpacing,Math.hypot(segment.bx-segment.ax,segment.by-segment.ay));
  assert.ok(segment.radius>0 && segment.radius<1,'collision thickness comes from mask strokes');
  const key=segment.platformId;
  if(!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(segment);
}
assert.ok(maxSpacing<=.32+1e-8,'mask collision sampling remains dense');
assert.equal(new Set(COLLIDERS.map(c=>c.sceneIndex)).size,6);
for(let scene=0;scene<6;scene++) {
  const platforms=new Set(COLLIDERS.filter(c=>c.sceneIndex===scene && c.platformIndex>=0).map(c=>c.platformIndex));
  assert.equal(platforms.size,12,'all twelve mask components have colliders in each scene');
}
function tick(p,move=0,jump=false) {
  stepPlayer(p,{move,jump},dt);
  assert.ok(Number.isFinite(p.x+p.y+p.vx+p.vy),'finite simulation');
  const surface=nearestSurface(p.x,p.y);
  assert.ok(surface.surfaceDistance>=WORLD.radius-1e-5,
    'no ground penetration '+JSON.stringify({progress:p.progress,depth:WORLD.radius-surface.surfaceDistance,platform:surface.platformId}));
}
function placeOnRoute(p,fraction,clearance=0) {
  resetPlayer(p);
  const path=samplePath(fraction),surface=nearestSurface(path.x,path.y),up=nearestPath(surface.x,surface.y);
  Object.assign(p,{x:surface.x+up.nx*(surface.radius+WORLD.radius+clearance),
    y:surface.y+up.ny*(surface.radius+WORLD.radius+clearance),nx:up.nx,ny:up.ny,
    grounded:clearance===0,progress:up.progress});
}
const p=createPlayer();
assert.ok(p.grounded);
assert.ok(Math.abs(nearestSurface(p.x,p.y).surfaceDistance-WORLD.radius)<.02,'spawn is on the mask floor');
const start={x:p.x,y:p.y};
for(let i=0;i<12;i++) tick(p,1);
assert.ok(p.x>start.x+.15,'D moves right from the mirrored start');
const turnX=p.x;
for(let i=0;i<24;i++) tick(p,-1);
assert.ok(p.x<turnX && p.vx<0,'A reverses direction');
resetPlayer(p);
const jumpStart={x:p.x,y:p.y,nx:p.nx,ny:p.ny};
tick(p,0,true);
assert.equal(p.grounded,false);assert.equal(p.jumps,1);
let highest=0,airFrames=0;
for(let i=0;i<240;i++) {
  highest=Math.max(highest,(p.x-jumpStart.x)*jumpStart.nx+(p.y-jumpStart.y)*jumpStart.ny);
  if(!p.grounded) airFrames++;
  tick(p);
}
assert.ok(highest>2.5 && highest<3.1,'jump retains its original height');
assert.ok(airFrames>70 && p.grounded,'jump has a visible arc and returns to the real floor');
for(const [phase,waitFrames] of [['rising',18],['falling',72]]) {
  resetPlayer(p);tick(p,0,true);
  assert.equal(p.airJumpUsed,false);
  for(let i=0;i<waitFrames;i++) tick(p);
  const up=nearestPath(p.x,p.y),speed=p.vx*up.nx+p.vy*up.ny;
  assert.ok(!p.grounded && (phase==='rising'?speed>0:speed<0));
  tick(p,0,true);
  assert.equal(p.jumps,2);assert.equal(p.airJumpUsed,true);
  assert.ok(Math.abs(p.vx*up.nx+p.vy*up.ny-(PHYSICS.jumpSpeed-PHYSICS.gravity*dt))<1e-8,
    'air jump resets normal speed without stacking');
  const withoutThird={...p};tick(p,0,true);tick(withoutThird);
  assert.deepEqual(p,withoutThird,'third press does not change flight');
  for(let i=0;i<240 && !p.grounded;i++) tick(p);
  assert.ok(p.grounded && !p.airJumpUsed,'landing rearms the air jump');
  assert.equal(p.jumps,2);
  tick(p,0,true);tick(p,0,true);
  assert.equal(p.jumps,4,'both jumps are available after landing');
  resetPlayer(p);assert.equal(p.jumps,0);assert.equal(p.airJumpUsed,false);
}
// Up follows the inverted spiral, rather than a nearby floating platform's underside.
placeOnRoute(p,.34);
for(let i=0;i<30;i++) tick(p);
assert.ok(p.grounded && p.ny<-.8,'inverted spiral terrain remains walkable');
tick(p,0,true);for(let i=0;i<18;i++) tick(p);
const invertedUp=nearestPath(p.x,p.y);tick(p,0,true);
assert.equal(p.jumps,2);
assert.ok(p.vx*invertedUp.nx+p.vy*invertedUp.ny>12,'double jump leaves inverted terrain');
resetPlayer(p);p.y+=1.5;p.grounded=false;p.nx=1;p.ny=0;
const fallUp=nearestPath(p.x,p.y);tick(p,0,true);
assert.ok(Math.abs(p.vx*fallUp.nx+p.vy*fallUp.ny-(PHYSICS.jumpSpeed-PHYSICS.gravity*dt))<1e-8);
assert.equal(p.jumps,1);assert.equal(p.airJumpUsed,true);
const withoutExtra={...p};tick(p,0,true);tick(withoutExtra);
assert.deepEqual(p,withoutExtra,'a fall without a ground jump has one air jump');

const gap=worldAt(750*PANELS[0].pixelScale);
assert.ok(nearestSurface(gap.x,gap.y).surfaceDistance>.4,'no hidden ribbon fills the first mask hole');
resetPlayer(p);Object.assign(p,{x:gap.x+gap.nx*.8,y:gap.y+gap.ny*.8,nx:gap.nx,ny:gap.ny,grounded:false});
for(let i=0;i<60;i++) tick(p);
assert.ok((p.x-gap.x)*gap.nx+(p.y-gap.y)*gap.ny<.1,'player drops through the hole onto the lower drawn ledge');
// An underside impact stops ascent without granting another airborne jump.
const roofPanel=PANELS[3],roofLine=roofPanel.source.platforms[7];
const roof=worldAt(roofPanel.start+(roofLine.x1+roofLine.x2)/2*roofPanel.pixelScale,
  (roofPanel.baseline-roofLine.y1-roofLine.halfThickness)*roofPanel.pixelScale-WORLD.radius-.3);
resetPlayer(p);Object.assign(p,{x:roof.x,y:roof.y,nx:roof.nx,ny:roof.ny,
  vx:roof.nx*PHYSICS.jumpSpeed,vy:roof.ny*PHYSICS.jumpSpeed,grounded:false,airJumpUsed:true});
for(let i=0;i<12;i++) tick(p);
assert.ok(!p.grounded && p.airJumpUsed,'ceiling collision is not a landing and does not rearm jump');
assert.ok(p.vx*p.nx+p.vy*p.ny<=0,'solid platform underside stops ascent');
let exposedPlatforms=0,elevatedPlatforms=0;
const contactScenes=new Set();
for(const [key,segments] of groups) {
  const segment=segments[Math.floor(segments.length/2)],s=(segment.s0+segment.s1)/2;
  const up=samplePath(s/WORLD.totalLength),x=(segment.ax+segment.bx)/2,y=(segment.ay+segment.by)/2;
  const sx=x+up.nx*(segment.radius+WORLD.radius),sy=y+up.ny*(segment.radius+WORLD.radius);
  const closest=nearestSurface(sx,sy);
  if(closest.surfaceDistance<WORLD.radius-.01 || closest.platformId!==key) continue;
  resetPlayer(p);Object.assign(p,{x:sx,y:sy,nx:up.nx,ny:up.ny,grounded:true});
  for(let i=0;i<12;i++) tick(p);
  if(!p.grounded) continue;
  const position={x:p.x,y:p.y};
  for(let i=0;i<60;i++) {tick(p);assert.ok(p.grounded,'exposed platform contact stays stable');}
  assert.ok(Math.hypot(p.x-position.x,p.y-position.y)<.003,'idle contact does not jitter');
  exposedPlatforms++;contactScenes.add(segment.sceneIndex);
  if((x-up.x)*up.nx+(y-up.y)*up.ny>1) elevatedPlatforms++;
}
assert.ok(exposedPlatforms>=120 && elevatedPlatforms>=60,'raised art platforms really support the player');
assert.equal(contactScenes.size,6);
resetPlayer(p);
for(let i=0;i<90;i++) {tick(p,1);assert.ok(p.ny>.95,'low ledges never invert local gravity');}
// Cross all panel/scene joins on their actual floor capsules.
for(const panel of PANELS.slice(1)) {
  placeOnRoute(p,(panel.start-1)/WORLD.totalLength);
  for(let i=0;i<96;i++) tick(p,1);
  assert.ok(p.progress*WORLD.totalLength>panel.start,'panel seam is traversable '+JSON.stringify({panel:panel.index,s:p.progress*WORLD.totalLength,seam:panel.start}));
}
resetPlayer(p);Object.assign(p,GOAL,{vx:0,vy:0,grounded:true});tick(p);
assert.ok(p.won,'the final actual floor reaches the goal');

// A real-input route follows the floor, jumps low ledges and the gap bridges,
// and uses its extra airborne impulse near the apex. No position overrides.
resetPlayer(p);
let lastJump=-999,maxProgress=0,stalled=0,routeAirFrames=0;
const visitedScenes=new Set();
const routeLimit=Math.ceil(WORLD.totalLength/PHYSICS.speed*1.8/dt);
for(let frame=0;frame<routeLimit && !p.won;frame++) {
  const up=nearestPath(p.x,p.y),s=p.progress*WORLD.totalLength;
  const h=(p.x-up.x)*up.nx+(p.y-up.y)*up.ny;
  const panel=PANELS[Math.min(PANELS.length-1,Math.floor(s/PANELS[0].length))];
  visitedScenes.add(panel.sceneIndex);
  const danger=panel.source.platforms.some(line=>{
    const height=(panel.baseline-line.y1)*panel.pixelScale;
    const a=panel.start+line.x1*panel.pixelScale,b=panel.start+line.x2*panel.pixelScale;
    return height>.3 && height<4.5 && s>a-2.5 && s<b && h<height+line.halfThickness*panel.pixelScale+.4;
  });
  const jump=(p.grounded && danger && frame-lastJump>12) ||
    (!p.grounded && !p.airJumpUsed && p.vx*p.nx+p.vy*p.ny<2);
  if(jump) lastJump=frame;
  const move=!p.grounded && s>WORLD.totalLength-6?0:1;
  tick(p,move,jump);
  if(!p.grounded) routeAirFrames++;
  if(p.progress>maxProgress+1e-6){maxProgress=p.progress;stalled=0;}else stalled++;
  assert.ok(stalled<360,'authored route keeps progressing through platforms and holes');
}
assert.ok(p.won,'jumping traverses the complete authored spiral');
assert.equal(visitedScenes.size,6,'the playable route crosses all six scenes');
assert.ok(routeAirFrames>1000 && p.jumps>20,'the route exercises real platform jumping');
console.log(JSON.stringify({ok:true,segments:COLLIDERS.length,maxSpacing,pathLength:WORLD.totalLength,
  platformGroups:groups.size,exposedPlatforms,elevatedPlatforms,jumpHeight:highest,airFrames,
  routeSeconds:p.elapsed,routeJumps:p.jumps,routeAirFrames},null,2));
