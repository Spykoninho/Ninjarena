import { describe, expect, it } from 'vitest';
import type { Build, MapDocument, RoomSettings } from '@ninjarena/core';
import { defaultRoomSettings, emptyBuild, migrateMapDocument } from '@ninjarena/core';
import { loadContent } from '@ninjarena/content';
import type { RoomView, ServerMessage } from '@ninjarena/protocol';
import { serverMessageCodec } from '@ninjarena/protocol';
import { MapLibrary } from '../maps/mapLibrary';
import { InMemoryMapRepository } from '../persistence/mapRepository';
import { ClientSession } from '../session/clientSession';
import { FakeConnection } from '../testing/fakeConnection';
import { hashPassword } from './password';
import type { MatchResult } from '../persistence/matchResultRepository';
import { Room } from './room';

const content = loadContent();
const RULES = content.statRules;
const TECHNIQUE_IDS = ['blink', 'chakra-shield', 'lightning-dash'];
const TICK_RATE = 60;
const POST_MATCH_TICKS = 10;
const MAX_TICKS = 1000;

interface Fixture {
  room: Room;
  repository: InMemoryMapRepository;
  matchResults: MatchResult[];
}

interface RoomOptions {
  password?: string;
  snapshotEveryTicks?: number;
}

function createRoom(overrides: Partial<RoomSettings> = {}, options: RoomOptions = {}): Fixture {
  const repository = new InMemoryMapRepository();
  const matchResults: MatchResult[] = [];
  const room = new Room({
    code: 'AB7K2P',
    passwordHash: options.password === undefined ? null : hashPassword(options.password),
    settings: { ...defaultRoomSettings(RULES, 'arena'), ...overrides },
    content,
    maps: new MapLibrary({ content, repository, maxStoredMaps: 10 }),
    tickRate: TICK_RATE,
    snapshotEveryTicks: options.snapshotEveryTicks ?? 1,
    postMatchTicks: POST_MATCH_TICKS,
    characterId: 'ninja',
    onMatchEnded: (result) => {
      matchResults.push(result);
      return result.settings.ranked ? [{ id: 'kage', before: 120, after: 131 }] : [];
    },
  });
  return { room, repository, matchResults };
}

function createSession(id: string): { connection: FakeConnection; session: ClientSession } {
  const connection = new FakeConnection(id);
  return { connection, session: new ClientSession(connection, 8) };
}

function decode(raw: string | undefined): ServerMessage {
  if (raw === undefined) throw new Error('no message was sent');
  const message = serverMessageCodec.decode(raw);
  if (message === null) throw new Error(`the server sent an invalid message: ${raw}`);
  return message;
}

function lastRoomView(connection: FakeConnection): RoomView {
  for (let i = connection.sent.length - 1; i >= 0; i--) {
    const message = decode(connection.sent[i]);
    if (message.type === 'roomState') return message.room;
  }
  throw new Error('no roomState was broadcast');
}

function messagesOfType<T extends ServerMessage['type']>(
  connection: FakeConnection,
  type: T,
): Extract<ServerMessage, { type: T }>[] {
  const found: Extract<ServerMessage, { type: T }>[] = [];
  for (const raw of connection.sent) {
    const message = decode(raw);
    if (message.type === type) found.push(message as Extract<ServerMessage, { type: T }>);
  }
  return found;
}

function lastSnapshot(connection: FakeConnection): Extract<ServerMessage, { type: 'snapshot' }> {
  const snapshots = messagesOfType(connection, 'snapshot');
  const last = snapshots.at(-1);
  if (last === undefined) throw new Error('no snapshot was sent');
  return last;
}

function eventTypes(connection: FakeConnection): string[] {
  return messagesOfType(connection, 'snapshot').flatMap((snapshot) =>
    snapshot.events.map((event) => event.type),
  );
}

function build(points: number): Build {
  return { ...emptyBuild(), speed: points };
}

function loadoutOf(points = 0): unknown {
  return { build: build(points), basicAttackId: 'kunai-strike', techniqueIds: TECHNIQUE_IDS };
}

