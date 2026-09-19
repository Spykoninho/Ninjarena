import { randomInt as cryptoRandomInt } from 'node:crypto';
import type { GameContent } from '@ninjarena/content';
import type { RatingChange, RoomSettings, TeamId, WorldEvent } from '@ninjarena/core';
import {
  applySettingsPatch,
  createBracket,
  currentMatch,
  isTournamentOver,
  openNextMatch,
  resolveMatch,
  roomMaxPlayers,
  teamsPresent,
  validateLoadout,
  withdrawPlayer,
} from '@ninjarena/core';
import type {
  MatchSummary,
  RoomStatus,
  RoomView,
  ServerMessage,
  StartBlocker,
} from '@ninjarena/protocol';
import type { MapLibrary } from '../maps/mapLibrary';
import type { MatchResult } from '../persistence/matchResultRepository';
import type { ClientSession } from '../session/clientSession';
import { passwordMatches } from './password';
import { RoomMapCache } from './roomMap';
import type { RoomMatch } from './roomMatch';
import { inJoinOrder, matchResultOf, startRoomMatch } from './roomMatch';
import type { RoomPlayer } from './roomPlayer';
import type { TournamentRecord } from './roomTournament';
import { shuffleWith, tournamentViewOf } from './roomTournament';
import { computeStartBlockers } from './startBlockers';

export type RoomErrorCode =
  | 'ROOM_FULL'
  | 'WRONG_PASSWORD'
  | 'ROOM_IN_GAME'
  | 'NOT_HOST'
  | 'WRONG_STATUS'
  | 'INVALID_SETTINGS'
  | 'INVALID_LOADOUT'
  | 'TEAM_FULL'
  | 'CANNOT_START'
  | 'NOT_LOGGED_IN';

export type RoomError = { code: RoomErrorCode; message: string };

export type RoomResult = { ok: true } | { ok: false; error: RoomError };

export interface RoomDeps {
  code: string;
  passwordHash: Buffer | null;
  settings: RoomSettings;
  content: GameContent;
  maps: MapLibrary;
  tickRate: number;
  snapshotEveryTicks: number;
  postMatchTicks: number;
  characterId: string;
  // Le crochet rend les scores réglés pour que le bilan envoyé aux joueurs les montre.
  onMatchEnded?: (result: MatchResult) => readonly RatingChange[] | void;
  // Le tirage de l'arbre du tournoi; injectable pour que les tests connaissent l'ordre.
  randomInt?: (max: number) => number;
  // Une salle de la file classée: personne n'y règle rien et elle part dès que tout le monde est prêt.
  locked?: boolean;
}

export class Room {
  readonly code: string;
  private readonly passwordHash: Buffer | null;
  private readonly content: GameContent;
  private readonly mapCache: RoomMapCache;
  private readonly tickRate: number;
  private readonly snapshotEveryTicks: number;
  private readonly postMatchTicks: number;
  private readonly characterId: string;
  private readonly onMatchEnded: ((result: MatchResult) => readonly RatingChange[] | void) | null;
  private readonly randomInt: (max: number) => number;
  private readonly locked: boolean;
  private readonly roster: RoomPlayer[] = [];
  private roomSettings: RoomSettings;
  private roomStatus: RoomStatus = 'WAITING';
  private activeMatch: RoomMatch | null = null;
  private tournament: TournamentRecord | null = null;
  private ticksSinceEnd = 0;
  private nextJoinedAt = 1;

  constructor(deps: RoomDeps) {
    this.code = deps.code;
    this.passwordHash = deps.passwordHash;
    this.roomSettings = deps.settings;
    this.content = deps.content;
    this.mapCache = new RoomMapCache(deps.maps, () => this.roomSettings);
    this.tickRate = deps.tickRate;
    this.snapshotEveryTicks = deps.snapshotEveryTicks;
    this.postMatchTicks = deps.postMatchTicks;
    this.characterId = deps.characterId;
    this.onMatchEnded = deps.onMatchEnded ?? null;
    this.randomInt = deps.randomInt ?? ((max) => cryptoRandomInt(max));
    this.locked = deps.locked ?? false;
  }

