import assert from 'node:assert/strict';
import { createCharacterActions } from './character-actions.js?v=20261127e';
import { createPlayer, PHYSICS } from './physics.js?v=20261127e';
import { floorPoint, PANELS } from './scenes.js?v=20261127e';

const player = createPlayer();
const poses = [], cues = [];
const character = {
  anticipateJump: air => poses.push(air ? 'air-windup' : 'ground-windup'),
  cancelAnticipation: () => poses.push('cancel'),
  jump: air => poses.push(air ? 'air-lift' : 'ground-lift'),
  land: () => poses.push('impact'),
  interact: () => poses.push('interact'),
  reset: () => poses.push('reset'),
};
const feedback = { emit: cue => cues.push(cue), reset: () => {} };
const actions = createCharacterActions(player, character, feedback);
function advance(frames, move = 0) {
  for (let i = 0; i < frames; i++) actions.step(move, PHYSICS.fixedDt);
}

actions.interact();
assert.deepEqual(cues, ['interact']);
assert.equal(player.jumps, 0, 'E triggers feedback without modifying jump or movement');
actions.requestJump();
advance(3);
assert.equal(poses.at(-1), 'ground-windup');
assert.ok(player.grounded, 'the ground squash starts before the takeoff impulse');
assert.deepEqual(cues, ['interact']);
advance(4);
assert.equal(player.jumps, 1);
assert.equal(cues.at(-1), 'jump');

advance(15);
actions.requestJump();
advance(2);
assert.equal(poses.at(-1), 'air-windup');
assert.equal(player.jumps, 1, 'the airborne squash also precedes the impulse');
advance(4);
assert.equal(player.jumps, 2);
assert.equal(cues.at(-1), 'doubleJump');
actions.requestJump();
advance(250);
assert.equal(player.jumps, 2, 'a third airborne press cannot create a jump or cue');
assert.ok(player.grounded);
assert.deepEqual(cues, ['interact', 'jump', 'doubleJump', 'land']);
assert.deepEqual(poses, ['interact', 'ground-windup', 'ground-lift', 'air-windup', 'air-lift', 'impact']);

actions.requestJump();
actions.cancelJump();
advance(10);
assert.equal(player.jumps, 2, 'clearing input on blur cancels a queued takeoff');
actions.reset();
Object.assign(player, floorPoint(PANELS[4].start + 4), { vx: 0, vy: 0 });
advance(100, 1);
assert.ok(cues.filter(cue => cue === 'step').length >= 3, 'walking produces distance-spaced footsteps');
advance(35);
const afterStop = cues.length;
advance(100);
assert.equal(cues.length, afterStop, 'standing still produces no footsteps');
