import type {
  AbilityDefinition,
  DefinitionCatalog,
  GameSimulation,
  MatchConfig,
  StatRulesDefinition,
} from '@ninjarena/core';
import {
  buildBudget,
  maxPlayers,
  pickTeamForNewPlayer,
  validateBuild,
  validateLoadout,
} from '@ninjarena/core';
import type { RoomPlayerInfo, ServerMessage } from '@ninjarena/protocol';
import type { ClientSession } from '../session/clientSession';

export type JoinError = { code: 'ROOM_FULL' | 'INVALID_LOADOUT'; message: string };

export type JoinResult = { ok: true } | { ok: false; error: JoinError };

export interface JoinRequest {
  name: string;
  build: unknown;
  techniqueIds: unknown;
}

export interface RoomOptions {
  id: string;
  matchConfig: MatchConfig;
  simulation: GameSimulation;
  characterId: string;
  autoStartWhenFull: boolean;
  rules: StatRulesDefinition;
  abilities: DefinitionCatalog<AbilityDefinition>;
}

const MIN_PLAYERS_TO_START = 2;

export class Room {
  readonly id: string;
  readonly matchConfig: MatchConfig;
  readonly simulation: GameSimulation;
  private readonly characterId: string;
  private readonly autoStartWhenFull: boolean;
  private readonly rules: StatRulesDefinition;
  private readonly abilities: DefinitionCatalog<AbilityDefinition>;
  private readonly present: ClientSession[] = [];

  constructor(options: RoomOptions) {
    this.id = options.id;
    this.matchConfig = options.matchConfig;
    this.simulation = options.simulation;
    this.characterId = options.characterId;
    this.autoStartWhenFull = options.autoStartWhenFull;
    this.rules = options.rules;
    this.abilities = options.abilities;
  }

  get sessions(): readonly ClientSession[] {
    return this.present;
  }

  get isFull(): boolean {
    return this.present.length >= maxPlayers(this.matchConfig);
  }

  join(session: ClientSession, request: JoinRequest): JoinResult {
    // Un `join` répété par la même session est sans effet plutôt que de dupliquer le joueur.
    if (this.present.includes(session)) return { ok: true };
    if (this.isFull)
      return { ok: false, error: { code: 'ROOM_FULL', message: 'the room is full' } };
    const build = validateBuild(
      request.build,
      this.rules,
      buildBudget(this.matchConfig, this.rules),
    );
    if (!build.ok) return { ok: false, error: { code: 'INVALID_LOADOUT', message: build.reason } };
    const loadout = validateLoadout(request.techniqueIds, this.abilities, this.rules);
    if (!loadout.ok) {
      return { ok: false, error: { code: 'INVALID_LOADOUT', message: loadout.reason } };
    }
    // L'identité du joueur vient de sa connexion: le client ne choisit jamais son identifiant.
    const playerId = session.id;
    session.playerId = playerId;
    session.name = request.name;
    session.techniqueIds = loadout.techniqueIds;
    session.ready = false;
    const teamId = pickTeamForNewPlayer(this.matchConfig, this.simulation.world, playerId);
    this.simulation.addPlayer({
      id: playerId,
      teamId,
      characterId: this.characterId,
      build: build.build,
      techniqueIds: loadout.techniqueIds,
    });
    this.present.push(session);
    return { ok: true };
  }

  announce(): void {
    this.broadcastRoomState();
    // Le démarrage automatique se joue aussi à l'arrivée: une salle pleine n'attend aucun `ready`.
    if (this.shouldStart()) this.simulation.startMatch();
  }

  // La relance d'après-match rejoue la règle de démarrage sans exiger un nouveau `ready`.
  tryStart(): void {
    const phase = this.simulation.world.match.phase;
    if (phase !== 'WAITING' && phase !== 'MATCH_END') return;
    if (this.present.length < MIN_PLAYERS_TO_START) return;
    this.simulation.startMatch();
    this.broadcastRoomState();
  }

  leave(session: ClientSession): void {
    const index = this.present.indexOf(session);
    if (index === -1) return;
    this.present.splice(index, 1);
    if (session.playerId !== null) this.simulation.removePlayer(session.playerId);
    session.playerId = null;
    session.ready = false;
    this.broadcastRoomState();
  }

  setReady(session: ClientSession, ready: boolean): void {
    if (!this.present.includes(session)) return;
    session.ready = ready;
    this.announce();
  }

  roomStateMessage(): ServerMessage {
    const players: RoomPlayerInfo[] = [];
    for (const session of this.present) {
      if (session.playerId === null) continue;
      const player = this.simulation.world.players[session.playerId];
      if (player === undefined) continue;
      players.push({
        id: session.playerId,
        name: session.name,
        teamId: player.teamId,
        ready: session.ready,
        techniqueIds: [...session.techniqueIds],
      });
    }
    return { type: 'roomState', players };
  }

  private shouldStart(): boolean {
    // Une partie en cours ne redémarre pas parce qu'un joueur bascule son état prêt.
    if (this.simulation.world.match.phase !== 'WAITING') return false;
    if (this.autoStartWhenFull && this.isFull) return true;
    return (
      this.present.length >= MIN_PLAYERS_TO_START && this.present.every((session) => session.ready)
    );
  }

  private broadcastRoomState(): void {
    const message = this.roomStateMessage();
    for (const session of this.present) session.send(message);
  }
}
