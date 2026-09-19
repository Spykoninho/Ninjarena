export const TOURNAMENT_SIZES = [4, 8] as const;

export type TournamentSize = (typeof TOURNAMENT_SIZES)[number];

export interface BracketMatch {
  players: [string | null, string | null];
  winnerId: string | null;
  played: boolean;
}

export interface MatchRef {
  round: number;
  index: number;
}

// L'arbre à élimination directe: un tour par colonne, chaque match nourrit le tour suivant.
export interface Bracket {
  size: number;
  rounds: BracketMatch[][];
  current: MatchRef | null;
  championId: string | null;
}

export function isTournamentSize(value: number): value is TournamentSize {
  return TOURNAMENT_SIZES.some((size) => size === value);
}

// Les joueurs se placent dans l'ordre donné: l'appelant les mélange s'il veut un tirage au sort.
export function createBracket(playerIds: readonly string[], size: TournamentSize): Bracket {
  const rounds: BracketMatch[][] = [];
  for (let matches = size / 2; matches >= 1; matches /= 2) {
    rounds.push(
      Array.from({ length: matches }, () => ({
        players: [null, null],
        winnerId: null,
        played: false,
      })),
    );
  }
  const first = rounds[0] ?? [];
  playerIds.slice(0, size).forEach((id, seat) => {
    const match = first[Math.floor(seat / 2)];
    if (match !== undefined) match.players[seat % 2] = id;
  });
  return { size, rounds, current: null, championId: null };
}

export function matchAt(bracket: Bracket, ref: MatchRef): BracketMatch | undefined {
  return bracket.rounds[ref.round]?.[ref.index];
}

export function currentMatch(bracket: Bracket): BracketMatch | null {
  return bracket.current === null ? null : (matchAt(bracket, bracket.current) ?? null);
}

// Le prochain match à jouer, dans l'ordre de lecture: les matches sans adversaire passent d'office.
export function openNextMatch(bracket: Bracket): MatchRef | null {
  for (let round = 0; round < bracket.rounds.length; round++) {
    const matches = bracket.rounds[round] ?? [];
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      if (match === undefined || match.played) continue;
      const ref = { round, index };
      const [a, b] = match.players;
      if (a !== null && b !== null) {
        bracket.current = ref;
        return ref;
      }
      resolveMatch(bracket, ref, a ?? b);
    }
  }
  return null;
}

export function resolveMatch(bracket: Bracket, ref: MatchRef, winnerId: string | null): void {
  const match = matchAt(bracket, ref);
  if (match === undefined || match.played) return;
  match.played = true;
  match.winnerId = winnerId !== null && match.players.includes(winnerId) ? winnerId : null;
  if (bracket.current?.round === ref.round && bracket.current.index === ref.index) {
    bracket.current = null;
  }
  const next = matchAt(bracket, { round: ref.round + 1, index: Math.floor(ref.index / 2) });
  if (next === undefined) {
    bracket.championId = match.winnerId;
    return;
  }
  next.players[ref.index % 2] = match.winnerId;
}

// Un joueur parti libère sa place partout où il n'a pas encore joué; son match en cours se règle ailleurs.
export function withdrawPlayer(bracket: Bracket, playerId: string): void {
  for (const matches of bracket.rounds) {
    for (const match of matches) {
      if (match.played) continue;
      for (let seat = 0; seat < match.players.length; seat++) {
        if (match.players[seat] === playerId) match.players[seat] = null;
      }
    }
  }
}

export function isTournamentOver(bracket: Bracket): boolean {
  const final = bracket.rounds.at(-1)?.[0];
  return final === undefined || final.played;
}
