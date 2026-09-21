import type { MatchPhase, TeamId } from '@ninjarena/core';
import type { MatchSummary, TournamentView } from '@ninjarena/protocol';
import { toggleFullscreen } from '../input/fullscreen';
import { P, pen, rect, surface, text } from '../rendering/art/nativeArt';
import { teamCodes } from '../rendering/art/presentation';
import { abilityIconCanvas } from '../rendering/art/abilityIcons';
import { setVisualSetting, visualSettings } from '../rendering/visualSettings';
import {
  gearCanvas,
  lockCanvas,
  portraitCanvas,
  shieldGlyphCanvas,
  teamColor,
  teamPlateCanvas,
} from './hudGlyphs';
import type { KeyBindingsPanel } from './keyBindingsPanel';
import { MatchSummaryPanel } from './matchSummaryPanel';
import { PauseMenu } from './pauseMenu';
import { PixelText } from './pixelText';

export type HudAbilityBlock = 'chakra' | 'control';

export interface HudExitAction {
  label: string;
  run: () => void;
}

export interface HudAbilityView {
  id?: string;
  name: string;
  family?: string;
  available?: boolean;
  reason?: HudAbilityBlock | null;
  binding: string;
  chakraCost: number;
  remainingMs: number;
  cooldownMs: number;
}

export interface HudMinimapTerrain {
  mapId: string;
  widthInTiles: number;
  heightInTiles: number;
  tileSize: number;
  // Une couleur par tuile, ligne par ligne; null pour une case vide.
  colors: readonly (string | null)[];
}

export interface HudMinimapMarker {
  id: string;
  name: string;
  teamCode: number;
  isLocal: boolean;
  x: number;
  y: number;
}

export interface HudMinimapView {
  terrain: HudMinimapTerrain;
  markers: HudMinimapMarker[];
}

export interface HudView {
  health: number;
  maxHealth: number;
  chakra: number;
  maxChakra: number;
  shield: number;
  abilities: HudAbilityView[];
  matchPhase: MatchPhase;
  round: number;
  scores: Record<TeamId, number>;
  roundTimer: string | null;
  buildSummary: string;
  status: string;
  rttMs: number | null;
  spectating: string | null;
  teamId: TeamId | null;
  teamCode: number;
  skin: number;
  watching: boolean;
  minimap: HudMinimapView | null;
}

const MS_PER_SECOND = 1000;
const GHOST_HOLD_MS = 400;
const GHOST_DRAIN_MS = 320;
const BANNER_ROUND_MS = 900;
const BANNER_FIGHT_MS = 700;
const BANNER_PHASE_MS = 1500;
const HEALTH_PER_TICK = 20;
const PORTRAIT_SIZE = 48;
const PLATE_SIZE = 9;
const ICON_SIZE = 24;
const MAX_FRAME_MS = 200;
const MINIMAP_MAX_WIDTH = 128;
const MINIMAP_MAX_HEIGHT = 96;
const MINIMAP_NAME_LENGTH = 6;
const GLYPH_HEIGHT = 7;
const GLYPH_ADVANCE = 6;

const PHASE_LABELS: Record<MatchPhase, string> = {
  WAITING: 'En attente des joueurs',
  COUNTDOWN: 'Préparez-vous',
  IN_ROUND: 'Manche en cours',
  ROUND_END: 'Fin de manche',
  MATCH_END: 'Fin de la partie',
};

const BANNER_LABELS: Record<MatchPhase, string> = {
  WAITING: 'ATTENTE',
  COUNTDOWN: 'EN GARDE',
  IN_ROUND: 'COMBATTEZ',
  ROUND_END: 'FIN DE MANCHE',
  MATCH_END: 'FIN DE PARTIE',
};

export class Hud {
  private readonly match: MatchPanel;
  private readonly banner: Banner;
  private readonly corner: CornerPanel;
  private readonly vitals: VitalsPanel;
  private readonly abilities: AbilityBar;
  private readonly minimap: MinimapPanel;
  private readonly summary: MatchSummaryPanel;
  private readonly pause: PauseMenu;

