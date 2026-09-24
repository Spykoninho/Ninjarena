import type { GameContent } from '@ninjarena/content';
import type {
  PlayerId,
  PlayerInput,
  PlayerState,
  TilesetDefinition,
  Vec2,
  WorldEvent,
  WorldState,
} from '@ninjarena/core';
import {
  FixedStepAccumulator,
  GameSimulation,
  LoadedMap,
  add,
  lerp,
  sub,
  tickDurationMs,
} from '@ninjarena/core';
import type {
  MatchSummary,
  RoomPlayerView,
  ServerMessage,
  TournamentView,
} from '@ninjarena/protocol';
import type { AudioPort } from '../audio/audioPort';
import { feedbackView } from '../feedback/cues';
import { FeedbackController } from '../feedback/feedbackController';
import type { InputBindings } from '../input/bindings';
import { buildPlayerInput } from '../input/buildPlayerInput';
import type { InputState } from '../input/inputState';
import { readySlots, touchPlayerInput } from '../input/touchInput';
import { CorrectionSmoother } from '../netcode/correctionSmoother';
import { PredictionBuffer } from '../netcode/predictionBuffer';
import { reconcile } from '../netcode/reconcile';
import { ServerClock } from '../netcode/serverClock';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import { SnapshotInterpolator } from '../netcode/snapshotInterpolator';
import type { NetworkClient } from '../network/networkClient';
import type { Renderer } from '../rendering/renderer';
import { gameCursorStyle } from '../ui/gameCursor';
import type { Hud, HudExitAction, HudLoadoutAction, HudMinimapTerrain } from '../ui/hud';
import type { TouchControls, TouchGuideFrame } from '../ui/touchControls';
import { routeEvents } from './eventRouter';
import { buildHudView, minimapTerrain } from './hudView';
import { buildRenderFrame } from './renderFrame';
import { SpectatorController } from './spectatorController';
import { touchSlots, visibleEnemies } from './touchView';

export interface ClientGameDeps {
  content: GameContent;
  network: NetworkClient;
  renderer: Renderer;
  hud: Hud;
  audio: AudioPort;
  inputState: InputState;
  bindings: InputBindings;
  // Les commandes d'un écran tactile; sans elles, le clavier et la souris pilotent seuls.
  touch: TouchControls | null;
  interpolationDelayTicks: number;
}

export type MatchStartedMessage = Extract<ServerMessage, { type: 'matchStarted' }>;
export type SnapshotMessage = Extract<ServerMessage, { type: 'snapshot' }>;
export type PongMessage = Extract<ServerMessage, { type: 'pong' }>;

interface MatchRound {
  map: LoadedMap;
  tileset: TilesetDefinition;
  terrain: HudMinimapTerrain;
}

const PAUSE_KEY = 'Escape';
const MAX_FRAME_MS = 250;
const MS_PER_SECOND = 1000;
const PING_INTERVAL_MS = 1000;

export class ClientGame {
  private readonly deps: ClientGameDeps;
  private readonly feedback: FeedbackController;
  private serverEvents: WorldEvent[] = [];
  private buffer = new PredictionBuffer();
  private interpolator = new SnapshotInterpolator();
  private smoother = new CorrectionSmoother();
  private simulation: GameSimulation | null = null;
  private accumulator: FixedStepAccumulator | null = null;
  private clock: ServerClock | null = null;
  private localPlayerId: PlayerId | null = null;
  private latestSnapshot: WorldState | null = null;
  private remotes: InterpolatedWorld | null = null;
  private touchEnemies: Vec2[] = [];
  private roomPlayers: RoomPlayerView[] = [];
  private playerNames: Record<string, string> = {};
  private spectator = new SpectatorController();
  private previousLocalPosition: Vec2 | null = null;
  private cameraPosition: Vec2 = { x: 0, y: 0 };
  private localRenderPosition: Vec2 = { x: 0, y: 0 };
  private isFfa = false;
  private watching = false;
  private tickMs = 0;
  private seq = 0;
  private frameHandle: number | null = null;
  private pingHandle: number | null = null;
  private lastFrameMs: number | null = null;
  private rttMs: number | null = null;
  private stopped = false;
  private status = '';
  private stage: HTMLElement | null = null;
  private exitAction: HudExitAction | null = null;
  // Les cartes du match, une par manche, avec leur jeu de tuiles; celle à l'écran suit la manche.
  private rounds: MatchRound[] = [];
  private shownRound: MatchRound | null = null;

