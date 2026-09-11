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
  rttMs: number | null;
}

interface Bar {
  fill: HTMLElement;
  label: HTMLElement;
  width: string;
  text: string;
}

interface AbilityChip {
  root: HTMLElement;
  cooldown: HTMLElement;
  name: HTMLElement;
  timer: HTMLElement;
  hidden: boolean;
  cooling: boolean;
  nameText: string;
  timerText: string;
  height: string;
}

const MS_PER_SECOND = 1000;

export class Hud {
  private readonly phase: HTMLElement;
  private readonly status: HTMLElement;
  private readonly health: Bar;
  private readonly energy: Bar;
  private readonly abilityList: HTMLElement;
  private readonly chips: AbilityChip[] = [];
  private phaseText = '';
  private statusText = '';

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

  // Le HUD est mis à jour à chaque image: chaque écriture DOM est conditionnée au changement.
  update(view: HudView): void {
    const phase = phaseText(view);
    if (this.phaseText !== phase) {
      this.phaseText = phase;
      this.phase.textContent = phase;
    }
    const status = statusText(view);
    if (this.statusText !== status) {
      this.statusText = status;
      this.status.textContent = status;
    }
    updateBar(this.health, view.health, view.maxHealth);
    updateBar(this.energy, view.energy, view.maxEnergy);
    this.updateAbilities(view.abilities);
  }

  private updateAbilities(abilities: readonly HudAbilityView[]): void {
    while (this.chips.length < abilities.length) this.chips.push(createChip(this.abilityList));
    for (let i = 0; i < this.chips.length; i++) {
      const chip = this.chips[i];
      if (chip === undefined) continue;
      updateChip(chip, abilities[i]);
    }
  }
}

function updateChip(chip: AbilityChip, ability: HudAbilityView | undefined): void {
  const hidden = ability === undefined;
  if (chip.hidden !== hidden) {
    chip.hidden = hidden;
    chip.root.hidden = hidden;
  }
  if (ability === undefined) return;
  const cooling = ability.remainingMs > 0;
  if (chip.cooling !== cooling) {
    chip.cooling = cooling;
    chip.root.classList.toggle('is-cooling', cooling);
  }
  if (chip.nameText !== ability.name) {
    chip.nameText = ability.name;
    chip.name.textContent = ability.name;
  }
  const timer = cooling ? `${(ability.remainingMs / MS_PER_SECOND).toFixed(1)}s` : 'ready';
  if (chip.timerText !== timer) {
    chip.timerText = timer;
    chip.timer.textContent = timer;
  }
  const ratio = ability.cooldownMs > 0 ? ability.remainingMs / ability.cooldownMs : 0;
  const height = `${Math.round(clamp01(ratio) * 100)}%`;
  if (chip.height !== height) {
    chip.height = height;
    chip.cooldown.style.height = height;
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

function statusText(view: HudView): string {
  if (view.rttMs === null) return view.status;
  return `${view.status} · ${Math.round(view.rttMs)} ms`;
}

function updateBar(bar: Bar, value: number, max: number): void {
  const width = `${clamp01(max > 0 ? value / max : 0) * 100}%`;
  if (bar.width !== width) {
    bar.width = width;
    bar.fill.style.width = width;
  }
  const text = `${Math.round(value)} / ${Math.round(max)}`;
  if (bar.text !== text) {
    bar.text = text;
    bar.label.textContent = text;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createBar(parent: HTMLElement, className: string): Bar {
  const root = element('div', `hud-bar ${className}`, parent);
  return {
    fill: element('div', 'hud-bar-fill', root),
    label: element('div', 'hud-bar-label', root),
    width: '100%',
    text: '',
  };
}

function createChip(parent: HTMLElement): AbilityChip {
  const root = element('div', 'hud-chip', parent);
  return {
    root,
    cooldown: element('div', 'hud-chip-cooldown', root),
    name: element('div', 'hud-chip-name', root),
    timer: element('div', 'hud-chip-timer', root),
    hidden: false,
    cooling: false,
    nameText: '',
    timerText: '',
    height: '0%',
  };
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
