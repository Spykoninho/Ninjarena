import { z } from 'zod';

export interface ServerConfig {
  host: string;
  port: number;
  tickRate: number;
  snapshotRate: number;
  inputQueueCapacity: number;
  maxConnections: number;
  maxRooms: number;
  postMatchMs: number;
  mapsDir: string;
  maxStoredMaps: number;
}

// Un serveur de développement sans authentification n'écoute pas sur le réseau par défaut.
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const DEFAULT_TICK_RATE = 60;
const DEFAULT_SNAPSHOT_RATE = 30;
const DEFAULT_INPUT_QUEUE_CAPACITY = 8;
const DEFAULT_MAX_CONNECTIONS = 32;
const DEFAULT_MAX_ROOMS = 64;
const DEFAULT_POST_MATCH_MS = 8000;
const DEFAULT_MAPS_DIR = 'data/maps';
const DEFAULT_MAX_STORED_MAPS = 100;
const MAX_RATE = 240;
const MAX_PORT = 65535;
const MAX_INPUT_QUEUE_CAPACITY = 64;
const MAX_CONNECTION_LIMIT = 1024;
const MAX_ROOMS_LIMIT = 1024;
const MAX_POST_MATCH_MS = 600000;
const MAX_STORED_MAPS_LIMIT = 10000;

const ServerConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(MAX_PORT),
  tickRate: z.coerce.number().int().min(1).max(MAX_RATE),
  snapshotRate: z.coerce.number().int().min(1).max(MAX_RATE),
  inputQueueCapacity: z.coerce.number().int().min(1).max(MAX_INPUT_QUEUE_CAPACITY),
  maxConnections: z.coerce.number().int().min(1).max(MAX_CONNECTION_LIMIT),
  maxRooms: z.coerce.number().int().min(1).max(MAX_ROOMS_LIMIT),
  postMatchMs: z.coerce.number().int().min(0).max(MAX_POST_MATCH_MS),
  mapsDir: z.string().min(1),
  maxStoredMaps: z.coerce.number().int().min(0).max(MAX_STORED_MAPS_LIMIT),
});

export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const parsed = ServerConfigSchema.safeParse({
    host: env.NINJARENA_HOST ?? DEFAULT_HOST,
    port: env.NINJARENA_PORT ?? DEFAULT_PORT,
    tickRate: env.NINJARENA_TICK_RATE ?? DEFAULT_TICK_RATE,
    snapshotRate: env.NINJARENA_SNAPSHOT_RATE ?? DEFAULT_SNAPSHOT_RATE,
    inputQueueCapacity: env.NINJARENA_INPUT_QUEUE ?? DEFAULT_INPUT_QUEUE_CAPACITY,
    maxConnections: env.NINJARENA_MAX_CONNECTIONS ?? DEFAULT_MAX_CONNECTIONS,
    maxRooms: env.NINJARENA_MAX_ROOMS ?? DEFAULT_MAX_ROOMS,
    postMatchMs: env.NINJARENA_POST_MATCH_MS ?? DEFAULT_POST_MATCH_MS,
    mapsDir: env.NINJARENA_MAPS_DIR ?? DEFAULT_MAPS_DIR,
    maxStoredMaps: env.NINJARENA_MAX_STORED_MAPS ?? DEFAULT_MAX_STORED_MAPS,
  });
  if (parsed.success) return parsed.data;
  // Un démarrage raté doit tenir sur une ligne: le champ fautif, pas le rapport zod complet.
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
  throw new Error(`invalid configuration: ${issues.join('; ')}`);
}