  get status(): RoomStatus {
    return this.roomStatus;
  }

  // L'hôte est le plus ancien présent: un départ passe la main sans élection.
  get hostId(): string | null {
    let host: RoomPlayer | null = null;
    for (const player of this.roster) {
      if (host === null || player.joinedAt < host.joinedAt) host = player;
    }
    return host?.session.id ?? null;
  }

  get settings(): RoomSettings {
    return this.roomSettings;
  }

  get players(): readonly RoomPlayer[] {
    return this.roster;
  }

  get isEmpty(): boolean {
    return this.roster.length === 0;
  }

  get match(): RoomMatch | null {
    return this.activeMatch;
  }

  playerOf(session: ClientSession): RoomPlayer | undefined {
    return this.roster.find((player) => player.session === session);
  }

  // Tout le monde reçoit les instantanés, y compris ceux qui regardent le match des autres.
  sessionsInMatch(): readonly ClientSession[] {
    return this.roster.map((player) => player.session);
  }

  join(session: ClientSession, password: string | undefined): RoomResult {
    // Un `join` répété par la même session est sans effet plutôt que de dupliquer le joueur.
    if (this.playerOf(session) !== undefined) return { ok: true };
    if (this.roomStatus !== 'WAITING') {
      return fail('ROOM_IN_GAME', 'the match has already started');
    }
    // Une salle sans mot de passe ignore celui qu'on lui envoie.
    if (this.passwordHash !== null && !passwordMatches(this.passwordHash, password ?? '')) {
      return fail('WRONG_PASSWORD', 'wrong password');
    }
    if (this.roster.length >= roomMaxPlayers(this.roomSettings)) {
      return fail('ROOM_FULL', 'the room is full');
    }
    if (this.roomSettings.ranked && session.account === null) {
      return fail('NOT_LOGGED_IN', 'a ranked room needs an account');
    }
    this.roster.push({
      session,
      team: this.roomSettings.mode === 'team' ? this.leastCrowdedTeam() : null,
      ready: false,
      loadout: null,
      loadoutValid: false,
      joinedAt: this.nextJoinedAt++,
    });
    session.room = this;
    this.broadcastState();
    return { ok: true };
  }

  leave(session: ClientSession): void {
    const index = this.roster.findIndex((player) => player.session === session);
    if (index === -1) return;
    this.roster.splice(index, 1);
    session.room = null;
    session.playerId = null;
    session.inputs.clear();

    const bracket = this.tournament?.bracket;
    if (bracket !== undefined && !isTournamentOver(bracket)) withdrawPlayer(bracket, session.id);
    const match = this.activeMatch;
    if (match !== null) {
      match.simulation.removePlayer(session.id);
      const running = this.roomStatus === 'STARTING' || this.roomStatus === 'IN_GAME';
      const present = teamsPresent(match.simulation.world);
      // Une partie sans adversaire ne peut plus se conclure: le camp resté en lice l'emporte.
      if (running && present.length < 2) this.finish(present[0] ?? null);
    }
    if (this.roster.length === 0) return;
    this.broadcastState();
  }

  updateSettings(session: ClientSession, patch: unknown): RoomResult {
    const denied = this.requireHostInLobby(session);
    if (denied !== null) return denied;
    if (this.locked) return fail('WRONG_STATUS', 'the settings of a matchmade room are fixed');

    const applied = applySettingsPatch(this.roomSettings, patch, this.content.statRules);
    if (!applied.ok) return fail('INVALID_SETTINGS', applied.reason);
    if (roomMaxPlayers(applied.settings) < this.roster.length) {
      return fail('INVALID_SETTINGS', `the room already holds ${this.roster.length} players`);
    }

    const mapChanged = applied.settings.mapId !== this.roomSettings.mapId;
    this.roomSettings = applied.settings;
    // Un arbre affiché après un tournoi parle d'une salle qui n'existe plus dès qu'on la règle.
    this.tournament = null;
    this.reassignTeams();
    this.revalidateLoadouts();
    if (mapChanged) this.scheduleRefresh();
    else this.mapCache.refreshIssues();
    this.broadcastState();
    return { ok: true };
  }

