import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { PlayerInput } from '@ninjarena/core';
import { duelConfig } from '../testing/matchConfig';
import type { TouchContext, TouchSlot, TouchState } from './touchInput';
import {
  aimDrag,
  createTouchState,
  queueFire,
  readySlots,
  stickVector,
  touchPlayerInput,
} from './touchInput';

const TICK_MS = 1000 / 60;
const ALL_READY = 0b11111;
const SWING: TouchSlot = { shape: { kind: 'cone', reach: 20, arcDegrees: 90 }, startupMs: 100 };
const ESCAPE: TouchSlot = {
  shape: { kind: 'line', reach: 96, spreadDegrees: 0, offensive: false },
  startupMs: 0,
};
const STRIKE: TouchSlot = {
  shape: { kind: 'area', range: 180, radius: 36, free: true },
  startupMs: 250,
};

function stateWith(...slots: TouchSlot[]): TouchState {
  const state = createTouchState();
  state.slots = slots;
  return state;
}

function context(overrides: Partial<TouchContext> = {}): TouchContext {
  return { position: { x: 0, y: 0 }, enemies: [], ready: ALL_READY, tickMs: TICK_MS, ...overrides };
}

function run(state: TouchState, ctx: TouchContext, ticks: number): PlayerInput[] {
  return Array.from({ length: ticks }, () => touchPlayerInput(state, ctx));
}

function tap(state: TouchState, slot: number): void {
  queueFire(state, { slot, direction: null, reach: 0 });
}

describe('stickVector', () => {
  it('runs at full speed toward the thumb once out of the dead zone', () => {
    expect(stickVector({ x: 3, y: 4 }, 10)).toEqual({ x: 0, y: 0 });
    const move = stickVector({ x: 30, y: 40 }, 10);
    expect(move.x).toBeCloseTo(0.6);
    expect(move.y).toBeCloseTo(0.8);
  });
});

describe('aimDrag', () => {
  it('has no direction inside the dead zone and reaches 1 at the edge of the radius', () => {
    expect(aimDrag({ x: 5, y: 0 }, 72, 16)).toEqual({ direction: null, reach: 0 });
    expect(aimDrag({ x: 0, y: 44 }, 72, 16)).toEqual({ direction: { x: 0, y: 1 }, reach: 0.5 });
    expect(aimDrag({ x: -200, y: 0 }, 72, 16).reach).toBe(1);
  });
});

