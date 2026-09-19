import type {
  MapSummary,
  RatingStakes,
  RoomSettings,
  RoomSettingsPatch,
  StatRulesDefinition,
} from '@ninjarena/core';
import {
  BEST_OF_OPTIONS,
  MAX_PLAYERS_PER_TEAM,
  MAX_ROUND_DURATION_MS,
  MAX_TEAM_COUNT,
  MIN_ROUND_DURATION_MS,
  MIN_TEAM_COUNT,
  buildPointRange,
  meanRating,
  ratingStakes,
  roomMaxPlayers,
} from '@ninjarena/core';
import type { RoomPlayerView, RoomView, StartBlocker } from '@ninjarena/protocol';

export interface TeamGroup {
  team: number | null;
  label: string;
  players: RoomPlayerView[];
  capacity: number | null;
}

export type PlayerStatus = 'ready' | 'not-ready' | 'invalid';

// Ce qu'un joueur risque dans la partie classée: rien sans compte, rien sans adversaire noté.
export interface StakeRow {
  id: string;
  name: string;
  rating: number | null;
  stakes: RatingStakes | null;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SettingsRow {
  key: keyof RoomSettings;
  label: string;
  kind: 'select' | 'number' | 'toggle';
  value: string | number | boolean;
  options?: SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  hidden: boolean;
}

const ROUND_DURATION_STEP_MS = 10_000;
const CODE_PATTERN = /^[A-Za-z0-9]{6}$/;

const BLOCKER_TEXTS: Record<StartBlocker, string> = {
  NOT_ENOUGH_PLAYERS: 'il faut au moins deux joueurs',
  PLAYER_NOT_READY: 'tout le monde doit être prêt',
  INVALID_LOADOUT: 'chaque équipement doit être valide',
  EMPTY_TEAM: 'chaque équipe a besoin d’un joueur',
  MAP_MISSING: 'la carte choisie est introuvable',
  MAP_INVALID: 'la carte choisie ne convient pas à ces réglages',
  RANKED_NEEDS_ACCOUNT: 'une partie classée demande un compte à chaque joueur',
};

// Les refus arrivent déjà traduits: seul le mot-clé dit lesquels parlent de l'équipement.
const LOADOUT_ERROR_MARKERS = ['équipement'];

const ROOM_STATUS_TEXTS: Record<RoomView['status'], string> = {
  WAITING: 'En attente',
  STARTING: 'Lancement',
  IN_GAME: 'En jeu',
  FINISHED: 'Partie terminée',
};

export function groupPlayers(room: RoomView): TeamGroup[] {
  const { settings } = room;
  if (settings.mode !== 'team') {
    return [{ team: null, label: 'Joueurs', players: [...room.players], capacity: null }];
  }
  const groups: TeamGroup[] = [];
  for (let team = 0; team < settings.teamCount; team++) {
    groups.push({
      team,
      label: `Équipe ${team + 1}`,
      players: room.players.filter((player) => player.team === team),
      capacity: settings.playersPerTeam,
    });
  }
  return groups;
}

const STATUS_LABELS: Record<PlayerStatus, string> = {
  ready: 'PRÊT',
  'not-ready': 'PAS PRÊT',
  invalid: 'ÉQUIPEMENT INVALIDE',
};

// Un loadout refusé prime sur le reste: le joueur ne peut pas être prêt tant qu'il n'est pas corrigé.
export function playerStatus(player: RoomPlayerView): PlayerStatus {
  if (!player.loadoutValid) return 'invalid';
  return player.ready ? 'ready' : 'not-ready';
}

export function statusLabel(status: PlayerStatus): string {
  return STATUS_LABELS[status];
}

export function emptySeats(group: TeamGroup): number {
  if (group.capacity === null) return 0;
  return Math.max(0, group.capacity - group.players.length);
}

export function blockerText(blocker: StartBlocker): string {
  return BLOCKER_TEXTS[blocker];
}

// Un code local invalide n'a pas besoin d'un aller-retour serveur pour être rejeté.
export function isRoomCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

export function isHost(room: RoomView, sessionId: string): boolean {
  return room.hostId === sessionId;
}

export function canStart(room: RoomView, sessionId: string): boolean {
  return isHost(room, sessionId) && room.status === 'WAITING' && room.startBlockers.length === 0;
}

// Chaque joueur est noté contre la moyenne de ses adversaires: en chacun pour soi, tous les autres.
export function rankedStakes(room: RoomView): StakeRow[] {
  return room.players.map((player) => {
    if (player.rating === null) {
      return { id: player.id, name: player.name, rating: null, stakes: null };
    }
    const opponents = room.players.flatMap((other) =>
      other.id !== player.id &&
      other.rating !== null &&
      (room.settings.mode !== 'team' || other.team !== player.team)
        ? [other.rating]
        : [],
    );
    const opponentRating = meanRating(opponents);
    return {
      id: player.id,
      name: player.name,
      rating: player.rating,
      stakes: opponentRating === null ? null : ratingStakes(player.rating, opponentRating),
    };
  });
}

export function roomLink(origin: string, pathname: string, code: string): string {
  return `${origin}${pathname}?room=${code}`;
}

export function statusText(room: RoomView): string {
  const capacity = roomMaxPlayers(room.settings);
  return `${ROOM_STATUS_TEXTS[room.status]} · ${room.players.length}/${capacity} joueurs`;
}

// Chaque contrôle du formulaire hôte n'envoie que sa propre clé, dans le type qu'elle attend.
export function settingsPatch(
  key: keyof RoomSettings,
  raw: string | boolean,
): RoomSettingsPatch | null {
  switch (key) {
    case 'mode':
      return raw === 'ffa' || raw === 'team' ? { mode: raw } : null;
    case 'mapId':
      return typeof raw === 'string' && raw.length > 0 ? { mapId: raw } : null;
    case 'friendlyFire':
      return typeof raw === 'boolean' ? { friendlyFire: raw } : null;
    case 'ranked':
      return typeof raw === 'boolean' ? { ranked: raw } : null;
    case 'bestOf': {
      const bestOf = BEST_OF_OPTIONS.find((option) => `${option}` === String(raw));
      return bestOf === undefined ? null : { bestOf };
    }
    default:
      return integerPatch(key, raw);
  }
}

export function isLoadoutError(message: string): boolean {
  const lowered = message.toLowerCase();
  return LOADOUT_ERROR_MARKERS.some((marker) => lowered.includes(marker));
}

export function settingsRows(
  settings: RoomSettings,
  maps: MapSummary[],
  rules: StatRulesDefinition,
): SettingsRow[] {
  const points = buildPointRange(rules);
  return [
    {
      key: 'mode',
      label: 'Mode',
      kind: 'select',
      value: settings.mode,
      options: [
        { value: 'team', label: 'Équipes' },
        { value: 'ffa', label: 'Chacun pour soi' },
      ],
      hidden: false,
    },
    {
      key: 'mapId',
      label: 'Carte',
      kind: 'select',
      value: settings.mapId,
      options: mapOptions(settings.mapId, maps),
      hidden: false,
    },
    {
      key: 'teamCount',
      label: 'Nombre d’équipes',
      kind: 'number',
      value: settings.teamCount,
      min: MIN_TEAM_COUNT,
      max: MAX_TEAM_COUNT,
      step: 1,
      hidden: false,
    },
    {
      key: 'playersPerTeam',
      label: 'Joueurs par équipe',
      kind: 'number',
      value: settings.playersPerTeam,
      min: 1,
      max: MAX_PLAYERS_PER_TEAM,
      step: 1,
      hidden: settings.mode === 'ffa',
    },
    {
      key: 'buildPoints',
      label: 'Points de répartition',
      kind: 'number',
      value: settings.buildPoints,
      min: points.min,
      max: points.max,
      step: 1,
      hidden: false,
    },
    {
      key: 'bestOf',
      label: 'Manches',
      kind: 'select',
      value: String(settings.bestOf),
      options: BEST_OF_OPTIONS.map((value) => ({
        value: `${value}`,
        label: `Au meilleur des ${value}`,
      })),
      hidden: false,
    },
    {
      key: 'roundDurationMs',
      label: 'Durée d’une manche (ms)',
      kind: 'number',
      value: settings.roundDurationMs,
      min: MIN_ROUND_DURATION_MS,
      max: MAX_ROUND_DURATION_MS,
      step: ROUND_DURATION_STEP_MS,
      hidden: false,
    },
    {
      key: 'friendlyFire',
      label: 'Tir allié',
      kind: 'toggle',
      value: settings.friendlyFire,
      hidden: false,
    },
    {
      key: 'ranked',
      label: 'Partie classée',
      kind: 'toggle',
      value: settings.ranked,
      hidden: false,
    },
  ];
}

function integerPatch(key: keyof RoomSettings, raw: string | boolean): RoomSettingsPatch | null {
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(value)) return null;
  switch (key) {
    case 'teamCount':
      return { teamCount: value };
    case 'playersPerTeam':
      return { playersPerTeam: value };
    case 'buildPoints':
      return { buildPoints: value };
    case 'roundDurationMs':
      return { roundDurationMs: value };
    default:
      return null;
  }
}

// La carte choisie reste listée même absente de `maps`: sinon le select coincerait l'hôte dessus.
function mapOptions(mapId: string, maps: MapSummary[]): SelectOption[] {
  const known = maps.map((map) => ({
    value: map.id,
    label: map.builtin ? `${map.name} (intégrée)` : map.name,
  }));
  if (maps.some((map) => map.id === mapId)) return known;
  return [...known, { value: mapId, label: `${mapId} (introuvable)` }];
}
