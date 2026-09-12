import type { GameContent } from '@ninjarena/content';
import { DEFAULT_MATCH_TIMING, defaultRoomSettings, toMatchConfig } from '@ninjarena/core';
import type { MatchConfig, RoomSettingsPatch } from '@ninjarena/core';

// Les modes de match viennent des réglages de salle: les tests en dérivent le leur.
export function matchConfigFor(content: GameContent, patch: RoomSettingsPatch = {}): MatchConfig {
  const settings = { ...defaultRoomSettings(content.statRules, 'arena'), ...patch };
  return toMatchConfig(settings, DEFAULT_MATCH_TIMING);
}

export function duelConfig(content: GameContent): MatchConfig {
  return matchConfigFor(content);
}
