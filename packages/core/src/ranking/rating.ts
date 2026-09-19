export const INITIAL_RATING = 100;
export const MIN_RATING = 0;
export const RATING_K_FACTOR = 30;
// Un écart de 200 points vaut dix contre un: l'échelle Elo classique (400) ramenée à des scores à trois chiffres.
export const RATING_SPREAD = 200;

export const RANK_TIERS = [
  { id: 'bronze', minRating: 0 },
  { id: 'silver', minRating: 150 },
  { id: 'gold', minRating: 300 },
] as const;

export type RankTier = (typeof RANK_TIERS)[number]['id'];

export type MatchOutcome = 'win' | 'loss' | 'draw';

export interface RatingStakes {
  win: number;
  loss: number;
}

export interface RatedParticipant {
  id: string;
  teamId: string;
  rating: number;
}

export interface RatingChange {
  id: string;
  before: number;
  after: number;
}

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / RATING_SPREAD));
}

export function ratingAfter(rating: number, opponentRating: number, outcome: MatchOutcome): number {
  const actual = outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5;
  const delta = Math.round(RATING_K_FACTOR * (actual - expectedScore(rating, opponentRating)));
  return Math.max(MIN_RATING, rating + delta);
}

export function ratingStakes(rating: number, opponentRating: number): RatingStakes {
  return {
    win: ratingAfter(rating, opponentRating, 'win') - rating,
    loss: ratingAfter(rating, opponentRating, 'loss') - rating,
  };
}

export function rankOf(rating: number): RankTier {
  let tier: RankTier = RANK_TIERS[0].id;
  for (const candidate of RANK_TIERS) {
    if (rating >= candidate.minRating) tier = candidate.id;
  }
  return tier;
}

export function meanRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

// Chaque joueur est noté contre la moyenne du camp adverse: la même règle sert au duel, aux équipes et au chacun pour soi.
export function settleRatings(
  participants: readonly RatedParticipant[],
  winnerTeamId: string | null,
): RatingChange[] {
  const changes: RatingChange[] = [];
  for (const participant of participants) {
    const opponents = participants.filter((other) => other.teamId !== participant.teamId);
    const opponentRating = meanRating(opponents.map((other) => other.rating));
    if (opponentRating === null) continue;
    const outcome: MatchOutcome =
      winnerTeamId === null ? 'draw' : winnerTeamId === participant.teamId ? 'win' : 'loss';
    changes.push({
      id: participant.id,
      before: participant.rating,
      after: ratingAfter(participant.rating, opponentRating, outcome),
    });
  }
  return changes;
}
