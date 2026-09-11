import type { MatchPhase, TeamId } from '@ninjarena/core';

export interface HudAbilityView {
  name: string;
  remainingMs: number;
  cooldownMs: number;
}

export interface HudView {
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  abilities: HudAbilityView[];
  matchPhase: MatchPhase;
  round: number;
  scores: Record<TeamId, number>;
  status: string;
}

interface Bar {
  fill: HTMLElement;
  label: HTMLElement;
}

interface AbilityChip {
  root: HTMLElement;
  cooldown: HTMLElement;
  name: HTMLElement;
  timer: HTMLElement;
}

const MS_PER_SECOND = 1000;

export class Hud {
  private readonly phase: HTMLElement;
  private readonly status: HTMLElement;
  private readonly health: Bar;
  private readonly energy: Bar;
  private readonly abilityList: HTMLElement;
  private readonly chips: AbilityChip[] = [];

  constructor(root: HTMLElement) {
    root.replaceChildren();
    const top = element('div', 'hud-top', root);
    this.phase = element('div', 'hud-phase', top);
    this.status = element('div', 'hud-status', top);
    const panel = element('div', 'hud-panel', root);
    this.health = createBar(panel, 'hud-bar-health');
    this.energy = createBar(panel, 'hud-bar-energy');
    this.abilityList = element('div', 'hud-abilities', panel);
  }

  update(view: HudView): void {
    this.phase.textContent = phaseText(view);
    this.status.textContent = view.status;
    updateBar(this.health, view.health, view.maxHealth);
    updateBar(this.energy, view.energy, view.maxEnergy);
    this.updateAbilities(view.abilities);
  }

  private updateAbilities(abilities: readonly HudAbilityView[]): void {
    while (this.chips.length < abilities.length) this.chips.push(createChip(this.abilityList));
    for (let i = 0; i < this.chips.length; i++) {
      const chip = this.chips[i];
      const ability = abilities[i];
      if (chip === undefined) continue;
      if (ability === undefined) {
        chip.root.hidden = true;
        continue;
      }
      chip.root.hidden = false;
      chip.root.classList.toggle('is-cooling', ability.remainingMs > 0);
      chip.name.textContent = ability.name;
      chip.timer.textContent =
        ability.remainingMs > 0 ? `${(ability.remainingMs / MS_PER_SECOND).toFixed(1)}s` : 'ready';
      const ratio = ability.cooldownMs > 0 ? ability.remainingMs / ability.cooldownMs : 0;
      chip.cooldown.style.height = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    }
  }
}

function phaseText(view: HudView): string {
  const scores = Object.entries(view.scores)
    .map(([teamId, score]) => `${teamId} ${score}`)
    .join(' · ');
  const round = view.round > 0 ? ` — round ${view.round}` : '';
  return scores.length > 0
    ? `${view.matchPhase}${round} — ${scores}`
    : `${view.matchPhase}${round}`;
}

function updateBar(bar: Bar, value: number, max: number): void {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  bar.fill.style.width = `${ratio * 100}%`;
  bar.label.textContent = `${Math.round(value)} / ${Math.round(max)}`;
}

function createBar(parent: HTMLElement, className: string): Bar {
  const root = element('div', `hud-bar ${className}`, parent);
  return {
    fill: element('div', 'hud-bar-fill', root),
    label: element('div', 'hud-bar-label', root),
  };
}

function createChip(parent: HTMLElement): AbilityChip {
  const root = element('div', 'hud-chip', parent);
  return {
    root,
    cooldown: element('div', 'hud-chip-cooldown', root),
    name: element('div', 'hud-chip-name', root),
    timer: element('div', 'hud-chip-timer', root),
  };
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
