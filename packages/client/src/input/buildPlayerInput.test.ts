import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from './bindings';
import { buildPlayerInput } from './buildPlayerInput';
import { createInputState } from './inputState';

describe('buildPlayerInput', () => {
  it('maps physical keys to a normalized movement vector', () => {
    const state = createInputState();
    state.keysDown.add('KeyW');
    state.keysDown.add('KeyD');
    const input = buildPlayerInput(state, DEFAULT_BINDINGS, { x: 0, y: 0 });
    expect(input.move.x).toBeCloseTo(Math.SQRT1_2);
    expect(input.move.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('aims from the player toward the mouse', () => {
    const state = createInputState();
    state.mouseScreen = { x: 100, y: 200 };
    const input = buildPlayerInput(state, DEFAULT_BINDINGS, { x: 100, y: 100 });
    expect(input.aim).toEqual({ x: 0, y: 1 });
  });

  it('sets ability bits from mouse buttons and keys', () => {
    const state = createInputState();
    state.buttonsDown.add(0);
    state.keysDown.add('Space');
    const input = buildPlayerInput(state, DEFAULT_BINDINGS, { x: 0, y: 0 });
    expect(input.abilityHeld).toBe(0b0101);
  });
});