  constructor(deps: ClientGameDeps) {
    this.deps = deps;
    this.feedback = new FeedbackController({ renderer: deps.renderer, audio: deps.audio });
  }

  async init(container: HTMLElement): Promise<void> {
    this.stage = container;
    await this.deps.renderer.init(container);
  }

  get active(): boolean {
    return this.simulation !== null;
  }

  setRoomPlayers(players: RoomPlayerView[]): void {
    this.roomPlayers = players;
    this.playerNames = Object.fromEntries(players.map((player) => [player.id, player.name]));
  }

  setTournament(view: TournamentView | null, localId: string): void {
    if (!this.stopped) this.deps.hud.setTournament(view, localId);
  }

  setStatus(status: string): void {
    if (this.stopped) return;
    this.status = status;
    this.updateHud();
  }

  // Une sortie proposée pendant le match, comme le retour à l'éditeur après un essai de carte.
  setExitAction(action: HudExitAction | null): void {
    this.exitAction = action;
    if (!this.stopped) this.deps.hud.setExitAction(action);
  }

  setLoadoutAction(action: HudLoadoutAction | null): void {
    if (!this.stopped) this.deps.hud.setLoadoutAction(action);
  }

  showSummary(summary: MatchSummary): void {
    if (this.stopped || this.simulation === null) return;
    this.deps.hud.showSummary(summary, this.localPlayerId);
  }

  endMatch(): void {
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.stopPing();
    if (!this.stopped) {
      this.deps.hud.hideSummary();
      this.deps.hud.hidePause();
      this.deps.touch?.hide();
    }
    this.setExitAction(null);
    this.setLoadoutAction(null);
    this.setCursor(false);
    // Le rendu reste initialisé: seule la partie disparaît, la prochaine repart d'un état vierge.
    this.simulation = null;
    this.rounds = [];
    this.shownRound = null;
    this.accumulator = null;
    this.clock = null;
    this.localPlayerId = null;
    this.latestSnapshot = null;
    this.remotes = null;
    this.touchEnemies = [];
    this.previousLocalPosition = null;
    this.spectator.reset();
    this.serverEvents = [];
    this.lastFrameMs = null;
    this.rttMs = null;
    this.seq = 0;
    this.setStatus('');
  }

  dispose(): void {
    // La fermeture de la socket arrive plus tard: rien ne doit plus toucher au HUD après `dispose`.
    this.endMatch();
    this.stopped = true;
    this.deps.network.close();
    this.deps.renderer.dispose();
  }

  beginMatch(message: MatchStartedMessage, roomPlayers: RoomPlayerView[]): void {
    const { content } = this.deps;
    const rounds = message.maps.map((document): MatchRound => {
      const tileset = content.tilesets.get(document.tileset);
      const map = LoadedMap.fromDocument(document, tileset);
      return { map, tileset, terrain: minimapTerrain(map, tileset) };
    });
    const map = rounds[0]?.map;
    if (map === undefined) throw new Error('a match needs at least one map');
    this.endMatch();
    this.rounds = rounds;
    this.setRoomPlayers(roomPlayers);
    this.simulation = new GameSimulation({
      maps: rounds.map((round) => round.map),
      abilities: content.abilities,
      characters: content.characters,
      matchConfig: message.matchConfig,
      rules: content.statRules,
      config: { tickRate: message.tickRate },
    });
    this.localPlayerId = message.playerId;
    this.isFfa = message.matchConfig.mode === 'ffa';
    this.watching = message.spectator;
    this.tickMs = tickDurationMs({ tickRate: message.tickRate });
    this.accumulator = new FixedStepAccumulator(this.tickMs);
    this.clock = new ServerClock(this.tickMs);
    // Un second match repart d'un état propre: rien de la partie précédente ne survit.
    this.buffer = new PredictionBuffer();
    this.interpolator = new SnapshotInterpolator();
    this.smoother = new CorrectionSmoother();
    // Avant le premier snapshot le joueur local n'existe pas: la caméra vise le centre de la carte.
    this.cameraPosition = { x: map.widthInUnits / 2, y: map.heightInUnits / 2 };
    this.localRenderPosition = { ...this.cameraPosition };
    this.showMap(map);
    this.setCursor(true);
    this.deps.touch?.show();
    this.startPing();
    this.startLoop();
  }

  // Une nouvelle manche peut changer de carte: le décor suit la simulation dès qu'elle en change.
  private showMap(map: LoadedMap): void {
    if (map === this.shownRound?.map) return;
    const round = this.rounds.find((candidate) => candidate.map === map);
    if (round === undefined) return;
    this.deps.renderer.setMap(map, round.tileset);
    this.shownRound = round;
  }

