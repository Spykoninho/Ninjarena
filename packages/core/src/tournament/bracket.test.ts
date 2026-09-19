import { describe, expect, it } from 'vitest';
import {
  createBracket,
  currentMatch,
  isTournamentOver,
  openNextMatch,
  resolveMatch,
  withdrawPlayer,
} from './bracket';

describe('bracket', () => {
  it('seats four players into two semi-finals and a final', () => {
    const bracket = createBracket(['a', 'b', 'c', 'd'], 4);
    expect(bracket.rounds.map((round) => round.length)).toEqual([2, 1]);
    expect(bracket.rounds[0]?.map((match) => match.players)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(bracket.rounds[1]?.[0]?.players).toEqual([null, null]);
  });

  it('plays the matches one after the other and feeds each winner forward', () => {
    const bracket = createBracket(['a', 'b', 'c', 'd'], 4);
    expect(openNextMatch(bracket)).toEqual({ round: 0, index: 0 });
    expect(currentMatch(bracket)?.players).toEqual(['a', 'b']);
    resolveMatch(bracket, { round: 0, index: 0 }, 'b');
    expect(bracket.current).toBeNull();
    expect(openNextMatch(bracket)).toEqual({ round: 0, index: 1 });
    resolveMatch(bracket, { round: 0, index: 1 }, 'c');
    expect(openNextMatch(bracket)).toEqual({ round: 1, index: 0 });
    expect(currentMatch(bracket)?.players).toEqual(['b', 'c']);
    expect(isTournamentOver(bracket)).toBe(false);
    resolveMatch(bracket, { round: 1, index: 0 }, 'c');
    expect(bracket.championId).toBe('c');
    expect(isTournamentOver(bracket)).toBe(true);
    expect(openNextMatch(bracket)).toBeNull();
  });

  it('walks a player over an opponent who left before their match', () => {
    const bracket = createBracket(['a', 'b', 'c', 'd'], 4);
    withdrawPlayer(bracket, 'c');
    expect(openNextMatch(bracket)).toEqual({ round: 0, index: 0 });
    resolveMatch(bracket, { round: 0, index: 0 }, 'a');
    // Le second match n'a plus qu'un joueur: il ne se joue pas, `d` passe en finale.
    expect(openNextMatch(bracket)).toEqual({ round: 1, index: 0 });
    expect(currentMatch(bracket)?.players).toEqual(['a', 'd']);
    expect(bracket.rounds[0]?.[1]).toEqual({ players: [null, 'd'], winnerId: 'd', played: true });
  });

  it('declares the last player left the champion and nobody when everyone leaves', () => {
    const bracket = createBracket(['a', 'b', 'c', 'd'], 4);
    for (const id of ['a', 'b', 'c']) withdrawPlayer(bracket, id);
    expect(openNextMatch(bracket)).toBeNull();
    expect(bracket.championId).toBe('d');
    const empty = createBracket(['a', 'b'], 4);
    for (const id of ['a', 'b']) withdrawPlayer(empty, id);
    expect(openNextMatch(empty)).toBeNull();
    expect(empty.championId).toBeNull();
  });

  it('ignores a winner who was not in the match and never replays a settled one', () => {
    const bracket = createBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 8);
    expect(bracket.rounds.map((round) => round.length)).toEqual([4, 2, 1]);
    openNextMatch(bracket);
    resolveMatch(bracket, { round: 0, index: 0 }, 'z');
    expect(bracket.rounds[0]?.[0]).toMatchObject({ played: true, winnerId: null });
    resolveMatch(bracket, { round: 0, index: 0 }, 'a');
    expect(bracket.rounds[0]?.[0]?.winnerId).toBeNull();
    expect(bracket.rounds[1]?.[0]?.players).toEqual([null, null]);
  });
});