  setLoadout(session: ClientSession, raw: unknown): RoomResult {
    const player = this.playerOf(session);
    if (player === undefined) return fail('WRONG_STATUS', 'the player is not in this room');
    if (this.roomStatus !== 'WAITING') return fail('WRONG_STATUS', 'the lobby is closed');

    const validation = validateLoadout(
      raw,
      this.content.abilities,
      this.content.statRules,
      this.roomSettings.buildPoints,
    );
    if (!validation.ok) return fail('INVALID_LOADOUT', validation.reason);
    player.loadout = validation.loadout;
    player.loadoutValid = true;
    this.broadcastState();
    return { ok: true };
  }

  setReady(session: ClientSession, ready: boolean): RoomResult {
    const player = this.playerOf(session);
    if (player === undefined) return fail('WRONG_STATUS', 'the player is not in this room');
    if (this.roomStatus !== 'WAITING') return fail('WRONG_STATUS', 'the lobby is closed');
    if (ready && (player.loadout === null || !player.loadoutValid)) {
      return fail('INVALID_LOADOUT', 'a valid loadout is needed to be ready');
    }
    player.ready = ready;
    this.broadcastState();
    return { ok: true };
  }

  switchTeam(session: ClientSession, team: number): RoomResult {
    const player = this.playerOf(session);
    if (player === undefined) return fail('WRONG_STATUS', 'the player is not in this room');
    if (this.roomStatus !== 'WAITING') return fail('WRONG_STATUS', 'the lobby is closed');
    if (this.roomSettings.mode !== 'team') return fail('WRONG_STATUS', 'free-for-all has no team');
    if (!Number.isInteger(team) || team < 0 || team >= this.roomSettings.teamCount) {
      return fail('INVALID_SETTINGS', `team ${team} is outside the room`);
    }
    if (player.team === team) return { ok: true };
    if (this.countOnTeam(team) >= this.roomSettings.playersPerTeam) {
      return fail('TEAM_FULL', `team ${team} is full`);
    }
    player.team = team;
    this.broadcastState();
    return { ok: true };
  }

  startBlockers(): StartBlocker[] {
    return computeStartBlockers({
      players: this.roster,
      settings: this.roomSettings,
      map: this.mapCache.document,
      mapIssues: this.mapCache.issues,
    });
  }

  start(session: ClientSession): RoomResult {
    const denied = this.requireHostInLobby(session);
    if (denied !== null) return denied;
    const blockers = this.startBlockers();
    if (blockers.length > 0) return fail('CANNOT_START', blockers.join(', '));
    if (this.mapCache.document === null) return fail('CANNOT_START', 'MAP_MISSING');

    if (this.roomSettings.tournament) {
      this.tournament = this.drawTournament();
      if (!this.playNextTournamentMatch()) this.tournament = null;
      return { ok: true };
    }
    this.tournament = null;
    this.launch(this.roster);
    return { ok: true };
  }

  tick(): void {
    if (this.activeMatch === null) {
      this.autoStart();
      return;
    }
    // La simulation tourne à vide après la fin: les clients gardent l'état final sous les yeux.
    const counting = this.roomStatus === 'FINISHED';
    this.activeMatch.host.tick();
    if (!counting) return;
    this.ticksSinceEnd += 1;
    if (this.ticksSinceEnd < this.postMatchTicks) return;
    // Entre deux matches d'un tournoi la salle ne repasse pas par le salon: le suivant s'enchaîne.
    if (this.tournament !== null && !isTournamentOver(this.tournament.bracket)) {
      this.discardMatch();
      if (this.playNextTournamentMatch()) return;
    }
    this.resetToLobby();
  }

