import { describe, expect, it } from 'vitest';
import { loadContent, loadMap } from '@ninjarena/content';
import { GameSimulation } from '@ninjarena/core';
import type { ObstacleState, PendingEffect, ProjectileState, Vec2 } from '@ninjarena/core';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import { duelConfig } from '../testing/matchConfig';
import type { RenderFrameInput } from './renderFrame';
import { buildRenderFrame } from './renderFrame';

const content = loadContent();
const TICK_SECONDS = 1 / 60;

const makeSim = (): GameSimulation => {
  const sim = new GameSimulation({
    maps: [loadMap(content, 'arena')],
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: duelConfig(content),
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

const emptyRemotes = (tick = 0): InterpolatedWorld => ({
  tick,
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
  pierce: false,
  hitPlayerIds: [],
});

const pendingOf = (id: string, ownerId: string, radius: number | null): PendingEffect => ({
  id,
  ownerId,
  triggerRadius: 0,
  teamId: ownerId === 'me' ? 'team-0' : 'team-1',
  position: { x: 60, y: 70 },
  direction: { x: 1, y: 0 },
  createdAt: 0,
  fireAt: 40,
  source: { abilityId: 'seismic-slam', path: '0' },
  radius,
  visual: { color: '#c9a26b', size: 40, trail: false },
  group: null,
  fragile: false,
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
    expect(own).toMatchObject({
      id: 'mine',
      radius: 4,
      color: '#ff6a3d',
      trail: true,
      direction: { x: 1, y: 0 },
    });
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
          ...projectileOf('theirs', 'other', { x: 10, y: 10 }, { x: 0, y: 200 }),
          renderPosition: { x: 12, y: 34 },
        },
      },
    };
    const frame = buildRenderFrame(inputFor(sim, { remotes }));
    expect(frame.projectiles).toEqual([
      {
        id: 'theirs',
        dangerous: true,
        position: { x: 12, y: 34 },
        radius: 4,
        color: '#ff6a3d',
        trail: true,
        direction: { x: 0, y: 1 },
      },
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
      dangerous: false,
      family: 'projectile',
      width: undefined,
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
      abilityId: 'sky-strike',
      startedAt: 0,
      activatesAt: 12,
      activeUntil: 12,
      endsAt: 27,
      activated: false,
    };
    const frame = buildRenderFrame(inputFor(sim, { tick: 3 }));
    expect(frame.players[0]?.telegraph).toMatchObject({
      kind: 'sky-mark',
      size: 36,
      progress: 0.25,
      anchor: { x: 190, y: 20 },
    });
    // Sous le curseur quand il est plus près que la portée: la marque s'y arrête.
    me.aimDistance = 60;
    const closer = buildRenderFrame(inputFor(sim, { tick: 3 }));
    expect(closer.players[0]?.telegraph?.anchor).toEqual({ x: 70, y: 20 });
  });

  it('anchors a ground telegraph where a spawned wall will stand', () => {
    const sim = makeSim();
    const me = sim.world.players['me']!;
    me.aim = { x: 1, y: 0 };
    me.phase = {
      kind: 'CASTING',
      slot: 4,
      abilityId: 'earth-wall',
      startedAt: 0,
      activatesAt: 18,
      activeUntil: 18,
      endsAt: 27,
      activated: false,
    };
    const frame = buildRenderFrame(inputFor(sim, { tick: 9 }));
    expect(frame.players[0]?.telegraph).toMatchObject({
      kind: 'ground-mark',
      family: 'wall',
      size: 48,
      width: 8,
      anchor: { x: 42, y: 20 },
    });
  });

  it('drops the telegraph once the cast has activated', () => {
    const sim = makeSim();
    const me = sim.world.players['me']!;
    me.phase = {
      kind: 'CASTING',
      slot: 3,
      abilityId: 'seismic-slam',
      startedAt: 0,
      activatesAt: 12,
      activeUntil: 12,
      endsAt: 27,
      activated: true,
    };
    expect(buildRenderFrame(inputFor(sim, { tick: 6 })).players[0]?.telegraph).toBeNull();
    me.phase = { ...me.phase, activated: false };
    expect(buildRenderFrame(inputFor(sim, { tick: 12 })).players[0]?.telegraph).toBeNull();
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
      activated: false,
    };
    const winding = buildRenderFrame(inputFor(sim, { tick: 2 }));
    expect(winding.players[0]?.activeArc).toBeNull();
    expect(winding.players[0]?.telegraph).toMatchObject({
      progress: 0.5,
      anchor: { x: 10, y: 20 },
    });
    const active = buildRenderFrame(inputFor(sim, { tick: 6 }));
    expect(active.players[0]?.activeArc).toEqual({ range: 22, arcDegrees: 100 });
    expect(active.players[0]?.telegraph).toBeNull();
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
      {
        id: 'z1',
        dangerous: false,
        position: { x: 60, y: 70 },
        radius: 40,
        color: '#c9a26b',
        progress: 0.25,
      },
    ]);
  });

  it('takes the zones and obstacles of other players from the interpolated world', () => {
    const sim = makeSim();
    const remotes: InterpolatedWorld = {
      ...emptyRemotes(20),
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
  it('reads the progress of remote views from the interpolated tick', () => {
    const sim = makeSim();
    const caster = {
      ...sim.world.players['other']!,
      aim: { x: 1, y: 0 },
      phase: {
        kind: 'CASTING' as const,
        slot: 2,
        abilityId: 'fireball',
        startedAt: 100,
        activatesAt: 110,
        activeUntil: 110,
        endsAt: 119,
        activated: false,
      },
    };
    const remotes: InterpolatedWorld = {
      ...emptyRemotes(105),
      players: { other: { ...caster, renderPosition: { x: 0, y: 0 } } },
      pending: { theirs: { ...pendingOf('theirs', 'other', 40), createdAt: 100, fireAt: 110 } },
    };
    const frame = buildRenderFrame(inputFor(sim, { tick: 112, remotes }));
    // Le tick local court devant l'échantillon: un télégraphe distant serait déjà plein.
    expect(frame.players.find((player) => !player.isLocal)?.telegraph?.progress).toBe(0.5);
    expect(frame.zones[0]?.progress).toBe(0.5);
  });

  it('keeps a remote melee arc dark until the interpolated tick reaches it', () => {
    const sim = makeSim();
    const caster = {
      ...sim.world.players['other']!,
      phase: {
        kind: 'CASTING' as const,
        slot: 0,
        abilityId: 'kunai-strike',
        startedAt: 100,
        activatesAt: 110,
        activeUntil: 115,
        endsAt: 122,
        activated: false,
      },
    };
    const remotes: InterpolatedWorld = {
      ...emptyRemotes(105),
      players: { other: { ...caster, renderPosition: { x: 0, y: 0 } } },
    };
    const frame = buildRenderFrame(inputFor(sim, { tick: 112, remotes }));
    expect(frame.players.find((player) => !player.isLocal)?.activeArc).toBeNull();
  });

  it('fades an obstacle over the last second whatever the tick rate', () => {
    const sim = makeSim();
    sim.world.obstacles['soon'] = obstacleOf('soon', 'me', 90);
    const fast = buildRenderFrame(inputFor(sim, { tick: 60, dt: 1 / 60 }));
    const slow = buildRenderFrame(inputFor(sim, { tick: 75, dt: 1 / 30 }));
    expect(fast.obstacles[0]?.remaining).toBeCloseTo(0.5);
    expect(slow.obstacles[0]?.remaining).toBeCloseTo(0.5);
  });

  it('telegraphs a melee cast as the exact cone it will strike', () => {
    const sim = makeSim();
    const me = sim.world.players['me']!;
    me.aim = { x: 0, y: 1 };
    me.phase = {
      kind: 'CASTING',
      slot: 0,
      abilityId: 'frost-breath',
      startedAt: 0,
      activatesAt: 12,
      activeUntil: 20,
      endsAt: 32,
      activated: false,
    };
    const frame = buildRenderFrame(inputFor(sim, { tick: 6 }));
    expect(frame.players[0]?.telegraph).toMatchObject({
      family: 'melee',
      arc: 80,
      size: 44,
      progress: 0.5,
      direction: { x: 0, y: 1 },
    });
    const active = buildRenderFrame(inputFor(sim, { tick: 14 }));
    expect(active.players[0]?.activeArc).toEqual({ range: 44, arcDegrees: 80, color: '#9fe4f0' });
  });

  it('reports haste and stealth on a player and keeps a stealthed local player drawn', () => {
    const sim = makeSim();
    const me = sim.world.players['me']!;
    me.statuses.push({ type: 'HASTED', expiresAt: 100, magnitude: 1.35 });
    me.statuses.push({ type: 'INVISIBLE', expiresAt: 100 });
    const frame = buildRenderFrame(inputFor(sim));
    expect(frame.players[0]).toMatchObject({ hasted: true, stealthed: true, visible: true });
  });

  it('passes the visual style of a projectile and of a pending zone to their views', () => {
    const sim = makeSim();
    const needle = projectileOf('p1', 'me', { x: 50, y: 50 }, { x: 100, y: 0 });
    needle.visual = { color: '#e8e8f0', size: 2, trail: false, style: 'needle' };
    needle.source = { abilityId: 'senbon-volley', path: '0' };
    sim.world.projectiles['p1'] = needle;
    const zone = pendingOf('z1', 'me', 36);
    zone.visual = { color: '#fff0b0', size: 36, trail: false, style: 'column' };
    zone.source = { abilityId: 'sky-strike', path: '0' };
    sim.world.pending['z1'] = zone;
    const frame = buildRenderFrame(inputFor(sim));
    expect(frame.projectiles[0]).toMatchObject({ id: 'p1', style: 'needle' });
    expect(frame.zones[0]).toMatchObject({ id: 'z1', style: 'column' });
  });
});
