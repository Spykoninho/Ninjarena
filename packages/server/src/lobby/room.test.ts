import { describe, expect, it } from 'vitest';
import { GameSimulation, emptyBuild } from '@ninjarena/core';
import type { Build } from '@ninjarena/core';
import { loadContent, loadMap } from '@ninjarena/content';
import { serverMessageCodec } from '@ninjarena/protocol';
import { ClientSession } from '../session/clientSession';
import { FakeConnection } from '../testing/fakeConnection';
import type { JoinResult } from './room';
import { Room } from './room';

const TECHNIQUE_IDS = ['blink', 'chakra-shield', 'lightning-dash'];

const createRoom = (autoStartWhenFull = false) => {
  const content = loadContent();
  const matchConfig = content.matchModes.get('duel');
  const simulation = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig,
    rules: content.statRules,
  });
  return new Room({
    id: 'default',
    matchConfig,
    simulation,
    characterId: 'ninja',
    autoStartWhenFull,
    rules: content.statRules,
    abilities: content.abilities,
    characters: content.characters,
  });
};

const createSession = (id: string) => {
  const connection = new FakeConnection(id);
  return { connection, session: new ClientSession(connection, 8) };
};

// La salle sépare l'entrée de sa diffusion: les tests rejouent l'enchaînement du serveur.
const joinAndAnnounce = (
  room: Room,
  session: ClientSession,
  name: string,
  build: Build = emptyBuild(),
  techniqueIds: readonly string[] = TECHNIQUE_IDS,
): JoinResult => {
  const result = room.join(session, { name, build, techniqueIds });
  if (result.ok) room.announce();
  return result;
};

