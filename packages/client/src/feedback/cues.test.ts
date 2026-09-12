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
