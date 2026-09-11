import { abilityMask, clampLength, isZero, normalize, sub } from '@ninjarena/core';
import type { PlayerInput, Vec2 } from '@ninjarena/core';
import type { InputBindings } from './bindings';
import type { InputState } from './inputState';

const MOUSE_BINDING_PREFIX = 'Mouse';
const FORWARD_AIM: Vec2 = { x: 1, y: 0 };

export function buildPlayerInput(
  state: InputState,
  bindings: InputBindings,
  playerScreenPosition: Vec2,
): PlayerInput {
  const move = clampLength(
    {
      x: axis(state, bindings.right) - axis(state, bindings.left),
      y: axis(state, bindings.down) - axis(state, bindings.up),
    },
    1,
  );
  const aim = normalize(sub(state.mouseScreen, playerScreenPosition));
  const heldSlots: number[] = [];
  for (let slot = 0; slot < bindings.abilities.length; slot++) {
    const binding = bindings.abilities[slot];
    if (binding !== undefined && isBindingDown(state, binding)) heldSlots.push(slot);
  }
  return { move, aim: isZero(aim) ? FORWARD_AIM : aim, abilityHeld: abilityMask(heldSlots) };
}

function axis(state: InputState, binding: string): number {
  return isBindingDown(state, binding) ? 1 : 0;
}

function isBindingDown(state: InputState, binding: string): boolean {
  if (binding.startsWith(MOUSE_BINDING_PREFIX)) {
    const button = Number.parseInt(binding.slice(MOUSE_BINDING_PREFIX.length), 10);
    return Number.isInteger(button) && state.buttonsDown.has(button);
  }
  return state.keysDown.has(binding);
}
