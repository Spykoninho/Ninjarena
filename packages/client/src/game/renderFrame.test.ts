import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { ObstacleState, PendingEffect, ProjectileState, Vec2 } from '@ninjarena/core';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import type { RenderFrameInput } from './renderFrame';
import { buildRenderFrame } from './renderFrame';

const content = loadContent();
const TICK_SECONDS = 1 / 60;

const makeSim = (): GameSimulation => {
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: content.matchModes.get('duel'),
    rules: content.statRules,
  });
  sim.addPlayer({
    id: 'me',
    teamId: 'team-0',
    characterId: 'ninja',
    techniqueIds: ['fireball', 'seismic-slam', 'earth-wall'],
    position: { x: 100, y: 100 },
  });
  sim.addPlayer({
    id: 'other',
    teamId: 'team-1',
    characterId: 'ninja',
    position: { x: 200, y: 100 },
  });
  return sim;
};

const inputFor = (
  sim: GameSimulation,
  overrides: Partial<RenderFrameInput> = {},
): RenderFrameInput => ({
  localPlayerId: 'me',
  predicted: sim.world,
  localRenderPosition: { x: 10, y: 20 },
  alpha: 0,
  dt: TICK_SECONDS,
  remotes: null,
  abilities: content.abilities,
  tick: sim.world.tick,
  isFfa: false,
  cameraTarget: { x: 10, y: 20 },
  ...overrides,
});

const emptyRemotes = (): InterpolatedWorld => ({
  players: {},
  projectiles: {},
  pending: {},
  obstacles: {},
});

const projectileOf = (
  id: string,
  ownerId: string,
  position: Vec2,
  velocity: Vec2,
): ProjectileState => ({
  id,
  ownerId,
  teamId: ownerId === 'me' ? 'team-0' : 'team-1',
  position,
  velocity,
  radius: 4,
  expiresAt: 60,
  visual: { color: '#ff6a3d', size: 5, trail: true },
  source: { abilityId: 'fireball', path: '0' },
});

const pendingOf = (id: string, ownerId: string, radius: number | null): PendingEffect => ({
  id,
  ownerId,
  teamId: ownerId === 'me' ? 'team-0' : 'team-1',
  position: { x: 60, y: 70 },
  direction: { x: 1, y: 0 },
  createdAt: 0,
  fireAt: 40,
  source: { abilityId: 'seismic-slam', path: '0' },
  radius,
  visual: { color: '#c9a26b', size: 40, trail: false },
});

const obstacleOf = (id: string, ownerId: string, expiresAt: number): ObstacleState => ({
  id,
  ownerId,
  teamId: ownerId === 'me' ? 'team-0' : 'team-1',
  shape: {
    type: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 48 },
      { x: 0, y: 48 },
    ],
  },
  expiresAt,
  visual: { color: '#8a6a4b', size: 8, trail: false },
  source: { abilityId: 'earth-wall', path: '0' },
});

