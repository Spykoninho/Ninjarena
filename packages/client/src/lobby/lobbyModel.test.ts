import type { MapSummary, RoomSettings, StatRulesDefinition } from '@ninjarena/core';
import type { RoomPlayerView, RoomView } from '@ninjarena/protocol';
import { describe, expect, it } from 'vitest';
import {
  blockerText,
  canStart,
  groupPlayers,
  isHost,
  isLoadoutError,
  roomLink,
  settingsPatch,
  settingsRows,
  statusText,
} from './lobbyModel';

const rules: StatRulesDefinition = {
  defaultPointBudget: 10,
  attributes: {
    vitality: { min: 0, max: 5 },
    strength: { min: 0, max: 5 },
    power: { min: 0, max: 5 },
    speed: { min: 0, max: 5 },
    maxChakra: { min: 0, max: 5 },
    chakraRegen: { min: 0, max: 5 },
    defense: { min: 0, max: 5 },
  },
  coefficients: {
    healthPerVitality: 1,
    physicalDamagePerStrength: 1,
    techniqueDamagePerPower: 1,
    moveSpeedPerSpeed: 1,
    chakraPerPoint: 1,
    chakraRegenPerPoint: 1,
    defensePerPoint: 1,
  },
  techniqueSlots: 3,
};

const settings: RoomSettings = {
  mode: 'team',
  teamCount: 2,
  playersPerTeam: 2,
  buildPoints: 10,
  mapId: 'arena',
  bestOf: 3,
  roundDurationMs: 240_000,
  friendlyFire: false,
};

const maps: MapSummary[] = [
  { id: 'arena', name: 'Arena', width: 32, height: 32, builtin: true },
  { id: 'garden', name: 'Garden', width: 24, height: 24, builtin: false },
];

function player(id: string, team: number | null): RoomPlayerView {
  return { id, name: id, team, ready: false, loadout: null, loadoutValid: false };
}

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'AB7K2P',
    hasPassword: false,
    hostId: 'c1',
    status: 'WAITING',
    settings,
    map: maps[0] ?? null,
    players: [player('c1', 0), player('c2', 1), player('c3', 0)],
    startBlockers: [],
    ...overrides,
  };
}

describe('groupPlayers', () => {
  it('builds one group per team, with the room capacity, in team mode', () => {
    const groups = groupPlayers(room());
    expect(groups).toEqual([
      {
        team: 0,
        label: 'Team 1',
        players: [player('c1', 0), player('c3', 0)],
        capacity: 2,
      },
      { team: 1, label: 'Team 2', players: [player('c2', 1)], capacity: 2 },
    ]);
  });

  it('builds a single uncapped group in free-for-all', () => {
    const ffa = room({
      settings: { ...settings, mode: 'ffa', playersPerTeam: 1 },
      players: [player('c1', null), player('c2', null), player('c3', null)],
    });
    expect(groupPlayers(ffa)).toEqual([
      {
        team: null,
        label: 'Players',
        players: [player('c1', null), player('c2', null), player('c3', null)],
        capacity: null,
      },
    ]);
  });
});

describe('isHost', () => {
  it('is true only for the session that owns the room', () => {
    expect(isHost(room(), 'c1')).toBe(true);
    expect(isHost(room(), 'c2')).toBe(false);
  });
});

describe('canStart', () => {
  it('is false for a player who is not the host', () => {
    expect(canStart(room(), 'c2')).toBe(false);
  });

  it('is true for the host of a waiting room with no blocker', () => {
    expect(canStart(room(), 'c1')).toBe(true);
  });

  it('is false while a blocker stands or the room is not waiting', () => {
    expect(canStart(room({ startBlockers: ['PLAYER_NOT_READY'] }), 'c1')).toBe(false);
    expect(canStart(room({ status: 'IN_GAME' }), 'c1')).toBe(false);
  });
});

describe('blockerText', () => {
  it('spells out every blocker the server can report', () => {
    expect(blockerText('NOT_ENOUGH_PLAYERS')).toBe('at least two players are needed');
    expect(blockerText('PLAYER_NOT_READY')).toBe('everyone must be ready');
    expect(blockerText('INVALID_LOADOUT')).toBe('every loadout must be valid');
    expect(blockerText('EMPTY_TEAM')).toBe('every team needs a player');
    expect(blockerText('MAP_MISSING')).toBe('the selected map is missing');
    expect(blockerText('MAP_INVALID')).toBe('the selected map is not valid for these settings');
  });
});

