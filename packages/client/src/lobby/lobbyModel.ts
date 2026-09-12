import type {
  MapSummary,
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
  roomMaxPlayers,
} from '@ninjarena/core';
import type { RoomPlayerView, RoomView, StartBlocker } from '@ninjarena/protocol';

export interface TeamGroup {
  team: number | null;
  label: string;
  players: RoomPlayerView[];
  capacity: number | null;
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
  NOT_ENOUGH_PLAYERS: 'at least two players are needed',
  PLAYER_NOT_READY: 'everyone must be ready',
  INVALID_LOADOUT: 'every loadout must be valid',
  EMPTY_TEAM: 'every team needs a player',
  MAP_MISSING: 'the selected map is missing',
  MAP_INVALID: 'the selected map is not valid for these settings',
};

// Le serveur renvoie ses refus en texte libre: ces marqueurs disent lesquels parlent du loadout.
const LOADOUT_ERROR_MARKERS = [
  'loadout',
  'build',
  'technique',
  'ability',
  'attribute',
  'basic attack',
  'basicattackid',
  'picked twice',
];

export function groupPlayers(room: RoomView): TeamGroup[] {
  const { settings } = room;
  if (settings.mode !== 'team') {
    return [{ team: null, label: 'Players', players: [...room.players], capacity: null }];
  }
  const groups: TeamGroup[] = [];
  for (let team = 0; team < settings.teamCount; team++) {
    groups.push({
      team,
      label: `Team ${team + 1}`,
      players: room.players.filter((player) => player.team === team),
      capacity: settings.playersPerTeam,
    });
  }
  return groups;
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

export function roomLink(origin: string, pathname: string, code: string): string {
  return `${origin}${pathname}?room=${code}`;
}

export function statusText(room: RoomView): string {
  const status = room.status === 'FINISHED' ? 'Match over' : room.status;
  const capacity = roomMaxPlayers(room.settings);
  return `Room ${room.code} · ${status} · ${room.players.length}/${capacity} players`;
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
        { value: 'team', label: 'Teams' },
        { value: 'ffa', label: 'Free for all' },
      ],
      hidden: false,
    },
    {
      key: 'mapId',
      label: 'Map',
      kind: 'select',
      value: settings.mapId,
      options: mapOptions(settings.mapId, maps),
      hidden: false,
    },
    {
      key: 'teamCount',
      label: 'Teams',
      kind: 'number',
      value: settings.teamCount,
      min: MIN_TEAM_COUNT,
      max: MAX_TEAM_COUNT,
      step: 1,
      hidden: false,
    },
    {
      key: 'playersPerTeam',
      label: 'Players per team',
      kind: 'number',
      value: settings.playersPerTeam,
      min: 1,
      max: MAX_PLAYERS_PER_TEAM,
      step: 1,
      hidden: settings.mode === 'ffa',
    },
    {
      key: 'buildPoints',
      label: 'Build points',
      kind: 'number',
      value: settings.buildPoints,
      min: points.min,
      max: points.max,
      step: 1,
      hidden: false,
    },
    {
      key: 'bestOf',
      label: 'Rounds',
      kind: 'select',
      value: String(settings.bestOf),
      options: BEST_OF_OPTIONS.map((value) => ({
        value: `${value}`,
        label: `Best of ${value}`,
      })),
      hidden: false,
    },
    {
      key: 'roundDurationMs',
      label: 'Round duration (ms)',
      kind: 'number',
      value: settings.roundDurationMs,
      min: MIN_ROUND_DURATION_MS,
      max: MAX_ROUND_DURATION_MS,
      step: ROUND_DURATION_STEP_MS,
      hidden: false,
    },
    {
      key: 'friendlyFire',
      label: 'Friendly fire',
      kind: 'toggle',
      value: settings.friendlyFire,
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

// La carte choisie reste listée tant que `mapList` n'est pas arrivée: sinon le select mentirait.
function mapOptions(mapId: string, maps: MapSummary[]): SelectOption[] {
  if (!maps.some((map) => map.id === mapId)) return [{ value: mapId, label: mapId }];
  return maps.map((map) => ({
    value: map.id,
    label: map.builtin ? `${map.name} (built-in)` : map.name,
  }));
}