// Une salle prête à démarrer: deux joueurs équipés et annoncés prêts.
function seatReadyPair(room: Room): {
  one: { connection: FakeConnection; session: ClientSession };
  two: { connection: FakeConnection; session: ClientSession };
} {
  const one = createSession('c1');
  const two = createSession('c2');
  for (const seat of [one, two]) {
    expect(room.join(seat.session, undefined)).toEqual({ ok: true });
    expect(room.setLoadout(seat.session, loadoutOf())).toEqual({ ok: true });
    expect(room.setReady(seat.session, true)).toEqual({ ok: true });
  }
  return { one, two };
}

function tickUntil(room: Room, done: () => boolean): number {
  for (let ticks = 1; ticks <= MAX_TICKS; ticks++) {
    room.tick();
    if (done()) return ticks;
  }
  throw new Error('the room never reached the expected state');
}

function killPlayer(room: Room, playerId: string): void {
  const world = room.match?.simulation.world;
  if (world === undefined) throw new Error('the room has no match');
  const player = world.players[playerId];
  if (player === undefined) throw new Error(`no player "${playerId}" in the match`);
  player.health = 0;
  player.phase = { kind: 'DEAD', diedAt: world.tick };
}

function smallMap(overrides: Partial<MapDocument> = {}): MapDocument {
  const size = 8;
  return migrateMapDocument({
    version: 1,
    id: 'pocket',
    name: 'Pocket',
    tileset: 'default',
    width: size,
    height: size,
    layers: {
      ground: Array.from({ length: size }, () => new Array<number>(size).fill(0)),
      objects: Array.from({ length: size }, () => new Array<number | null>(size).fill(null)),
    },
    colliders: [],
    spawns: [
      { x: 1, y: 1 },
      { x: 6, y: 6 },
    ],
    ...overrides,
  });
}

describe('Room joining', () => {
  it('fills the least crowded team first', async () => {
    const { room } = createRoom({ playersPerTeam: 2 });
    await room.refreshMap();

    const teams: (number | null)[] = [];
    for (const id of ['c1', 'c2', 'c3']) {
      const { session } = createSession(id);
      expect(room.join(session, undefined)).toEqual({ ok: true });
      teams.push(room.playerOf(session)?.team ?? null);
    }

    expect(teams).toEqual([0, 1, 0]);
  });

  it('refuses a join once every seat is taken', () => {
    const { room } = createRoom();

    expect(room.join(createSession('c1').session, undefined)).toEqual({ ok: true });
    expect(room.join(createSession('c2').session, undefined)).toEqual({ ok: true });
    expect(room.join(createSession('c3').session, undefined)).toEqual({
      ok: false,
      error: { code: 'ROOM_FULL', message: expect.any(String) },
    });
  });

  it('checks the password of a protected room', () => {
    const { room } = createRoom({}, { password: 'shuriken' });

    expect(room.join(createSession('c1').session, 'nope')).toEqual({
      ok: false,
      error: { code: 'WRONG_PASSWORD', message: expect.any(String) },
    });
    expect(room.join(createSession('c2').session, 'shuriken')).toEqual({ ok: true });
  });

  it('ignores a password sent to a room that has none', () => {
    const { room } = createRoom();
    const { connection, session } = createSession('c1');

    expect(room.join(session, 'shuriken')).toEqual({ ok: true });
    expect(lastRoomView(connection).hasPassword).toBe(false);
  });

  it('refuses a join while a match is running', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const { one } = seatReadyPair(room);
    expect(room.start(one.session)).toEqual({ ok: true });

    expect(room.join(createSession('c3').session, undefined)).toEqual({
      ok: false,
      error: { code: 'ROOM_IN_GAME', message: expect.any(String) },
    });
  });
});

describe('Room readiness', () => {
  it('refuses ready without a loadout and accepts it once equipped', () => {
    const { room } = createRoom();
    const { connection, session } = createSession('c1');
    room.join(session, undefined);

    expect(room.setReady(session, true)).toEqual({
      ok: false,
      error: { code: 'INVALID_LOADOUT', message: expect.any(String) },
    });

    expect(room.setLoadout(session, loadoutOf(4))).toEqual({ ok: true });
    expect(room.setReady(session, true)).toEqual({ ok: true });
    expect(lastRoomView(connection).players).toEqual([
      expect.objectContaining({ id: 'c1', ready: true, loadoutValid: true }),
    ]);
  });

  it('rejects a loadout over the build budget', () => {
    const { room } = createRoom({ buildPoints: 2 });
    const { session } = createSession('c1');
    room.join(session, undefined);

    expect(room.setLoadout(session, loadoutOf(4))).toEqual({
      ok: false,
      error: { code: 'INVALID_LOADOUT', message: expect.any(String) },
    });
  });
});

