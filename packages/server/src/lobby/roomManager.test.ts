import { describe, expect, it } from 'vitest';
import type { RoomSettings } from '@ninjarena/core';
import { defaultRoomSettings, emptyBuild } from '@ninjarena/core';
import { loadContent } from '@ninjarena/content';
import { MapLibrary } from '../maps/mapLibrary';
import { InMemoryMapRepository } from '../persistence/mapRepository';
import { ClientSession } from '../session/clientSession';
import { FakeConnection } from '../testing/fakeConnection';
import { Room } from './room';
import { RoomManager } from './roomManager';

const content = loadContent();
const RULES = content.statRules;
const DEFAULTS = defaultRoomSettings(RULES, 'arena');
const TECHNIQUE_IDS = ['blink', 'chakra-shield', 'lightning-dash'];
// 'AB7K2P' puis 'CD8L3Q' dans l'alphabet des codes de salle.
const DRAWS = [0, 1, 29, 9, 24, 13, 2, 3, 30, 10, 25, 14];

function createManager(maxRooms = 4): RoomManager {
  let draw = 0;
  return new RoomManager({
    maxRooms,
    randomInt: () => DRAWS[draw++ % DRAWS.length] ?? 0,
    createRoom: (code, passwordHash, settings) =>
      new Room({
        code,
        passwordHash,
        settings,
        content,
        maps: new MapLibrary({
          content,
          repository: new InMemoryMapRepository(),
          maxStoredMaps: 4,
        }),
        tickRate: 60,
        snapshotEveryTicks: 1,
        postMatchTicks: 10,
        characterId: 'ninja',
      }),
  });
}

function createSession(id: string): ClientSession {
  return new ClientSession(new FakeConnection(id), 8);
}

function loadout(): unknown {
  return { build: emptyBuild(), basicAttackId: 'kunai-strike', techniqueIds: TECHNIQUE_IDS };
}

async function startedRoom(manager: RoomManager, ids: [string, string]): Promise<Room> {
  const host = createSession(ids[0]);
  const created = manager.create(host, {}, RULES, DEFAULTS);
  if (!created.ok) throw new Error('expected the room to be created');
  const room = created.room;
  await room.refreshMap();
  const guest = createSession(ids[1]);
  manager.join(guest, room.code, undefined);
  for (const session of [host, guest]) {
    room.setLoadout(session, loadout());
    room.setReady(session, true);
  }
  const started = room.start(host);
  if (!started.ok) throw new Error(`expected the match to start: ${started.error.message}`);
  return room;
}

