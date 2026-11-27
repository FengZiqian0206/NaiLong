import { WORLD, nearestPath } from './world.js?v=20261123b';
import { COLLIDERS, CUSTOM_COLLIDERS, SPAWN, GOAL, SCENE_LENGTH, PANELS, floorPoint, sceneAt } from './scenes.js?v=20261127e';
export { WORLD, samplePath } from './world.js?v=20261123b';

const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
// The original controller was tuned for drawings 69.5820932 world units wide.
// Keep that reference fixed when scene/route sizes change, scaling range together.
const movementScale=Math.sqrt(SCENE_LENGTH/69.58209322849558);
export const PHYSICS={speed:10*movementScale,acceleration:48*movementScale,
  airAcceleration:20*movementScale,gravity:30,jumpSpeed:13.4*movementScale,fixedDt:1/120,
  fallHeight:-2.6,respawnHeight:-6};
export const goalLapProgress=(GOAL.s-SPAWN.s)/WORLD.totalLength;
const levelSpawns=PANELS.map(panel=>floorPoint(panel.start+.8));

function rememberGround(player,ground,progress) {
  player.respawnScene=ground.sceneIndex;
  let distance=progress-levelSpawns[ground.sceneIndex].progress;
  if(distance>.5) distance-=1;
  if(distance<-.5) distance+=1;
  player.respawnLapProgress=player.lapProgress-distance;
}

function closestBlock(x, y, cutoff) {
  if (!CUSTOM_COLLIDERS.length) return null;
  const radius = Math.hypot(x, y), angle = Math.atan2(x, y), turn = Math.PI * 2;
  let result = null;
  for (const block of CUSTOM_COLLIDERS) {
    const radialGap = Math.max(0, block.minimumRadius - radius, radius - block.maximumRadius);
    if (radialGap > Math.max(0, cutoff)) continue;
    const relativeAngle = angle - block.angle;
    const delta = relativeAngle - turn * Math.round(relativeAngle / turn);
    const angularGap = Math.max(0, Math.abs(delta) - block.halfAngle);
    if (radius * Math.sin(Math.min(angularGap, Math.PI / 2)) > Math.max(0, cutoff)) continue;

    // Test the exact curved ceiling/foot surfaces and the two radial side walls.
    const inside = radialGap === 0 && angularGap === 0;
    let closest = null, closestDistance = Infinity;
    function consider(a, r, radialNormal, sign) {
      const sin = Math.sin(a), cos = Math.cos(a), qx = sin * r, qy = cos * r;
      const dx = x - qx, dy = y - qy, distance = Math.hypot(dx, dy);
      if (distance >= closestDistance) return;
      closestDistance = distance;
      const normalScale = distance > 1e-9 ? (inside ? -1 : 1) / distance : 0;
      const nx = normalScale ? dx * normalScale : sign * (radialNormal ? sin : cos);
      const ny = normalScale ? dy * normalScale : sign * (radialNormal ? cos : -sin);
      closest = { x: qx, y: qy, nx, ny, tx: ny, ty: -nx,
        distance, surfaceDistance: inside ? -distance : distance, radius: 0,
        progress: (a / turn + 1) % 1, id: block.platformId, platformId: block.platformId };
    }

    const arc = block.angle + clamp(delta, -block.halfAngle, block.halfAngle);
    consider(arc, block.maximumRadius, true, 1);
    consider(arc, block.minimumRadius, true, -1);
    for (const side of [-1, 1]) {
      const a = block.angle + side * block.halfAngle;
      const r = clamp(radius * Math.cos(delta - side * block.halfAngle), block.minimumRadius, block.maximumRadius);
      consider(a, r, false, side);
    }
    if (closest.surfaceDistance >= cutoff) continue;
    cutoff = closest.surfaceDistance;
    result = closest;
  }
  if (result) result.sceneIndex = sceneAt(result.progress * WORLD.totalLength);
  return result;
}

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
  const block = closestBlock(x, y, bestSurface);
  if (block) return block;
  const dx=best.bx-best.ax,dy=best.by-best.ay,length=Math.hypot(dx,dy);
  const tx=length?dx/length:1,ty=length?dy/length:0;
  return {x:qx,y:qy,tx,ty,nx:bestDistance>1e-8?(x-qx)/bestDistance:-ty,
    ny:bestDistance>1e-8?(y-qy)/bestDistance:tx,distance:bestDistance,
    surfaceDistance:bestSurface,radius:best.radius,id:best.id,
    platformId:best.platformId,sceneIndex:best.sceneIndex,
    progress:(best.s0+bestT*(best.s1-best.s0))/WORLD.totalLength};
}

