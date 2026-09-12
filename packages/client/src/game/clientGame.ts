import type { GameContent } from '@ninjarena/content';
import { loadMap } from '@ninjarena/content';
import type { PlayerId, PlayerState, Vec2, WorldEvent, WorldState } from '@ninjarena/core';
import {
  FixedStepAccumulator,
  GameSimulation,
  add,
  lerp,
  sub,
  tickDurationMs,
} from '@ninjarena/core';
import type { RoomPlayerInfo, ServerMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION } from '@ninjarena/protocol';
import type { AudioPort } from '../audio/audioPort';
import type { ClientConfig } from '../config/clientConfig';
import { feedbackView } from '../feedback/cues';
import { FeedbackController } from '../feedback/feedbackController';
import type { InputBindings } from '../input/bindings';
import { buildPlayerInput } from '../input/buildPlayerInput';
import type { InputState } from '../input/inputState';
import { CorrectionSmoother } from '../netcode/correctionSmoother';
import { PredictionBuffer } from '../netcode/predictionBuffer';
import { reconcile } from '../netcode/reconcile';
import { ServerClock } from '../netcode/serverClock';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import { SnapshotInterpolator } from '../netcode/snapshotInterpolator';
import type { NetworkClient } from '../network/networkClient';
import type { Renderer } from '../rendering/renderer';
import type { Hud } from '../ui/hud';
import { createSetupState, techniqueOptions } from '../ui/setupModel';
import type { SetupState } from '../ui/setupModel';
import type { SetupPanel } from '../ui/setupPanel';
import { routeEvents } from './eventRouter';
import { buildHudView } from './hudView';
import { buildRenderFrame } from './renderFrame';
import { SpectatorController } from './spectatorController';

export interface ClientGameDeps {
  config: ClientConfig;
  content: GameContent;
  network: NetworkClient;
  renderer: Renderer;
  hud: Hud;
  audio: AudioPort;
  inputState: InputState;
  bindings: InputBindings;
  setupPanel: SetupPanel;
}

type WelcomeMessage = Extract<ServerMessage, { type: 'welcome' }>;
type SnapshotMessage = Extract<ServerMessage, { type: 'snapshot' }>;

