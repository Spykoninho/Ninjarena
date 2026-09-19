import type { RoomPlayerView, RoomView } from '@ninjarena/protocol';
import { emptySeats, groupPlayers, playerStatus, statusLabel } from '../lobby/lobbyModel';
import type { TeamGroup } from '../lobby/lobbyModel';
import { skinIndex, teamCodes } from '../rendering/art/presentation';
import { poseCanvas } from '../rendering/art/spriteArt';
import { abilityIcon } from './abilityCards';
import { teamPlateCanvas } from './hudGlyphs';
import type { AbilityOption } from './loadoutModel';

interface Figure {
  canvas: HTMLCanvasElement;
  skin: number;
}

const CELL = 64;
const PLATE_SIZE = 9;
const IDLE_FRAMES = 4;
const IDLE_FRAME_MS = 200;
const poses = new Map<string, HTMLCanvasElement>();

// Le plateau du salon: chaque joueur y est son ninja, au repos, avec son statut et son kit.
export class LobbyRoster {
  private readonly root: HTMLElement;
  private readonly options: Map<string, AbilityOption>;
  private readonly onJoin: (team: number) => void;
  private figures: Figure[] = [];
  private frame = 0;
  private timer: number | null = null;

  constructor(
    parent: HTMLElement,
    options: Map<string, AbilityOption>,
    onJoin: (team: number) => void,
  ) {
    this.root = element('div', 'roster', parent);
    this.options = options;
    this.onJoin = onJoin;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      this.frame = (this.frame + 1) % IDLE_FRAMES;
      for (const figure of this.figures) drawPose(figure.canvas, figure.skin, this.frame);
    }, IDLE_FRAME_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  update(room: RoomView, sessionId: string): void {
    this.root.replaceChildren();
    this.figures = [];
    const localTeam = room.players.find((player) => player.id === sessionId)?.team ?? null;
    const codes = teamCodes(room.players.map((player) => String(player.team ?? 0)));
    for (const group of groupPlayers(room)) {
      const column = element('div', 'roster-team', this.root);
      const header = element('div', 'roster-team-header', column);
      element('span', 'roster-team-name', header).textContent = group.label;
      if (group.capacity !== null) {
        element('span', 'roster-team-count', header).textContent =
          `${group.players.length}/${group.capacity}`;
      }
      const cards = element('div', 'roster-cards', column);
      for (const player of group.players) {
        const code = codes.get(String(player.team ?? 0)) ?? 0;
        this.renderPlayer(cards, player, room, sessionId, code);
      }
      const joinable = canJoin(group, room, localTeam);
      for (let seat = 0; seat < emptySeats(group); seat++) {
        this.renderSeat(cards, group, joinable && seat === 0);
      }
    }
  }

  private renderPlayer(
    parent: HTMLElement,
    player: RoomPlayerView,
    room: RoomView,
    sessionId: string,
    code: number,
  ): void {
    const status = playerStatus(player);
    const card = element('div', 'roster-card', parent);
    card.dataset.status = status;
    if (player.id === sessionId) card.classList.add('is-local');
    const figure = element('div', 'roster-figure', card);
    const sprite = document.createElement('canvas');
    sprite.className = 'roster-sprite';
    sprite.width = CELL;
    sprite.height = CELL;
    const skin = skinIndex(player.id);
    drawPose(sprite, skin, this.frame);
    figure.appendChild(sprite);
    this.figures.push({ canvas: sprite, skin });
    if (room.settings.mode === 'team') {
      const plate = document.createElement('canvas');
      plate.className = 'roster-plate';
      plate.width = PLATE_SIZE;
      plate.height = PLATE_SIZE;
      plate.getContext('2d')?.drawImage(teamPlateCanvas(code), 0, 0);
      figure.appendChild(plate);
    }
    const name = element('div', 'roster-name', card);
    element('span', 'roster-name-text', name).textContent = player.name;
    if (player.id === room.hostId) element('span', 'roster-host', name).textContent = 'HOST';
    if (player.id === sessionId) element('span', 'roster-you', name).textContent = 'YOU';
    const badge = element('div', `roster-status badge-${status}`, card);
    badge.textContent = statusLabel(status);
    this.renderKit(card, player);
  }

  // Le kit d'un joueur se lit d'un coup d'oeil: l'attaque de base puis ses techniques, en icônes.
  private renderKit(card: HTMLElement, player: RoomPlayerView): void {
    const kit = element('div', 'roster-kit', card);
    const loadout = player.loadout;
    if (loadout === null) return;
    for (const id of [loadout.basicAttackId, ...loadout.techniqueIds]) {
      const option = this.options.get(id);
      if (option === undefined) continue;
      const icon = abilityIcon(option.family, 'roster-kit-icon');
      icon.title = option.name;
      kit.appendChild(icon);
    }
  }

  private renderSeat(parent: HTMLElement, group: TeamGroup, joinable: boolean): void {
    const seat = element('div', 'roster-card is-empty', parent);
    element('div', 'roster-figure', seat);
    if (joinable && group.team !== null) {
      const team = group.team;
      const join = document.createElement('button');
      join.type = 'button';
      join.className = 'roster-join';
      join.textContent = 'Join this team';
      join.addEventListener('click', () => {
        this.onJoin(team);
      });
      seat.appendChild(join);
    } else {
      element('div', 'roster-empty', seat).textContent = 'Open seat';
    }
  }
}

function canJoin(group: TeamGroup, room: RoomView, localTeam: number | null): boolean {
  if (group.team === null || group.capacity === null) return false;
  if (room.status !== 'WAITING' || group.team === localTeam) return false;
  return group.players.length < group.capacity;
}

function drawPose(canvas: HTMLCanvasElement, skin: number, frame: number): void {
  const key = `${skin}:${frame}`;
  let pose = poses.get(key);
  if (pose === undefined) {
    pose = poseCanvas('s', 'idle', frame, skin);
    poses.set(key, pose);
  }
  const context = canvas.getContext('2d');
  if (context === null) return;
  context.clearRect(0, 0, CELL, CELL);
  context.drawImage(pose, 0, 0);
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
