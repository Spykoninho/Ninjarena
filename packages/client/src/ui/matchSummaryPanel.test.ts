import { describe, expect, it } from 'vitest';
import type { MatchSummary, MatchSummaryPlayer } from '@ninjarena/protocol';
import { standings, verdict, winnersLine } from './matchSummaryPanel';

function player(id: string, teamId: string, damageDealt: number): MatchSummaryPlayer {
  return { id, name: id, teamId, damageDealt, damageTaken: 0, kills: 0, deaths: 0, rating: null };
}

const summary: MatchSummary = {
  winnerTeamId: 'team-1',
  scores: { 'team-0': 1, 'team-1': 2 },
  ranked: false,
  players: [player('a', 'team-0', 90), player('b', 'team-1', 20), player('c', 'team-1', 70)],
};

describe('standings', () => {
  it('lists the winners first, then by damage dealt', () => {
    expect(standings(summary).map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('verdict', () => {
  it('speaks from the local player’s side, and names a draw', () => {
    expect(verdict(summary, summary.players[1] ?? null)).toBe('VICTOIRE');
    expect(verdict(summary, summary.players[0] ?? null)).toBe('DÉFAITE');
    expect(verdict(summary, null)).toBe('FIN DE PARTIE');
    expect(verdict({ ...summary, winnerTeamId: null }, null)).toBe('ÉGALITÉ');
  });
});

describe('winnersLine', () => {
  it('names one winner, joins several and admits a draw', () => {
    expect(winnersLine(summary)).toBe('b et c l’emportent');
    expect(winnersLine({ ...summary, winnerTeamId: 'team-0' })).toBe('a l’emporte');
    expect(winnersLine({ ...summary, winnerTeamId: null })).toBe('Personne ne l’emporte');
  });
});
