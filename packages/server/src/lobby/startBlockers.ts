import type { RoomSettings } from '@ninjarena/core';
import type { StartBlocker } from '@ninjarena/protocol';
import type { RoomMapStatus } from './roomMap';
import type { RoomPlayer } from './roomPlayer';

const MIN_PLAYERS_TO_START = 2;

export interface StartBlockerInput {
  players: readonly RoomPlayer[];
  settings: RoomSettings;
  map: RoomMapStatus;
}

export function computeStartBlockers(input: StartBlockerInput): StartBlocker[] {
  // Un entraînement se lance seul; sinon une salle presque vide n'a rien d'autre à corriger.
  const solo = input.settings.practice;
  if (!solo && input.players.length < MIN_PLAYERS_TO_START) return ['NOT_ENOUGH_PLAYERS'];

  const blockers: StartBlocker[] = [];
  // Un arbre à trous se jouerait par forfaits: le tournoi attend que chaque place soit prise.
  if (input.settings.tournament && input.players.length < input.settings.tournamentSize) {
    blockers.push('TOURNAMENT_NOT_FULL');
  }
  if (input.players.some((player) => !player.ready)) blockers.push('PLAYER_NOT_READY');
  if (input.players.some((player) => player.loadout !== null && !player.loadoutValid)) {
    blockers.push('INVALID_LOADOUT');
  }
  if (!solo && hasEmptyTeam(input.players, input.settings)) blockers.push('EMPTY_TEAM');
  if (input.settings.ranked && input.players.some((player) => player.session.account === null)) {
    blockers.push('RANKED_NEEDS_ACCOUNT');
  }
  if (input.map === 'missing') blockers.push('MAP_MISSING');
  else if (input.map === 'invalid') blockers.push('MAP_INVALID');
  return blockers;
}

function hasEmptyTeam(players: readonly RoomPlayer[], settings: RoomSettings): boolean {
  if (settings.mode !== 'team') return false;
  for (let team = 0; team < settings.teamCount; team++) {
    if (!players.some((player) => player.team === team)) return true;
  }
  return false;
}