describe('buildRenderFrame', () => {
  it('draws the local player at its render position and centres the camera on the target', () => {
    const sim = makeSim();
    const frame = buildRenderFrame(inputFor(sim));
    expect(frame.camera).toEqual({ x: 10, y: 20 });
    expect(frame.players).toHaveLength(1);
    expect(frame.players[0]).toMatchObject({
      id: 'me',
      isLocal: true,
      visible: true,
      position: { x: 10, y: 20 },
      phase: 'NORMAL',
      telegraph: null,
      activeArc: null,
      isDashing: false,
      shieldRatio: 0,
      healthRatio: 1,
    });
  });

  it('takes the other players from the interpolated world', () => {
    const sim = makeSim();
    const other = sim.world.players['other']!;
    const remotes: InterpolatedWorld = {
      ...emptyRemotes(),
      players: {
        me: { ...sim.world.players['me']!, renderPosition: { x: 99, y: 99 } },
        other: { ...other, renderPosition: { x: 50, y: 60 } },
      },
    };
    const frame = buildRenderFrame(inputFor(sim, { remotes }));
    expect(frame.players).toHaveLength(2);
    expect(frame.players.find((player) => player.isLocal)?.position).toEqual({ x: 10, y: 20 });
    expect(frame.players.find((player) => !player.isLocal)).toMatchObject({
      id: 'other',
      position: { x: 50, y: 60 },
      visible: true,
    });
  });

  it('hides a remote player made invisible to the local one', () => {
    const sim = makeSim();
    const hidden = {
      ...sim.world.players['other']!,
      statuses: [{ type: 'INVISIBLE' as const, expiresAt: 100 }],
    };
    const remotes: InterpolatedWorld = {
      ...emptyRemotes(),
      players: { other: { ...hidden, renderPosition: { x: 5, y: 5 } } },
    };
    const frame = buildRenderFrame(inputFor(sim, { remotes }));
    expect(frame.players.find((player) => !player.isLocal)?.visible).toBe(false);
  });

  it('reports the remaining shield as a ratio of the maximum health', () => {
    const sim = makeSim();
    sim.world.players['me']!.statuses = [{ type: 'SHIELDED', expiresAt: 100, magnitude: 40 }];
    const frame = buildRenderFrame(inputFor(sim));
    expect(frame.players[0]?.shieldRatio).toBeCloseTo(0.4);
  });

  it('extrapolates the projectiles it owns from the predicted world', () => {
    const sim = makeSim();
    sim.world.projectiles['mine'] = projectileOf('mine', 'me', { x: 0, y: 0 }, { x: 120, y: 0 });
    const frame = buildRenderFrame(inputFor(sim, { alpha: 0.5 }));
    expect(frame.projectiles).toHaveLength(1);
    const own = frame.projectiles[0]!;
    expect(own).toMatchObject({ id: 'mine', radius: 4, color: '#ff6a3d', trail: true });
    expect(own.position.x).toBeCloseTo(1);
    expect(own.position.y).toBeCloseTo(0);
  });

  it('takes the projectiles of other players from the interpolated world', () => {
    const sim = makeSim();
    sim.world.projectiles['theirs'] = projectileOf(
      'theirs',
      'other',
      { x: 999, y: 999 },
      { x: 0, y: 0 },
    );
    const remotes: InterpolatedWorld = {
      ...emptyRemotes(),
      projectiles: {
        theirs: {
          ...projectileOf('theirs', 'other', { x: 10, y: 10 }, { x: 0, y: 0 }),
          renderPosition: { x: 12, y: 34 },
        },
      },
    };
    const frame = buildRenderFrame(inputFor(sim, { remotes }));
    expect(frame.projectiles).toEqual([
      { id: 'theirs', position: { x: 12, y: 34 }, radius: 4, color: '#ff6a3d', trail: true },
    ]);
  });

  it('builds the telegraph of a casting player halfway through its startup', () => {
    const sim = makeSim();
    const me = sim.world.players['me']!;
    me.aim = { x: 1, y: 0 };
    me.phase = {
      kind: 'CASTING',
      slot: 2,
      abilityId: 'fireball',
      startedAt: 0,
      activatesAt: 10,
      activeUntil: 10,
      endsAt: 19,
      activated: false,
    };
    const frame = buildRenderFrame(inputFor(sim, { tick: 5 }));
    expect(frame.players[0]?.telegraph).toEqual({
      kind: 'orb',
      color: '#ff6a3d',
      size: 8,
      progress: 0.5,
      anchor: { x: 18, y: 20 },
      direction: { x: 1, y: 0 },
    });
  });

  it('anchors a ground telegraph at the range of the aimed area', () => {
    const sim = makeSim();
    const me = sim.world.players['me']!;
    me.aim = { x: 1, y: 0 };
    me.phase = {
      kind: 'CASTING',
      slot: 3,
      abilityId: 'seismic-slam',
      startedAt: 5,
      activatesAt: 5,
      activeUntil: 5,
      endsAt: 20,
      activated: true,
    };
    const frame = buildRenderFrame(inputFor(sim, { tick: 5 }));
    expect(frame.players[0]?.telegraph).toMatchObject({
      kind: 'ground-circle',
      size: 40,
      progress: 1,
      anchor: { x: 150, y: 20 },
    });
  });

  it('exposes the active arc of a melee ability during its active window', () => {
    const sim = makeSim();
    const me = sim.world.players['me']!;
    me.phase = {
      kind: 'CASTING',
      slot: 0,
      abilityId: 'kunai-strike',
      startedAt: 0,
      activatesAt: 4,
      activeUntil: 9,
      endsAt: 16,
      activated: true,
    };
    const active = buildRenderFrame(inputFor(sim, { tick: 6 }));
    expect(active.players[0]?.activeArc).toEqual({ range: 22, arcDegrees: 100 });
    expect(active.players[0]?.telegraph).toMatchObject({ progress: 1, anchor: { x: 10, y: 20 } });
    const recovering = buildRenderFrame(inputFor(sim, { tick: 9 }));
    expect(recovering.players[0]?.activeArc).toBeNull();
  });

  it('turns the zones it owns into views progressing toward their trigger', () => {
    const sim = makeSim();
    sim.world.pending['z1'] = pendingOf('z1', 'me', 40);
    sim.world.pending['hidden'] = pendingOf('hidden', 'me', null);
    sim.world.pending['theirs'] = pendingOf('theirs', 'other', 40);
    const frame = buildRenderFrame(inputFor(sim, { tick: 10 }));
    expect(frame.zones).toEqual([
      { id: 'z1', position: { x: 60, y: 70 }, radius: 40, color: '#c9a26b', progress: 0.25 },
    ]);
  });

  it('takes the zones and obstacles of other players from the interpolated world', () => {
    const sim = makeSim();
    const remotes: InterpolatedWorld = {
      ...emptyRemotes(),
      pending: { theirs: pendingOf('theirs', 'other', 40) },
      obstacles: { wall: obstacleOf('wall', 'other', 90) },
    };
    sim.world.pending['theirs'] = pendingOf('theirs', 'other', 40);
    sim.world.obstacles['wall'] = obstacleOf('wall', 'other', 90);
    const frame = buildRenderFrame(inputFor(sim, { tick: 20, remotes }));
    expect(frame.zones).toHaveLength(1);
    expect(frame.zones[0]).toMatchObject({ id: 'theirs', progress: 0.5 });
    expect(frame.obstacles).toHaveLength(1);
  });

  it('passes the points of an obstacle through and fades it over its last second', () => {
    const sim = makeSim();
    sim.world.obstacles['far'] = obstacleOf('far', 'me', 300);
    sim.world.obstacles['soon'] = obstacleOf('soon', 'me', 90);
    const frame = buildRenderFrame(inputFor(sim, { tick: 60 }));
    const far = frame.obstacles.find((obstacle) => obstacle.id === 'far');
    const soon = frame.obstacles.find((obstacle) => obstacle.id === 'soon');
    expect(far).toMatchObject({ color: '#8a6a4b', remaining: 1 });
    expect(far?.points).toEqual([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 48 },
      { x: 0, y: 48 },
    ]);
    expect(soon?.remaining).toBeCloseTo(0.5);
  });
});
