import type { GameSimulation, MatchConfig } from '@ninjarena/core';
import { maxPlayers, pickTeamForNewPlayer } from '@ninjarena/core';
import type { RoomPlayerInfo, ServerMessage } from '@ninjarena/protocol';
import type { ClientSession } from '../session/clientSession';

export type JoinError = 'ROOM_FULL';

export type JoinResult = { ok: true } | { ok: false; error: JoinError };

export interface RoomOptions {
  id: string;
  matchConfig: MatchConfig;
  simulation: GameSimulation;
  characterId: string;
  autoStartWhenFull: boolean;
}

const MIN_PLAYERS_TO_START = 2;

export class Room {
  readonly id: string;
  readonly matchConfig: MatchConfig;
  readonly simulation: GameSimulation;
  private readonly characterId: string;
  private readonly autoStartWhenFull: boolean;
  private readonly present: ClientSession[] = [];

  constructor(options: RoomOptions) {
    this.id = options.id;
    this.matchConfig = options.matchConfig;
    this.simulation = options.simulation;
    this.characterId = options.characterId;
    this.autoStartWhenFull = options.autoStartWhenFull;
  }

  get sessions(): readonly ClientSession[] {
    return this.present;
  }

  get isFull(): boolean {
    return this.present.length >= maxPlayers(this.matchConfig);
  }

  join(session: ClientSession, name: string): JoinResult {
    // Un `join` répété par la même session est sans effet plutôt que de dupliquer le joueur.
    if (this.present.includes(session)) return { ok: true };
    if (this.isFull) return { ok: false, error: 'ROOM_FULL' };
    // L'identité du joueur vient de sa connexion: le client ne choisit jamais son identifiant.
    const playerId = session.id;
    session.playerId = playerId;
    session.name = name;
    session.ready = false;
    const teamId = pickTeamForNewPlayer(this.matchConfig, this.simulation.world, playerId);
    this.simulation.addPlayer({ id: playerId, teamId, characterId: this.characterId });
    this.present.push(session);
    this.broadcastRoomState();
    // Le démarrage automatique se joue aussi à l'arrivée: une salle pleine n'attend aucun `ready`.
    if (this.shouldStart()) this.simulation.startMatch();
    return { ok: true };
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
    this.broadcastRoomState();
    if (this.shouldStart()) this.simulation.startMatch();
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
