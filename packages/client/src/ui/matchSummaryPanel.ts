import type { MatchSummary, MatchSummaryPlayer } from '@ninjarena/protocol';
import { teamCodes } from '../rendering/art/presentation';
import { teamColor, teamPlateCanvas } from './hudGlyphs';
import { PixelText } from './pixelText';

const PLATE_SIZE = 9;

const COLUMNS = ['Joueur', 'Dégâts infligés', 'Dégâts subis', 'Élim.', 'Morts'];

// L'écran de fin: qui l'emporte, puis le bilan de chacun tant que la salle montre le résultat.
export class MatchSummaryPanel {
  private readonly root: HTMLElement;
  private readonly title = new PixelText({ scale: 4 });
  private readonly subtitle: HTMLElement;
  private readonly table: HTMLTableElement;
  private readonly hint: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = element('div', 'hud-summary hud-ink', parent);
    this.root.hidden = true;
    const head = element('div', 'hud-summary-head', this.root);
    head.appendChild(this.title.canvas);
    this.subtitle = element('div', 'hud-summary-subtitle', head);
    this.table = document.createElement('table');
    this.table.className = 'hud-summary-table';
    this.root.appendChild(this.table);
    this.hint = element('div', 'hud-summary-hint', this.root);
    this.hint.textContent = 'Retour au salon dans quelques secondes';
  }

  show(summary: MatchSummary, localPlayerId: string | null): void {
    const local = summary.players.find((player) => player.id === localPlayerId) ?? null;
    const codes = teamCodes(summary.players.map((player) => player.teamId));
    this.title.set(verdict(summary, local));
    this.title.setColor(verdictColor(summary, local, codes));
    this.subtitle.textContent = winnersLine(summary);
    this.renderTable(summary, localPlayerId, codes);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  private renderTable(
    summary: MatchSummary,
    localPlayerId: string | null,
    codes: Map<string, number>,
  ): void {
    this.table.replaceChildren();
    const headRow = element('tr', '', element('thead', '', this.table));
    const columns = summary.ranked ? [...COLUMNS, 'Score'] : COLUMNS;
    for (const label of columns) element('th', '', headRow).textContent = label;
    const body = element('tbody', '', this.table);
    for (const player of standings(summary)) {
      const row = element('tr', 'hud-summary-row', body);
      if (player.id === localPlayerId) row.classList.add('is-local');
      if (player.teamId === summary.winnerTeamId) row.classList.add('is-winner');
      const who = element('td', 'hud-summary-player', row);
      who.appendChild(plate(codes.get(player.teamId) ?? 0));
      element('span', 'hud-summary-name', who).textContent = player.name;
      element('td', 'hud-summary-number', row).textContent = String(Math.round(player.damageDealt));
      element('td', 'hud-summary-number', row).textContent = String(Math.round(player.damageTaken));
      element('td', 'hud-summary-number', row).textContent = String(player.kills);
      element('td', 'hud-summary-number', row).textContent = String(player.deaths);
      if (summary.ranked) this.renderRating(row, player);
    }
  }

  private renderRating(row: HTMLElement, player: MatchSummaryPlayer): void {
    const cell = element('td', 'hud-summary-number', row);
    if (player.rating === null) {
      cell.textContent = '—';
      return;
    }
    const delta = player.rating.after - player.rating.before;
    element('span', '', cell).textContent = `${player.rating.after} `;
    const change = element('span', 'hud-summary-delta', cell);
    change.textContent = delta >= 0 ? `+${delta}` : `${delta}`;
    change.classList.add(delta >= 0 ? 'is-gain' : 'is-loss');
  }
}

// Les vainqueurs d'abord, puis les plus gros dégâts: le tableau se lit comme un podium.
export function standings(summary: MatchSummary): MatchSummaryPlayer[] {
  return [...summary.players].sort((a, b) => {
    const aWon = a.teamId === summary.winnerTeamId ? 1 : 0;
    const bWon = b.teamId === summary.winnerTeamId ? 1 : 0;
    return bWon - aWon || b.damageDealt - a.damageDealt || a.name.localeCompare(b.name);
  });
}

export function verdict(summary: MatchSummary, local: MatchSummaryPlayer | null): string {
  if (summary.winnerTeamId === null) return 'ÉGALITÉ';
  if (local === null) return 'FIN DE PARTIE';
  return local.teamId === summary.winnerTeamId ? 'VICTOIRE' : 'DÉFAITE';
}

export function winnersLine(summary: MatchSummary): string {
  if (summary.winnerTeamId === null) return 'Personne ne l’emporte';
  const winners = summary.players
    .filter((player) => player.teamId === summary.winnerTeamId)
    .map((player) => player.name);
  if (winners.length === 0) return 'La partie est terminée';
  if (winners.length === 1) return `${winners[0]} l’emporte`;
  return `${winners.slice(0, -1).join(', ')} et ${winners.at(-1)} l’emportent`;
}

function verdictColor(
  summary: MatchSummary,
  local: MatchSummaryPlayer | null,
  codes: Map<string, number>,
): string {
  const winner = summary.winnerTeamId;
  if (winner === null) return '#f5edcd';
  if (local !== null && local.teamId !== winner) return '#ff8a8a';
  return teamColor(codes.get(winner) ?? 0);
}

function plate(code: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'hud-summary-plate';
  canvas.width = PLATE_SIZE;
  canvas.height = PLATE_SIZE;
  canvas.getContext('2d')?.drawImage(teamPlateCanvas(code), 0, 0);
  return canvas;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
