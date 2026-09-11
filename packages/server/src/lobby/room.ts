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
    if (this.isFull) return { ok: false, error: 'ROOM_FULL' };
    // L'identité du joueur vient de sa connexion: le client ne choisit jamais son identifiant.
    session.playerId = session.id;
    session.name = name;
    session.ready = false;
    const teamId = pickTeamForNewPlayer(this.matchConfig, this.simulation.world, session.id);
    this.simulation.addPlayer({ id: session.id, teamId, characterId: this.characterId });
    this.present.push(session);
    this.broadcastRoomState();
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
      const player = this.simulation.world.players[session.id];
      if (player === undefined) continue;
      players.push({
        id: session.id,
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
