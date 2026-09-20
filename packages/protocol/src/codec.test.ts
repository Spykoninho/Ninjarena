import { describe, expect, it } from 'vitest';
import { MatchConfigSchema, createWorldState, emptyBuild } from '@ninjarena/core';
import type { Loadout, MapDocument } from '@ninjarena/core';
import { clientMessageCodec, serverMessageCodec } from './codec';
import type { ClientMessage, RoomView, ServerMessage } from './messages';
import { PROTOCOL_VERSION } from './version';

const DUEL = MatchConfigSchema.parse({
  id: 'duel',
  mode: 'team',
  teamCount: 2,
  playersPerTeam: 1,
  roundsToWin: 3,
  roundDurationMs: 90000,
  countdownMs: 3000,
  roundEndDelayMs: 3000,
});

const smallMapDocument = (size: number): unknown => ({
  version: 1,
  id: 'tiny',
  name: 'Tiny',
  tileset: 'default',
  width: size,
  height: size,
  layers: {
    ground: Array.from({ length: size }, () => Array.from({ length: size }, () => 0)),
    objects: Array.from({ length: size }, () => Array.from({ length: size }, () => null)),
  },
  colliders: [],
  spawns: [
    { x: 1, y: 1 },
    { x: 6, y: 6, team: 1 },
  ],
});

const MAP: MapDocument = smallMapDocument(8) as MapDocument;

const LOADOUT: Loadout = {
  build: { ...emptyBuild(), vitality: 2, power: 3, speed: 1 },
  basicAttackId: 'shuriken-throw',
  techniqueIds: ['blink', 'chakra-shield'],
};

const ROOM_VIEW: RoomView = {
  code: 'AB12CD',
  hasPassword: true,
  locked: false,
  hostId: 'c1',
  status: 'WAITING',
  settings: {
    mode: 'team',
    teamCount: 2,
    playersPerTeam: 2,
    buildPoints: 10,
    mapId: 'arena',
    bestOf: 3,
    roundDurationMs: 240_000,
    friendlyFire: false,
    ranked: true,
    practice: false,
    tournament: false,
    tournamentSize: 4,
  },
  map: { id: 'arena', name: 'Arena', width: 16, height: 16, builtin: true },
  players: [
    {
      id: 'c1',
      name: 'host',
      team: 0,
      ready: true,
      loadout: LOADOUT,
      loadoutValid: true,
      rating: 120,
    },
    {
      id: 'c2',
      name: 'guest',
      team: null,
      ready: false,
      loadout: null,
      loadoutValid: false,
      rating: null,
    },
  ],
  startBlockers: ['PLAYER_NOT_READY'],
  tournament: null,
};

const CLIENT_MESSAGES: ClientMessage[] = [
  { type: 'hello', protocolVersion: PROTOCOL_VERSION, name: 'ninja-a1b2' },
  { type: 'register', name: 'kage', password: 'secret' },
  { type: 'login', name: 'kage', password: 'secret' },
  { type: 'resume', token: 'ab'.repeat(32) },
  { type: 'logout' },
  { type: 'getLeaderboard' },
  { type: 'createRoom', password: 'secret', settings: { teamCount: 4 } },
  { type: 'joinRoom', code: 'ab12cd', password: 'secret' },
  { type: 'leaveRoom' },
  { type: 'updateSettings', patch: { bestOf: 5, mapId: 'arena' } },
  { type: 'setLoadout', loadout: LOADOUT },
  { type: 'setReady', ready: true },
  { type: 'switchTeam', team: 1 },
  { type: 'startMatch' },
  { type: 'listMaps' },
  { type: 'getMap', id: 'arena' },
  { type: 'saveMap', document: MAP },
  { type: 'deleteMap', id: 'dojo-a1b2' },
  { type: 'input', seq: 12, input: { move: { x: 1, y: 0 }, aim: { x: 0, y: 1 }, abilityHeld: 2 } },
  { type: 'ping', sentAt: 1_700_000_000_000 },
];

