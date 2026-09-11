import type { GameContent } from '@ninjarena/content';
import { loadMap } from '@ninjarena/content';
import type { PlayerId, PlayerState, Vec2, WorldState } from '@ninjarena/core';
import {
  FixedStepAccumulator,
  GameSimulation,
  isVisibleTo,
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
import type { PlayerView, ProjectileView, Renderer } from '../rendering/renderer';
import type { Hud, HudAbilityView } from '../ui/hud';

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

export class ClientGame {
  private readonly deps: ClientGameDeps;
  private readonly buffer = new PredictionBuffer();
  private readonly interpolator = new SnapshotInterpolator();
  private simulation: GameSimulation | null = null;
  private accumulator: FixedStepAccumulator | null = null;
  private clock: ServerClock | null = null;
  private localPlayerId: PlayerId | null = null;
  private latestSnapshot: WorldState | null = null;
  private previousLocalPosition: Vec2 | null = null;
  private cameraPosition: Vec2 = { x: 0, y: 0 };
  private tickMs = 0;
  private seq = 0;
  private frameHandle: number | null = null;
  private lastFrameMs: number | null = null;
  private connected = false;
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
      this.connected = false;
      this.status = 'disconnected';
    });
    await network.connect(config.serverUrl);
    this.connected = true;
    this.status = 'joining';
    network.send({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: config.playerName });
  }

  stop(): void {
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
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
        this.status = `${ready}/${message.players.length} ready`;
        return;
      }
      case 'snapshot':
        this.handleSnapshot(message);
        return;
      case 'error':
        this.status = `error: ${message.message}`;
        return;
      case 'pong':
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
      config: { tickRate: message.tickRate },
    });
    this.localPlayerId = message.playerId;
    this.tickMs = tickDurationMs({ tickRate: message.tickRate });
    this.accumulator = new FixedStepAccumulator(this.tickMs);
    this.clock = new ServerClock(this.tickMs);
    // Avant le premier snapshot le joueur local n'existe pas: la caméra vise le centre de la carte.
    this.cameraPosition = { x: map.widthInUnits / 2, y: map.heightInUnits / 2 };
    renderer.setMap(map, content.tilesets.get(content.maps.get(message.mapId).tileset));
    network.send({ type: 'ready' });
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
    const screenPosition = this.deps.renderer.worldToScreen(local?.position ?? this.cameraPosition);
    const input = buildPlayerInput(this.deps.inputState, this.deps.bindings, screenPosition);
    this.seq += 1;
    this.deps.network.send({ type: 'input', seq: this.seq, input });
    this.buffer.push(this.seq, input);
    simulation.step({ [localPlayerId]: input });
  }

  private renderFrame(alpha: number): void {
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
    }
    const sampled = this.sampleRemotes();
    const players: PlayerView[] = [];
    if (local !== undefined) players.push(toPlayerView(local, this.cameraPosition, true, true));
    for (const remote of Object.values(sampled?.players ?? {})) {
      if (remote.id === localPlayerId) continue;
      const visible = local === undefined || isVisibleTo(remote, local);
      players.push(toPlayerView(remote, remote.renderPosition, false, visible));
    }
    const projectiles: ProjectileView[] = Object.values(sampled?.projectiles ?? {}).map(
      (projectile) => ({
        id: projectile.id,
        position: projectile.renderPosition,
        radius: projectile.radius,
      }),
    );
    this.deps.renderer.render({ camera: this.cameraPosition, players, projectiles });
  }

  private sampleRemotes(): InterpolatedWorld | null {
    const clock = this.clock;
    if (clock === null) return null;
    const renderTick =
      clock.estimateTick(performance.now()) - this.deps.config.interpolationDelayTicks;
    return this.interpolator.sample(renderTick);
  }

  private updateHud(): void {
    const local = this.localPlayer();
    const match = this.latestSnapshot?.match ?? null;
    this.deps.hud.update({
      health: local?.health ?? 0,
      maxHealth: local?.stats.maxHealth ?? 0,
      energy: local?.energy ?? 0,
      maxEnergy: local?.stats.maxEnergy ?? 0,
      abilities: this.abilityViews(local),
      matchPhase: match?.phase ?? 'WAITING',
      round: match?.round ?? 0,
      scores: match?.scores ?? {},
      status: this.status,
    });
  }

  private localPlayer(): PlayerState | undefined {
    const localPlayerId = this.localPlayerId;
    if (this.simulation === null || localPlayerId === null) return undefined;
    return this.simulation.world.players[localPlayerId];
  }

  private abilityViews(local: PlayerState | undefined): HudAbilityView[] {
    const simulation = this.simulation;
    if (local === undefined || simulation === null) return [];
    return local.abilities.map((slot) => {
      const ability = this.deps.content.abilities.get(slot.abilityId);
      return {
        name: ability.name,
        remainingMs: Math.max(0, (slot.readyAt - simulation.world.tick) * this.tickMs),
        cooldownMs: ability.cooldownMs,
      };
    });
  }
}

function toPlayerView(
  player: PlayerState,
  position: Vec2,
  isLocal: boolean,
  visible: boolean,
): PlayerView {
  return {
    id: player.id,
    teamId: player.teamId,
    position,
    aim: player.aim,
    phase: player.phase.kind,
    isLocal,
    visible,
    healthRatio: player.stats.maxHealth > 0 ? player.health / player.stats.maxHealth : 0,
  };
}