describe('Room settings', () => {
  it('refuses a settings change from a guest', () => {
    const { room } = createRoom();
    const host = createSession('c1');
    const guest = createSession('c2');
    room.join(host.session, undefined);
    room.join(guest.session, undefined);

    expect(room.updateSettings(guest.session, { bestOf: 5 })).toEqual({
      ok: false,
      error: { code: 'NOT_HOST', message: expect.any(String) },
    });
  });

  it('reports an unusable patch', () => {
    const { room } = createRoom();
    const { session } = createSession('c1');
    room.join(session, undefined);

    expect(room.updateSettings(session, { teamCount: 99 })).toEqual({
      ok: false,
      error: { code: 'INVALID_SETTINGS', message: expect.any(String) },
    });
  });

  it('invalidates a loadout that no longer fits the budget', () => {
    const { room } = createRoom();
    const { session } = createSession('c1');
    room.join(session, undefined);
    room.setLoadout(session, loadoutOf(4));
    room.setReady(session, true);

    expect(room.updateSettings(session, { buildPoints: 0 })).toEqual({ ok: true });

    const player = room.playerOf(session);
    expect(player?.loadoutValid).toBe(false);
    expect(player?.ready).toBe(false);
  });

  it('reassigns players left outside the team range', () => {
    const { room } = createRoom({ playersPerTeam: 2 });
    const host = createSession('c1');
    const second = createSession('c2');
    const third = createSession('c3');
    room.join(host.session, undefined);
    room.join(second.session, undefined);
    expect(room.updateSettings(host.session, { teamCount: 3 })).toEqual({ ok: true });
    room.join(third.session, undefined);
    expect(room.playerOf(third.session)?.team).toBe(2);

    expect(room.updateSettings(host.session, { teamCount: 2 })).toEqual({ ok: true });

    expect(room.playerOf(third.session)?.team).toBe(0);
  });

  it('drops every team when switching to free-for-all', () => {
    const { room } = createRoom();
    const { session } = createSession('c1');
    room.join(session, undefined);

    expect(room.updateSettings(session, { mode: 'ffa' })).toEqual({ ok: true });

    expect(room.playerOf(session)?.team).toBeNull();
  });
});

describe('Room teams', () => {
  it('refuses a switch to a full team', () => {
    const { room } = createRoom();
    const host = createSession('c1');
    const guest = createSession('c2');
    room.join(host.session, undefined);
    room.join(guest.session, undefined);

    expect(room.switchTeam(guest.session, 0)).toEqual({
      ok: false,
      error: { code: 'TEAM_FULL', message: expect.any(String) },
    });
  });

  it('refuses a switch in free-for-all', () => {
    const { room } = createRoom({ mode: 'ffa' });
    const { session } = createSession('c1');
    room.join(session, undefined);

    expect(room.switchTeam(session, 1)).toEqual({
      ok: false,
      error: { code: 'WRONG_STATUS', message: expect.any(String) },
    });
  });

  it('moves a player to a free team', () => {
    const { room } = createRoom({ playersPerTeam: 2 });
    const host = createSession('c1');
    const guest = createSession('c2');
    room.join(host.session, undefined);
    room.join(guest.session, undefined);

    expect(room.switchTeam(guest.session, 0)).toEqual({ ok: true });

    expect(room.playerOf(guest.session)?.team).toBe(0);
  });
});