export function createPlayer({ bounded = false } = {}) {
  const player={ bounded };
  resetPlayer(player);
  return player;
}
export function resetPlayer(player) {
  const ground=nearestSurface(SPAWN.x,SPAWN.y);
  Object.assign(player,{x:SPAWN.x,y:SPAWN.y,
    vx:0,vy:0,nx:SPAWN.nx,ny:SPAWN.ny,tx:-SPAWN.ny,ty:SPAWN.nx,
    grounded:true,groundId:ground.platformId,airJumpUsed:false,progress:SPAWN.progress,
    lapProgress:0,won:false,jumps:0,elapsed:0,falling:false,
    respawnScene:0,respawnLapProgress:0,respawnId:player.respawnId??0});
}

export function respawnPlayer(player, sceneIndex) {
  if (sceneIndex !== undefined) rememberGround(player, { sceneIndex }, player.progress);
  const spawn=levelSpawns[player.respawnScene],surface=nearestSurface(spawn.x,spawn.y);
  Object.assign(player,{x:spawn.x,y:spawn.y,nx:spawn.nx,ny:spawn.ny,
    tx:-spawn.ny,ty:spawn.nx,vx:0,vy:0,grounded:true,groundId:surface.platformId,
    airJumpUsed:false,falling:false,progress:spawn.progress,
    lapProgress:player.respawnLapProgress,won:false,respawnId:player.respawnId+1});
}

export function stepPlayer(player,input,dt) {
  if(!(dt>0)||!Number.isFinite(dt)) return;
  // Clamp callers as a last defence; the render loop supplies fixed 1/120 s steps.
  dt=Math.min(dt,1/60);
  let ground=nearestSurface(player.x,player.y);
  const local=nearestPath(player.x,player.y);
  const nx=local.nx,ny=local.ny;
  const wasGrounded=player.grounded && ground.surfaceDistance<WORLD.radius+.12 && ground.nx*nx+ground.ny*ny>.5;
  if(wasGrounded) rememberGround(player,ground,local.progress);
  const previousPlatform=ground.platformId;
  // The circle's radial direction defines up. Floating platforms still collide on
  // both faces, but their undersides cannot reverse gravity or reset a jump.
  // While supported, follow the real ramp instead of cancelling its vertical
  // velocity every tick. Takeoff and flight still use the radial up direction.
  const supportMotion=wasGrounded && !input.jump;
  const motionNx=supportMotion?ground.nx:nx,motionNy=supportMotion?ground.ny:ny;
  const tx=-motionNy,ty=motionNx;
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
  player.vx=tx*speed+motionNx*normalSpeed;
  player.vy=ty*speed+motionNy*normalSpeed;
  player.x+=player.vx*dt;
  player.y+=player.vy*dt;
  player.grounded=false;
  player.groundId=null;
  let supportGround;
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
      supportGround=ground;
    }
  }
  let current=nearestPath(player.x,player.y);
  // Signed unwrapped travel keeps the HUD and victory honest across the 1→0 seam.
  let routeDelta=current.progress-player.progress;
  if(routeDelta>.5) routeDelta-=1;
  if(routeDelta<-.5) routeDelta+=1;
  player.lapProgress+=routeDelta;
  if (player.bounded && (player.lapProgress < 0 || player.lapProgress > goalLapProgress)) {
    const atStart = player.lapProgress < 0;
    const edge = atStart ? SPAWN : GOAL;
    const radius = Math.hypot(player.x, player.y);
    const radialSpeed = player.vx * current.nx + player.vy * current.ny;
    // Keep jumping and falling velocity while stopping at the end of the route.
    player.x = edge.nx * radius; player.y = edge.ny * radius;
    player.vx = edge.nx * radialSpeed; player.vy = edge.ny * radialSpeed;
    player.lapProgress = atStart ? 0 : goalLapProgress;
    current = edge;
  }
  player.nx=current.nx;player.ny=current.ny;
  player.tx=-current.ny;player.ty=current.nx;
  player.progress=current.progress;
  player.elapsed+=dt;
  if(supportGround) rememberGround(player,supportGround,current.progress);
  const height=Math.hypot(player.x,player.y)-WORLD.ringRadius;
  player.falling=!player.grounded && height<PHYSICS.fallHeight;
  if(!player.grounded && height<PHYSICS.respawnHeight) {
    respawnPlayer(player);
    return;
  }
  if(player.grounded && player.lapProgress>=goalLapProgress) player.won=true;
}
