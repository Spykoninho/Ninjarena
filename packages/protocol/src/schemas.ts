import {
  BEST_OF_OPTIONS,
  MAP_ID_PATTERN,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
  MapDocumentSchema,
  MatchConfigSchema,
  MAX_PLAYERS_PER_TEAM,
  MAX_ROUND_DURATION_MS,
  MAX_TEAM_COUNT,
  MIN_ROUND_DURATION_MS,
  MIN_TEAM_COUNT,
} from '@ninjarena/core';
import type { RoomSettings, WorldEvent, WorldState } from '@ninjarena/core';
import { z } from 'zod';
import type {
  AccountView,
  ClientMessage,
  MatchSummary,
  RoomPlayerView,
  RoomView,
  ServerMessage,
} from './messages';
import { SERVER_ERROR_CODES, START_BLOCKERS } from './messages';

const MAX_PLAYER_NAME_LENGTH = 24;
const MAX_ATTRIBUTE_POINTS = 50;
const MAX_TECHNIQUE_ID_LENGTH = 64;
const MAX_TECHNIQUE_IDS = 8;
const MAX_PASSWORD_LENGTH = 32;
const MIN_ACCOUNT_NAME_LENGTH = 2;
const MIN_ACCOUNT_PASSWORD_LENGTH = 4;
const MAX_ACCOUNT_PASSWORD_LENGTH = 64;
const MAX_LEADERBOARD_ENTRIES = 200;
const MAX_MAP_STRING_LENGTH = 40;
const MAX_BASIC_ATTACK_ID_LENGTH = 64;
const MAX_BUILD_POINTS = 50;
const MAX_TEAM_INDEX = MAX_TEAM_COUNT - 1;
const CODE_PATTERN = /^[A-Za-z0-9]{6}$/;

const Vec2Schema = z.strictObject({ x: z.number(), y: z.number() });

const PlayerInputSchema = z.strictObject({
  move: Vec2Schema,
  aim: Vec2Schema,
  abilityHeld: z.number(),
});

const AttributePointsSchema = z.number().int().min(0).max(MAX_ATTRIBUTE_POINTS);

export const BuildSchema = z.strictObject({
  vitality: AttributePointsSchema,
  strength: AttributePointsSchema,
  power: AttributePointsSchema,
  speed: AttributePointsSchema,
  maxChakra: AttributePointsSchema,
  chakraRegen: AttributePointsSchema,
  defense: AttributePointsSchema,
});

// Le nombre exact de techniques dépend des règles: seule la forme est vérifiée ici.
const TechniqueIdsSchema = z
  .array(z.string().min(1).max(MAX_TECHNIQUE_ID_LENGTH))
  .max(MAX_TECHNIQUE_IDS);

export const LoadoutSchema = z.strictObject({
  build: BuildSchema,
  basicAttackId: z.string().min(1).max(MAX_BASIC_ATTACK_ID_LENGTH),
  techniqueIds: TechniqueIdsSchema,
});

export const RoomSettingsPatchSchema = z.strictObject({
  mode: z.enum(['ffa', 'team']).optional(),
  teamCount: z.number().int().min(MIN_TEAM_COUNT).max(MAX_TEAM_COUNT).optional(),
  playersPerTeam: z.number().int().min(1).max(MAX_PLAYERS_PER_TEAM).optional(),
  buildPoints: z.number().int().min(0).max(MAX_BUILD_POINTS).optional(),
  mapId: z.string().min(1).max(MAX_MAP_STRING_LENGTH).optional(),
  bestOf: z.union(BEST_OF_OPTIONS.map((value) => z.literal(value))).optional(),
  roundDurationMs: z
    .number()
    .int()
    .min(MIN_ROUND_DURATION_MS)
    .max(MAX_ROUND_DURATION_MS)
    .optional(),
  friendlyFire: z.boolean().optional(),
  ranked: z.boolean().optional(),
});

// Version pleine (tous les champs requis) pour l'état de salle diffusé sur le fil.
const RoomSettingsSchema: z.ZodType<RoomSettings> = z.strictObject({
  mode: z.enum(['ffa', 'team']),
  teamCount: z.number().int().min(MIN_TEAM_COUNT).max(MAX_TEAM_COUNT),
  playersPerTeam: z.number().int().min(1).max(MAX_PLAYERS_PER_TEAM),
  buildPoints: z.number().int().min(0).max(MAX_BUILD_POINTS),
  mapId: z.string().min(1).max(MAX_MAP_STRING_LENGTH),
  bestOf: z.union(BEST_OF_OPTIONS.map((value) => z.literal(value))),
  roundDurationMs: z.number().int().min(MIN_ROUND_DURATION_MS).max(MAX_ROUND_DURATION_MS),
  friendlyFire: z.boolean(),
  ranked: z.boolean(),
});

// Un pseudo de compte est unique et lisible: ni vide ni fait d'espaces, contrairement au nom d'invité.
const AccountNameSchema = z
  .string()
  .max(MAX_PLAYER_NAME_LENGTH)
  .refine((name) => name.trim().length >= MIN_ACCOUNT_NAME_LENGTH && name.trim() === name, {
    message: 'an account name has 2 to 24 characters without surrounding spaces',
  });

const AccountPasswordSchema = z
  .string()
  .min(MIN_ACCOUNT_PASSWORD_LENGTH)
  .max(MAX_ACCOUNT_PASSWORD_LENGTH);

const AccountViewSchema: z.ZodType<AccountView> = z.strictObject({
  name: AccountNameSchema,
  rating: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});