describe('Room start blockers', () => {
  it('reports a lonely player', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    room.join(createSession('c1').session, undefined);

    expect(room.startBlockers()).toEqual(['NOT_ENOUGH_PLAYERS']);
  });

  it('reports players who are not ready', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    room.join(createSession('c1').session, undefined);
    room.join(createSession('c2').session, undefined);

    expect(room.startBlockers()).toEqual(['PLAYER_NOT_READY']);
  });

  it('reports a loadout broken by a settings change', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const host = createSession('c1');
    const guest = createSession('c2');
    for (const seat of [host, guest]) {
      room.join(seat.session, undefined);
      room.setLoadout(seat.session, loadoutOf(4));
      room.setReady(seat.session, true);
    }

    room.updateSettings(host.session, { buildPoints: 0 });

    expect(room.startBlockers()).toEqual(['PLAYER_NOT_READY', 'INVALID_LOADOUT']);
  });

  it('reports a team left without a player', async () => {
    const { room } = createRoom({ playersPerTeam: 2 });
    await room.refreshMap();
    const host = createSession('c1');
    const guest = createSession('c2');
    room.join(host.session, undefined);
    room.join(guest.session, undefined);
    room.switchTeam(guest.session, 0);

    expect(room.startBlockers()).toContain('EMPTY_TEAM');
  });

  it('reports a map the library cannot serve', async () => {
    const { room } = createRoom();
    const host = createSession('c1');
    room.join(host.session, undefined);
    room.join(createSession('c2').session, undefined);
    room.updateSettings(host.session, { mapId: 'nope' });
    await room.refreshMap();

    expect(room.startBlockers()).toContain('MAP_MISSING');
  });

  it('reports a map without enough spawns for the format', async () => {
    const { room, repository } = createRoom({ mode: 'ffa', teamCount: 4, mapId: 'pocket' });
    await repository.save(smallMap());
    await room.refreshMap();
    for (const id of ['c1', 'c2', 'c3', 'c4']) {
      const { session } = createSession(id);
      room.join(session, undefined);
      room.setLoadout(session, loadoutOf());
      room.setReady(session, true);
    }

    expect(room.startBlockers()).toEqual(['MAP_INVALID']);
  });
});

describe('Room ranked play', () => {
  it('reports a guest in a ranked room and refuses a guest joining one', async () => {
    const { room } = createRoom({ ranked: true });
    await room.refreshMap();
    const one = createSession('c1');
    const two = createSession('c2');
    one.session.account = { name: 'kage', rating: 120, wins: 2, losses: 0 };
    expect(room.join(one.session, undefined)).toEqual({ ok: true });
    expect(room.join(two.session, undefined)).toMatchObject({
      ok: false,
      error: { code: 'NOT_LOGGED_IN' },
    });

    two.session.account = { name: 'hanzo', rating: 100, wins: 0, losses: 0 };
    expect(room.join(two.session, undefined)).toEqual({ ok: true });
    for (const seat of [one, two]) {
      room.setLoadout(seat.session, loadoutOf());
      room.setReady(seat.session, true);
    }
    expect(room.startBlockers()).toEqual([]);
    expect(lastRoomView(one.connection).players.map((player) => player.rating)).toEqual([120, 100]);

    two.session.account = null;
    expect(room.startBlockers()).toEqual(['RANKED_NEEDS_ACCOUNT']);
  });

  it('sends every player a summary with the stats tallied over the match', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);
    room.start(one.session);
    tickUntil(room, () => room.status === 'IN_GAME');

    for (let round = 1; round <= 2; round++) {
      tickUntil(room, () => room.match?.simulation.world.match.phase === 'IN_ROUND');
      const world = room.match?.simulation.world;
      const victim = world?.players[two.session.id];
      if (world === undefined || victim === undefined) throw new Error('no match');
      // Un coup fictif d'un joueur sur l'autre: la simulation n'est pas ce que ce test vérifie.
      room.match?.stats.record([
        {
          type: 'damageDealt',
          tick: world.tick,
          targetId: two.session.id,
          sourceId: one.session.id,
          amount: 30,
          remainingHealth: 0,
          scaling: 'none',
          position: victim.position,
        },
      ]);
      killPlayer(room, two.session.id);
      tickUntil(room, () => room.match?.simulation.world.match.phase !== 'IN_ROUND');
    }

    for (const seat of [one, two]) {
      const summaries = messagesOfType(seat.connection, 'matchSummary');
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.summary).toMatchObject({
        winnerTeamId: 'team-0',
        scores: { 'team-0': 2 },
        ranked: false,
        players: [
          { id: 'c1', teamId: 'team-0', damageDealt: 60, damageTaken: 0, rating: null },
          { id: 'c2', teamId: 'team-1', damageDealt: 0, damageTaken: 60, rating: null },
        ],
      });
    }
  });

  it('shows the settled rating next to each account in a ranked summary', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);
    one.session.account = { name: 'kage', rating: 120, wins: 2, losses: 0 };
    room.updateSettings(one.session, { ranked: false });
    two.session.account = { name: 'hanzo', rating: 100, wins: 0, losses: 0 };
    room.updateSettings(one.session, { ranked: true });
    room.start(one.session);
    tickUntil(room, () => room.status === 'IN_GAME');

    room.leave(two.session);

    const summary = messagesOfType(one.connection, 'matchSummary')[0]?.summary;
    expect(summary).toMatchObject({
      ranked: true,
      winnerTeamId: 'team-0',
      players: [
        { name: 'c1', rating: { before: 120, after: 131 } },
        { name: 'c2', rating: { before: 100, after: 100 } },
      ],
    });
  });

  it('freezes each account and its rating in the match result at kick-off', async () => {
    const { room, matchResults } = createRoom();
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);
    one.session.account = { name: 'kage', rating: 120, wins: 2, losses: 0 };
    two.session.account = { name: 'hanzo', rating: 100, wins: 0, losses: 0 };
    expect(room.updateSettings(one.session, { ranked: true })).toEqual({ ok: true });
    expect(room.start(one.session)).toEqual({ ok: true });
    one.session.account = { ...one.session.account, rating: 999 };

    room.leave(two.session);

    expect(matchResults[0]?.players).toEqual([
      { id: 'c1', name: 'c1', teamId: 'team-0', account: { name: 'kage', rating: 120 } },
      { id: 'c2', name: 'c2', teamId: 'team-1', account: { name: 'hanzo', rating: 100 } },
    ]);
  });
});

