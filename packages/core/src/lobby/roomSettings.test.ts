import { describe, expect, it } from 'vitest';
import { TEST_RULES } from '../testing/fixtures';
import {
  DEFAULT_MATCH_TIMING,
  MAX_ROOM_PLAYERS,
  applySettingsPatch,
  buildPointRange,
  defaultRoomSettings,
  roomMaxPlayers,
  toMatchConfig,
} from './roomSettings';

describe('defaultRoomSettings', () => {
  it('derives defaults from the rules and the default map', () => {
    expect(defaultRoomSettings(TEST_RULES, 'arena')).toEqual({
      mode: 'team',
      teamCount: 2,
      playersPerTeam: 1,
      buildPoints: TEST_RULES.defaultPointBudget,
      mapId: 'arena',
      bestOf: 3,
      roundDurationMs: 240_000,
      friendlyFire: false,
      ranked: false,
    });
  });
});

describe('applySettingsPatch', () => {
  const defaults = defaultRoomSettings(TEST_RULES, 'arena');

  it('forces one player per team when switching to ffa', () => {
    const result = applySettingsPatch(defaults, { mode: 'ffa', playersPerTeam: 3 }, TEST_RULES);
    expect(result).toEqual({
      ok: true,
      settings: { ...defaults, mode: 'ffa', playersPerTeam: 1 },
    });
  });

  it('rejects a patch with an unknown field, an out-of-range value or too many players', () => {
    expect(applySettingsPatch(defaults, { mapId: '' }, TEST_RULES).ok).toBe(false);
    const mapIdResult = applySettingsPatch(defaults, { mapId: '' }, TEST_RULES);
    expect(mapIdResult.ok).toBe(false);
    if (!mapIdResult.ok) expect(mapIdResult.reason).toContain('mapId');

    expect(applySettingsPatch(defaults, { teamCount: 9 }, TEST_RULES).ok).toBe(false);

    const tooManyPlayers = applySettingsPatch(
      defaults,
      { teamCount: 8, playersPerTeam: 4 },
      TEST_RULES,
    );
    expect(tooManyPlayers).toEqual({
      ok: false,
      reason: expect.stringContaining(String(MAX_ROOM_PLAYERS)),
    });

    expect(applySettingsPatch(defaults, { extra: 1 }, TEST_RULES).ok).toBe(false);
    expect(applySettingsPatch(defaults, null, TEST_RULES).ok).toBe(false);
    expect(applySettingsPatch(defaults, 'nope', TEST_RULES).ok).toBe(false);
  });

  it('bounds build points by the attribute ranges', () => {
    const range = buildPointRange(TEST_RULES);
    expect(range).toEqual({ min: 0, max: 35 });
    expect(applySettingsPatch(defaults, { buildPoints: 36 }, TEST_RULES).ok).toBe(false);
    expect(applySettingsPatch(defaults, { buildPoints: 35 }, TEST_RULES).ok).toBe(true);
    expect(applySettingsPatch(defaults, { buildPoints: -1 }, TEST_RULES).ok).toBe(false);
  });
});

describe('roomMaxPlayers', () => {
  it('multiplies the team count by the players per team', () => {
    expect(roomMaxPlayers({ ...defaultRoomSettings(TEST_RULES, 'arena'), teamCount: 4 })).toBe(4);
  });
});

describe('toMatchConfig', () => {
  it('maps best-of to rounds to win and keeps timing from the caller', () => {
    const defaults = defaultRoomSettings(TEST_RULES, 'arena');
    const config = toMatchConfig({ ...defaults, bestOf: 5 }, DEFAULT_MATCH_TIMING);
    expect(config.roundsToWin).toBe(3);
    expect(config.countdownMs).toBe(3000);
    expect(config.id).toBe('team-2x1');
    expect(config.buildPoints).toBe(10);
  });
});
