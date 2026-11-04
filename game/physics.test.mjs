import assert from 'node:assert/strict';
import {WORLD,PHYSICS,createPlayer,resetPlayer,stepPlayer,nearestSurface,samplePath} from './physics.js';
const dt=PHYSICS.fixedDt,contact=WORLD.halfWidth+WORLD.radius;
function tick(p,move=0,jump=false) {
  stepPlayer(p,{move,jump},dt);
  assert.ok(Number.isFinite(p.x+p.y+p.vx+p.vy),'finite simulation');
  assert.ok(nearestSurface(p.x,p.y).distance>=contact-1e-6,'no ground penetration');
}
const p=createPlayer();
assert.ok(p.grounded);
const start={x:p.x,y:p.y};
for(let i=0;i<240;i++) tick(p,-1);
assert.ok(p.x<start.x-15,'A moves left from start');
const beforeReverse=p.progress;
for(let i=0;i<120;i++) tick(p,1);
assert.ok(p.progress<beforeReverse,'D moves back along the surface');
resetPlayer(p);
tick(p,0,true);
assert.equal(p.grounded,false,'Space launches');
assert.equal(p.jumps,1);
let highest=0,airFrames=0;
for(let i=0;i<240;i++) {
  highest=Math.max(highest,nearestSurface(p.x,p.y).distance-contact);
  if(!p.grounded) airFrames++;
  tick(p);
}
assert.ok(highest>2.5 && highest<3.1,'jump is about 3 world units high');
assert.ok(airFrames>70,'jump is a visible arc');
assert.ok(p.grounded,'jump lands');
// Put the player under the start: gravity must point up and support upside-down play.
const underside=samplePath(.03);
Object.assign(p,{x:underside.x-underside.nx*contact,y:underside.y-underside.ny*contact,vx:0,vy:0,grounded:true});
tick(p);
assert.ok(p.ny<-.9 && p.grounded,'underside is a walkable surface');
const underY=p.y;
tick(p,0,true);
assert.ok(p.y<underY && !p.grounded,'underside jump points away from ground');
resetPlayer(p);
let minNormalY=1,maxProgress=0,frames=0;
for(;frames<18000 && !p.won;frames++) {
  tick(p,-1);
  assert.ok(p.grounded,'walking maintains contact around every bend');
  minNormalY=Math.min(minNormalY,p.ny);
  maxProgress=Math.max(maxProgress,p.progress);
}
assert.ok(minNormalY<-.9,'full journey includes upside-down traversal');
assert.ok(p.won,'A alone traverses the complete spiral and reaches the centre');
assert.ok(maxProgress>.995);
let reverseFrames=0;
while(p.progress>.007 && reverseFrames<18000) {
  tick(p,1);
  assert.ok(p.grounded,'reverse traversal maintains contact');
  reverseFrames++;
}
assert.ok(p.progress<.007,'reverse traversal reaches the outer start');
resetPlayer(p);
for(let i=0;i<16000 && !p.won;i++) {
  const ground=nearestSurface(p.x,p.y);
  // Follow the route after a jump transfers gravity to another coil's underside.
  const move=(-ground.ny*ground.tx+ground.nx*ground.ty)>=0?-1:1;
  tick(p,move,i%180===0);
}
assert.ok(p.won,'repeated moving jumps can traverse every coil');
const movingJumps=p.jumps,movingJumpSeconds=p.elapsed;
resetPlayer(p);
for(let i=0;i<480;i++) {
  tick(p,1);
  assert.ok(p.grounded,'outer rounded tip remains walkable');
}
assert.ok(p.ny<-.8 && p.progress>.05,'D rounds the tip and keeps moving on the underside');
const undersideProgress=p.progress;
for(let i=0;i<120;i++) tick(p,-1);
assert.ok(p.progress<undersideProgress,'A reverses naturally on the underside');
// Stationary contact should not oscillate between nearby segments.
for(const fraction of [.1,.45,.7,.9,.98]) {
  const surface=samplePath(fraction);
  Object.assign(p,{x:surface.x+surface.nx*contact,y:surface.y+surface.ny*contact,vx:0,vy:0,grounded:true});
  for(let i=0;i<30;i++) tick(p);
  const position={x:p.x,y:p.y};
  for(let i=0;i<120;i++) {tick(p);assert.ok(p.grounded,'idle contact is stable');}
  assert.ok(Math.hypot(p.x-position.x,p.y-position.y)<1e-4,'idle position does not jitter');
}
// A second neighbouring coil can become the nearest ground during free flight.
// Place above the middle coil and check that gravity pulls into its local surface.
const middle=samplePath(.65);
Object.assign(p,{x:middle.x+middle.nx*3,y:middle.y+middle.ny*3,vx:0,vy:0,grounded:false,won:false});
const initialDistance=nearestSurface(p.x,p.y).distance;
tick(p);
assert.ok(nearestSurface(p.x,p.y).distance<initialDistance,'free fall uses nearest ground');
for(let i=0;i<120;i++) tick(p);
assert.ok(p.grounded,'free fall settles on the middle coil');
console.log(JSON.stringify({ok:true,segments:WORLD.points.length-1,pathLength:WORLD.totalLength,
  walkSeconds:frames*dt,reverseSeconds:reverseFrames*dt,jumpHeight:highest,airFrames,minNormalY,
  movingJumps,movingJumpSeconds},null,2));
