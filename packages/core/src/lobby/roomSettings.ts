import { z } from 'zod';
import type { MatchConfig, StatRulesDefinition } from '../definitions';
import { ATTRIBUTE_IDS, MatchConfigSchema } from '../definitions';
import type { TournamentSize } from '../tournament/bracket';
import { TOURNAMENT_SIZES } from '../tournament/bracket';

export const BEST_OF_OPTIONS = [1, 3, 5, 7] as const;
export const MAX_ROOM_PLAYERS = 16;
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 8;
export const MAX_PLAYERS_PER_TEAM = 4;
export const MIN_ROUND_DURATION_MS = 30_000;
export const MAX_ROUND_DURATION_MS = 600_000;

const DEFAULT_ROUND_DURATION_MS = 240_000;
const DEFAULT_BEST_OF: (typeof BEST_OF_OPTIONS)[number] = 3;
const DEFAULT_TOURNAMENT_SIZE: TournamentSize = 4;
// Un match de tournoi est toujours un duel: deux joueurs, chacun pour soi.
const TOURNAMENT_MATCH_TEAMS = 2;

export interface RoomSettings {
  mode: 'ffa' | 'team';
  teamCount: number;
  playersPerTeam: number;
  buildPoints: number;
  mapId: string;
  bestOf: (typeof BEST_OF_OPTIONS)[number];
  roundDurationMs: number;
  friendlyFire: boolean;
  ranked: boolean;
  practice: boolean;
  tournament: boolean;
  tournamentSize: TournamentSize;
}

export type RoomSettingsPatch = Partial<RoomSettings>;

// Le format d'un match: celui de la salle, sauf en tournoi où chaque match oppose deux joueurs.
export interface MatchFormat {
  mode: 'ffa' | 'team';
  teamCount: number;
  playersPerTeam: number;
}

export interface MatchTiming {
  countdownMs: number;
  roundEndDelayMs: number;
}

export const DEFAULT_MATCH_TIMING: MatchTiming = { countdownMs: 3000, roundEndDelayMs: 3000 };

// La somme des bornes par attribut donne l'enveloppe de points de build permise par ces règles.
export function buildPointRange(rules: StatRulesDefinition): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const id of ATTRIBUTE_IDS) {
    min += rules.attributes[id].min;
    max += rules.attributes[id].max;
  }
  return { min, max };
}

// Les bornes de buildPoints dépendent des règles: le schéma est reconstruit pour chaque salle.
export function roomSettingsSchema(rules: StatRulesDefinition): z.ZodType<RoomSettings> {
  const range = buildPointRange(rules);
  return z
    .strictObject({
      mode: z.enum(['ffa', 'team']),
      teamCount: z.number().int().min(MIN_TEAM_COUNT).max(MAX_TEAM_COUNT),
      playersPerTeam: z.number().int().min(1).max(MAX_PLAYERS_PER_TEAM),
      buildPoints: z.number().int().min(range.min).max(range.max),
      mapId: z.string().min(1),
      bestOf: z.union(BEST_OF_OPTIONS.map((value) => z.literal(value))),
      roundDurationMs: z.number().int().min(MIN_ROUND_DURATION_MS).max(MAX_ROUND_DURATION_MS),
      friendlyFire: z.boolean(),
      ranked: z.boolean(),
      practice: z.boolean(),
      tournament: z.boolean(),
      tournamentSize: z.union(TOURNAMENT_SIZES.map((value) => z.literal(value))),
    })
    .refine((settings) => settings.mode === 'team' || settings.playersPerTeam === 1, {
      path: ['playersPerTeam'],
      message: 'ffa uses one player per team',
    })
    .refine((settings) => !(settings.practice && settings.ranked), {
      path: ['ranked'],
      message: 'a practice room cannot be ranked',
    })
    .refine((settings) => !(settings.tournament && (settings.ranked || settings.practice)), {
      path: ['tournament'],
      message: 'a tournament is neither ranked nor a practice room',
    })
    .refine(
      (settings) =>
        !settings.tournament ||
        (settings.mode === 'ffa' && settings.teamCount === settings.tournamentSize),
      { path: ['tournament'], message: 'a tournament room holds exactly its bracket size' },
    );
}

export function defaultRoomSettings(rules: StatRulesDefinition, mapId: string): RoomSettings {
  return {
    mode: 'team',
    teamCount: MIN_TEAM_COUNT,
    playersPerTeam: 1,
    buildPoints: rules.defaultPointBudget,
    mapId,
    bestOf: DEFAULT_BEST_OF,
    roundDurationMs: DEFAULT_ROUND_DURATION_MS,
    friendlyFire: false,
    ranked: false,
    practice: false,
    tournament: false,
    tournamentSize: DEFAULT_TOURNAMENT_SIZE,
  };
}

export function roomMaxPlayers(settings: RoomSettings): number {
  return settings.teamCount * settings.playersPerTeam;
}

export function matchFormatOf(settings: RoomSettings): MatchFormat {
  if (settings.tournament)
    return { mode: 'ffa', teamCount: TOURNAMENT_MATCH_TEAMS, playersPerTeam: 1 };
  return {
    mode: settings.mode,
    teamCount: settings.teamCount,
    playersPerTeam: settings.playersPerTeam,
  };
}

export function applySettingsPatch(
  current: RoomSettings,
  patch: unknown,
  rules: StatRulesDefinition,
): { ok: true; settings: RoomSettings } | { ok: false; reason: string } {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, reason: 'patch must be an object' };
  }
  const merged: Record<string, unknown> = { ...current, ...(patch as Record<string, unknown>) };
  const result = roomSettingsSchema(rules).safeParse(normalise(merged));
  if (!result.success) {
    const issue = result.error.issues[0];
    const reason =
      issue === undefined
        ? 'invalid room settings'
        : `${issue.path.join('.')} ${issue.message}`.trim();
    return { ok: false, reason };
  }
  if (roomMaxPlayers(result.data) > MAX_ROOM_PLAYERS) {
    return {
      ok: false,
      reason: `teamCount × playersPerTeam must be at most ${MAX_ROOM_PLAYERS}`,
    };
  }
  return { ok: true, settings: result.data };
}

// Le ffa n'a qu'un joueur par équipe et un tournoi est un ffa à la taille de son arbre.
function normalise(merged: Record<string, unknown>): Record<string, unknown> {
  if (merged.tournament === true) {
    return { ...merged, mode: 'ffa', playersPerTeam: 1, teamCount: merged.tournamentSize };
  }
  return merged.mode === 'ffa' ? { ...merged, playersPerTeam: 1 } : merged;
}

export function toMatchConfig(settings: RoomSettings, timing: MatchTiming): MatchConfig {
  const format = matchFormatOf(settings);
  return MatchConfigSchema.parse({
    id: `${format.mode}-${format.teamCount}x${format.playersPerTeam}`,
    mode: format.mode,
    teamCount: format.teamCount,
    playersPerTeam: format.playersPerTeam,
    roundsToWin: Math.floor(settings.bestOf / 2) + 1,
    roundDurationMs: settings.roundDurationMs,
    countdownMs: timing.countdownMs,
    roundEndDelayMs: timing.roundEndDelayMs,
    friendlyFire: settings.friendlyFire,
    buildPoints: settings.buildPoints,
    practice: settings.practice,
  });
}
