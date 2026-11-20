import { WORLD, nearestPath } from './world.js';
import { COLLIDERS, SPAWN } from './scenes.js';
export { WORLD, samplePath } from './world.js';

const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
export const PHYSICS={speed:10,acceleration:48,airAcceleration:20,gravity:30,jumpSpeed:13.4,fixedDt:1/120};

export function nearestSurface(x,y) {
  let bestSurface=Infinity,bestDistance=0,best,bestT=0,qx=0,qy=0;
  // ponytail: one character scans the static mask-derived capsules. Add a
  // spatial grid if profiling shows this scan limiting additional actors.
  for(const segment of COLLIDERS) {
    const dx=segment.bx-segment.ax,dy=segment.by-segment.ay;
    const lengthSq=dx*dx+dy*dy,t=lengthSq?clamp(((x-segment.ax)*dx+(y-segment.ay)*dy)/lengthSq,0,1):0;
    const px=segment.ax+t*dx,py=segment.ay+t*dy,distSq=(x-px)**2+(y-py)**2;
    const cutoff=bestSurface+segment.radius;
    if(cutoff<0 || distSq>=cutoff*cutoff) continue;
    const distance=Math.sqrt(distSq);
    bestSurface=distance-segment.radius;bestDistance=distance;
    best=segment;bestT=t;qx=px;qy=py;
  }
  const dx=best.bx-best.ax,dy=best.by-best.ay,length=Math.hypot(dx,dy);
  const tx=length?dx/length:1,ty=length?dy/length:0;
  return {x:qx,y:qy,tx,ty,nx:bestDistance>1e-8?(x-qx)/bestDistance:-ty,
    ny:bestDistance>1e-8?(y-qy)/bestDistance:tx,distance:bestDistance,
    surfaceDistance:bestSurface,radius:best.radius,id:best.id,
    platformId:best.platformId,
    progress:(best.s0+bestT*(best.s1-best.s0))/WORLD.totalLength};
}

export function createPlayer() {
  const player={};
  resetPlayer(player);
  return player;
}
export function resetPlayer(player) {
  const ground=nearestSurface(SPAWN.x,SPAWN.y);
  Object.assign(player,{x:SPAWN.x,y:SPAWN.y,
    vx:0,vy:0,nx:SPAWN.nx,ny:SPAWN.ny,tx:-SPAWN.ny,ty:SPAWN.nx,
    grounded:true,groundId:ground.platformId,airJumpUsed:false,progress:SPAWN.progress,won:false,jumps:0,elapsed:0});
}

export function stepPlayer(player,input,dt) {
  if(!(dt>0)||!Number.isFinite(dt)) return;
  // Clamp callers as a last defence; the render loop supplies fixed 1/120 s steps.
  dt=Math.min(dt,1/60);
  let ground=nearestSurface(player.x,player.y);
  const local=nearestPath(player.x,player.y);
  const nx=local.nx,ny=local.ny;
  const wasGrounded=player.grounded && ground.surfaceDistance<WORLD.radius+.12 && ground.nx*nx+ground.ny*ny>.5;
  const previousPlatform=ground.platformId;
  // The nearest spiral region defines up. Floating platforms still collide on
  // both faces, but their undersides cannot reverse gravity or reset a jump.
  const tx=-ny,ty=nx;
  const move=clamp(input.move||0,-1,1);
  const tangential=player.vx*tx+player.vy*ty;
  const desired=-move*PHYSICS.speed;
  const maxChange=(wasGrounded?PHYSICS.acceleration:PHYSICS.airAcceleration)*dt;
  const speed=tangential+clamp(desired-tangential,-maxChange,maxChange);
  let normalSpeed=player.vx*nx+player.vy*ny;
  if(wasGrounded) normalSpeed=0;
  if(input.jump && (wasGrounded || !player.airJumpUsed)) {
    normalSpeed=PHYSICS.jumpSpeed;
    player.airJumpUsed=!wasGrounded;
    player.grounded=false;
    player.jumps++;
  }
  normalSpeed-=PHYSICS.gravity*dt;
  player.vx=tx*speed+nx*normalSpeed;
  player.vy=ty*speed+ny*normalSpeed;
  player.x+=player.vx*dt;
  player.y+=player.vy*dt;
  player.grounded=false;
  player.groundId=null;
  // Resolve neighbouring capsules as well as separate platforms meeting at a seam.
  for(let i=0;i<40;i++) {
    ground=nearestSurface(player.x,player.y);
    const walkable=ground.nx*nx+ground.ny*ny>.5;
    const snapDistance=i===0 && wasGrounded && !input.jump && walkable &&
      ground.platformId===previousPlatform ? .10 : 0;
    if(ground.surfaceDistance>WORLD.radius+snapDistance) break;
    player.x=ground.x+ground.nx*(ground.radius+WORLD.radius+1e-7);
    player.y=ground.y+ground.ny*(ground.radius+WORLD.radius+1e-7);
    const inward=player.vx*ground.nx+player.vy*ground.ny;
    if(inward<0) {player.vx-=ground.nx*inward;player.vy-=ground.ny*inward;}
    if(walkable) {
      player.grounded=true;player.groundId=ground.platformId;player.airJumpUsed=false;
    }
  }
  const current=nearestPath(player.x,player.y);
  player.nx=current.nx;player.ny=current.ny;
  player.tx=-current.ny;player.ty=current.nx;
  player.progress=current.progress;
  player.elapsed+=dt;
  if(player.grounded && current.progress>1-1.5/WORLD.totalLength) player.won=true;
}
