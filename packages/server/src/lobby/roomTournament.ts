import type { Bracket, BracketMatch, MatchRef } from '@ninjarena/core';
import type { TournamentMatchView, TournamentView } from '@ninjarena/protocol';

// Les noms sont figés au coup d'envoi: un joueur parti reste lisible dans sa case.
export interface TournamentRecord {
  bracket: Bracket;
  names: Map<string, string>;
}

export function tournamentViewOf(record: TournamentRecord): TournamentView {
  const { bracket, names } = record;
  return {
    size: bracket.size,
    rounds: bracket.rounds.map((matches, round) =>
      matches.map((match, index) => matchViewOf(match, names, bracket.current, { round, index })),
    ),
    championId: bracket.championId,
  };
}

function matchViewOf(
  match: BracketMatch,
  names: Map<string, string>,
  current: MatchRef | null,
  ref: MatchRef,
): TournamentMatchView {
  const live = current !== null && current.round === ref.round && current.index === ref.index;
  return {
    players: [seatOf(match.players[0], names), seatOf(match.players[1], names)],
    winnerId: match.winnerId,
    status: match.played ? 'done' : live ? 'live' : 'pending',
  };
}

function seatOf(
  id: string | null,
  names: Map<string, string>,
): { id: string; name: string } | null {
  return id === null ? null : { id, name: names.get(id) ?? id };
}

// Un mélange de Fisher-Yates sur l'entier aléatoire injecté: les tests le rendent déterministe.
export function shuffleWith<T>(items: readonly T[], randomInt: (max: number) => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) continue;
    shuffled[i] = b;
    shuffled[j] = a;
  }
  return shuffled;
}