describe('roomLink', () => {
  it('appends the room code to the current page', () => {
    expect(roomLink('https://ninjarena.example', '/play', 'AB7K2P')).toBe(
      'https://ninjarena.example/play?room=AB7K2P',
    );
  });
});

describe('settingsRows', () => {
  it('lists the maps as select options, marking the built-in ones', () => {
    const rows = settingsRows(settings, maps, rules);
    const map = rows.find((row) => row.key === 'mapId');
    expect(map?.kind).toBe('select');
    expect(map?.value).toBe('arena');
    expect(map?.options).toEqual([
      { value: 'arena', label: 'Arena (built-in)' },
      { value: 'garden', label: 'Garden' },
    ]);
  });

  it('keeps the selected map listed even when the map list has not arrived', () => {
    const rows = settingsRows(settings, [], rules);
    expect(rows.find((row) => row.key === 'mapId')?.options).toEqual([
      { value: 'arena', label: 'arena' },
    ]);
  });

  it('hides playersPerTeam in free-for-all and shows it in team mode', () => {
    const teamRows = settingsRows(settings, maps, rules);
    expect(teamRows.find((row) => row.key === 'playersPerTeam')?.hidden).toBe(false);
    const ffaRows = settingsRows({ ...settings, mode: 'ffa', playersPerTeam: 1 }, maps, rules);
    expect(ffaRows.find((row) => row.key === 'playersPerTeam')?.hidden).toBe(true);
  });

  it('bounds the build points by what the attribute ranges allow', () => {
    const points = settingsRows(settings, maps, rules).find((row) => row.key === 'buildPoints');
    expect(points).toEqual({
      key: 'buildPoints',
      label: 'Build points',
      kind: 'number',
      value: 10,
      min: 0,
      max: 35,
      step: 1,
      hidden: false,
    });
  });

  it('offers the four best-of options and the friendly fire toggle', () => {
    const rows = settingsRows(settings, maps, rules);
    expect(rows.find((row) => row.key === 'bestOf')?.options).toEqual([
      { value: '1', label: 'Best of 1' },
      { value: '3', label: 'Best of 3' },
      { value: '5', label: 'Best of 5' },
      { value: '7', label: 'Best of 7' },
    ]);
    const friendlyFire = rows.find((row) => row.key === 'friendlyFire');
    expect(friendlyFire?.kind).toBe('toggle');
    expect(friendlyFire?.value).toBe(false);
  });
});

describe('statusText', () => {
  it('names the room, its status and how full it is', () => {
    expect(statusText(room())).toBe('Room AB7K2P · WAITING · 3/4 players');
  });

  it('says the match is over once the room reports FINISHED', () => {
    expect(statusText(room({ status: 'FINISHED' }))).toBe('Room AB7K2P · Match over · 3/4 players');
  });
});

describe('settingsPatch', () => {
  it('builds a one-key patch for each kind of control', () => {
    expect(settingsPatch('mode', 'ffa')).toEqual({ mode: 'ffa' });
    expect(settingsPatch('mapId', 'garden')).toEqual({ mapId: 'garden' });
    expect(settingsPatch('teamCount', '3')).toEqual({ teamCount: 3 });
    expect(settingsPatch('roundDurationMs', '90000')).toEqual({ roundDurationMs: 90_000 });
    expect(settingsPatch('bestOf', '5')).toEqual({ bestOf: 5 });
    expect(settingsPatch('friendlyFire', true)).toEqual({ friendlyFire: true });
  });

  it('refuses a value the settings would never accept', () => {
    expect(settingsPatch('teamCount', 'many')).toBeNull();
    expect(settingsPatch('bestOf', '4')).toBeNull();
    expect(settingsPatch('mode', 'duel')).toBeNull();
    expect(settingsPatch('mapId', '')).toBeNull();
  });
});

describe('isLoadoutError', () => {
  it('recognises the messages a rejected loadout produces', () => {
    expect(isLoadoutError('a valid loadout is needed to be ready')).toBe(true);
    expect(isLoadoutError('build spends 12 points, budget is 10')).toBe(true);
    expect(isLoadoutError('"blink" is picked twice')).toBe(true);
    expect(isLoadoutError('"kunai-strike" is not a technique')).toBe(true);
  });

  it('leaves the other lobby errors to the error line alone', () => {
    expect(isLoadoutError('team 1 is full')).toBe(false);
    expect(isLoadoutError('the room already holds 3 players')).toBe(false);
    expect(isLoadoutError('only the host can do that')).toBe(false);
  });
});