const SERVER_MESSAGES: ServerMessage[] = [
  { type: 'welcome', sessionId: 'session-1' },
  {
    type: 'accountState',
    account: { name: 'kage', rating: 120, wins: 3, losses: 1 },
    token: 'ab'.repeat(32),
  },
  { type: 'accountState', account: null },
  { type: 'leaderboard', entries: [{ name: 'kage', rating: 120, wins: 3, losses: 1 }] },
  { type: 'roomState', room: ROOM_VIEW },
  { type: 'roomLeft' },
  {
    type: 'matchStarted',
    playerId: 'c1',
    spectator: false,
    tickRate: 60,
    snapshotRate: 30,
    matchConfig: DUEL,
    maps: [MAP],
  },
  {
    type: 'snapshot',
    tick: 0,
    lastProcessedSeq: 7,
    world: createWorldState(),
    events: [{ type: 'roundStarted', tick: 0, round: 1 }],
  },
  {
    type: 'matchSummary',
    summary: {
      winnerTeamId: 'team-0',
      scores: { 'team-0': 2, 'team-1': 1 },
      ranked: true,
      players: [
        {
          id: 'c1',
          name: 'host',
          teamId: 'team-0',
          damageDealt: 142.5,
          damageTaken: 60,
          kills: 2,
          deaths: 1,
          rating: { before: 100, after: 115 },
        },
        {
          id: 'c2',
          name: 'guest',
          teamId: 'team-1',
          damageDealt: 60,
          damageTaken: 142.5,
          kills: 1,
          deaths: 2,
          rating: null,
        },
      ],
    },
  },
  {
    type: 'mapList',
    maps: [{ id: 'arena', name: 'Arena', width: 16, height: 16, builtin: true }],
  },
  { type: 'mapSaved', id: 'arena' },
  { type: 'mapDocument', document: MAP },
  { type: 'error', code: 'ROOM_FULL', message: 'the room is full' },
  { type: 'error', code: 'INVALID_LOADOUT', message: 'build spends 11 points, budget is 10' },
  { type: 'pong', sentAt: 1_700_000_000_000, serverTime: 1_700_000_000_020 },
];

describe('protocol codec', () => {
  it.each(CLIENT_MESSAGES)('round-trips the client $type message', (message) => {
    expect(clientMessageCodec.decode(clientMessageCodec.encode(message))).toEqual(message);
  });

  it.each(SERVER_MESSAGES)('round-trips the server $type message', (message) => {
    expect(serverMessageCodec.decode(serverMessageCodec.encode(message))).toEqual(message);
  });

  it('rejects malformed or unknown messages', () => {
    expect(clientMessageCodec.decode('{not json')).toBeNull();
    expect(clientMessageCodec.decode(JSON.stringify({ type: 'hack', damage: 50 }))).toBeNull();
    expect(
      clientMessageCodec.decode(JSON.stringify({ type: 'input', seq: -1, input: {} })),
    ).toBeNull();
  });

  it('rejects a joinRoom whose code is not exactly six alphanumeric characters', () => {
    expect(
      clientMessageCodec.decode(JSON.stringify({ type: 'joinRoom', code: 'ab12c' })),
    ).toBeNull();
  });

  it('rejects a saveMap whose ground layer holds a null tile', () => {
    const doc = smallMapDocument(9) as { layers: { ground: (number | null)[][] } };
    doc.layers.ground[0]![0] = null;
    expect(
      clientMessageCodec.decode(JSON.stringify({ type: 'saveMap', document: doc })),
    ).toBeNull();
  });

  it('rejects a createRoom whose settings patch violates the team count bounds', () => {
    expect(
      clientMessageCodec.decode(JSON.stringify({ type: 'createRoom', settings: { teamCount: 1 } })),
    ).toBeNull();
  });

  it('rejects a register whose name is padded with spaces or whose password is too short', () => {
    expect(
      clientMessageCodec.decode(
        JSON.stringify({ type: 'register', name: ' kage', password: 'secret' }),
      ),
    ).toBeNull();
    expect(
      clientMessageCodec.decode(
        JSON.stringify({ type: 'register', name: 'kage', password: 'abc' }),
      ),
    ).toBeNull();
  });

  it('rejects a resume whose token is not the hexadecimal the server hands out', () => {
    expect(
      clientMessageCodec.decode(JSON.stringify({ type: 'resume', token: 'not-a-token' })),
    ).toBeNull();
  });

  it('rejects a matchStarted without any map', () => {
    const started = SERVER_MESSAGES.find((message) => message.type === 'matchStarted');
    expect(serverMessageCodec.decode(JSON.stringify({ ...started, maps: [] }))).toBeNull();
  });

  it('rejects a welcome carrying an empty sessionId', () => {
    expect(
      serverMessageCodec.decode(JSON.stringify({ type: 'welcome', sessionId: '' })),
    ).toBeNull();
  });
});
