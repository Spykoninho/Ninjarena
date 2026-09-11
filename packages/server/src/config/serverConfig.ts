import { DEFAULT_MAP_ID } from '@ninjarena/content';
import { z } from 'zod';

export interface ServerConfig {
  host: string;
  port: number;
  tickRate: number;
  snapshotRate: number;
  mapId: string;
  matchModeId: string;
  inputQueueCapacity: number;
  autoStartWhenFull: boolean;
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8080;
const DEFAULT_TICK_RATE = 60;
const DEFAULT_SNAPSHOT_RATE = 30;
const DEFAULT_MATCH_MODE_ID = 'duel';
const DEFAULT_INPUT_QUEUE_CAPACITY = 8;
const MAX_RATE = 240;
const MAX_PORT = 65535;
const MAX_INPUT_QUEUE_CAPACITY = 64;

// `z.coerce.boolean()` accepte n'importe quelle chaîne non vide: "false" doit rester faux.
const BooleanEnvSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const ServerConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(MAX_PORT),
  tickRate: z.coerce.number().int().min(1).max(MAX_RATE),
  snapshotRate: z.coerce.number().int().min(1).max(MAX_RATE),
  mapId: z.string().min(1),
  matchModeId: z.string().min(1),
  inputQueueCapacity: z.coerce.number().int().min(1).max(MAX_INPUT_QUEUE_CAPACITY),
  autoStartWhenFull: BooleanEnvSchema,
});

export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  return ServerConfigSchema.parse({
    host: env.NINJARENA_HOST ?? DEFAULT_HOST,
    port: env.NINJARENA_PORT ?? DEFAULT_PORT,
    tickRate: env.NINJARENA_TICK_RATE ?? DEFAULT_TICK_RATE,
    snapshotRate: env.NINJARENA_SNAPSHOT_RATE ?? DEFAULT_SNAPSHOT_RATE,
    mapId: env.NINJARENA_MAP ?? DEFAULT_MAP_ID,
    matchModeId: env.NINJARENA_MATCH_MODE ?? DEFAULT_MATCH_MODE_ID,
    inputQueueCapacity: env.NINJARENA_INPUT_QUEUE ?? DEFAULT_INPUT_QUEUE_CAPACITY,
    autoStartWhenFull: env.NINJARENA_AUTO_START ?? true,
  });
}
