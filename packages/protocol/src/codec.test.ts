import { describe, expect, it } from 'vitest';
import { MatchConfigSchema, createWorldState, emptyBuild, neutralInput } from '@ninjarena/core';
import type { Build } from '@ninjarena/core';
import { clientMessageCodec, serverMessageCodec } from './codec';
import type { ClientMessage, ServerMessage } from './messages';
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

const BUILD: Build = { ...emptyBuild(), vitality: 2, power: 3, speed: 1 };

const TECHNIQUE_IDS = ['blink', 'chakra-shield', 'lightning-dash'];

const CLIENT_MESSAGES: ClientMessage[] = [
  {
    type: 'join',
    protocolVersion: PROTOCOL_VERSION,
    name: 'ninja-a1b2',
    build: BUILD,
    techniqueIds: TECHNIQUE_IDS,
  },
  { type: 'ready' },
  { type: 'input', seq: 12, input: { ...neutralInput(), move: { x: 1, y: 0 }, abilityHeld: 2 } },
  { type: 'ping', sentAt: 1_700_000_000_000 },
];

const SERVER_MESSAGES: ServerMessage[] = [
  {
    type: 'welcome',
    playerId: 'c1',
    tickRate: 60,
    snapshotRate: 30,
    mapId: 'arena',
    matchConfig: DUEL,
  },
  {
    type: 'roomState',
    players: [
      { id: 'c1', name: 'one', teamId: 'team-0', ready: true, techniqueIds: TECHNIQUE_IDS },
    ],
  },
  {
    type: 'snapshot',
    tick: 0,
    lastProcessedSeq: 7,
    world: createWorldState(),
    events: [{ type: 'roundStarted', tick: 0, round: 1 }],
  },
  { type: 'error', code: 'ROOM_FULL', message: 'the room is full' },
  { type: 'error', code: 'INVALID_LOADOUT', message: 'build spends 11 points, budget is 10' },
  { type: 'pong', sentAt: 1_700_000_000_000, serverTime: 1_700_000_000_020 },
];

const decodeJoin = (overrides: Record<string, unknown>): ClientMessage | null =>
  clientMessageCodec.decode(
    JSON.stringify({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name: 'ninja-a1b2',
      build: BUILD,
      techniqueIds: TECHNIQUE_IDS,
      ...overrides,
    }),
  );

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

  it('rejects a join whose build is not seven whole point counts', () => {
    const withoutDefense = {
      vitality: 2,
      strength: 0,
      power: 3,
      speed: 1,
      maxChakra: 0,
      chakraRegen: 0,
    };
    expect(decodeJoin({ build: withoutDefense })).toBeNull();
    expect(decodeJoin({ build: { ...BUILD, vitality: 1.5 } })).toBeNull();
    expect(decodeJoin({ build: { ...BUILD, luck: 1 } })).toBeNull();
    expect(decodeJoin({ build: { ...BUILD, vitality: -1 } })).toBeNull();
  });

  it('rejects a join carrying more techniques than any loadout holds', () => {
    const nine = Array.from({ length: 9 }, (_, index) => `technique-${index}`);
    expect(decodeJoin({ techniqueIds: nine })).toBeNull();
    expect(decodeJoin({ techniqueIds: [''] })).toBeNull();
  });
});