  // La flèche du système n'a rien à faire sur un champ de bataille: le réticule la remplace.
  private setCursor(playing: boolean): void {
    if (this.stage === null) return;
    this.stage.style.cursor = playing ? gameCursorStyle() : '';
  }

  handleSnapshot(message: SnapshotMessage): void {
    const simulation = this.simulation;
    const localPlayerId = this.localPlayerId;
    if (simulation === null || localPlayerId === null) return;
    this.clock?.observe(message.tick, performance.now());
    this.interpolator.push(message.world);
    this.buffer.acknowledge(message.lastProcessedSeq);
    const before = simulation.world.players[localPlayerId]?.position;
    const previous = before === undefined ? null : { ...before };
    reconcile(simulation, localPlayerId, message.world, this.buffer.pending);
    const corrected = simulation.world.players[localPlayerId];
    // Une petite correction est absorbée par le rendu: le joueur glisse au lieu de sauter.
    if (previous !== null && corrected !== undefined) {
      this.smoother.absorb(sub(previous, corrected.position));
    }
    this.latestSnapshot = message.world;
    // Les événements attendent la prochaine image: le routage a besoin des ticks prédits du tour.
    this.serverEvents.push(...message.events);
  }

  handlePong(message: PongMessage): void {
    this.rttMs = performance.now() - message.sentAt;
  }

