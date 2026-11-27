import assert from 'node:assert/strict';
import LEVELS from './assets/levels.json' with {type:'json'};
import {WORLD,samplePath} from './world.js';
import {SCENE_COUNT,SCENE_LENGTH,TRANSITIONS,PANELS,COLLIDERS,LEVEL3_ENTRY_RAMP,
  panelAt,sceneAt,transitionAt,transitionTop,worldAt,floorPoint} from './scenes.js?v=20261127e';
import {nearestSurface} from './physics.js?v=20261127e';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8);
assert.equal(SCENE_COUNT,6);
assert.equal(PANELS.length,6);
assert.equal(TRANSITIONS.length,6);
close(SCENE_LENGTH,101.00626436394589);
close(6*SCENE_LENGTH*(1+1380/2172),WORLD.totalLength);
assert.deepEqual(PANELS.map(panel=>panel.image),
  ['level1.png','level2.png','level3.png','level4.png','level5.png','level6.png']);
assert.deepEqual(TRANSITIONS.map(transition=>transition.image),
  ['transition-1-2.jpg','transition-2-3.jpg','transition-3-4.jpg','transition-4-5.jpg','transition-5-6.png',null]);
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
  assert.deepEqual(panel.source,LEVELS['level'+(index+1)]);
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
    // Endpoint heights follow the masked ground or the drawn bridge's deck.
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
assert.deepEqual(LEVELS.level4.platforms,[{x1:0,y1:624.5,x2:2163,y2:624.5,halfThickness:3}]);
assert.ok(LEVELS.level6.platforms.some(line=>line.y1!==line.y2),'the final bridge follows its painted arch');

const courtyardGate=TRANSITIONS[1];
const {length,endBefore,rise}=LEVEL3_ENTRY_RAMP;
const rampEnd=courtyardGate.end-endBefore,rampStart=rampEnd-length;
const low=courtyardGate.entryTop-rise;
assert.ok(length>=24,'the uphill grade extends beyond the old stepped entrance');
close(transitionTop(courtyardGate,courtyardGate.start),courtyardGate.exitTop);
close(transitionTop(courtyardGate,rampStart-1),low);
close(transitionTop(courtyardGate,rampStart),low);
close(transitionTop(courtyardGate,rampEnd),courtyardGate.entryTop);
close(transitionTop(courtyardGate,courtyardGate.end),courtyardGate.entryTop);
let last=low;
for(let step=1;step<=52;step++) {
  const s=rampStart+length*step/52;
  const top=transitionTop(courtyardGate,s);
  const grade=(top-last)/(length/52);
  assert.ok(grade>0 && grade<.045,'the ramp climbs continuously on a shallow grade');
  last=top;
}
const near=.01;
assert.ok((transitionTop(courtyardGate,rampStart+near)-low)/near<.001,'the base eases into the incline');
assert.ok((courtyardGate.entryTop-transitionTop(courtyardGate,rampEnd-near))/near<.001,'the slope eases into the level path');
const factoryBridge=TRANSITIONS[2];
close(factoryBridge.exitTop,factoryBridge.entryTop);
close(transitionTop(factoryBridge,factoryBridge.end-1),factoryBridge.entryTop);

function floorCollider(panel,atEnd) {
  const lineIndex=panel.source.platforms.findIndex(line=>atEnd?line.x2>=panel.source.width-16:line.x1===0);
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
console.log('Six illustrated scenes, five illustrated connectors and all six floor joins verified.');
