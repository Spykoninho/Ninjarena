import type { TournamentMatchView, TournamentView } from '@ninjarena/protocol';

const ROUND_LABELS: Record<number, string> = { 1: 'Finale', 2: 'Demi-finales', 4: 'Quarts' };

export function roundLabel(round: number, roundCount: number): string {
  const matches = 2 ** (roundCount - round - 1);
  return ROUND_LABELS[matches] ?? `Tour ${round + 1}`;
}

// L'arbre se dessine en colonnes, un tour par colonne, la finale à droite.
export function renderBracket(root: HTMLElement, view: TournamentView, localId: string): void {
  root.replaceChildren();
  view.rounds.forEach((matches, round) => {
    const column = element('div', 'bracket-round', root);
    element('div', 'bracket-round-title', column).textContent = roundLabel(
      round,
      view.rounds.length,
    );
    for (const match of matches) column.appendChild(matchNode(match, localId));
  });
  if (view.championId !== null) {
    const column = element('div', 'bracket-round bracket-champion', root);
    element('div', 'bracket-round-title', column).textContent = 'Vainqueur';
    const box = element('div', 'bracket-match is-done', column);
    const name = championName(view);
    const seat = element('div', 'bracket-seat is-winner', box);
    if (view.championId === localId) seat.classList.add('is-local');
    seat.textContent = name;
  }
}

function matchNode(match: TournamentMatchView, localId: string): HTMLElement {
  const box = document.createElement('div');
  box.className = `bracket-match is-${match.status}`;
  for (const player of match.players) {
    const seat = element('div', 'bracket-seat', box);
    if (player === null) {
      seat.classList.add('is-empty');
      seat.textContent = '—';
      continue;
    }
    seat.textContent = player.name;
    if (player.id === localId) seat.classList.add('is-local');
    if (match.winnerId !== null) {
      seat.classList.add(player.id === match.winnerId ? 'is-winner' : 'is-loser');
    }
  }
  if (match.status === 'live') element('div', 'bracket-live', box).textContent = 'EN COURS';
  return box;
}

function championName(view: TournamentView): string {
  for (const matches of view.rounds) {
    for (const match of matches) {
      const champion = match.players.find((player) => player?.id === view.championId);
      if (champion) return champion.name;
    }
  }
  return view.championId ?? '';
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
