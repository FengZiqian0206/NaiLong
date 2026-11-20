// The original spiral is mirrored horizontally; route progress now starts left to right.
const scale = 3;
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
].map(([x,y]) => ({x:-(x-960)/18*scale,y:(540-y)/18*scale}));
function spline(a,b,c,d,t,key) {
  return .5*(2*b[key]+(-a[key]+c[key])*t+(2*a[key]-5*b[key]+4*c[key]-d[key])*t*t+(-a[key]+3*b[key]-3*c[key]+d[key])*t*t*t);
}
const points=[];
for(let i=0;i<anchors.length-1;i++) {
  const a=anchors[Math.max(0,i-1)],b=anchors[i],c=anchors[i+1],d=anchors[Math.min(anchors.length-1,i+2)];
  const steps=Math.max(12,Math.ceil(Math.hypot(c.x-b.x,c.y-b.y)/.2));
  for(let j=0;j<steps;j++) points.push({x:spline(a,b,c,d,j/steps,'x'),y:spline(a,b,c,d,j/steps,'y')});
}
points.push({...anchors.at(-1)});
const lengths=[0];
for(let i=1;i<points.length;i++) lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
const tangents=points.map((p,i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],length=Math.hypot(b.x-a.x,b.y-a.y);
  return {x:(b.x-a.x)/length,y:(b.y-a.y)/length};
});
export const WORLD={points,scale,radius:.62,totalLength:lengths.at(-1)};
export function samplePath(fraction) {
  const progress=Math.max(0,Math.min(1,fraction)),target=progress*WORLD.totalLength;
  let low=0,high=lengths.length-1;
  while(low+1<high){const mid=(low+high)>>1;if(lengths[mid]<=target)low=mid;else high=mid;}
  const a=points[low],b=points[high],length=lengths[high]-lengths[low],t=(target-lengths[low])/length;
  const dx=tangents[low].x+(tangents[high].x-tangents[low].x)*t,dy=tangents[low].y+(tangents[high].y-tangents[low].y)*t;
  const tangentLength=Math.hypot(dx,dy),tx=dx/tangentLength,ty=dy/tangentLength;
  return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,tx,ty,nx:-ty,ny:tx,progress};
}
export function nearestPath(x,y) {
  let distanceSq=Infinity,index=0,bestT=0;
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
    const d=(x-a.x-t*dx)**2+(y-a.y-t*dy)**2;
    if(d<distanceSq){distanceSq=d;index=i;bestT=t;}
  }
  const s=lengths[index]+bestT*(lengths[index+1]-lengths[index]);
  return{...samplePath(s/WORLD.totalLength),distance:Math.sqrt(distanceSq)};
}
