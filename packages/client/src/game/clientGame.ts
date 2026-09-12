import type { GameContent } from '@ninjarena/content';
import { loadMap } from '@ninjarena/content';
import type { PlayerId, PlayerState, Vec2, WorldState } from '@ninjarena/core';
import {
  FixedStepAccumulator,
  GameSimulation,
  emptyBuild,
  lerp,
  tickDurationMs,
} from '@ninjarena/core';
import type { ServerMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION } from '@ninjarena/protocol';
import type { AudioPort } from '../audio/audioPort';
import { cueForEvent } from '../audio/eventCues';
import type { ClientConfig } from '../config/clientConfig';
import type { InputBindings } from '../input/bindings';
import { buildPlayerInput } from '../input/buildPlayerInput';
import type { InputState } from '../input/inputState';
import { PredictionBuffer } from '../netcode/predictionBuffer';
import { reconcile } from '../netcode/reconcile';
import { ServerClock } from '../netcode/serverClock';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import { SnapshotInterpolator } from '../netcode/snapshotInterpolator';
import type { NetworkClient } from '../network/networkClient';
import type { Renderer } from '../rendering/renderer';
import type { Hud } from '../ui/hud';
import { buildHudView } from './hudView';
import { buildRenderFrame } from './renderFrame';

export interface ClientGameDeps {
  config: ClientConfig;
  content: GameContent;
  network: NetworkClient;
  renderer: Renderer;
  hud: Hud;
  audio: AudioPort;
  inputState: InputState;
  bindings: InputBindings;
}

type WelcomeMessage = Extract<ServerMessage, { type: 'welcome' }>;
type SnapshotMessage = Extract<ServerMessage, { type: 'snapshot' }>;

const MAX_FRAME_MS = 250;
const PING_INTERVAL_MS = 1000;
const DISCONNECTED = 'disconnected';

export class ClientGame {
  private readonly deps: ClientGameDeps;
  private buffer = new PredictionBuffer();
  private interpolator = new SnapshotInterpolator();
  private simulation: GameSimulation | null = null;
  private accumulator: FixedStepAccumulator | null = null;
  private clock: ServerClock | null = null;
  private localPlayerId: PlayerId | null = null;
  private latestSnapshot: WorldState | null = null;
  private previousLocalPosition: Vec2 | null = null;
  private cameraPosition: Vec2 = { x: 0, y: 0 };
  private isFfa = false;
  private tickMs = 0;
  private seq = 0;
  private frameHandle: number | null = null;
  private pingHandle: number | null = null;
  private lastFrameMs: number | null = null;
  private rttMs: number | null = null;
  private connected = false;
  private stopped = false;
  private status = 'connecting';

  constructor(deps: ClientGameDeps) {
    this.deps = deps;
  }

  async start(container: HTMLElement): Promise<void> {
    const { config, network, renderer } = this.deps;
    await renderer.init(container);
    network.onMessage((message) => {
      this.handleMessage(message);
    });
    network.onClose(() => {
      this.markDisconnected(DISCONNECTED);
    });
    this.setStatus(`connecting to ${config.serverUrl}`);
    try {
      await network.connect(config.serverUrl);
    } catch (error) {
      this.markDisconnected(`${DISCONNECTED}: ${reasonOf(error)}`);
      throw error;
    }
    this.connected = true;
    // Loadout par défaut en attendant le panneau de préparation.
    network.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name: config.playerName,
      build: emptyBuild(),
      techniqueIds: ['blink', 'chakra-shield', 'lightning-dash'],
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
    this.deps.network.close();
    this.deps.renderer.dispose();
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        return;
      case 'roomState': {
        const ready = message.players.filter((player) => player.ready).length;
        this.setStatus(`${ready}/${message.players.length} ready`);
        return;
      }
      case 'snapshot':
        this.handleSnapshot(message);
        return;
      case 'error':
        this.setStatus(`error: ${message.message}`);
        return;
      case 'pong':
        this.rttMs = performance.now() - message.sentAt;
        return;
    }
  }

  private handleWelcome(message: WelcomeMessage): void {
    const { content, network, renderer } = this.deps;
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
    this.latestSnapshot = null;
    this.previousLocalPosition = null;
    this.lastFrameMs = null;
    this.rttMs = null;
    this.seq = 0;
    // Avant le premier snapshot le joueur local n'existe pas: la caméra vise le centre de la carte.
    this.cameraPosition = { x: map.widthInUnits / 2, y: map.heightInUnits / 2 };
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
    reconcile(simulation, localPlayerId, message.world, this.buffer.pending);
    this.latestSnapshot = message.world;
    for (const event of message.events) {
      const cue = cueForEvent(event);
      if (cue !== null) this.deps.audio.play(cue);
    }
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
    for (let step = 0; step < steps; step++) this.runTick();
    this.renderFrame(accumulator.alpha);
    this.updateHud();
  }

  private runTick(): void {
    const simulation = this.simulation;
    const localPlayerId = this.localPlayerId;
    if (simulation === null || localPlayerId === null) return;
    const local = simulation.world.players[localPlayerId];
    this.previousLocalPosition = local === undefined ? null : { ...local.position };
    // La visée part de l'endroit où le joueur est dessiné, pas de sa position simulée.
    const screenPosition = this.deps.renderer.worldToScreen(this.cameraPosition);
    const input = buildPlayerInput(this.deps.inputState, this.deps.bindings, screenPosition);
    this.seq += 1;
    this.deps.network.send({ type: 'input', seq: this.seq, input });
    this.buffer.push(this.seq, input);
    simulation.step({ [localPlayerId]: input });
  }

  private renderFrame(alpha: number): void {
    const localPlayerId = this.localPlayerId;
    if (localPlayerId === null) return;
    const local = this.localPlayer();
    if (local !== undefined) {
      this.cameraPosition = lerp(
        this.previousLocalPosition ?? local.position,
        local.position,
        alpha,
      );
    }
    this.deps.renderer.render(
      buildRenderFrame({
        localPlayerId,
        localPlayer: local,
        localPosition: this.cameraPosition,
        remotes: this.sampleRemotes(),
        isFfa: this.isFfa,
      }),
    );
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
      }),
    );
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