  // Une salle verrouillée n'attend pas son hôte: elle part seule dès que rien ne bloque.
  private autoStart(): void {
    if (!this.locked || this.roomStatus !== 'WAITING') return;
    if (this.mapCache.document === null || this.startBlockers().length > 0) return;
    this.launch(this.roster);
  }

  // Le tirage au sort place les joueurs dans l'arbre; leurs noms sont figés pour l'affichage.
  private drawTournament(): TournamentRecord {
    const ids = shuffleWith(
      inJoinOrder(this.roster).map((player) => player.session.id),
      this.randomInt,
    );
    const names = new Map(this.roster.map((player) => [player.session.id, player.session.name]));
    return { bracket: createBracket(ids, this.roomSettings.tournamentSize), names };
  }

  // Ouvre le prochain match de l'arbre; les forfaits passent d'office et `false` signe la fin.
  private playNextTournamentMatch(): boolean {
    const record = this.tournament;
    if (record === null) return false;
    const ref = openNextMatch(record.bracket);
    const match = currentMatch(record.bracket);
    if (ref === null || match === null) return false;
    const seated = this.roster.filter((player) => match.players.includes(player.session.id));
    if (seated.length < 2) {
      // Un joueur parti entre l'ouverture et le lancement: son adversaire passe par forfait.
      resolveMatch(record.bracket, ref, seated[0]?.session.id ?? null);
      return this.playNextTournamentMatch();
    }
    this.launch(seated);
    return true;
  }

  private launch(players: readonly RoomPlayer[]): void {
    const map = this.mapCache.document;
    if (map === null) return;
    this.activeMatch = startRoomMatch({
      content: this.content,
      map,
      settings: this.roomSettings,
      players,
      spectators: this.roster.filter((player) => !players.includes(player)),
      characterId: this.characterId,
      tickRate: this.tickRate,
      snapshotEveryTicks: this.snapshotEveryTicks,
      sessions: () => this.sessionsInMatch(),
      onEvents: (events) => {
        this.handleEvents(events);
      },
    });
    this.roomStatus = 'STARTING';
    this.ticksSinceEnd = 0;
    this.broadcastState();
  }

  // La salle se rediffuse une fois la carte lue: sa vue ne dépend pas de l'ordre des appels.
  async refreshMap(): Promise<void> {
    await this.mapCache.load();
    this.broadcastState();
  }

  view(): RoomView {
    return {
      code: this.code,
      hasPassword: this.passwordHash !== null,
      locked: this.locked,
      // Une salle vide n'a pas d'hôte: le code tient lieu de valeur pour rester décodable.
      hostId: this.hostId ?? this.code,
      status: this.roomStatus,
      settings: { ...this.roomSettings },
      map: this.mapCache.summary,
      players: this.roster.map((player) => ({
        id: player.session.id,
        name: player.session.name,
        team: player.team,
        ready: player.ready,
        loadout: player.loadout,
        loadoutValid: player.loadoutValid,
        rating: player.session.account?.rating ?? null,
      })),
      startBlockers: this.startBlockers(),
      tournament: this.tournament === null ? null : tournamentViewOf(this.tournament),
    };
  }

  broadcastState(): void {
    this.broadcast({ type: 'roomState', room: this.view() });
  }

  private broadcast(message: ServerMessage): void {
    for (const player of this.roster) player.session.send(message);
  }

  private handleEvents(events: readonly WorldEvent[]): void {
    for (const event of events) {
      if (event.type === 'roundStarted' && event.round === 1 && this.roomStatus === 'STARTING') {
        this.roomStatus = 'IN_GAME';
        this.broadcastState();
      } else if (event.type === 'matchEnded') {
        this.finish(event.winnerTeamId);
      }
    }
  }