const MAX_FRAME_MS = 250;
const MS_PER_SECOND = 1000;
const PING_INTERVAL_MS = 1000;
const DISCONNECTED = 'disconnected';

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
  private roomPlayers: RoomPlayerInfo[] = [];
  private spectator = new SpectatorController();
  private previousLocalPosition: Vec2 | null = null;
  private cameraPosition: Vec2 = { x: 0, y: 0 };
  private localRenderPosition: Vec2 = { x: 0, y: 0 };
  private isFfa = false;
  private tickMs = 0;
  private seq = 0;
  private frameHandle: number | null = null;
  private pingHandle: number | null = null;
  private lastFrameMs: number | null = null;
  private rttMs: number | null = null;
  private connected = false;
  private connecting = false;
  private stopped = false;
  private status = 'connecting';

  constructor(deps: ClientGameDeps) {
    this.deps = deps;
    this.feedback = new FeedbackController({ renderer: deps.renderer, audio: deps.audio });
  }

  async start(container: HTMLElement): Promise<void> {
    const { config, content, network, renderer, setupPanel } = this.deps;
    await renderer.init(container);
    network.onMessage((message) => {
      this.handleMessage(message);
    });
    network.onClose(() => {
      // Avant le `welcome` une fermeture sans message d'erreur (salle pleine, trames invalides) doit rester visible.
      if (this.simulation === null) {
        setupPanel.showError(
          'disconnected: the server closed the connection (full or unreachable)',
        );
      }
      this.markDisconnected(DISCONNECTED);
    });
    setupPanel.onPlay((state) => {
      void this.play(state);
    });
    const initial = createSetupState(
      config,
      content.statRules,
      techniqueOptions(content.abilities),
    );
    setupPanel.show(initial);
  }

  private async play(state: SetupState): Promise<void> {
    const { config, network, setupPanel } = this.deps;
    // Un second clic pendant la poignée de main laisserait la première socket orpheline.
    if (this.connecting) return;
    if (!this.connected) {
      this.connecting = true;
      this.setStatus(`connecting to ${config.serverUrl}`);
      try {
        await network.connect(config.serverUrl);
      } catch (error) {
        setupPanel.showError(`failed to connect: ${reasonOf(error)}`);
        return;
      } finally {
        this.connecting = false;
      }
      this.connected = true;
    }
    network.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name: state.name,
      build: state.build,
      techniqueIds: state.techniqueIds.filter((id): id is string => id !== null),
    });
    this.setStatus('joining');
  }

  stop(): void {
    // La fermeture de la socket arrive plus tard: rien ne doit plus toucher au HUD après `stop`.
    this.stopped = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.stopPing();
    this.connected = false;
    this.connecting = false;
    this.deps.network.close();
    this.deps.renderer.dispose();
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        return;
      case 'roomState': {
        this.roomPlayers = message.players;
        const ready = message.players.filter((player) => player.ready).length;
        this.setStatus(`${ready}/${message.players.length} ready`);
        return;
      }
      case 'snapshot':
        this.handleSnapshot(message);
        return;
      case 'error':
        // Avant le `welcome` l'erreur concerne le loadout: elle s'affiche dans le panneau, pas dans le HUD.
        if (this.simulation === null) {
          this.deps.setupPanel.showError(message.message);
        } else {
          this.setStatus(`error: ${message.message}`);
        }
        return;
      case 'pong':
        this.rttMs = performance.now() - message.sentAt;
        return;
    }
  }

  private handleWelcome(message: WelcomeMessage): void {
    const { content, network, renderer, setupPanel } = this.deps;
    setupPanel.hide();
    const map = loadMap(content, message.mapId);
    this.simulation = new GameSimulation({
      map,
      abilities: content.abilities,
      characters: content.characters,
      matchConfig: message.matchConfig,
      rules: content.statRules,
      config: { tickRate: message.tickRate },
    });
    this.localPlayerId = message.playerId;
    this.isFfa = message.matchConfig.mode === 'ffa';
    this.tickMs = tickDurationMs({ tickRate: message.tickRate });
    this.accumulator = new FixedStepAccumulator(this.tickMs);
    this.clock = new ServerClock(this.tickMs);
    // Un second `welcome` repart d'un état propre: rien de la session précédente ne survit.
    this.buffer = new PredictionBuffer();
    this.interpolator = new SnapshotInterpolator();
    this.smoother = new CorrectionSmoother();
    this.latestSnapshot = null;
    this.previousLocalPosition = null;
    this.spectator.reset();
    this.serverEvents = [];
    this.lastFrameMs = null;
    this.rttMs = null;
    this.seq = 0;
    // Avant le premier snapshot le joueur local n'existe pas: la caméra vise le centre de la carte.
    this.cameraPosition = { x: map.widthInUnits / 2, y: map.heightInUnits / 2 };
    this.localRenderPosition = { ...this.cameraPosition };
    renderer.setMap(map, content.tilesets.get(content.maps.get(message.mapId).tileset));
    network.send({ type: 'ready' });
    this.startPing();
    this.startLoop();
  }

  private handleSnapshot(message: SnapshotMessage): void {
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
    const steps = this.connected ? accumulator.advance(elapsed) : 0;
    const predicted: WorldEvent[] = [];
    for (let step = 0; step < steps; step++) predicted.push(...this.runTick());
    this.applyFeedback(predicted);
    this.updateSpectator();
    const offset = this.smoother.advance(elapsed);
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
    this.deps.inputState.pressedOnce.clear();
    if (localPlayerId === null) return;
    this.spectator.update(this.latestSnapshot, localPlayerId, this.isFfa, cyclePressed);
  }

  private runTick(): readonly WorldEvent[] {
    const simulation = this.simulation;
    const localPlayerId = this.localPlayerId;
    if (simulation === null || localPlayerId === null) return [];
    const local = simulation.world.players[localPlayerId];
    this.previousLocalPosition = local === undefined ? null : { ...local.position };
    // La visée part de l'endroit où le joueur est dessiné, pas de sa position simulée.
    const screenPosition = this.deps.renderer.worldToScreen(this.localRenderPosition);
    const input = buildPlayerInput(this.deps.inputState, this.deps.bindings, screenPosition);
    this.seq += 1;
    this.deps.network.send({ type: 'input', seq: this.seq, input });
    this.buffer.push(this.seq, input);
    return simulation.step({ [localPlayerId]: input });
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
    const renderTick =
      clock.estimateTick(performance.now()) - this.deps.config.interpolationDelayTicks;
    return this.interpolator.sample(renderTick);
  }

  private updateHud(): void {
    this.deps.hud.update(
      buildHudView({
        localPlayer: this.localPlayer(),
        abilities: this.deps.content.abilities,
        match: this.latestSnapshot?.match ?? null,
        tick: this.simulation?.world.tick ?? 0,
        tickDurationMs: this.tickMs,
        status: this.status,
        rttMs: this.rttMs,
        spectating: this.spectatingName(),
      }),
    );
  }

  private spectatingName(): string | null {
    const target = this.spectator.current;
    if (target === null) return null;
    return this.roomPlayers.find((player) => player.id === target)?.name ?? target;
  }

  private localPlayer(): PlayerState | undefined {
    const localPlayerId = this.localPlayerId;
    if (this.simulation === null || localPlayerId === null) return undefined;
    return this.simulation.world.players[localPlayerId];
  }

  private setStatus(status: string): void {
    if (this.stopped) return;
    this.status = status;
    // La boucle de rendu ne démarre qu'au `welcome`: sans cet appel le joueur ne verrait rien avant.
    this.updateHud();
  }

  private markDisconnected(status: string): void {
    if (this.stopped) return;
    this.connected = false;
    this.stopPing();
    this.rttMs = null;
    // Une raison précise ne doit pas être écrasée par la fermeture qui la suit.
    if (this.status.startsWith(DISCONNECTED)) return;
    this.setStatus(status);
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

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