describe('Room', () => {
  it('refuses a join once the match capacity is reached', () => {
    const room = createRoom();
    expect(joinAndAnnounce(room, createSession('c1').session, 'one')).toEqual({ ok: true });
    expect(joinAndAnnounce(room, createSession('c2').session, 'two')).toEqual({ ok: true });
    expect(room.isFull).toBe(true);
    expect(joinAndAnnounce(room, createSession('c3').session, 'three')).toEqual({
      ok: false,
      error: { code: 'ROOM_FULL', message: 'the room is full' },
    });
    expect(room.sessions).toHaveLength(2);
    expect(room.simulation.world.players['c3']).toBeUndefined();
  });

  it('accepts a build spending the whole budget and derives the player maxima', () => {
    const room = createRoom();
    const { session } = createSession('c1');
    const build: Build = {
      ...emptyBuild(),
      vitality: 2,
      strength: 2,
      power: 2,
      speed: 2,
      defense: 2,
    };
    expect(joinAndAnnounce(room, session, 'one', build)).toEqual({ ok: true });
    const player = room.simulation.world.players['c1'];
    expect(player?.build).toEqual(build);
    expect(player?.stats.maxHealth).toBe(124);
    expect(player?.health).toBe(124);
    expect(player?.abilities.map((slot) => slot.abilityId)).toEqual([
      'kunai-strike',
      'shadow-step',
      ...TECHNIQUE_IDS,
    ]);
    expect(session.techniqueIds).toEqual(TECHNIQUE_IDS);
  });

  it('refuses a build that overspends the budget and adds no player', () => {
    const room = createRoom();
    const { session } = createSession('c1');
    const build: Build = { ...emptyBuild(), vitality: 5, strength: 5, power: 1 };
    expect(room.join(session, { name: 'one', build, techniqueIds: TECHNIQUE_IDS })).toEqual({
      ok: false,
      error: { code: 'INVALID_LOADOUT', message: 'build spends 11 points, budget is 10' },
    });
    expect(room.sessions).toHaveLength(0);
    expect(room.simulation.world.players['c1']).toBeUndefined();
    expect(session.playerId).toBeNull();
  });

  it('refuses a loadout that leaves a technique slot empty', () => {
    const room = createRoom();
    const { session } = createSession('c1');
    expect(
      room.join(session, { name: 'one', build: emptyBuild(), techniqueIds: ['blink', 'seal'] }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_LOADOUT', message: 'loadout must hold exactly 3 techniques' },
    });
    expect(room.sessions).toHaveLength(0);
  });

  it('refuses a loadout naming an ability that is not a technique', () => {
    const room = createRoom();
    const result = room.join(createSession('c1').session, {
      name: 'one',
      build: emptyBuild(),
      techniqueIds: ['blink', 'chakra-shield', 'shadow-step'],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_LOADOUT', message: '"shadow-step" is not a technique' },
    });
  });

  it('starts the match once every present player is ready', () => {
    const room = createRoom();
    const first = createSession('c1');
    const second = createSession('c2');
    joinAndAnnounce(room, first.session, 'one');
    joinAndAnnounce(room, second.session, 'two');
    room.setReady(first.session, true);
    expect(room.simulation.world.match.phase).toBe('WAITING');
    room.setReady(second.session, true);
    expect(room.simulation.world.match.phase).not.toBe('WAITING');
    expect(room.simulation.world.match.round).toBe(1);
  });

  it('ignores a repeated join from the same session', () => {
    const room = createRoom();
    const { session } = createSession('c1');
    expect(joinAndAnnounce(room, session, 'one')).toEqual({ ok: true });
    expect(joinAndAnnounce(room, session, 'one-again')).toEqual({ ok: true });
    expect(room.sessions).toHaveLength(1);
    expect(room.roomStateMessage()).toMatchObject({
      type: 'roomState',
      players: [{ id: 'c1', name: 'one', techniqueIds: TECHNIQUE_IDS }],
    });
  });

  it('starts a full room on the last announce when auto-start is on', () => {
    const room = createRoom(true);
    joinAndAnnounce(room, createSession('c1').session, 'one');
    expect(room.simulation.world.match.phase).toBe('WAITING');
    joinAndAnnounce(room, createSession('c2').session, 'two');
    expect(room.isFull).toBe(true);
    expect(room.simulation.world.match.phase).not.toBe('WAITING');
    expect(room.simulation.world.match.round).toBe(1);
  });

  it('restarts a finished match at round one with fresh scores', () => {
    const room = createRoom();
    const first = createSession('c1');
    const second = createSession('c2');
    joinAndAnnounce(room, first.session, 'one');
    joinAndAnnounce(room, second.session, 'two');
    const match = room.simulation.world.match;
    match.phase = 'MATCH_END';
    match.round = 2;
    match.scores = { 'team-0': 2, 'team-1': 1 };
    match.winner = 'team-0';
    room.tryStart();
    expect(match.phase).not.toBe('MATCH_END');
    expect(match.round).toBe(1);
    expect(match.scores).toEqual({ 'team-0': 0, 'team-1': 0 });
    expect(match.winner).toBeNull();
  });

  it('keeps a finished match in MATCH_END while a single player remains', () => {
    const room = createRoom();
    joinAndAnnounce(room, createSession('c1').session, 'one');
    const match = room.simulation.world.match;
    match.phase = 'MATCH_END';
    match.winner = 'team-0';
    room.tryStart();
    expect(match.phase).toBe('MATCH_END');
    expect(match.winner).toBe('team-0');
  });

  it('restarts a finished match when a replacement player is ready', () => {
    const room = createRoom();
    const first = createSession('c1');
    const second = createSession('c2');
    joinAndAnnounce(room, first.session, 'one');
    joinAndAnnounce(room, second.session, 'two');
    room.setReady(first.session, true);
    room.setReady(second.session, true);
    const match = room.simulation.world.match;
    match.phase = 'MATCH_END';
    match.round = 2;
    match.scores = { 'team-0': 2, 'team-1': 1 };
    match.winner = 'team-0';
    // Le perdant quitte l'écran de résultat avant que le minuteur de relance ne tombe.
    room.leave(second.session);
    room.tryStart();
    expect(match.phase).toBe('MATCH_END');
    const third = createSession('c3');
    joinAndAnnounce(room, third.session, 'three');
    expect(match.phase).toBe('MATCH_END');
    room.setReady(third.session, true);
    expect(match.phase).not.toBe('MATCH_END');
    expect(match.round).toBe(1);
    expect(match.scores).toEqual({ 'team-0': 0, 'team-1': 0 });
    expect(match.winner).toBeNull();
  });

  it('removes a leaving player from the simulation', () => {
    const room = createRoom();
    const { session } = createSession('c1');
    joinAndAnnounce(room, session, 'one');
    expect(room.simulation.world.players['c1']).toBeDefined();
    room.leave(session);
    expect(room.simulation.world.players['c1']).toBeUndefined();
    expect(room.sessions).toHaveLength(0);
  });

  it('stays silent on join and broadcasts the room state on announce', () => {
    const room = createRoom();
    const first = createSession('c1');
    joinAndAnnounce(room, first.session, 'one');
    const second = createSession('c2');
    expect(
      room.join(second.session, { name: 'two', build: emptyBuild(), techniqueIds: TECHNIQUE_IDS }),
    ).toEqual({
      ok: true,
    });
    expect(first.connection.sent).toHaveLength(1);
    room.announce();
    const last = first.connection.sent.map((raw) => serverMessageCodec.decode(raw)).at(-1);
    expect(last).toMatchObject({
      type: 'roomState',
      players: [
        { id: 'c1', name: 'one', teamId: 'team-0', ready: false, techniqueIds: TECHNIQUE_IDS },
        { id: 'c2', name: 'two', teamId: 'team-1', ready: false, techniqueIds: TECHNIQUE_IDS },
      ],
    });
  });
});
