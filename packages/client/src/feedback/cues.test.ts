import type { WorldEvent } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import type { FeedbackView, VisualCue } from './cues';
import { cuesForEvent } from './cues';

const view: FeedbackView = {
  localPlayerId: 'me',
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
    expect(kinds(cue.visual)).toEqual(['hitFlash', 'playerDamageNumber']);
    expect(cue.visual[0]).toEqual({ kind: 'hitFlash', playerId: 'me' });
    expect(cue.visual[1]).toEqual({
      kind: 'playerDamageNumber',
      playerId: 'me',
      amount: 12,
      tone: 'taken',
    });
    expect(cue.shake).toBeGreaterThan(0);
    expect(cue.audio).toBe('hit');
  });

  it('does not shake for damage between two remote players', () => {
    const cue = cuesForEvent(damage({ targetId: 'other', sourceId: 'third' }), view);
    expect(kinds(cue.visual)).toEqual(['hitFlash', 'playerDamageNumber']);
    expect(cue.shake).toBe(0);
    expect(cue.visual[1]).toMatchObject({ tone: 'other' });
  });

  it('tones the number of a hit the local player lands as dealt', () => {
    const cue = cuesForEvent(damage({ targetId: 'other', sourceId: 'me' }), view);
    expect(cue.visual[1]).toMatchObject({ kind: 'playerDamageNumber', tone: 'dealt' });
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

  it('bursts on the dying body and shakes hard on a death', () => {
    const cue = cuesForEvent(
      { type: 'playerDied', tick: 9, playerId: 'other', killerId: 'me' },
      view,
    );
    expect(cue.visual).toEqual([
      { kind: 'playerBurst', playerId: 'other', color: '#ffffff', count: 18 },
    ]);
    expect(cue.shake).toBe(4);
    expect(cue.audio).toBe('death');
  });

  it('anchors a dash contact on the two bodies it involves', () => {
    const cue = cuesForEvent(
      { type: 'dashContact', tick: 11, playerId: 'me', targetId: 'other' },
      view,
    );
    expect(cue.visual).toEqual([
      { kind: 'dashTrail', playerId: 'me' },
      { kind: 'playerImpact', playerId: 'other', color: '#ffffff', size: 5 },
    ]);
    expect(cue.audio).toBe('impact');
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
    expect(kinds(cue.visual)).toEqual(['portal', 'portal', 'burst', 'burst']);
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

  it('marks a spawned wall where the wall stands, not on its owner', () => {
    const spawned = cuesForEvent(
      { type: 'obstacleSpawned', tick: 4, id: 'w1', ownerId: 'other', position: { x: 60, y: 12 } },
      view,
    );
    expect(spawned.visual).toEqual([
      { kind: 'impact', position: { x: 60, y: 12 }, color: '#ffffff', size: 8 },
    ]);
    expect(spawned.audio).toBe('impact');
    const unknownOwner = cuesForEvent(
      { type: 'obstacleSpawned', tick: 4, id: 'w2', ownerId: 'ghost', position: { x: 1, y: 2 } },
      view,
    );
    expect(unknownOwner.visual).toEqual([
      { kind: 'impact', position: { x: 1, y: 2 }, color: '#ffffff', size: 8 },
    ]);
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

  it('bursts and numbers a heal in its own tone', () => {
    const cue = cuesForEvent(
      { type: 'healed', tick: 3, targetId: 'me', sourceId: 'me', amount: 28, remainingHealth: 90 },
      view,
    );
    expect(cue.visual).toEqual([
      { kind: 'playerBurst', playerId: 'me', color: '#92d8b4', count: 10 },
      { kind: 'playerDamageNumber', playerId: 'me', amount: 28, tone: 'heal' },
    ]);
    expect(cue.shake).toBe(0);
  });

  it('drops a column on an area whose visual asks for one', () => {
    const cue = cuesForEvent(
      {
        type: 'areaResolved',
        tick: 8,
        ownerId: 'me',
        position: { x: 12, y: 34 },
        radius: 36,
        visual: { color: '#fff0b0', size: 36, trail: false, style: 'column' },
      },
      view,
    );
    expect(kinds(cue.visual)).toEqual(['column', 'impact', 'burst']);
    expect(cue.visual[0]).toEqual({
      kind: 'column',
      position: { x: 12, y: 34 },
      color: '#fff0b0',
      radius: 36,
    });
  });

  it('puffs smoke on a vanishing player and only announces the buffs', () => {
    const vanish = cuesForEvent(
      { type: 'statusApplied', tick: 2, playerId: 'me', status: 'INVISIBLE', expiresAt: 180 },
      view,
    );
    expect(kinds(vanish.visual)).toEqual(['playerPuff']);
    const haste = cuesForEvent(
      { type: 'statusApplied', tick: 2, playerId: 'me', status: 'HASTED', expiresAt: 180 },
      view,
    );
    expect(kinds(haste.visual)).toEqual(['playerBurst']);
    const slow = cuesForEvent(
      { type: 'statusApplied', tick: 2, playerId: 'me', status: 'SLOWED', expiresAt: 180 },
      view,
    );
    expect(slow.visual).toEqual([]);
  });
});