  constructor(root: HTMLElement, keys: KeyBindingsPanel) {
    root.replaceChildren();
    root.classList.add('hud');
    this.match = new MatchPanel(root);
    this.banner = new Banner(root);
    this.corner = new CornerPanel(root);
    this.vitals = new VitalsPanel(root);
    this.abilities = new AbilityBar(root);
    this.minimap = new MinimapPanel(root);
    this.summary = new MatchSummaryPanel(root);
    this.pause = new PauseMenu(root, keys);
  }

  showSummary(summary: MatchSummary, localPlayerId: string | null): void {
    this.summary.show(summary, localPlayerId);
  }

  setExitAction(action: HudExitAction | null): void {
    this.corner.setExitAction(action);
    this.pause.setExitAction(action);
  }

  setTournament(view: TournamentView | null, localId: string): void {
    this.pause.setTournament(view, localId);
  }

  togglePause(): void {
    this.pause.toggle();
  }

  hidePause(): void {
    this.pause.hide();
  }

  hideSummary(): void {
    this.summary.hide();
  }

  // Le HUD est mis à jour à chaque image: chaque écriture DOM est conditionnée au changement.
  update(view: HudView): void {
    const now = performance.now();
    this.match.update(view);
    this.banner.update(view, now);
    this.corner.update(view);
    this.vitals.update(view, now);
    this.abilities.update(view);
    this.minimap.update(view);
  }
}

class MatchPanel {
  private readonly round = new PixelText({ scale: 2, color: P.wood[2] });
  private readonly timer = new PixelText({ scale: 3 });
  private readonly timerBox: HTMLElement;
  private readonly score: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly status: HTMLElement;
  private readonly spectate: HTMLElement;
  private readonly rows = new Map<string, PixelText>();
  private teamsKey = '';

  constructor(root: HTMLElement) {
    const top = element('div', 'hud-top', root);
    const panel = element('div', 'hud-match hud-ink', top);
    panel.appendChild(this.round.canvas);
    this.score = element('div', 'hud-match-score', panel);
    this.timerBox = document.createElement('div');
    this.timerBox.className = 'hud-match-timer';
    this.timerBox.appendChild(this.timer.canvas);
    this.phase = element('div', 'hud-match-phase', panel);
    const under = element('div', 'hud-under', top);
    this.status = element('div', 'hud-status', under);
    this.spectate = element('div', 'hud-spectate', under);
  }

  update(view: HudView): void {
    this.round.set(view.round > 0 ? `MANCHE ${view.round}` : '');
    this.updateScores(view.scores);
    this.timer.set(view.roundTimer ?? '');
    setText(this.phase, PHASE_LABELS[view.matchPhase]);
    setText(this.status, view.status);
    setText(this.spectate, spectateLabel(view.spectating));
  }

  private updateScores(scores: Record<TeamId, number>): void {
    const codes = teamCodes(Object.keys(scores));
    const key = [...codes.keys()].join(',');
    if (key !== this.teamsKey) {
      this.teamsKey = key;
      this.rebuild(codes);
    }
    for (const [teamId, score] of this.rows) score.set(String(scores[teamId] ?? 0));
  }

  // Le minuteur s'intercale entre les deux premières équipes; au-delà, les équipes passent à la ligne.
  private rebuild(codes: Map<string, number>): void {
    this.rows.clear();
    this.score.replaceChildren();
    let index = 0;
    for (const [teamId, code] of codes) {
      if (index === 1) this.score.appendChild(this.timerBox);
      const root = element('div', 'hud-team', this.score);
      const plate = document.createElement('canvas');
      plate.className = 'hud-team-plate';
      plate.width = PLATE_SIZE;
      plate.height = PLATE_SIZE;
      plate.getContext('2d')?.drawImage(teamPlateCanvas(code), 0, 0);
      const score = new PixelText({ scale: 2, color: teamColor(code) });
      root.append(plate, score.canvas);
      this.rows.set(teamId, score);
      index++;
    }
    if (index < 2) this.score.appendChild(this.timerBox);
  }
}

