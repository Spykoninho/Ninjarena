import type { RankTier } from '@ninjarena/core';
import { rankOf } from '@ninjarena/core';

const RANK_LABELS: Record<RankTier, string> = {
  bronze: 'Bronze',
  silver: 'Argent',
  gold: 'Or',
};

export function rankLabel(tier: RankTier): string {
  return RANK_LABELS[tier];
}

export function ratingText(rating: number): string {
  return `${rating} pts`;
}

// Le palier se lit à côté du pseudo partout où un joueur apparaît: salon, accueil, classement.
export function rankBadge(rating: number, className = ''): HTMLElement {
  const tier = rankOf(rating);
  const badge = document.createElement('span');
  badge.className = `rank-badge rank-${tier} ${className}`.trim();
  badge.textContent = rankLabel(tier);
  badge.title = `${rankLabel(tier)} · ${ratingText(rating)}`;
  return badge;
}
