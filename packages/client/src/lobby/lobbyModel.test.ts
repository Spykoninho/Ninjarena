import type { MapSummary, RoomSettings, StatRulesDefinition } from '@ninjarena/core';
import type { RoomPlayerView, RoomView } from '@ninjarena/protocol';
import { describe, expect, it } from 'vitest';
import {
  blockerText,
  canStart,
  emptySeats,
  groupPlayers,
  isHost,
  isLoadoutError,
  isRoomCode,
  playerStatus,
  rankedStakes,
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
  ranked: false,
  practice: false,
  tournament: false,
  tournamentSize: 4,
};

const maps: MapSummary[] = [
  { id: 'arena', name: 'Arena', width: 32, height: 32, builtin: true },
  { id: 'garden', name: 'Garden', width: 24, height: 24, builtin: false },
];

function player(id: string, team: number | null, rating: number | null = null): RoomPlayerView {
  return { id, name: id, team, ready: false, loadout: null, loadoutValid: false, rating };
}

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'AB7K2P',
    hasPassword: false,
    locked: false,
    hostId: 'c1',
    status: 'WAITING',
    settings,
    map: maps[0] ?? null,
    players: [player('c1', 0), player('c2', 1), player('c3', 0)],
    startBlockers: [],
    tournament: null,
    ...overrides,
  };
}

describe('groupPlayers', () => {
  it('builds one group per team, with the room capacity, in team mode', () => {
    const groups = groupPlayers(room());
    expect(groups).toEqual([
      {
        team: 0,
        label: 'Équipe 1',
        players: [player('c1', 0), player('c3', 0)],
        capacity: 2,
      },
      { team: 1, label: 'Équipe 2', players: [player('c2', 1)], capacity: 2 },
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
        label: 'Joueurs',
        players: [player('c1', null), player('c2', null), player('c3', null)],
        capacity: null,
      },
    ]);
  });
});

describe('emptySeats', () => {
  it('counts the seats left in a capped team and none in free-for-all', () => {
    const [first, second] = groupPlayers(room({ players: [player('a', 0)] }));
    expect(first === undefined ? -1 : emptySeats(first)).toBe(1);
    expect(second === undefined ? -1 : emptySeats(second)).toBe(2);
    const ffa = groupPlayers(room({ settings: { ...settings, mode: 'ffa' } }));
    expect(emptySeats(ffa[0] ?? { team: null, label: '', players: [], capacity: null })).toBe(0);
  });
});

describe('playerStatus', () => {
  it('reports an invalid loadout before readiness', () => {
    expect(playerStatus(player('a', 0))).toBe('invalid');
    expect(playerStatus({ ...player('a', 0), loadoutValid: true })).toBe('not-ready');
    expect(playerStatus({ ...player('a', 0), loadoutValid: true, ready: true })).toBe('ready');
  });
});

describe('isRoomCode', () => {
  it('accepts exactly six letters or digits', () => {
    expect(isRoomCode('AB12CD')).toBe(true);
  });

  it('rejects a code of the wrong length or with other characters', () => {
    expect(isRoomCode('AB12C')).toBe(false);
    expect(isRoomCode('AB12CD3')).toBe(false);
    expect(isRoomCode('AB-2CD')).toBe(false);
    expect(isRoomCode('')).toBe(false);
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
    expect(blockerText('NOT_ENOUGH_PLAYERS')).toBe('il faut au moins deux joueurs');
    expect(blockerText('PLAYER_NOT_READY')).toBe('tout le monde doit être prêt');
    expect(blockerText('INVALID_LOADOUT')).toBe('chaque équipement doit être valide');
    expect(blockerText('EMPTY_TEAM')).toBe('chaque équipe a besoin d’un joueur');
    expect(blockerText('MAP_MISSING')).toBe('la carte choisie est introuvable');
    expect(blockerText('MAP_INVALID')).toBe('aucune carte ne convient à ces réglages');
    expect(blockerText('RANKED_NEEDS_ACCOUNT')).toBe(
      'une partie classée demande un compte à chaque joueur',
    );
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
      { value: 'random', label: 'Aléatoire (une carte différente à chaque manche)' },
      { value: 'arena', label: 'Arena (intégrée)' },
      { value: 'garden', label: 'Garden' },
    ]);
  });

  it('keeps the selected map listed even when the map list has not arrived', () => {
    const rows = settingsRows(settings, [], rules);
    expect(rows.find((row) => row.key === 'mapId')?.options).toEqual([
      { value: 'random', label: 'Aléatoire (une carte différente à chaque manche)' },
      { value: 'arena', label: 'arena (introuvable)' },
    ]);
  });

  it('never marks the random map as missing', () => {
    const rows = settingsRows({ ...settings, mapId: 'random' }, [], rules);
    expect(rows.find((row) => row.key === 'mapId')?.options).toEqual([
      { value: 'random', label: 'Aléatoire (une carte différente à chaque manche)' },
    ]);
  });

  it('appends the selected map to the real list when it is missing from it', () => {
    const rows = settingsRows({ ...settings, mapId: 'dojo' }, maps, rules);
    expect(rows.find((row) => row.key === 'mapId')?.options).toEqual([
      { value: 'random', label: 'Aléatoire (une carte différente à chaque manche)' },
      { value: 'arena', label: 'Arena (intégrée)' },
      { value: 'garden', label: 'Garden' },
      { value: 'dojo', label: 'dojo (introuvable)' },
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
      label: 'Points de répartition',
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
      { value: '1', label: 'Au meilleur des 1' },
      { value: '3', label: 'Au meilleur des 3' },
      { value: '5', label: 'Au meilleur des 5' },
      { value: '7', label: 'Au meilleur des 7' },
    ]);
    const friendlyFire = rows.find((row) => row.key === 'friendlyFire');
    expect(friendlyFire?.kind).toBe('toggle');
    expect(friendlyFire?.value).toBe(false);
  });

  it('folds the format rows behind the tournament toggle and offers 4 or 8 seats', () => {
    const rows = settingsRows({ ...settings, tournament: true }, maps, rules);
    const hidden = rows.filter((row) => row.hidden).map((row) => row.key);
    expect(hidden).toEqual(['mode', 'teamCount', 'playersPerTeam', 'ranked', 'practice']);
    expect(rows.find((row) => row.key === 'tournamentSize')?.options).toEqual([
      { value: '4', label: '4 joueurs' },
      { value: '8', label: '8 joueurs' },
    ]);
    expect(
      settingsRows(settings, maps, rules).find((row) => row.key === 'tournamentSize')?.hidden,
    ).toBe(true);
    expect(settingsPatch('tournament', true)).toEqual({ tournament: true });
    expect(settingsPatch('tournamentSize', '8')).toEqual({ tournamentSize: 8 });
    expect(settingsPatch('tournamentSize', '6')).toBeNull();
  });

  it('offers the ranked toggle', () => {
    const rows = settingsRows({ ...settings, ranked: true }, maps, rules);
    expect(rows.find((row) => row.key === 'ranked')).toMatchObject({
      kind: 'toggle',
      value: true,
      hidden: false,
    });
  });
});