interface BannerStep {
  text: string;
  durationMs: number;
}

class Banner {
  private readonly root: HTMLElement;
  private readonly text = new PixelText({ scale: 4 });
  private queue: BannerStep[] = [];
  private phase: MatchPhase | null = null;
  private current = '';
  private untilMs = 0;

  constructor(root: HTMLElement) {
    this.root = element('div', 'hud-banner hud-ink', root);
    this.root.appendChild(this.text.canvas);
    this.root.hidden = true;
  }

  update(view: HudView, now: number): void {
    if (this.phase !== view.matchPhase) {
      const previous = this.phase;
      this.phase = view.matchPhase;
      // Rejoindre une manche en cours ne doit pas jouer le bandeau de son début.
      if (previous !== null) this.enqueue(previous, view);
    }
    if (this.current !== '' && now >= this.untilMs) this.current = '';
    while (this.current === '') {
      const step = this.queue.shift();
      if (step === undefined) break;
      if (step.text === '') continue;
      this.current = step.text;
      this.untilMs = now + step.durationMs;
    }
    this.text.set(this.current);
    if (this.root.hidden === (this.current !== '')) this.root.hidden = this.current === '';
  }

  private enqueue(previous: MatchPhase, view: HudView): void {
    if (view.matchPhase === 'IN_ROUND') {
      this.queue = [
        { text: view.round > 0 ? `MANCHE ${view.round}` : '', durationMs: BANNER_ROUND_MS },
        { text: BANNER_LABELS.IN_ROUND, durationMs: BANNER_FIGHT_MS },
      ];
    } else if (previous === 'IN_ROUND') {
      this.queue = [{ text: BANNER_LABELS[view.matchPhase], durationMs: BANNER_PHASE_MS }];
    } else {
      return;
    }
    this.current = '';
    this.untilMs = 0;
  }
}

class CornerPanel {
  private readonly ping: HTMLElement;
  private readonly value = new PixelText({ scale: 2 });
  private readonly exit: HTMLButtonElement;
  private exitAction: HudExitAction | null = null;

  constructor(root: HTMLElement) {
    const corner = element('div', 'hud-corner', root);
    this.exit = document.createElement('button');
    this.exit.type = 'button';
    this.exit.className = 'hud-exit hud-ink';
    this.exit.hidden = true;
    this.exit.addEventListener('click', () => this.exitAction?.run());
    corner.appendChild(this.exit);
    this.ping = element('div', 'hud-ping hud-ink', corner);
    const unit = new PixelText({ scale: 2, color: P.edge });
    unit.set('MS');
    this.ping.append(this.value.canvas, unit.canvas);
    this.addSettings(corner);
  }

  setExitAction(action: HudExitAction | null): void {
    this.exitAction = action;
    this.exit.hidden = action === null;
    if (action !== null) this.exit.textContent = action.label;
  }

  update(view: HudView): void {
    const hidden = view.rttMs === null;
    if (this.ping.hidden !== hidden) this.ping.hidden = hidden;
    if (view.rttMs !== null) this.value.set(String(Math.round(view.rttMs)));
  }

  private addSettings(root: HTMLElement): void {
    const details = document.createElement('details');
    details.className = 'hud-settings';
    root.appendChild(details);
    const summary = document.createElement('summary');
    summary.className = 'hud-settings-button hud-ink';
    summary.title = 'Visuels';
    const gear = document.createElement('canvas');
    gear.className = 'hud-settings-gear';
    gear.width = 11;
    gear.height = 11;
    gear.getContext('2d')?.drawImage(gearCanvas(), 0, 0);
    summary.appendChild(gear);
    details.appendChild(summary);
    const list = element('div', 'hud-settings-list hud-ink', details);
    for (const [key, label] of [
      ['motion', 'Vent et eau animés'],
      ['flashes', 'Flashs d’impact'],
      ['shake', 'Secousses'],
    ] as const) {
      const row = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = visualSettings()[key];
      input.addEventListener('change', () => setVisualSetting(key, input.checked));
      row.append(input, document.createTextNode(label));
      list.appendChild(row);
    }
    const fullscreen = document.createElement('button');
    fullscreen.type = 'button';
    fullscreen.className = 'hud-settings-action';
    fullscreen.textContent = 'Plein écran (F)';
    fullscreen.addEventListener('click', () => {
      void toggleFullscreen();
    });
    list.appendChild(fullscreen);
  }
}