  private startLoop(): void {
    if (this.frameHandle !== null) return;
    const frame = (timestamp: number): void => {
      this.frameHandle = requestAnimationFrame(frame);
      this.advance(timestamp);
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

  private advance(timestamp: number): void {
    const accumulator = this.accumulator;
    if (accumulator === null) return;
    // Un onglet réveillé après une longue pause ne rejoue pas tout le temps écoulé.
    const elapsed = Math.min(MAX_FRAME_MS, timestamp - (this.lastFrameMs ?? timestamp));
    this.lastFrameMs = timestamp;
    const steps = accumulator.advance(elapsed);
    if (this.deps.touch !== null) this.syncTouch(this.deps.touch);
    const predicted: WorldEvent[] = [];
    for (let step = 0; step < steps; step++) predicted.push(...this.runTick());
    this.applyFeedback(predicted);
    this.updateSpectator();
    // Échap ouvre le menu de pause: quitter, lire l'arbre du tournoi ou changer ses touches.
    if (this.deps.inputState.pressedOnce.has(PAUSE_KEY)) this.deps.hud.togglePause();
    // Une pression ne vaut que pour l'image qui la lit: elle est consommée à la fin de celle-ci.
    this.deps.inputState.pressedOnce.clear();
    const offset = this.smoother.advance(elapsed);
    if (this.simulation !== null) this.showMap(this.simulation.map);
    // Un gel de coup arrête l'image sans arrêter la simulation ni les entrées envoyées.
    if (!this.feedback.advance(elapsed).frozen) {
      this.renderFrame(accumulator.alpha, offset, elapsed);
    }
    this.updateHud();
  }

  private applyFeedback(predicted: readonly WorldEvent[]): void {
    const simulation = this.simulation;
    const localPlayerId = this.localPlayerId;
    if (simulation === null || localPlayerId === null) return;
    const events = routeEvents(predicted, this.serverEvents, localPlayerId);
    this.serverEvents = [];
    if (events.length === 0) return;
    this.feedback.apply(events, feedbackView(localPlayerId, this.deps.content.abilities));
  }

  private updateSpectator(): void {
    const localPlayerId = this.localPlayerId;
    const cyclePressed = this.deps.inputState.pressedOnce.has(this.deps.bindings.spectateNext);
    if (localPlayerId === null) return;
    this.spectator.update(
      this.latestSnapshot,
      localPlayerId,
      this.isFfa,
      cyclePressed,
      this.watching,
    );
  }

  private runTick(): readonly WorldEvent[] {
    const simulation = this.simulation;
    const localPlayerId = this.localPlayerId;
    if (simulation === null || localPlayerId === null) return [];
    const local = simulation.world.players[localPlayerId];
    this.previousLocalPosition = local === undefined ? null : { ...local.position };
    const input = this.playerInput(simulation, localPlayerId);
    this.seq += 1;
    // Un spectateur n'a personne à piloter: il ne pousse rien vers le serveur.
    if (!this.watching) {
      this.deps.network.send({ type: 'input', seq: this.seq, input });
      this.buffer.push(this.seq, input);
    }
    return simulation.step({ [localPlayerId]: input });
  }

  private playerInput(simulation: GameSimulation, localPlayerId: PlayerId): PlayerInput {
    const touch = this.deps.touch;
    if (touch !== null) {
      return touchPlayerInput(touch.state, {
        position: simulation.world.players[localPlayerId]?.position ?? this.cameraPosition,
        enemies: this.touchEnemies,
        ready: readySlots(simulation.world, localPlayerId, this.deps.content.abilities),
        tickMs: this.tickMs,
      });
    }
    // La visée part de l'endroit où le joueur est dessiné, pas de sa position simulée.
    const screenPosition = this.deps.renderer.worldToScreen(this.localRenderPosition);
    return buildPlayerInput(
      this.deps.inputState,
      this.deps.bindings,
      screenPosition,
      this.deps.renderer.pixelsPerUnit(),
    );
  }

  private syncTouch(touch: TouchControls): void {
    const local = this.localPlayer();
    touch.state.slots = touchSlots(local, this.deps.content.abilities);
    this.touchEnemies = visibleEnemies(local, this.remotes);
  }

  private renderFrame(alpha: number, offset: Vec2, elapsedMs: number): void {
    const simulation = this.simulation;
    const localPlayerId = this.localPlayerId;
    if (simulation === null || localPlayerId === null) return;
    const local = simulation.world.players[localPlayerId];
    if (local !== undefined) {
      this.cameraPosition = lerp(
        this.previousLocalPosition ?? local.position,
        local.position,
        alpha,
      );
      // La correction lissée déplace le corps, pas la caméra: l'image ne recule pas avec lui.
      this.localRenderPosition = add(this.cameraPosition, offset);
    }
    const remotes = this.sampleRemotes();
    this.remotes = remotes;
    this.deps.renderer.render(
      buildRenderFrame({
        localPlayerId,
        predicted: simulation.world,
        localRenderPosition: this.localRenderPosition,
        alpha,
        dt: this.tickMs / MS_PER_SECOND,
        remotes,
        abilities: this.deps.content.abilities,
        tick: simulation.world.tick,
        isFfa: this.isFfa,
        cameraTarget: this.spectateCameraTarget(remotes) ?? this.cameraPosition,
        map: simulation.map,
        friendlyFire: simulation.matchConfig.friendlyFire,
      }),
      elapsedMs,
    );
  }

  private spectateCameraTarget(remotes: InterpolatedWorld | null): Vec2 | null {
    const target = this.spectator.current;
    if (target === null) return null;
    return remotes?.players[target]?.renderPosition ?? null;
  }

  private sampleRemotes(): InterpolatedWorld | null {
    const clock = this.clock;
    if (clock === null || !clock.hasEstimate) return null;
    const renderTick = clock.estimateTick(performance.now()) - this.deps.interpolationDelayTicks;
    return this.interpolator.sample(renderTick);
  }

  private updateHud(): void {
    const view = buildHudView({
      localPlayer: this.localPlayer(),
      abilities: this.deps.content.abilities,
      bindings: this.deps.bindings,
      match: this.latestSnapshot?.match ?? null,
      world: this.latestSnapshot,
      minimapTerrain: this.shownRound?.terrain ?? null,
      playerNames: this.playerNames,
      tick: this.simulation?.world.tick ?? 0,
      tickDurationMs: this.tickMs,
      status: this.status,
      rttMs: this.rttMs,
      spectating: this.spectatingName(),
    });
    this.deps.hud.update(view);
    this.deps.touch?.update(view, this.touchGuideFrame());
  }

  private touchGuideFrame(): TouchGuideFrame {
    return {
      player:
        this.localPlayer() === undefined
          ? null
          : this.deps.renderer.worldToScreen(this.localRenderPosition),
      pixelsPerUnit: this.deps.renderer.pixelsPerUnit(),
    };
  }

  private spectatingName(): string | null {
    const target = this.spectator.current;
    if (target === null) return this.watching ? '' : null;
    return this.roomPlayers.find((player) => player.id === target)?.name ?? target;
  }

  private localPlayer(): PlayerState | undefined {
    const localPlayerId = this.localPlayerId;
    if (this.simulation === null || localPlayerId === null) return undefined;
    return this.simulation.world.players[localPlayerId];
  }

  private startPing(): void {
    this.stopPing();
    this.pingHandle = window.setInterval(() => {
      this.deps.network.send({ type: 'ping', sentAt: performance.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingHandle !== null) window.clearInterval(this.pingHandle);
    this.pingHandle = null;
  }
}