describe('touchPlayerInput', () => {
  it('walks along the stick and keeps facing that way once it stops', () => {
    const state = stateWith(SWING);
    state.move = { x: 0, y: 1 };
    expect(touchPlayerInput(state, context())).toMatchObject({
      move: { x: 0, y: 1 },
      aim: { x: 0, y: 1 },
      abilityHeld: 0,
    });
    state.move = { x: 0, y: 0 };
    expect(touchPlayerInput(state, context()).aim).toEqual({ x: 0, y: 1 });
  });

  it('faces the finger while a button is held, without pressing it', () => {
    const state = stateWith(SWING);
    state.aiming = { slot: 0, direction: { x: -1, y: 0 }, reach: 0.3 };
    expect(touchPlayerInput(state, context())).toMatchObject({
      aim: { x: -1, y: 0 },
      abilityHeld: 0,
    });
  });

  it('turns toward the nearest enemy for a tick, then presses the tapped slot', () => {
    const state = stateWith(SWING);
    tap(state, 0);
    const enemies = [
      { x: 100, y: 0 },
      { x: 0, y: 50 },
    ];
    const inputs = run(state, context({ enemies }), 6);
    expect(inputs.map((input) => input.abilityHeld)).toEqual([0, 1, 1, 1, 0, 0]);
    expect(inputs.slice(0, 4).map((input) => input.aim)).toEqual(
      Array.from({ length: 4 }, () => ({ x: 0, y: 1 })),
    );
  });

  it('keeps facing forward when no enemy is close enough', () => {
    const state = stateWith(SWING);
    tap(state, 0);
    const inputs = run(state, context({ enemies: [{ x: -1000, y: 0 }] }), 2);
    expect(inputs[1]?.aim).toEqual({ x: 1, y: 0 });
  });

  it('dashes where the stick points rather than at an enemy', () => {
    const state = stateWith(SWING, ESCAPE);
    state.move = { x: 0, y: -1 };
    tap(state, 1);
    const inputs = run(state, context({ enemies: [{ x: 30, y: 0 }] }), 2);
    expect(inputs[1]).toMatchObject({ aim: { x: 0, y: -1 }, abilityHeld: 0b10 });
  });

  it('holds a dragged aim until the cast has had time to start', () => {
    const state = stateWith(SWING);
    queueFire(state, { slot: 0, direction: { x: 0, y: 1 }, reach: 1 });
    state.move = { x: 1, y: 0 };
    const inputs = run(state, context(), 30);
    // Un tick pour se tourner, trois d'appui, puis les six ticks d'incantation de 100 ms.
    expect(inputs.slice(0, 10).every((input) => input.aim.y === 1)).toBe(true);
    expect(inputs[29]?.aim).toEqual({ x: 1, y: 0 });
  });

  it('lands a strike at the dragged share of its range, or on the tapped target', () => {
    const dragged = stateWith(STRIKE);
    queueFire(dragged, { slot: 0, direction: { x: 1, y: 0 }, reach: 0.5 });
    expect(run(dragged, context(), 2)[1]?.aimDistance).toBe(90);
    const tapped = stateWith(STRIKE);
    tap(tapped, 0);
    expect(run(tapped, context({ enemies: [{ x: 0, y: 120 }] }), 2)[1]?.aimDistance).toBe(120);
  });

  it('waits for a busy slot, then presses it once it is ready', () => {
    const state = stateWith(SWING);
    tap(state, 0);
    const busy = run(state, context({ ready: 0 }), 5);
    expect(busy.every((input) => input.abilityHeld === 0)).toBe(true);
    expect(run(state, context(), 2)[1]?.abilityHeld).toBe(1);
  });

  it('drops a tap that stays refused for too long', () => {
    const state = stateWith(SWING);
    tap(state, 0);
    run(state, context({ ready: 0 }), 30);
    expect(run(state, context(), 5).every((input) => input.abilityHeld === 0)).toBe(true);
  });

  it('releases the button between two presses of the same slot', () => {
    const state = stateWith(SWING);
    tap(state, 0);
    const first = run(state, context(), 2);
    tap(state, 0);
    const held = [...first, ...run(state, context(), 20)].map((input) => input.abilityHeld);
    const presses = held.filter((bit, index) => bit === 1 && held[index - 1] !== 1);
    expect(presses).toHaveLength(2);
  });
});

describe('readySlots', () => {
  const content = loadContent();
  const simulation = (): GameSimulation =>
    new GameSimulation({
      maps: [loadMap(content, 'arena')],
      abilities: content.abilities,
      characters: content.characters,
      matchConfig: duelConfig(content),
      rules: content.statRules,
    });

  it('lists the slots off cooldown with enough chakra, during a round only', () => {
    const sim = simulation();
    const player = sim.addPlayer({
      id: 'me',
      teamId: 'team-0',
      characterId: 'ninja',
      techniqueIds: ['fireball', 'seismic-slam', 'earth-wall'],
    });
    expect(readySlots(sim.world, 'me', content.abilities)).toBe(0);
    sim.world.match.phase = 'IN_ROUND';
    expect(readySlots(sim.world, 'me', content.abilities)).toBe(0b11111);
    const fireball = player.abilities[2];
    if (fireball === undefined) throw new Error('the ninja has no first technique');
    fireball.readyAt = sim.world.tick + 1;
    player.chakra = 0;
    expect(readySlots(sim.world, 'me', content.abilities)).toBe(0b00001);
  });
});
