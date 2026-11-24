import { stepPlayer } from './physics.js?v=20261123c';

export function createCharacterActions(player, character, feedback) {
  const stepLength = 2.4;
  const firstStepDistance = .95;
  let jumpWindup = 0;
  let walkingDistance = 0;
  let nextStep = firstStepDistance;
  let resting = 0;

  function cancelJump() {
    if (jumpWindup) character.cancelAnticipation();
    jumpWindup = 0;
  }
  function reset() {
    jumpWindup = 0;
    walkingDistance = 0;
    nextStep = firstStepDistance;
    resting = 0;
    character.reset();
    feedback.reset();
  }

  return {
    requestJump() {
      if (jumpWindup || (!player.grounded && player.airJumpUsed)) return;
      jumpWindup = player.grounded ? .05 : .04;
      character.anticipateJump(!player.grounded);
    },
    cancelJump,
    interact() {
      character.interact();
      feedback.emit('interact', player);
    },
    reset,
    step(move, dt) {
      const { x, y, grounded, jumps, respawnId } = player;
      const fallSpeed = -(player.vx * player.nx + player.vy * player.ny);
      const requestsJump = jumpWindup > 0 && jumpWindup <= dt + 1e-8;
      jumpWindup = requestsJump ? 0 : Math.max(0, jumpWindup - dt);
      stepPlayer(player, { move, jump: requestsJump }, dt);

      if (respawnId !== player.respawnId) {
        reset();
        return;
      }
      if (player.jumps > jumps) {
        character.jump(!grounded);
        feedback.emit(grounded ? 'jump' : 'doubleJump', player);
      } else if (requestsJump) {
        character.cancelAnticipation();
      }

      if (!grounded && player.grounded && fallSpeed > 2) {
        const strength = Math.min(1, .35 + fallSpeed / 24);
        character.land(strength);
        feedback.emit('land', player, strength);
      }
      if (!grounded || !player.grounded) {
        walkingDistance = 0;
        nextStep = firstStepDistance;
        return;
      }
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance < dt * .7) {
        resting += dt;
        if (resting > .15) {
          walkingDistance = 0;
          nextStep = firstStepDistance;
        }
        return;
      }
      resting = 0;
      walkingDistance += distance;
      if (walkingDistance >= nextStep) {
        walkingDistance -= nextStep;
        nextStep = stepLength;
        feedback.emit('step', player);
      }
    },
  };
}
