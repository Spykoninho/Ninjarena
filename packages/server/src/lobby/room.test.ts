import { describe, expect, it } from 'vitest';
import { GameSimulation } from '@ninjarena/core';
import { loadContent, loadMap } from '@ninjarena/content';
import { serverMessageCodec } from '@ninjarena/protocol';
import { ClientSession } from '../session/clientSession';
import { FakeConnection } from '../testing/fakeConnection';
import { Room } from './room';

const createRoom = (autoStartWhenFull = false) => {
  const content = loadContent();
  const matchConfig = content.matchModes.get('duel');
  const simulation = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig,
  });
  return new Room({
    id: 'default',
    matchConfig,
    simulation,
    characterId: 'ninja',
    autoStartWhenFull,
  });
};

const createSession = (id: string) => {
  const connection = new FakeConnection(id);
  return { connection, session: new ClientSession(connection, 8) };
};

describe('Room', () => {
  it('refuses a join once the match capacity is reached', () => {
    const room = createRoom();
    expect(room.join(createSession('c1').session, 'one')).toEqual({ ok: true });
    expect(room.join(createSession('c2').session, 'two')).toEqual({ ok: true });
    expect(room.isFull).toBe(true);
    expect(room.join(createSession('c3').session, 'three')).toEqual({
      ok: false,
      error: 'ROOM_FULL',
    });
    expect(room.sessions).toHaveLength(2);
    expect(room.simulation.world.players['c3']).toBeUndefined();
  });

  it('starts the match once every present player is ready', () => {
    const room = createRoom();
    const first = createSession('c1');
    const second = createSession('c2');
    room.join(first.session, 'one');
    room.join(second.session, 'two');
    room.setReady(first.session, true);
    expect(room.simulation.world.match.phase).toBe('WAITING');
    room.setReady(second.session, true);
    expect(room.simulation.world.match.phase).not.toBe('WAITING');
    expect(room.simulation.world.match.round).toBe(1);
  });

  it('removes a leaving player from the simulation', () => {
    const room = createRoom();
    const { session } = createSession('c1');
    room.join(session, 'one');
    expect(room.simulation.world.players['c1']).toBeDefined();
    room.leave(session);
    expect(room.simulation.world.players['c1']).toBeUndefined();
    expect(room.sessions).toHaveLength(0);
  });

  it('broadcasts the room state to every session on join', () => {
    const room = createRoom();
    const first = createSession('c1');
    room.join(first.session, 'one');
    room.join(createSession('c2').session, 'two');
    const last = first.connection.sent.map((raw) => serverMessageCodec.decode(raw)).at(-1);
    expect(last).toMatchObject({
      type: 'roomState',
      players: [
        { id: 'c1', name: 'one', teamId: 'team-0', ready: false },
        { id: 'c2', name: 'two', teamId: 'team-1', ready: false },
      ],
    });
  });
});
