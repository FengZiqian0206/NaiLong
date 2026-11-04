// The same sampled centreline drives the visible ribbon and its capsule collider.
// Coordinates follow the supplied sketch; y points upwards in the game world.
const anchors = [
  [1790,150],[1530,150],[1320,160],[1080,125],[850,93],[600,88],
  [405,110],[260,180],[160,330],[105,520],[110,650],[215,805],
  [365,930],[590,980],[810,985],[1020,935],[1260,880],[1380,790],
  [1430,710],[1410,590],[1350,455],[1220,315],[1080,265],[870,235],
  [690,230],[540,255],[420,330],[375,445],[375,560],[435,650],
  [575,735],[760,800],[935,805],[1100,775],[1185,715],[1208,610],
  [1180,520],[1080,425],[960,370],[855,370],[745,400],[680,450],
  [682,505],[730,590],[800,630],[890,640],[955,620],[990,580],
  [975,540],[935,510],[895,505],[871,520],[873,546],[888,555],
].map(([x,y]) => ({x:(x-960)/18,y:(540-y)/18}));

const lerp = (a,b,t) => a + (b-a)*t;
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
function spline(a,b,c,d,t,key) {
  return .5 * ((2*b[key]) + (-a[key]+c[key])*t +
    (2*a[key]-5*b[key]+4*c[key]-d[key])*t*t +
    (-a[key]+3*b[key]-3*c[key]+d[key])*t*t*t);
}
const points = [];
for (let i=0;i<anchors.length-1;i++) {
  const a=anchors[Math.max(0,i-1)],b=anchors[i],c=anchors[i+1],d=anchors[Math.min(anchors.length-1,i+2)];
  const steps=Math.max(8,Math.ceil(Math.hypot(c.x-b.x,c.y-b.y)/.32));
  for (let j=0;j<steps;j++) points.push({x:spline(a,b,c,d,j/steps,'x'),y:spline(a,b,c,d,j/steps,'y')});
}
points.push({...anchors.at(-1)});
const lengths=[0];
for(let i=1;i<points.length;i++) lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
export const WORLD={points,halfWidth:.85,radius:.62,totalLength:lengths.at(-1)};
export const PHYSICS={speed:10,acceleration:48,airAcceleration:20,gravity:30,jumpSpeed:13.4,fixedDt:1/120};
const contact=WORLD.halfWidth+WORLD.radius;

export function samplePath(fraction) {
  const target=clamp(fraction,0,1)*WORLD.totalLength;
  let low=0,high=lengths.length-1;
  while(low+1<high) {const mid=(low+high)>>1;if(lengths[mid]<=target) low=mid;else high=mid;}
  const a=points[low],b=points[high],length=lengths[high]-lengths[low];
  const tx=(b.x-a.x)/length,ty=(b.y-a.y)/length,t=(target-lengths[low])/length;
  return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),tx,ty,nx:ty,ny:-tx,progress:clamp(fraction,0,1)};
}

export function nearestSurface(x,y) {
  let bestDistance=Infinity,bestIndex=0,bestT=0,qx=0,qy=0;
  // ponytail: linear scan is ample for one character / ~1500 static segments.
  // Add a spatial grid only if additional dynamic actors make this measurable.
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const lengthSq=dx*dx+dy*dy,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/lengthSq,0,1);
    const px=a.x+t*dx,py=a.y+t*dy,distSq=(x-px)**2+(y-py)**2;
    if(distSq>=bestDistance) continue;
    bestDistance=distSq;
    bestIndex=i;bestT=t;qx=px;qy=py;
  }
  const a=points[bestIndex],b=points[bestIndex+1],length=lengths[bestIndex+1]-lengths[bestIndex];
  const distance=Math.sqrt(bestDistance),tx=(b.x-a.x)/length,ty=(b.y-a.y)/length;
  return {x:qx,y:qy,tx,ty,nx:distance>1e-8?(x-qx)/distance:ty,
    ny:distance>1e-8?(y-qy)/distance:-tx,distance,
    progress:(lengths[bestIndex]+bestT*length)/WORLD.totalLength};
}

export function createPlayer() {
  const player={};
  resetPlayer(player);
  return player;
}
export function resetPlayer(player) {
  const start=samplePath(.006);
  Object.assign(player,{x:start.x+start.nx*contact,y:start.y+start.ny*contact,
    vx:0,vy:0,nx:start.nx,ny:start.ny,tx:start.tx,ty:start.ty,
    grounded:true,progress:start.progress,won:false,jumps:0,elapsed:0});
}

export function stepPlayer(player,input,dt) {
  if(!(dt>0)||!Number.isFinite(dt)) return;
  // Clamp callers as a last defence; the render loop supplies fixed 1/120 s steps.
  dt=Math.min(dt,1/60);
  let ground=nearestSurface(player.x,player.y);
  const wasGrounded=player.grounded && ground.distance<contact+.12;
  const nx=ground.nx,ny=ground.ny;
  // A/D are local left/right relative to the current ground normal. Keeping
  // this orientation through a rounded end also allows walking onto its underside.
  const tx=-ny,ty=nx;
  const move=clamp(input.move||0,-1,1);
  const tangential=player.vx*tx+player.vy*ty;
  const desired=-move*PHYSICS.speed;
  const maxChange=(wasGrounded?PHYSICS.acceleration:PHYSICS.airAcceleration)*dt;
  const speed=tangential+clamp(desired-tangential,-maxChange,maxChange);
  let normalSpeed=player.vx*nx+player.vy*ny;
  if(wasGrounded) normalSpeed=0;
  if(input.jump && wasGrounded) {
    normalSpeed=PHYSICS.jumpSpeed;
    player.grounded=false;
    player.jumps++;
  }
  normalSpeed-=PHYSICS.gravity*dt;
  player.vx=tx*speed+nx*normalSpeed;
  player.vy=ty*speed+ny*normalSpeed;
  player.x+=player.vx*dt;
  player.y+=player.vy*dt;
  ground=nearestSurface(player.x,player.y);
  const snapDistance=wasGrounded && !input.jump ? .10 : 0;
  player.grounded=ground.distance<=contact+snapDistance;
  if(player.grounded) {
    player.x=ground.x+ground.nx*contact;
    player.y=ground.y+ground.ny*contact;
    // On a concave bend, resolving one capsule can overlap its neighbour.
    for(let i=0;i<4;i++) {
      const next=nearestSurface(player.x,player.y);
      ground=next;
      if(next.distance>=contact-1e-8) break;
      player.x=next.x+next.nx*(contact+1e-7);
      player.y=next.y+next.ny*(contact+1e-7);
    }
    const inward=player.vx*ground.nx+player.vy*ground.ny;
    player.vx-=ground.nx*inward;
    player.vy-=ground.ny*inward;
  }
  player.nx=ground.nx;player.ny=ground.ny;
  player.tx=-ground.ny;player.ty=ground.nx;
  player.progress=ground.progress;
  player.elapsed+=dt;
  if(player.grounded && ground.progress>.995) player.won=true;
}