describe('Room match lifecycle', () => {
  it('refuses a start from a guest or with blockers left', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const host = createSession('c1');
    const guest = createSession('c2');
    room.join(host.session, undefined);
    room.join(guest.session, undefined);

    expect(room.start(guest.session)).toEqual({
      ok: false,
      error: { code: 'NOT_HOST', message: expect.any(String) },
    });
    expect(room.start(host.session)).toEqual({
      ok: false,
      error: { code: 'CANNOT_START', message: expect.any(String) },
    });
  });

  it('runs a match from the countdown to the next lobby', async () => {
    const { room, matchResults } = createRoom();
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);

    expect(room.start(one.session)).toEqual({ ok: true });
    expect(room.status).toBe('STARTING');
    for (const seat of [one, two]) {
      const started = messagesOfType(seat.connection, 'matchStarted');
      expect(started).toHaveLength(1);
      expect(started[0]?.playerId).toBe(seat.session.id);
      expect(started[0]?.map.id).toBe('arena');
      expect(started[0]?.tickRate).toBe(TICK_RATE);
    }

    tickUntil(room, () => room.status === 'IN_GAME');
    expect(room.status).toBe('IN_GAME');

    for (let round = 1; round <= 2; round++) {
      tickUntil(room, () => room.match?.simulation.world.match.phase === 'IN_ROUND');
      killPlayer(room, two.session.id);
      tickUntil(room, () => room.match?.simulation.world.match.phase !== 'IN_ROUND');
    }

    expect(room.status).toBe('FINISHED');
    expect(matchResults).toHaveLength(1);
    expect(matchResults[0]).toMatchObject({
      roomCode: 'AB7K2P',
      winnerTeamId: 'team-0',
      players: [
        { id: 'c1', teamId: 'team-0' },
        { id: 'c2', teamId: 'team-1' },
      ],
    });

    for (let i = 0; i < POST_MATCH_TICKS; i++) room.tick();

    expect(room.status).toBe('WAITING');
    expect(room.match).toBeNull();
    expect(room.players.every((player) => !player.ready)).toBe(true);
    expect([one, two].every((seat) => seat.session.playerId === null)).toBe(true);

    room.leave(two.session);
    expect(room.join(createSession('c3').session, undefined)).toEqual({ ok: true });
  });

  it('ends the match when a leave empties a team', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);
    room.start(one.session);
    tickUntil(room, () => room.status === 'IN_GAME');

    room.leave(two.session);

    expect(room.status).toBe('FINISHED');
    expect(room.match?.simulation.world.players['c2']).toBeUndefined();
  });

  // Une fin de partie tombe une fois sur deux hors tick d'instantané: les deux cadences comptent.
  it.each([2, 3])('streams the end of the match with one snapshot every %i ticks', async (rate) => {
    const { room } = createRoom({}, { snapshotEveryTicks: rate });
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);
    room.start(one.session);
    tickUntil(room, () => room.status === 'IN_GAME');

    for (let round = 1; round <= 2; round++) {
      tickUntil(room, () => room.match?.simulation.world.match.phase === 'IN_ROUND');
      killPlayer(room, two.session.id);
      tickUntil(room, () => room.match?.simulation.world.match.phase !== 'IN_ROUND');
    }
    expect(room.status).toBe('FINISHED');

    for (const seat of [one, two]) {
      expect(eventTypes(seat.connection)).toContain('matchEnded');
      expect(lastSnapshot(seat.connection).world.match.phase).toBe('MATCH_END');
    }

    // La salle continue de diffuser pendant l'écran de fin.
    const before = messagesOfType(one.connection, 'snapshot').length;
    room.tick();
    room.tick();
    expect(messagesOfType(one.connection, 'snapshot').length).toBeGreaterThan(before);
  });

  it('records both players and the remaining team when the host forfeits', async () => {
    const { room, matchResults } = createRoom({}, { snapshotEveryTicks: 2 });
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);
    room.start(one.session);
    tickUntil(room, () => room.status === 'IN_GAME');

    room.leave(one.session);

    expect(matchResults).toHaveLength(1);
    expect(matchResults[0]).toMatchObject({
      winnerTeamId: 'team-1',
      players: [
        { id: 'c1', teamId: 'team-0' },
        { id: 'c2', teamId: 'team-1' },
      ],
    });
    expect(lastSnapshot(two.connection).world.players['c1']).toBeUndefined();
  });

  it('records nothing more once the last player leaves the match', async () => {
    const { room, matchResults } = createRoom();
    await room.refreshMap();
    const { one, two } = seatReadyPair(room);
    room.start(one.session);
    tickUntil(room, () => room.status === 'IN_GAME');

    room.leave(one.session);
    room.leave(two.session);

    expect(matchResults).toHaveLength(1);
    expect(room.isEmpty).toBe(true);
  });

  it('refuses a settings change while the match runs', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const { one } = seatReadyPair(room);
    room.start(one.session);

    expect(room.updateSettings(one.session, { bestOf: 5 })).toEqual({
      ok: false,
      error: { code: 'WRONG_STATUS', message: expect.any(String) },
    });
  });
});

