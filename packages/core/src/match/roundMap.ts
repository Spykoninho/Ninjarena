// La manche N se joue sur la N-ième carte; une liste plus courte que le match tourne en boucle.
export function mapForRound<T>(maps: readonly T[], round: number): T {
  const first = maps[0];
  if (first === undefined) throw new Error('a match needs at least one map');
  return maps[Math.max(0, round - 1) % maps.length] ?? first;
}