class VitalsPanel {
  private readonly panel: HTMLElement;
  private readonly portrait: HTMLCanvasElement;
  private readonly plate: HTMLCanvasElement;
  private readonly health: Gauge;
  private readonly chakra: Gauge;
  private skin = -1;
  private code = -1;
  private build = '';

  constructor(root: HTMLElement) {
    const panel = element('div', 'hud-vitals hud-ink', root);
    this.panel = panel;
    const frame = element('div', 'hud-portrait', panel);
    this.portrait = document.createElement('canvas');
    this.portrait.className = 'hud-portrait-art';
    this.portrait.width = PORTRAIT_SIZE;
    this.portrait.height = PORTRAIT_SIZE;
    this.portrait.setAttribute('role', 'img');
    this.plate = document.createElement('canvas');
    this.plate.className = 'hud-portrait-team';
    this.plate.width = PLATE_SIZE;
    this.plate.height = PLATE_SIZE;
    frame.append(this.portrait, this.plate);
    const gauges = element('div', 'hud-gauges', panel);
    this.health = new Gauge(gauges, 'hud-gauge-health', P.ivory, true);
    this.chakra = new Gauge(gauges, 'hud-gauge-chakra', P.cyan, false);
  }

  update(view: HudView, now: number): void {
    if (this.panel.hidden !== view.watching) this.panel.hidden = view.watching;
    if (this.skin !== view.skin) {
      this.skin = view.skin;
      this.portrait.getContext('2d')?.drawImage(portraitCanvas(view.skin), 0, 0);
    }
    if (this.code !== view.teamCode) {
      this.code = view.teamCode;
      this.plate.getContext('2d')?.clearRect(0, 0, PLATE_SIZE, PLATE_SIZE);
      this.plate.getContext('2d')?.drawImage(teamPlateCanvas(view.teamCode), 0, 0);
    }
    // Le détail de build reste dans la vue mais sort du panneau: il n'est plus qu'un libellé.
    if (this.build !== view.buildSummary) {
      this.build = view.buildSummary;
      this.portrait.setAttribute('aria-label', view.buildSummary);
    }
    this.health.update(view.health, view.maxHealth, view.shield, now);
    this.chakra.update(view.chakra, view.maxChakra, 0, now);
  }
}

class Gauge {
  private readonly track: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly value: PixelText;
  private readonly shieldGlyph: HTMLCanvasElement;
  private ghostValue = -1;
  private holdUntil = 0;
  private sampledAt = 0;
  private fillWidth = '';
  private ghostWidth = '';
  private overlayLeft = '';
  private overlayWidth = '';
  private tickWidth = '';
  private shieldShown = true;

  constructor(parent: HTMLElement, className: string, color: string, ticks: boolean) {
    const root = element('div', `hud-gauge ${className}`, parent);
    this.track = element('div', 'hud-gauge-track', root);
    if (ticks) this.track.classList.add('has-ticks');
    this.ghost = element('div', 'hud-gauge-ghost', this.track);
    this.fill = element('div', 'hud-gauge-fill', this.track);
    this.overlay = element('div', 'hud-gauge-shield', this.track);
    const read = element('div', 'hud-gauge-read', root);
    this.shieldGlyph = document.createElement('canvas');
    this.shieldGlyph.className = 'hud-gauge-shield-glyph';
    this.shieldGlyph.width = 7;
    this.shieldGlyph.height = 8;
    this.shieldGlyph.getContext('2d')?.drawImage(shieldGlyphCanvas(), 0, 0);
    this.value = new PixelText({ scale: 2, color });
    read.append(this.shieldGlyph, this.value.canvas);
  }