describe('Room membership', () => {
  it('hands the room over to the next player when the host leaves', () => {
    const { room } = createRoom();
    const host = createSession('c1');
    const guest = createSession('c2');
    room.join(host.session, undefined);
    room.join(guest.session, undefined);
    expect(room.hostId).toBe('c1');

    room.leave(host.session);

    expect(room.hostId).toBe('c2');
    expect(host.session.room).toBeNull();
    expect(room.isEmpty).toBe(false);
  });

  it('reports an empty room once the last player leaves', () => {
    const { room } = createRoom();
    const { session } = createSession('c1');
    room.join(session, undefined);

    room.leave(session);

    expect(room.isEmpty).toBe(true);
  });

  it('broadcasts the room to every player', async () => {
    const { room } = createRoom();
    await room.refreshMap();
    const host = createSession('c1');
    const guest = createSession('c2');
    room.join(host.session, undefined);
    room.join(guest.session, undefined);

    const view = lastRoomView(host.connection);
    expect(view).toMatchObject({
      code: 'AB7K2P',
      hasPassword: false,
      hostId: 'c1',
      status: 'WAITING',
      map: { id: 'arena', builtin: true },
    });
    expect(view.players.map((player) => player.id)).toEqual(['c1', 'c2']);
    expect(lastRoomView(guest.connection)).toEqual(view);
  });
});

describe('Room map cache', () => {
  it('broadcasts the room again once the map is loaded', async () => {
    const { room } = createRoom();
    const { connection, session } = createSession('c1');
    room.join(session, undefined);
    const before = messagesOfType(connection, 'roomState').length;

    await room.refreshMap();

    const views = messagesOfType(connection, 'roomState');
    expect(views.length).toBe(before + 1);
    expect(views.at(-1)?.room.map).toMatchObject({ id: 'arena' });
  });

  it('forgets the cached map when the host picks an unknown one', async () => {
    const { room } = createRoom();
    const { session } = createSession('c1');
    room.join(session, undefined);
    await room.refreshMap();

    room.updateSettings(session, { mapId: 'nope' });
    await room.refreshMap();

    expect(room.view().map).toBeNull();
  });
});
