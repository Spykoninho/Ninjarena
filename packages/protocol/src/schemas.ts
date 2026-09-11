import { MatchConfigSchema } from '@ninjarena/core';
import type { WorldEvent, WorldState } from '@ninjarena/core';
import { z } from 'zod';
import type { ClientMessage, ServerMessage } from './messages';

const MAX_PLAYER_NAME_LENGTH = 24;

const Vec2Schema = z.strictObject({ x: z.number(), y: z.number() });

const PlayerInputSchema = z.strictObject({
  move: Vec2Schema,
  aim: Vec2Schema,
  abilityHeld: z.number(),
});

export const ClientMessageSchema: z.ZodType<ClientMessage> = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('join'),
    protocolVersion: z.number().int(),
    name: z.string().min(1).max(MAX_PLAYER_NAME_LENGTH),
  }),
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    input: PlayerInputSchema,
  }),
  z.strictObject({ type: z.literal('ping'), sentAt: z.number() }),
]);

const RoomPlayerInfoSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  teamId: z.string().min(1),
  ready: z.boolean(),
});

// Le client fait confiance au serveur: l'état du monde n'est vérifié qu'en forme.
const isObject = (value: unknown): boolean => typeof value === 'object' && value !== null;
const WorldStateSchema = z.custom<WorldState>(isObject);
const WorldEventSchema = z.custom<WorldEvent>(isObject);

export const ServerMessageSchema: z.ZodType<ServerMessage> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    playerId: z.string().min(1),
    tickRate: z.number().positive(),
    snapshotRate: z.number().positive(),
    mapId: z.string().min(1),
    matchConfig: MatchConfigSchema,
  }),
  z.object({ type: z.literal('roomState'), players: z.array(RoomPlayerInfoSchema) }),
  z.object({
    type: z.literal('snapshot'),
    tick: z.number().int().nonnegative(),
    lastProcessedSeq: z.number().int(),
    world: WorldStateSchema,
    events: z.array(WorldEventSchema),
  }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['PROTOCOL_VERSION', 'ROOM_FULL', 'INVALID_MESSAGE', 'NOT_JOINED']),
    message: z.string(),
  }),
  z.object({ type: z.literal('pong'), sentAt: z.number(), serverTime: z.number() }),
]);