  update(value: number, max: number, shield: number, now: number): void {
    this.trackGhost(value, max, now);
    const ratio = max > 0 ? clamp01(value / max) : 0;
    const fill = percent(ratio);
    if (this.fillWidth !== fill) {
      this.fillWidth = fill;
      this.fill.style.width = fill;
    }
    const ghost = percent(max > 0 ? clamp01(this.ghostValue / max) : 0);
    if (this.ghostWidth !== ghost) {
      this.ghostWidth = ghost;
      this.ghost.style.width = ghost;
    }
    const shieldRatio = max > 0 ? clamp01(shield / max) : 0;
    const left = percent(Math.min(ratio, 1 - shieldRatio));
    const width = percent(shieldRatio);
    if (this.overlayLeft !== left) {
      this.overlayLeft = left;
      this.overlay.style.left = left;
    }
    if (this.overlayWidth !== width) {
      this.overlayWidth = width;
      this.overlay.style.width = width;
    }
    const shown = shield > 0;
    if (this.shieldShown !== shown) {
      this.shieldShown = shown;
      this.shieldGlyph.hidden = !shown;
      this.overlay.hidden = !shown;
    }
    const tick = max > 0 ? percent(HEALTH_PER_TICK / max) : '100%';
    if (this.tickWidth !== tick) {
      this.tickWidth = tick;
      this.track.style.setProperty('--hud-tick', tick);
    }
    this.value.set(`${Math.round(value)}/${Math.round(max)}`);
  }

  // Le fantôme de dégâts tient la valeur perdue puis la rejoint: le coup se lit après coup.
  private trackGhost(value: number, max: number, now: number): void {
    const elapsed = Math.min(MAX_FRAME_MS, Math.max(0, now - this.sampledAt));
    this.sampledAt = now;
    if (this.ghostValue < 0 || value >= this.ghostValue) {
      this.ghostValue = value;
      this.holdUntil = 0;
      return;
    }
    if (this.holdUntil === 0) this.holdUntil = now + GHOST_HOLD_MS;
    else if (now >= this.holdUntil)
      this.ghostValue = Math.max(value, this.ghostValue - (max * elapsed) / GHOST_DRAIN_MS);
  }
}

class AbilityBar {
  private readonly root: HTMLElement;
  private readonly slots: Slot[] = [];

  constructor(root: HTMLElement) {
    this.root = element('div', 'hud-abilities', root);
  }

  update(view: HudView): void {
    while (this.slots.length < view.abilities.length) this.slots.push(new Slot(this.root));
    for (let i = 0; i < this.slots.length; i++) this.slots[i]?.update(view.abilities[i]);
  }
}

class Slot {
  private readonly root: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly icon: HTMLCanvasElement;
  private readonly veil: HTMLElement;
  private readonly lock: HTMLCanvasElement;
  private readonly cost: HTMLElement;
  private readonly costText = new PixelText({ scale: 2, color: P.cyan });
  private readonly binding = new PixelText({ scale: 2 });
  private readonly timer = new PixelText({ scale: 2, color: P.wood[2] });
  private readonly name: HTMLElement;
  private family = '';
  private iconKey = '';
  private hidden = false;
  private cooling = false;
  private blocked: HudAbilityBlock | null = null;
  private height = '';
  private label = '';
  private nameText = '';

