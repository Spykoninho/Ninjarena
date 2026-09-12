import type { Vec2, WorldEvent } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import type { FeedbackView, VisualCue } from './cues';
import { cuesForEvent } from './cues';

const POSITIONS: Record<string, Vec2> = {
  me: { x: 10, y: 20 },
  other: { x: 30, y: 40 },
};

const view: FeedbackView = {
  localPlayerId: 'me',
  positionOf: (id) => POSITIONS[id] ?? null,
  abilityColor: () => '#ff8800',
};

const kinds = (cues: readonly VisualCue[]): string[] => cues.map((cue) => cue.kind);

const damage = (overrides: Partial<Extract<WorldEvent, { type: 'damageDealt' }>> = {}) =>
  ({
    type: 'damageDealt',
    tick: 5,
    targetId: 'other',
    sourceId: 'me',
    amount: 12,
    remainingHealth: 30,
    scaling: 'technique',
    position: { x: 30, y: 40 },
    ...overrides,
  }) satisfies WorldEvent;

describe('cuesForEvent', () => {
  it('flashes, numbers and shakes when the local player takes damage', () => {
    const cue = cuesForEvent(damage({ targetId: 'me', sourceId: 'other' }), view);
    expect(kinds(cue.visual)).toEqual(['hitFlash', 'damageNumber']);
    expect(cue.visual[0]).toEqual({ kind: 'hitFlash', playerId: 'me' });
    expect(cue.visual[1]).toEqual({
      kind: 'damageNumber',
      position: { x: 30, y: 40 },
      amount: 12,
    });
    expect(cue.shake).toBeGreaterThan(0);
    expect(cue.audio).toBe('hit');
  });

  it('does not shake for damage between two remote players', () => {
    const cue = cuesForEvent(damage({ targetId: 'other', sourceId: 'third' }), view);
    expect(kinds(cue.visual)).toEqual(['hitFlash', 'damageNumber']);
    expect(cue.shake).toBe(0);
  });

  it('freezes on the local player physical hit only', () => {
    expect(cuesForEvent(damage({ scaling: 'physical' }), view).hitStopMs).toBe(40);
    expect(cuesForEvent(damage({ scaling: 'technique' }), view).hitStopMs).toBe(0);
    expect(cuesForEvent(damage({ sourceId: 'other', scaling: 'physical' }), view).hitStopMs).toBe(
      0,
    );
  });

  it('flashes the caster with the ability colour', () => {
    const cue = cuesForEvent(
      { type: 'abilityActivated', tick: 3, playerId: 'other', abilityId: 'fireball' },
      view,
    );
    expect(cue.visual).toEqual([{ kind: 'castFlash', playerId: 'other', color: '#ff8800' }]);
    expect(cue.audio).toBe('ability');
  });

  it('bursts and shakes hard on a death', () => {
    const cue = cuesForEvent(
      { type: 'playerDied', tick: 9, playerId: 'other', killerId: 'me' },
      view,
    );
    expect(kinds(cue.visual)).toEqual(['burst']);
    expect(cue.shake).toBe(4);
    expect(cue.audio).toBe('death');
  });

  it('marks a projectile impact but ignores an expired one', () => {
    const hit = cuesForEvent(
      {
        type: 'projectileDestroyed',
        tick: 7,
        projectileId: 'p1',
        reason: 'hit',
        position: { x: 1, y: 2 },
      },
      view,
    );
    expect(kinds(hit.visual)).toEqual(['impact']);
    const expired = cuesForEvent(
      {
        type: 'projectileDestroyed',
        tick: 7,
        projectileId: 'p1',
        reason: 'expired',
        position: { x: 1, y: 2 },
      },
      view,
    );
    expect(expired.visual).toEqual([]);
    expect(expired.audio).toBe(null);
  });

  it('bursts at both ends of a teleport', () => {
    const cue = cuesForEvent(
      {
        type: 'teleported',
        tick: 2,
        playerId: 'me',
        from: { x: 0, y: 0 },
        to: { x: 50, y: 50 },
      },
      view,
    );
    expect(kinds(cue.visual)).toEqual(['burst', 'burst']);
    expect(cue.audio).toBe('dash');
  });

  it('sizes an area blast to its radius and paints it with its visual', () => {
    const cue = cuesForEvent(
      {
        type: 'areaResolved',
        tick: 8,
        ownerId: 'me',
        position: { x: 12, y: 34 },
        radius: 40,
        visual: { color: '#ff3300', size: 6, trail: false },
      },
      view,
    );
    expect(cue.visual).toEqual([
      { kind: 'impact', position: { x: 12, y: 34 }, color: '#ff3300', size: 40 },
      { kind: 'burst', position: { x: 12, y: 34 }, color: '#ff3300', count: 12 },
    ]);
    expect(cue.audio).toBe('impact');
  });

  it('falls back to white when an area carries no visual', () => {
    const cue = cuesForEvent(
      {
        type: 'areaResolved',
        tick: 8,
        ownerId: 'me',
        position: { x: 0, y: 0 },
        radius: 20,
        visual: null,
      },
      view,
    );
    expect(cue.visual.map((visual) => 'color' in visual && visual.color)).toEqual([
      '#ffffff',
      '#ffffff',
    ]);
  });

  it('bursts where a zone fires', () => {
    const cue = cuesForEvent(
      { type: 'zoneTriggered', tick: 6, id: 'z1', position: { x: 7, y: 8 } },
      view,
    );
    expect(cue.visual).toEqual([
      { kind: 'burst', position: { x: 7, y: 8 }, color: '#ffffff', count: 14 },
    ]);
    expect(cue.audio).toBe('impact');
  });

  it('marks a spawned wall on its owner and stays silent about an unknown one', () => {
    const spawned = cuesForEvent(
      { type: 'obstacleSpawned', tick: 4, id: 'w1', ownerId: 'other' },
      view,
    );
    expect(spawned.visual).toEqual([
      { kind: 'impact', position: { x: 30, y: 40 }, color: '#ffffff', size: 8 },
    ]);
    const unknown = cuesForEvent(
      { type: 'obstacleSpawned', tick: 4, id: 'w2', ownerId: 'ghost' },
      view,
    );
    expect(unknown.visual).toEqual([]);
    expect(unknown.audio).toBe('impact');
  });

  it('keeps the round cues of the previous mapping', () => {
    expect(cuesForEvent({ type: 'roundStarted', tick: 0, round: 1 }, view).audio).toBe(
      'round-start',
    );
    expect(cuesForEvent({ type: 'matchEnded', tick: 90, winnerTeamId: 'team-0' }, view).audio).toBe(
      'round-end',
    );
    expect(
      cuesForEvent({ type: 'phaseChanged', tick: 3, playerId: 'me', phase: 'NORMAL' }, view).audio,
    ).toBe(null);
  });
});