describe('RoomManager', () => {
  it('creates a room with a fresh code and seats its host', () => {
    const manager = createManager();
    const session = createSession('c1');

    const created = manager.create(session, {}, RULES, DEFAULTS);

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.room.code).toBe('AB7K2P');
    expect(created.room.hostId).toBe('c1');
    expect(session.room).toBe(created.room);
    expect(manager.count).toBe(1);
  });

  it('applies the requested settings and password', () => {
    const manager = createManager();
    const session = createSession('c1');

    const created = manager.create(
      session,
      { password: 'shuriken', settings: { bestOf: 5 } },
      RULES,
      DEFAULTS,
    );

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.room.settings.bestOf).toBe(5);
    expect(created.room.view().hasPassword).toBe(true);
    expect(manager.join(createSession('c2'), 'AB7K2P', 'nope')).toEqual({
      ok: false,
      error: { code: 'WRONG_PASSWORD', message: expect.any(String) },
    });
  });

  it('refuses a settings patch it cannot apply', () => {
    const manager = createManager();

    expect(manager.create(createSession('c1'), { settings: { teamCount: 99 } }, RULES, DEFAULTS)) //
      .toEqual({ ok: false, error: { code: 'INVALID_SETTINGS', message: expect.any(String) } });
    expect(manager.count).toBe(0);
  });

  it('refuses a second room to a seated player', () => {
    const manager = createManager();
    const session = createSession('c1');
    manager.create(session, {}, RULES, DEFAULTS);

    expect(manager.create(session, {}, RULES, DEFAULTS)).toEqual({
      ok: false,
      error: { code: 'ALREADY_IN_ROOM', message: expect.any(String) },
    });
  });

  it('refuses a room past the server limit', () => {
    const manager = createManager(1);
    manager.create(createSession('c1'), {}, RULES, DEFAULTS);

    expect(manager.create(createSession('c2'), {}, RULES, DEFAULTS)).toEqual({
      ok: false,
      error: { code: 'TOO_MANY_ROOMS', message: expect.any(String) },
    });
  });

  it('joins a room from a lowercase code', () => {
    const manager = createManager();
    manager.create(createSession('c1'), {}, RULES, DEFAULTS);
    const guest = createSession('c2');

    const joined = manager.join(guest, 'ab7k2p', undefined);

    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.room.code).toBe('AB7K2P');
    expect(joined.room.players).toHaveLength(2);
    expect(manager.get('ab7k2p')).toBe(joined.room);
  });

  it('reports an unknown code and a player already seated', () => {
    const manager = createManager();
    const session = createSession('c1');
    manager.create(session, {}, RULES, DEFAULTS);

    expect(manager.join(createSession('c2'), 'ZZZZZZ', undefined)).toEqual({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND', message: expect.any(String) },
    });
    expect(manager.join(session, 'AB7K2P', undefined)).toEqual({
      ok: false,
      error: { code: 'ALREADY_IN_ROOM', message: expect.any(String) },
    });
  });

  it('forwards the reason a room refuses a join', () => {
    const manager = createManager();
    manager.create(createSession('c1'), {}, RULES, DEFAULTS);
    manager.join(createSession('c2'), 'AB7K2P', undefined);

    expect(manager.join(createSession('c3'), 'AB7K2P', undefined)).toEqual({
      ok: false,
      error: { code: 'ROOM_FULL', message: expect.any(String) },
    });
  });

  it('drops a room once its last player leaves', () => {
    const manager = createManager();
    const host = createSession('c1');
    const guest = createSession('c2');
    manager.create(host, {}, RULES, DEFAULTS);
    manager.join(guest, 'AB7K2P', undefined);

    manager.leave(host);
    expect(manager.get('AB7K2P')).toBeDefined();

    manager.leave(guest);
    expect(manager.get('AB7K2P')).toBeUndefined();
    expect(manager.count).toBe(0);
    expect(guest.room).toBeNull();
  });

  it('advances only the rooms that run a match', async () => {
    const manager = createManager();
    const playing = await startedRoom(manager, ['c1', 'c2']);
    const idleHost = createSession('c3');
    const idle = manager.create(idleHost, {}, RULES, DEFAULTS);
    if (!idle.ok) throw new Error('expected the second room to be created');

    manager.tick();
    manager.tick();

    expect(playing.match?.simulation.world.tick).toBe(2);
    expect(idle.room.match).toBeNull();
    expect(idle.room.status).toBe('WAITING');
  });

  it('creates a distinct code for each room', () => {
    const manager = createManager();
    manager.create(createSession('c1'), {}, RULES, DEFAULTS);
    manager.create(createSession('c2'), {}, RULES, DEFAULTS);

    expect(manager.get('AB7K2P')?.code).toBe('AB7K2P');
    expect(manager.get('CD8L3Q')?.code).toBe('CD8L3Q');
    expect(manager.count).toBe(2);
  });
});

describe('RoomManager settings', () => {
  it('leaves the default settings untouched when a patch is applied', () => {
    const manager = createManager();
    const defaults: RoomSettings = { ...DEFAULTS };

    manager.create(createSession('c1'), { settings: { bestOf: 7 } }, RULES, defaults);

    expect(defaults).toEqual(DEFAULTS);
  });
});