  constructor(parent: HTMLElement) {
    this.root = element('div', 'hud-slot', parent);
    this.frame = element('div', 'hud-slot-frame', this.root);
    this.icon = document.createElement('canvas');
    this.icon.className = 'hud-slot-icon';
    this.icon.width = ICON_SIZE;
    this.icon.height = ICON_SIZE;
    this.frame.appendChild(this.icon);
    this.veil = element('div', 'hud-slot-veil', this.frame);
    this.lock = document.createElement('canvas');
    this.lock.className = 'hud-slot-lock';
    this.lock.width = 8;
    this.lock.height = 10;
    this.lock.getContext('2d')?.drawImage(lockCanvas(), 0, 0);
    this.lock.hidden = true;
    this.frame.appendChild(this.lock);
    const timerBox = element('div', 'hud-slot-timer', this.frame);
    timerBox.appendChild(this.timer.canvas);
    const bindingBox = element('div', 'hud-slot-key', this.frame);
    bindingBox.appendChild(this.binding.canvas);
    this.cost = element('div', 'hud-slot-cost', this.frame);
    element('div', 'hud-slot-pip', this.cost);
    this.cost.appendChild(this.costText.canvas);
    this.name = element('div', 'hud-slot-name', this.root);
  }

  update(ability: HudAbilityView | undefined): void {
    const hidden = ability === undefined;
    if (this.hidden !== hidden) {
      this.hidden = hidden;
      this.root.hidden = hidden;
    }
    if (ability === undefined) return;
    const family = ability.family ?? 'melee';
    if (this.family !== family) {
      this.family = family;
      this.root.dataset.family = family;
    }
    const iconKey = `${ability.id ?? ''}:${family}`;
    if (this.iconKey !== iconKey) {
      this.iconKey = iconKey;
      this.icon.getContext('2d')?.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
      this.icon.getContext('2d')?.drawImage(abilityIconCanvas(ability.id ?? '', family), 0, 0);
    }
    if (this.nameText !== ability.name) {
      this.nameText = ability.name;
      setText(this.name, ability.name);
    }
    this.updateStates(ability);
    this.binding.set(ability.binding);
    this.costText.set(ability.chakraCost > 0 ? String(ability.chakraCost) : '');
    if (this.cost.hidden !== (ability.chakraCost === 0))
      this.cost.hidden = ability.chakraCost === 0;
    const label = `${ability.name}, ${ability.binding}, ${stateLabel(ability)}`;
    if (this.label !== label) {
      this.label = label;
      this.root.setAttribute('aria-label', label);
    }
  }

  private updateStates(ability: HudAbilityView): void {
    const blocked = ability.reason ?? (ability.available === false ? 'control' : null);
    if (this.blocked !== blocked) {
      this.blocked = blocked;
      this.root.classList.toggle('is-locked', blocked === 'control');
      this.root.classList.toggle('is-starved', blocked === 'chakra');
      this.lock.hidden = blocked !== 'control';
      this.costText.setColor(blocked === 'chakra' ? P.danger : P.cyan);
    }
    const cooling = ability.remainingMs > 0;
    if (this.cooling !== cooling) {
      // Le passage de recharge à prêt rejoue l'éclair: la classe est retirée puis reposée.
      this.cooling = cooling;
      this.root.classList.toggle('is-cooling', cooling);
      if (!cooling && blocked === null) this.flash();
    }
    this.timer.set(cooling ? remainingLabel(ability.remainingMs) : '');
    const ratio = ability.cooldownMs > 0 ? clamp01(ability.remainingMs / ability.cooldownMs) : 0;
    const height = `${Math.round(ratio * 100)}%`;
    if (this.height !== height) {
      this.height = height;
      this.veil.style.height = height;
    }
  }

  private flash(): void {
    this.frame.classList.remove('is-flash');
    void this.frame.offsetWidth;
    this.frame.classList.add('is-flash');
  }
}

class MinimapPanel {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private terrain: HTMLCanvasElement | null = null;
  private mapId = '';
  private scale = 1;
  private key = '';

  constructor(root: HTMLElement) {
    this.root = element('div', 'hud-minimap hud-ink', root);
    this.root.hidden = true;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-minimap-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Minicarte');
    this.root.appendChild(this.canvas);
  }