const MapSummarySchema = z.strictObject({
  id: z.string().regex(MAP_ID_PATTERN),
  name: z.string().min(1).max(MAX_MAP_STRING_LENGTH),
  width: z.number().int().min(MAP_MIN_SIZE).max(MAP_MAX_SIZE),
  height: z.number().int().min(MAP_MIN_SIZE).max(MAP_MAX_SIZE),
  author: z.string().min(1).max(MAX_MAP_STRING_LENGTH).optional(),
  builtin: z.boolean(),
});

const RoomPlayerViewSchema: z.ZodType<RoomPlayerView> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(MAX_PLAYER_NAME_LENGTH),
  team: z.number().int().min(0).max(MAX_TEAM_INDEX).nullable(),
  ready: z.boolean(),
  loadout: LoadoutSchema.nullable(),
  loadoutValid: z.boolean(),
  rating: z.number().int().nonnegative().nullable(),
});

const MatchSummarySchema: z.ZodType<MatchSummary> = z.strictObject({
  winnerTeamId: z.string().min(1).nullable(),
  scores: z.record(z.string(), z.number().int().nonnegative()),
  ranked: z.boolean(),
  players: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string().min(1).max(MAX_PLAYER_NAME_LENGTH),
      teamId: z.string().min(1),
      damageDealt: z.number().nonnegative(),
      damageTaken: z.number().nonnegative(),
      kills: z.number().int().nonnegative(),
      deaths: z.number().int().nonnegative(),
      rating: z
        .strictObject({
          before: z.number().int().nonnegative(),
          after: z.number().int().nonnegative(),
        })
        .nullable(),
    }),
  ),
});

const RoomViewSchema: z.ZodType<RoomView> = z.strictObject({
  code: z.string().regex(CODE_PATTERN),
  hasPassword: z.boolean(),
  hostId: z.string().min(1),
  status: z.enum(['WAITING', 'STARTING', 'IN_GAME', 'FINISHED']),
  settings: RoomSettingsSchema,
  map: MapSummarySchema.nullable(),
  players: z.array(RoomPlayerViewSchema),
  startBlockers: z.array(z.enum(START_BLOCKERS)),
});

export const ClientMessageSchema: z.ZodType<ClientMessage> = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('hello'),
    protocolVersion: z.number().int(),
    name: z.string().min(1).max(MAX_PLAYER_NAME_LENGTH),
  }),
  z.strictObject({
    type: z.literal('register'),
    name: AccountNameSchema,
    password: AccountPasswordSchema,
  }),
  z.strictObject({
    type: z.literal('login'),
    name: AccountNameSchema,
    password: AccountPasswordSchema,
  }),
  z.strictObject({ type: z.literal('logout') }),
  z.strictObject({ type: z.literal('getLeaderboard') }),
  z.strictObject({
    type: z.literal('createRoom'),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH).optional(),
    settings: RoomSettingsPatchSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('joinRoom'),
    code: z.string().regex(CODE_PATTERN),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH).optional(),
  }),
  z.strictObject({ type: z.literal('leaveRoom') }),
  z.strictObject({ type: z.literal('updateSettings'), patch: RoomSettingsPatchSchema }),
  z.strictObject({ type: z.literal('setLoadout'), loadout: LoadoutSchema }),
  z.strictObject({ type: z.literal('setReady'), ready: z.boolean() }),
  z.strictObject({
    type: z.literal('switchTeam'),
    team: z.number().int().min(0).max(MAX_TEAM_INDEX),
  }),
  z.strictObject({ type: z.literal('startMatch') }),
  z.strictObject({ type: z.literal('listMaps') }),
  z.strictObject({ type: z.literal('getMap'), id: z.string().min(1).max(MAX_MAP_STRING_LENGTH) }),
  z.strictObject({ type: z.literal('saveMap'), document: MapDocumentSchema }),
  z.strictObject({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    input: PlayerInputSchema,
  }),
  z.strictObject({ type: z.literal('ping'), sentAt: z.number() }),
]);

// Le client fait confiance au serveur: l'état du monde n'est vérifié qu'en forme.
const isObject = (value: unknown): boolean => typeof value === 'object' && value !== null;
const WorldStateSchema = z.custom<WorldState>(isObject);
const WorldEventSchema = z.custom<WorldEvent>(isObject);

export const ServerMessageSchema: z.ZodType<ServerMessage> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), sessionId: z.string().min(1) }),
  z.object({ type: z.literal('accountState'), account: AccountViewSchema.nullable() }),
  z.object({
    type: z.literal('leaderboard'),
    entries: z.array(AccountViewSchema).max(MAX_LEADERBOARD_ENTRIES),
  }),
  z.object({ type: z.literal('roomState'), room: RoomViewSchema }),
  z.object({ type: z.literal('roomLeft') }),
  z.object({
    type: z.literal('matchStarted'),
    playerId: z.string().min(1),
    tickRate: z.number().positive(),
    snapshotRate: z.number().positive(),
    matchConfig: MatchConfigSchema,
    map: MapDocumentSchema,
  }),
  z.object({
    type: z.literal('snapshot'),
    tick: z.number().int().nonnegative(),
    lastProcessedSeq: z.number().int(),
    world: WorldStateSchema,
    events: z.array(WorldEventSchema),
  }),
  z.object({ type: z.literal('matchSummary'), summary: MatchSummarySchema }),
  z.object({ type: z.literal('mapList'), maps: z.array(MapSummarySchema) }),
  z.object({ type: z.literal('mapSaved'), id: z.string().min(1).max(MAX_MAP_STRING_LENGTH) }),
  z.object({ type: z.literal('mapDocument'), document: MapDocumentSchema }),
  z.object({
    type: z.literal('error'),
    code: z.enum(SERVER_ERROR_CODES),
    message: z.string(),
  }),
  z.object({ type: z.literal('pong'), sentAt: z.number(), serverTime: z.number() }),
]);
