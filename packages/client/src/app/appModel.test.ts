import type { MapDocument, MapSummary, MatchConfig, RoomSettings } from '@ninjarena/core';
import type { RoomStatus, RoomView, ServerMessage } from '@ninjarena/protocol';
import { describe, expect, it } from 'vitest';
import { loadClientConfig } from '../config/clientConfig';
import { initialAppState, reduceServerMessage, screenFor } from './appModel';
import type { AppState } from './appModel';

const settings: RoomSettings = {
  mode: 'team',
  teamCount: 2,
  playersPerTeam: 1,
  buildPoints: 10,
  mapId: 'arena',
  bestOf: 3,
  roundDurationMs: 240_000,
  friendlyFire: false,
  ranked: false,
};

const matchConfig: MatchConfig = {
  id: 'team-2x1',
  mode: 'team',
  teamCount: 2,
  playersPerTeam: 1,
  roundsToWin: 2,
  roundDurationMs: 240_000,
  countdownMs: 3000,
  roundEndDelayMs: 3000,
  friendlyFire: false,
  buildPoints: 10,
};

const mapDocument: MapDocument = {
  version: 1,
  id: 'arena',
  name: 'Arena',
  tileset: 'default',
  width: 8,
  height: 8,
  layers: {
    ground: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)),
    objects: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
  },
  colliders: [],
  spawns: [{ x: 1, y: 1, team: 0 }],
};

function room(status: RoomStatus): RoomView {
  return {
    code: 'AB7K2P',
    hasPassword: false,
    hostId: 'session-1',
    status,
    settings,
    map: null,
    players: [],
    startBlockers: [],
  };
}

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...initialAppState(loadClientConfig('')), ...overrides };
}

describe('initialAppState', () => {
  it('starts on the home screen with nothing known yet', () => {
    const initial = initialAppState(loadClientConfig(''));
    expect(initial.screen).toBe('home');
    expect(initial.sessionId).toBeNull();
    expect(initial.room).toBeNull();
    expect(initial.maps).toEqual([]);
    expect(initial.account).toBeNull();
    expect(initial.leaderboard).toEqual([]);
  });

  it('starts on the editor screen when the query asks for it', () => {
    expect(initialAppState(loadClientConfig('?editor')).screen).toBe('editor');
  });
});

describe('reduceServerMessage', () => {
  it('keeps the session id given by welcome', () => {
    const next = reduceServerMessage(state(), { type: 'welcome', sessionId: 'session-1' });
    expect(next.sessionId).toBe('session-1');
  });

  it('moves from home to the lobby on the first room state', () => {
    const next = reduceServerMessage(state(), { type: 'roomState', room: room('WAITING') });
    expect(next.screen).toBe('lobby');
    expect(next.room?.code).toBe('AB7K2P');
  });

  it('leaves the editor for the lobby only when the room was asked for', () => {
    const message: ServerMessage = { type: 'roomState', room: room('WAITING') };
    expect(reduceServerMessage(state({ screen: 'editor' }), message, 'lobby').screen).toBe('lobby');
    const stayed = reduceServerMessage(state({ screen: 'editor' }), message, 'stay');
    expect(stayed.screen).toBe('editor');
    expect(stayed.room?.code).toBe('AB7K2P');
  });

  it('returns from the game to the lobby only once the room waits again', () => {
    const playing = state({ screen: 'game', room: room('IN_GAME') });
    expect(reduceServerMessage(playing, { type: 'roomState', room: room('IN_GAME') }).screen).toBe(
      'game',
    );
    expect(reduceServerMessage(playing, { type: 'roomState', room: room('WAITING') }).screen).toBe(
      'lobby',
    );
  });

  it('goes home when the room is left', () => {
    const next = reduceServerMessage(state({ screen: 'lobby', room: room('WAITING') }), {
      type: 'roomLeft',
    });
    expect(next.screen).toBe('home');
    expect(next.room).toBeNull();
  });

  it('switches to the game when the match starts', () => {
    const next = reduceServerMessage(state({ screen: 'lobby', room: room('STARTING') }), {
      type: 'matchStarted',
      playerId: 'session-1',
      tickRate: 30,
      snapshotRate: 15,
      matchConfig,
      map: mapDocument,
    });
    expect(next.screen).toBe('game');
  });

  it('keeps the map list without leaving the current screen', () => {
    const maps: MapSummary[] = [{ id: 'arena', name: 'Arena', width: 8, height: 8, builtin: true }];
    const next = reduceServerMessage(
      state({ screen: 'editor' }),
      { type: 'mapList', maps },
      'stay',
    );
    expect(next.maps).toEqual(maps);
    expect(next.screen).toBe('editor');
  });

  it('keeps the account the server reports and forgets it on logout', () => {
    const account = { name: 'kage', rating: 115, wins: 1, losses: 0 };
    const loggedIn = reduceServerMessage(state(), { type: 'accountState', account });
    expect(loggedIn.account).toEqual(account);
    expect(loggedIn.screen).toBe('home');
    expect(
      reduceServerMessage(loggedIn, { type: 'accountState', account: null }).account,
    ).toBeNull();
  });

  it('keeps the leaderboard without leaving the current screen', () => {
    const entries = [{ name: 'kage', rating: 115, wins: 1, losses: 0 }];
    const next = reduceServerMessage(state({ screen: 'lobby', room: room('WAITING') }), {
      type: 'leaderboard',
      entries,
    });
    expect(next.leaderboard).toEqual(entries);
    expect(next.screen).toBe('lobby');
  });

  it('shows a server error in the status without leaving the current screen', () => {
    const next = reduceServerMessage(state({ screen: 'home' }), {
      type: 'error',
      code: 'ROOM_NOT_FOUND',
      message: 'no room "AB7K2P"',
    });
    expect(next.status).toBe('no room "AB7K2P"');
    expect(next.screen).toBe('home');
  });

  it('leaves the state untouched for a message it does not follow', () => {
    const current = state({ screen: 'editor' });
    expect(reduceServerMessage(current, { type: 'mapSaved', id: 'draft' })).toBe(current);
  });
});

describe('screenFor', () => {
  it('falls back to home when a room screen has no room', () => {
    expect(screenFor(state({ screen: 'lobby' }))).toBe('home');
    expect(screenFor(state({ screen: 'game' }))).toBe('home');
  });

  it('keeps the screen the state holds otherwise', () => {
    expect(screenFor(state({ screen: 'lobby', room: room('WAITING') }))).toBe('lobby');
    expect(screenFor(state({ screen: 'editor' }))).toBe('editor');
  });
});
