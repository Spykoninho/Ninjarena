import type { MapDocument, MapIssue, RoomSettings } from '@ninjarena/core';
import type { StartBlocker } from '@ninjarena/protocol';
import type { RoomPlayer } from './roomPlayer';

const MIN_PLAYERS_TO_START = 2;

export interface StartBlockerInput {
  players: readonly RoomPlayer[];
  settings: RoomSettings;
  map: MapDocument | null;
  mapIssues: MapIssue[];
}

export function computeStartBlockers(input: StartBlockerInput): StartBlocker[] {
  // Une salle presque vide n'a rien d'autre à corriger: le seul verrou est le nombre de joueurs.
  if (input.players.length < MIN_PLAYERS_TO_START) return ['NOT_ENOUGH_PLAYERS'];

  const blockers: StartBlocker[] = [];
  if (input.players.some((player) => !player.ready)) blockers.push('PLAYER_NOT_READY');
  if (input.players.some((player) => player.loadout !== null && !player.loadoutValid)) {
    blockers.push('INVALID_LOADOUT');
  }
  if (hasEmptyTeam(input.players, input.settings)) blockers.push('EMPTY_TEAM');
  if (input.settings.ranked && input.players.some((player) => player.session.account === null)) {
    blockers.push('RANKED_NEEDS_ACCOUNT');
  }
  if (input.map === null) blockers.push('MAP_MISSING');
  else if (input.mapIssues.length > 0) blockers.push('MAP_INVALID');
  return blockers;
}

function hasEmptyTeam(players: readonly RoomPlayer[], settings: RoomSettings): boolean {
  if (settings.mode !== 'team') return false;
  for (let team = 0; team < settings.teamCount; team++) {
    if (!players.some((player) => player.team === team)) return true;
  }
  return false;
}