  update(view: HudView): void {
    const hidden = view.minimap === null;
    if (this.root.hidden !== hidden) this.root.hidden = hidden;
    if (view.minimap === null) return;
    if (this.mapId !== view.minimap.terrain.mapId) this.paintTerrain(view.minimap.terrain);
    // Les marqueurs bougent chaque image, mais pas d'un pixel de carte: on ne repeint qu'alors.
    const key = view.minimap.markers
      .map(
        (marker) =>
          `${marker.id}:${this.pixel(marker.x)}:${this.pixel(marker.y)}:${marker.teamCode}`,
      )
      .join('|');
    if (this.key === key) return;
    this.key = key;
    this.paintMarkers(view.minimap);
  }

  private pixel(units: number): number {
    return Math.floor(units * this.scale);
  }

  // Un nombre entier de pixels par tuile, le plus grand qui tienne dans le cadre.
  private paintTerrain(terrain: HudMinimapTerrain): void {
    this.mapId = terrain.mapId;
    this.key = '';
    const tiles = Math.max(
      1,
      Math.min(
        Math.floor(MINIMAP_MAX_WIDTH / terrain.widthInTiles),
        Math.floor(MINIMAP_MAX_HEIGHT / terrain.heightInTiles),
      ),
    );
    this.scale = tiles / terrain.tileSize;
    const width = terrain.widthInTiles * tiles;
    const height = terrain.heightInTiles * tiles;
    const canvas = surface(width, height);
    const context = pen(canvas);
    rect(context, 0, 0, width, height, P.ink);
    terrain.colors.forEach((color, index) => {
      if (color === null) return;
      const tx = index % terrain.widthInTiles;
      const ty = Math.floor(index / terrain.widthInTiles);
      rect(context, tx * tiles, ty * tiles, tiles, tiles, color);
    });
    this.terrain = canvas;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private paintMarkers(view: HudMinimapView): void {
    const context = pen(this.canvas);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.terrain !== null) context.drawImage(this.terrain, 0, 0);
    for (const marker of view.markers) {
      const x = this.pixel(marker.x);
      const y = this.pixel(marker.y);
      const color = teamColor(marker.teamCode);
      if (marker.isLocal) rect(context, x - 3, y - 3, 7, 7, P.ivory);
      rect(context, x - 2, y - 2, 5, 5, P.ink);
      rect(context, x - 1, y - 1, 3, 3, color);
      this.paintName(context, marker.name, x, y - 4, color);
    }
  }

  // Le nom reste dans le cadre: il glisse plutôt que d'être coupé au bord.
  private paintName(
    context: CanvasRenderingContext2D,
    name: string,
    x: number,
    bottom: number,
    color: string,
  ): void {
    const label = name.slice(0, MINIMAP_NAME_LENGTH);
    const width = label.length * GLYPH_ADVANCE - 1;
    const left = Math.max(0, Math.min(this.canvas.width - width, x - Math.floor(width / 2)));
    const baseline = Math.max(GLYPH_HEIGHT, bottom);
    text(context, label, left + 1, baseline + 1, P.ink);
    text(context, label, left, baseline, color);
  }
}

// Un spectateur sans cible (personne en vie encore) reste annoncé comme tel.
function spectateLabel(spectating: string | null): string {
  if (spectating === null) return '';
  return spectating.length === 0 ? 'SPECTATEUR' : `SPECTATEUR DE ${spectating}`;
}

function remainingLabel(remainingMs: number): string {
  const seconds = remainingMs / MS_PER_SECOND;
  return remainingMs < MS_PER_SECOND ? seconds.toFixed(1) : String(Math.ceil(seconds));
}

function stateLabel(ability: HudAbilityView): string {
  if (ability.reason === 'control') return 'indisponible';
  if (ability.reason === 'chakra') return 'chakra insuffisant';
  return ability.remainingMs > 0 ? 'recharge' : 'prêt';
}

function percent(ratio: number): string {
  return `${(clamp01(ratio) * 100).toFixed(2)}%`;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent === text) return;
  node.textContent = text;
  node.hidden = text.length === 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