  private finish(winnerTeamId: TeamId | null): void {
    if (this.roomStatus !== 'STARTING' && this.roomStatus !== 'IN_GAME') return;
    const match = this.activeMatch;
    this.roomStatus = 'FINISHED';
    this.ticksSinceEnd = 0;
    // En duel chacun est sa propre équipe: l'identifiant gagnant est celui du joueur.
    const bracket = this.tournament?.bracket;
    if (bracket?.current) resolveMatch(bracket, bracket.current, winnerTeamId);
    // Une fin hors tick d'instantané resterait invisible: l'état terminal part tout de suite.
    match?.host.flush();
    // Une salle vidée n'a plus de résultat à consigner.
    if (match !== null && this.roster.length > 0) {
      const result = matchResultOf({
        roomCode: this.code,
        settings: this.roomSettings,
        players: match.participants,
        winnerTeamId,
        scores: match.simulation.world.match.scores,
        endedAt: Date.now(),
      });
      const changes = this.onMatchEnded?.(result) ?? [];
      this.broadcast({ type: 'matchSummary', summary: this.summaryOf(match, result, changes) });
    }
    this.broadcastState();
  }

  private summaryOf(
    match: RoomMatch,
    result: MatchResult,
    changes: readonly RatingChange[],
  ): MatchSummary {
    return {
      winnerTeamId: result.winnerTeamId,
      scores: { ...result.scores },
      ranked: result.settings.ranked,
      players: result.players.map((player) => {
        const change = changes.find((entry) => entry.id === player.account?.name);
        return {
          id: player.id,
          name: player.name,
          teamId: player.teamId,
          ...match.stats.statsOf(player.id),
          rating:
            player.account === null
              ? null
              : { before: player.account.rating, after: change?.after ?? player.account.rating },
        };
      }),
    };
  }

  private discardMatch(): void {
    this.activeMatch = null;
    this.ticksSinceEnd = 0;
    for (const player of this.roster) {
      player.session.playerId = null;
      player.session.inputs.clear();
    }
  }

  private resetToLobby(): void {
    this.discardMatch();
    this.roomStatus = 'WAITING';
    for (const player of this.roster) player.ready = false;
    this.broadcastState();
  }

  private requireHostInLobby(session: ClientSession): RoomResult | null {
    if (this.playerOf(session) === undefined || session.id !== this.hostId) {
      return fail('NOT_HOST', 'only the host can do that');
    }
    if (this.roomStatus !== 'WAITING') return fail('WRONG_STATUS', 'the lobby is closed');
    return null;
  }

  private countOnTeam(team: number): number {
    return this.roster.filter((player) => player.team === team).length;
  }

  private leastCrowdedTeam(): number {
    let best = 0;
    for (let team = 1; team < this.roomSettings.teamCount; team++) {
      if (this.countOnTeam(team) < this.countOnTeam(best)) best = team;
    }
    return best;
  }

  private reassignTeams(): void {
    if (this.roomSettings.mode !== 'team') {
      for (const player of this.roster) player.team = null;
      return;
    }
    for (const player of inJoinOrder(this.roster)) {
      if (player.team !== null && player.team < this.roomSettings.teamCount) continue;
      player.team = this.leastCrowdedTeam();
    }
  }

  private revalidateLoadouts(): void {
    for (const player of this.roster) {
      if (player.loadout === null) continue;
      const validation = validateLoadout(
        player.loadout,
        this.content.abilities,
        this.content.statRules,
        this.roomSettings.buildPoints,
      );
      player.loadoutValid = validation.ok;
      if (!validation.ok) player.ready = false;
    }
  }

  // Une carte illisible vaut une carte absente: la salle reste utilisable et l'annonce.
  private scheduleRefresh(): void {
    void this.refreshMap().catch(() => {
      this.mapCache.accept(null);
      this.broadcastState();
    });
  }
}

function fail(code: RoomErrorCode, message: string): RoomResult {
  return { ok: false, error: { code, message } };
}
