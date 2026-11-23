import assert from 'node:assert/strict';
import {WORLD,PHYSICS,goalLapProgress,createPlayer,resetPlayer,stepPlayer,nearestSurface,samplePath} from './physics.js?v=20261123b';
import {nearestPath} from './world.js?v=20261123b';
import {COLLIDERS,SPAWN,GOAL,PANELS,TRANSITIONS,SCENE_LENGTH,worldAt,floorPoint} from './scenes.js?v=20261123b';

const dt=PHYSICS.fixedDt;
assert.equal(WORLD.radius,.62,'art replacement preserves character size');
assert.ok(Math.abs(samplePath(0).x)<1e-8 && samplePath(0).y>0 && samplePath(0).tx>.99,
  'the circle starts at the top and D moves clockwise/right');
const pathStart=samplePath(0),pathEnd=samplePath(1);
assert.ok(Math.hypot(pathEnd.x-pathStart.x,pathEnd.y-pathStart.y)<1e-8,'the route is geometrically closed');
assert.ok(Math.abs(WORLD.totalLength-991.0890912175022)<.01,'the circle includes six unchanged scenes and six wider transitions');
assert.ok(Math.abs(SCENE_LENGTH-101.0062643639452)<.01,'each individual scene retains its size');
for(let i=0;i<12;i++) {
  const path=samplePath(i/12),radius=Math.hypot(path.x,path.y);
  assert.ok(Math.abs(radius-WORLD.totalLength/(2*Math.PI))<1e-8,'every route sample lies on the regular circle');
  assert.ok(Math.abs(path.nx-path.x/radius)<1e-8 && Math.abs(path.ny-path.y/radius)<1e-8,'local up is radial');
}
const groups=new Map();
let maxSpacing=0;
for(const segment of COLLIDERS) {
  maxSpacing=Math.max(maxSpacing,Math.hypot(segment.bx-segment.ax,segment.by-segment.ay));
  assert.ok(Number.isFinite(segment.radius) && segment.radius>0,'collider thickness is positive');
  if(segment.sceneIndex>=0 && segment.sceneIndex<4 && segment.platformIndex>=0) {
    const panel=PANELS[segment.sceneIndex],line=panel.source.platforms[segment.platformIndex];
    assert.ok(Math.abs(segment.radius-line.halfThickness*panel.pixelScale)<1e-8,
      'real scene collision thickness exactly follows its mask');
  }
  const key=segment.platformId;
  if(!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(segment);
}
assert.ok(maxSpacing<=.32+1e-8,'mask collision sampling remains dense');
assert.equal(PANELS.length,6,'each scene occupies one region without tiled repeats');
assert.deepEqual(PANELS.slice(0,2).map(p=>p.image),['level1.png','level2.png']);
assert.ok(PANELS.slice(0,4).every(p=>p.image),'the four supplied scenes have artwork');
assert.ok(PANELS.slice(4).every(p=>!p.image),'scenes five and six remain neutral placeholders');
assert.equal(TRANSITIONS.length,6,'every scene including six has an exit transition');
for(const [i,bridge] of TRANSITIONS.entries()) {
  assert.equal(bridge.index,i);
  assert.ok(Math.abs(bridge.length-SCENE_LENGTH*1380/2172)<1e-8,'transition width preserves the supplied artwork proportion');
  assert.ok(Math.abs(bridge.start-PANELS[i].start-SCENE_LENGTH)<1e-8);
  assert.ok(Math.abs(bridge.end-(i<5?PANELS[i+1].start:WORLD.totalLength))<1e-8);
}
assert.equal(new Set(COLLIDERS.filter(c=>c.sceneIndex>=0).map(c=>c.sceneIndex)).size,6);
for(let scene=0;scene<6;scene++) {
  const platforms=new Set(COLLIDERS.filter(c=>c.sceneIndex===scene && c.platformIndex>=0).map(c=>c.platformIndex));
  assert.equal(platforms.size,PANELS[scene].source.platforms.length,'every source platform has a real collider');
}
assert.equal(PANELS[2].source.platforms.length,1,'scene three has one continuous walkable floor');
assert.ok(PANELS.slice(4).every(p=>p.source.platforms.length===1));
function tick(p,move=0,jump=false) {
  stepPlayer(p,{move,jump},dt);
  assert.ok(Number.isFinite(p.x+p.y+p.vx+p.vy),'finite simulation');
  const surface=nearestSurface(p.x,p.y);
  assert.ok(p.progress>=0 && p.progress<1,'render progress stays wrapped');
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
for(let i=0;i<60;i++) tick(p,-1);
assert.ok(p.progress>.98 && p.lapProgress<0 && !p.won,'backing across the closing seam cannot finish a lap');
const backwardPosition=p.lapProgress;
for(let i=0;i<120 && p.lapProgress<.001;i++) tick(p,1);
assert.ok(p.lapProgress>backwardPosition && p.progress<.02 && !p.won,
  'moving forward across the seam returns to the start without winning');
resetPlayer(p);
assert.equal(p.lapProgress,0);assert.equal(p.won,false);
resetPlayer(p);
const jumpStart={x:p.x,y:p.y,nx:p.nx,ny:p.ny};
tick(p,0,true);
assert.equal(p.grounded,false);assert.equal(p.jumps,1);
let highest=0,airFrames=0;
for(let i=0;i<360;i++) {
  highest=Math.max(highest,(p.x-jumpStart.x)*jumpStart.nx+(p.y-jumpStart.y)*jumpStart.ny);
  if(!p.grounded) airFrames++;
  tick(p);
}
const expectedHeight=PHYSICS.jumpSpeed**2/(2*PHYSICS.gravity);
assert.ok(highest>expectedHeight-.25 && highest<expectedHeight+.05,'jump height matches full-scene movement tuning');
assert.ok(airFrames>120 && p.grounded,'jump has a visible arc and returns to the real floor');
for(const [phase,waitFrames] of [['rising',18],['falling',Math.ceil(PHYSICS.jumpSpeed/PHYSICS.gravity/dt*1.35)]]) {
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
  for(let i=0;i<360 && !p.grounded;i++) tick(p);
  assert.ok(p.grounded && !p.airJumpUsed,'landing rearms the air jump');
  assert.equal(p.jumps,2);
  tick(p,0,true);tick(p,0,true);
  assert.equal(p.jumps,4,'both jumps are available after landing');
  resetPlayer(p);assert.equal(p.jumps,0);assert.equal(p.airJumpUsed,false);
}
// Up follows the inverted part of the circle, not a nearby platform's underside.
let invertedFraction=0;
for(let i=1;i<100;i++) if(samplePath(i/100).ny<samplePath(invertedFraction).ny) invertedFraction=i/100;
placeOnRoute(p,invertedFraction);
for(let i=0;i<30;i++) tick(p);
assert.ok(p.grounded && p.ny<-.8,'inverted circular terrain remains walkable');
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
const roofPanel=PANELS[1],roofLine=roofPanel.source.platforms[7];
const roof=worldAt(roofPanel.start+(roofLine.x1+roofLine.x2)/2*roofPanel.pixelScale,
  (roofPanel.baseline-roofLine.y1-roofLine.halfThickness)*roofPanel.pixelScale-WORLD.radius-.3);
resetPlayer(p);Object.assign(p,{x:roof.x,y:roof.y,nx:roof.nx,ny:roof.ny,
  vx:roof.nx*PHYSICS.jumpSpeed,vy:roof.ny*PHYSICS.jumpSpeed,grounded:false,airJumpUsed:true});
for(let i=0;i<12;i++) tick(p);
assert.ok(!p.grounded && p.airJumpUsed,'ceiling collision is not a landing and does not rearm jump');
assert.ok(p.vx*p.nx+p.vy*p.ny<=0,'solid platform underside stops ascent');
let exposedPlatforms=0,elevatedPlatforms=0,maxContactRouteOffset=0;
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
  assert.ok(Math.hypot(p.x-position.x,p.y-position.y)<.003,'idle contact does not jitter '+key+' '+Math.hypot(p.x-position.x,p.y-position.y));
  maxContactRouteOffset=Math.max(maxContactRouteOffset,Math.abs(p.progress*WORLD.totalLength-s));
  exposedPlatforms++;contactScenes.add(segment.sceneIndex);
  if((x-up.x)*up.nx+(y-up.y)*up.ny>1) elevatedPlatforms++;
}
assert.ok(exposedPlatforms>=24 && elevatedPlatforms>=16,'both scenes retain real raised platforms');
assert.ok(maxContactRouteOffset<.3,'even the tallest artwork platforms retain their own circular region');
assert.equal([...contactScenes].filter(s=>s>=0).length,6);
let rampChecks=0;
for(const [platformIndex,line] of PANELS[3].source.platforms.entries()) {
  if(line.y1===line.y2) continue;
  const segments=groups.get('3:'+platformIndex),segment=segments[Math.floor(segments.length/2)];
  const x=(segment.ax+segment.bx)/2,y=(segment.ay+segment.by)/2,up=nearestPath(x,y);
  const length=Math.hypot(segment.bx-segment.ax,segment.by-segment.ay);
  let nx=-(segment.by-segment.ay)/length,ny=(segment.bx-segment.ax)/length;
  if(nx*up.nx+ny*up.ny<0){nx=-nx;ny=-ny;}
  resetPlayer(p);Object.assign(p,{x:x+nx*(segment.radius+WORLD.radius),
    y:y+ny*(segment.radius+WORLD.radius),nx:up.nx,ny:up.ny,grounded:true});
  p.progress=nearestPath(p.x,p.y).progress;
  const idle={x:p.x,y:p.y};
  for(let i=0;i<60;i++) {tick(p);assert.ok(p.grounded,'diagonal mask ramp supports the character');}
  assert.ok(Math.hypot(p.x-idle.x,p.y-idle.y)<.003,'idle on a ramp does not slide');
  const from=p.lapProgress;
  for(let i=0;i<20;i++) tick(p,1);
  assert.ok((p.lapProgress-from)*WORLD.totalLength>.2 && Math.hypot(p.vx,p.vy)>8,
    'D walks along the real diagonal ramp without losing speed into the radial axis');
  rampChecks++;
}
assert.equal(rampChecks,2,'both diagonal mask surfaces are exercised');
resetPlayer(p);
for(let i=0;i<90;i++) {tick(p,1);assert.ok(p.ny>.95,'low ledges never invert local gravity');}
// Cross the transition entrances and the remaining scene seams on actual terrain.
for(const seam of [...TRANSITIONS.map(t=>t.start),...PANELS.slice(1).map(panel=>panel.start)]) {
  placeOnRoute(p,(seam-1)/WORLD.totalLength);
  for(let i=0;i<180;i++) tick(p,1);
  assert.ok(p.progress*WORLD.totalLength>seam,'scene seam is traversable '+JSON.stringify({s:p.progress*WORLD.totalLength,seam}));
}
const dedicatedBridgeFrames=[];
for(const bridge of TRANSITIONS) {
  const point=floorPoint(bridge.start+.2);
  resetPlayer(p);Object.assign(p,point,{grounded:true});
  let contactFrames=0;
  const bridgeStepLimit=Math.ceil((bridge.length/PHYSICS.speed+2)/dt);
  for(let i=0;i<bridgeStepLimit && p.lapProgress*WORLD.totalLength<bridge.length-.4;i++) {
    tick(p,1);
    assert.ok(p.grounded,'walking continuously across a transition keeps ground contact');
    if(p.groundId==='transition:'+bridge.index) contactFrames++;
  }
  assert.ok(p.lapProgress*WORLD.totalLength>=bridge.length-.4 && contactFrames>100,
    'each transition supports a full uninterrupted walk');
  dedicatedBridgeFrames.push(contactFrames);
}
// The closing bridge is traversable in both directions with continuous input.
placeOnRoute(p,(WORLD.totalLength-2)/WORLD.totalLength);
for(let i=0;i<60;i++) tick(p,1);
assert.ok(p.progress<.02 && p.lapProgress>0 && !p.won,'held D crosses six-to-one without an artificial finish');
for(let i=0;i<120 && p.progress<.98;i++) tick(p,-1);
assert.ok(p.progress>.98 && !p.won,'held A crosses the closing seam in reverse');
resetPlayer(p);Object.assign(p,GOAL,{vx:0,vy:0,grounded:true,progress:GOAL.progress});tick(p);
assert.ok(!p.won,'standing at the goal without travelling a lap cannot win');

// A real-input route follows the floor, jumps low ledges and the gap bridges,
// and uses its extra airborne impulse near the apex. No position overrides.
resetPlayer(p);
let lastJump=-999,maxProgress=0,stalled=0,routeAirFrames=0;
const visitedScenes=new Set();
const bridgeContactFrames=Array(6).fill(0);
let maxRouteStep=0;
const artScale=SCENE_LENGTH/69.58209322849558;
const routeLimit=Math.ceil(WORLD.totalLength/PHYSICS.speed*1.8/dt);
for(let frame=0;frame<routeLimit && !p.won;frame++) {
  const up=nearestPath(p.x,p.y),s=p.progress*WORLD.totalLength;
  const h=(p.x-up.x)*up.nx+(p.y-up.y)*up.ny;
  const panel=PANELS.find(p=>s>=p.start && s<=p.start+p.length);
  if(panel) visitedScenes.add(panel.sceneIndex);
  // Scenes 3–6 have a continuous floor; the forked scene-4 platforms are optional.
  const danger=!!panel && panel.sceneIndex<2 && panel.source.platforms.some(line=>{
    const height=(panel.baseline-line.y1)*panel.pixelScale;
    const a=panel.start+line.x1*panel.pixelScale,b=panel.start+line.x2*panel.pixelScale;
    return height>.3 && height<4.5*artScale && s>a-2.5*artScale && s<b && h<height+line.halfThickness*panel.pixelScale+.4;
  });
  const jump=(p.grounded && danger && frame-lastJump>12) ||
    (!p.grounded && !p.airJumpUsed && p.vx*p.nx+p.vy*p.ny<2);
  if(jump) lastJump=frame;
  const move=!p.grounded && p.lapProgress>goalLapProgress-6/WORLD.totalLength?0:1;
  const priorLap=p.lapProgress;
  tick(p,move,jump);
  maxRouteStep=Math.max(maxRouteStep,Math.abs(p.lapProgress-priorLap)*WORLD.totalLength);
  assert.ok(maxRouteStep<1,'unwrapped lap progress has no jumps at the closing seam');
  if(p.grounded && p.groundId?.startsWith('transition:')) bridgeContactFrames[Number(p.groundId.split(':')[1])]++;
  if(!p.grounded) routeAirFrames++;
  if(p.lapProgress>maxProgress+1e-6){maxProgress=p.lapProgress;stalled=0;}else stalled++;
  assert.ok(stalled<360,'authored route keeps progressing through platforms and holes '+JSON.stringify({s:p.progress*WORLD.totalLength,time:p.elapsed,ground:p.groundId,jumps:p.jumps,x:p.x,y:p.y,vx:p.vx,vy:p.vy,height:nearestPath(p.x,p.y).distance}));
}
assert.ok(p.won && p.lapProgress>=goalLapProgress,'jumping completes a real forward lap');
assert.equal(visitedScenes.size,6,'the playable route crosses all six scenes');
assert.ok(bridgeContactFrames.every(frames=>frames>0),'the full route contacts all six real transition grounds '+JSON.stringify(bridgeContactFrames));
assert.ok(routeAirFrames>1000 && p.jumps>10,'the route exercises real platform jumping');
console.log(JSON.stringify({ok:true,segments:COLLIDERS.length,maxSpacing,pathLength:WORLD.totalLength,
  platformGroups:groups.size,exposedPlatforms,elevatedPlatforms,jumpHeight:highest,airFrames,
  routeSeconds:p.elapsed,routeJumps:p.jumps,routeAirFrames,bridgeContactFrames,dedicatedBridgeFrames,
  rampChecks,maxRouteStep,maxContactRouteOffset},null,2));