describe('rankedStakes', () => {
  it('rates each player against the average of the other teams', () => {
    const rows = rankedStakes(
      room({
        players: [player('c1', 0, 100), player('c2', 1, 100), player('c3', 1, 300)],
      }),
    );
    expect(rows).toEqual([
      { id: 'c1', name: 'c1', rating: 100, stakes: { win: 23, loss: -7 } },
      { id: 'c2', name: 'c2', rating: 100, stakes: { win: 15, loss: -15 } },
      { id: 'c3', name: 'c3', rating: 300, stakes: { win: 3, loss: -27 } },
    ]);
  });

  it('treats everyone else as an opponent in free-for-all', () => {
    const rows = rankedStakes(
      room({
        settings: { ...settings, mode: 'ffa', playersPerTeam: 1 },
        players: [player('c1', null, 100), player('c2', null, 200), player('c3', null, 300)],
      }),
    );
    expect(rows[0]?.stakes).toEqual({ win: 25, loss: -5 });
  });

  it('has no stake for a guest, and none while no rated opponent is seated', () => {
    const rows = rankedStakes(room({ players: [player('c1', 0, 100), player('c2', 1)] }));
    expect(rows).toEqual([
      { id: 'c1', name: 'c1', rating: 100, stakes: null },
      { id: 'c2', name: 'c2', rating: null, stakes: null },
    ]);
  });
});

describe('statusText', () => {
  it('names the status and how full the room is', () => {
    expect(statusText(room())).toBe('En attente · 3/4 joueurs');
  });

  it('says a tournament room is one', () => {
    const tournament = {
      ...settings,
      tournament: true,
      mode: 'ffa' as const,
      teamCount: 4,
      playersPerTeam: 1,
    };
    expect(statusText(room({ settings: tournament }))).toBe('Tournoi · En attente · 3/4 joueurs');
  });

  it('says the match is over once the room reports FINISHED', () => {
    expect(statusText(room({ status: 'FINISHED' }))).toBe('Partie terminée · 3/4 joueurs');
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
    expect(settingsPatch('ranked', true)).toEqual({ ranked: true });
    expect(settingsPatch('practice', true)).toEqual({ practice: true });
  });

  it('refuses a value the settings would never accept', () => {
    expect(settingsPatch('teamCount', 'many')).toBeNull();
    expect(settingsPatch('bestOf', '4')).toBeNull();
    expect(settingsPatch('mode', 'duel')).toBeNull();
    expect(settingsPatch('mapId', '')).toBeNull();
    expect(settingsPatch('ranked', 'yes')).toBeNull();
  });
});

describe('isLoadoutError', () => {
  it('recognises the messages a rejected loadout produces', () => {
    expect(isLoadoutError('Équipement refusé par le serveur')).toBe(true);
    expect(isLoadoutError('un équipement valide est nécessaire pour être prêt')).toBe(true);
  });

  it('leaves the other lobby errors to the error line alone', () => {
    expect(isLoadoutError('Cette équipe est pleine')).toBe(false);
    expect(isLoadoutError('La salle est pleine')).toBe(false);
    expect(isLoadoutError('only the host can do that')).toBe(false);
  });
});
