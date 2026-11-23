import assert from 'node:assert/strict';
import LEVELS from './assets/levels.json' with {type:'json'};
import {WORLD,samplePath} from './world.js';
import {SCENE_COUNT,SCENE_LENGTH,TRANSITIONS,PANELS,COLLIDERS,
  panelAt,sceneAt,transitionAt,worldAt,floorPoint} from './scenes.js';
import {nearestSurface} from './physics.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8);
assert.equal(SCENE_COUNT,6);
assert.equal(PANELS.length,6);
assert.equal(TRANSITIONS.length,6);
close(SCENE_LENGTH,101.00626436394589);
close(6*SCENE_LENGTH*(1+1380/2172),WORLD.totalLength);
assert.deepEqual(PANELS.map(panel=>panel.image),
  ['level1.png','level2.png','level3.png','level4.png',null,null]);
assert.deepEqual(TRANSITIONS.map(transition=>transition.image),
  ['transition-1-2.jpg','transition-2-3.jpg',null,null,null,null]);
assert.strictEqual(panelAt(WORLD.totalLength),PANELS[0]);

const groups=new Map();
for(const part of COLLIDERS) {
  if(!groups.has(part.platformId)) groups.set(part.platformId,[]);
  groups.get(part.platformId).push(part);
}
let expectedGroups=TRANSITIONS.length;
for(const [index,panel] of PANELS.entries()) {
  close(panel.start,index*WORLD.totalLength/6);
  close(panel.length,SCENE_LENGTH);
  const center=panel.start+panel.length/2;
  assert.strictEqual(panelAt(center),panel);
  assert.equal(sceneAt(center),index);
  assert.equal(panel.isPlaceholder,index>=4);
  if(index<4) assert.deepEqual(panel.source,LEVELS['level'+(index+1)]);
  else assert.equal(panel.source.platforms.length,1);
  expectedGroups+=panel.source.platforms.length;
  for(const [lineIndex,line] of panel.source.platforms.entries()) {
    const parts=groups.get(index+':'+lineIndex);
    const start=panel.start+line.x1*panel.pixelScale,end=panel.start+line.x2*panel.pixelScale;
    close(parts[0].s0,start);
    close(parts.at(-1).s1,end);
    let previous=start;
    for(const part of parts) {
      close(part.s0,previous);
      close(part.radius,line.halfThickness*panel.pixelScale);
      previous=part.s1;
    }
    // Endpoint heights must follow each original stroke, including sloped stairs.
    for(const [px,y,part,endpoint] of [
      [line.x1,line.y1,parts[0],'a'],[line.x2,line.y2,parts.at(-1),'b'],
    ]) {
      const point=worldAt(panel.start+px*panel.pixelScale,(panel.baseline-y)*panel.pixelScale);
      close(part[endpoint+'x'],point.x);
      close(part[endpoint+'y'],point.y);
    }
  }
}
assert.equal(groups.size,expectedGroups,'no extra floor fills the image masks');

for(const pixelX of [750,1458]) {
  const point=worldAt(pixelX*PANELS[0].pixelScale);
  assert.ok(nearestSurface(point.x,point.y).surfaceDistance>.4,'level1 floor gaps remain open');
}
assert.equal(LEVELS.level3.platforms.length,1);
assert.equal(LEVELS.level3.platforms[0].x2,LEVELS.level3.width);
assert.equal(LEVELS.level4.platforms.filter(line=>line.y1!==line.y2).length,2);

function floorCollider(panel,atEnd) {
  const lineIndex=panel.source.platforms.findIndex(line=>line.x2-line.x1>panel.source.width*.2 &&
    (atEnd?line.x2>=panel.source.width-16:line.x1===0));
  const parts=groups.get(panel.index+':'+lineIndex);
  return atEnd?parts.at(-1):parts[0];
}
for(const transition of TRANSITIONS) {
  const panel=PANELS[transition.index],next=PANELS[(transition.index+1)%6];
  close(transition.start,panel.start+panel.length);
  close(transition.length,SCENE_LENGTH*1380/2172);
  close(transition.end,next.index===0?WORLD.totalLength:next.start);
  const center=(transition.start+transition.end)/2;
  assert.equal(panelAt(center),null);
  assert.strictEqual(transitionAt(center),transition);

  const bridge=groups.get('transition:'+transition.index);
  close(bridge[0].s0,transition.groundStart);
  close(bridge.at(-1).s1,transition.end);
  for(let sample=1;sample<20;sample++) {
    const s=transition.start+transition.length*sample/20;
    const point=floorPoint(s),surface=nearestSurface(point.x,point.y),up=samplePath(s/WORLD.totalLength);
    assert.ok(Math.abs(surface.surfaceDistance-WORLD.radius)<.02,'connector has walkable ground throughout');
    assert.ok(surface.nx*up.nx+surface.ny*up.ny>.95);
  }
  for(const [exit,entry] of [[floorCollider(panel,true),bridge[0]],[bridge.at(-1),floorCollider(next,false)]]) {
    assert.ok(Math.hypot(exit.bx-entry.ax,exit.by-entry.ay)<=exit.radius+entry.radius,
      'connector touches both source floors, including the ring seam');
  }
}
console.log('Six equal scene slots, four distinct images, two illustrated connectors and all six ground joins verified.');
