import { z } from 'zod';
import type { Vec2 } from '../math/vec2';
import type { TilesetDefinition } from './tileset';

export const CURRENT_MAP_FORMAT_VERSION = 1;
export const MAP_MIN_SIZE = 8;
export const MAP_MAX_SIZE = 128;
export const MAP_MAX_SPAWNS = 64;
export const MAP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_NAME_LENGTH = 40;

export const Vec2Schema = z.object({ x: z.number(), y: z.number() });

export const ShapeDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.object({
    type: z.literal('circle'),
    x: z.number(),
    y: z.number(),
    radius: z.number().positive(),
  }),
  z.object({ type: z.literal('polygon'), points: z.array(Vec2Schema).min(3) }),
]);

export const MapSpawnSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  team: z.number().int().nonnegative().optional(),
});

const SizeSchema = z.number().int().min(MAP_MIN_SIZE).max(MAP_MAX_SIZE);
const TileIdSchema = z.number().int().nonnegative();

export const MapDocumentSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(MAP_ID_PATTERN),
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    author: z.string().max(MAX_NAME_LENGTH).optional(),
    createdAt: z.iso.datetime().optional(),
    tileset: z.string().min(1),
    width: SizeSchema,
    height: SizeSchema,
    layers: z.object({
      ground: z.array(z.array(TileIdSchema).max(MAP_MAX_SIZE)).max(MAP_MAX_SIZE),
      objects: z.array(z.array(TileIdSchema.nullable()).max(MAP_MAX_SIZE)).max(MAP_MAX_SIZE),
    }),
    colliders: z.array(ShapeDefinitionSchema).default([]),
    spawns: z.array(MapSpawnSchema).max(MAP_MAX_SPAWNS),
  })
  .superRefine((map, ctx) => {
    for (const layer of ['ground', 'objects'] as const) {
      const rows = map.layers[layer];
      if (rows.length !== map.height) {
        ctx.addIssue({
          code: 'custom',
          path: ['layers', layer],
          message: `layer "${layer}" must have ${map.height} rows, got ${rows.length}`,
        });
      }
      rows.forEach((row, y) => {
        if (row.length !== map.width) {
          ctx.addIssue({
            code: 'custom',
            path: ['layers', layer, y],
            message: `row ${y} of layer "${layer}" must be ${map.width} tiles wide, got ${row.length}`,
          });
        }
      });
    }
  });

export type MapSpawn = z.infer<typeof MapSpawnSchema>;
export type MapDocument = z.infer<typeof MapDocumentSchema>;
export type ShapeDefinition = z.infer<typeof ShapeDefinitionSchema>;

export interface MapSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  author?: string;
  builtin: boolean;
}

// Une seule porte d'entrée par version: une v2 ajoutera son étape ici.
export function migrateMapDocument(raw: unknown): MapDocument {
  const version = versionOf(raw);
  if (version === 1) return MapDocumentSchema.parse(raw);
  throw new Error(`unsupported map format version ${String(version)}`);
}

function versionOf(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null
    ? (raw as { version?: unknown }).version
    : undefined;
}

export function summarizeMap(doc: MapDocument, builtin: boolean): MapSummary {
  return {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    ...(doc.author !== undefined ? { author: doc.author } : {}),
    builtin,
  };
}

export function spawnWorldPosition(spawn: MapSpawn, tileSize: number): Vec2 {
  return { x: (spawn.x + 0.5) * tileSize, y: (spawn.y + 0.5) * tileSize };
}

export function isSolidTile(
  tileset: TilesetDefinition,
  ground: number,
  object: number | null,
): boolean {
  const g = tileset.tiles[String(ground)];
  const o = object === null ? undefined : tileset.tiles[String(object)];
  return (g?.solid ?? false) || (o?.solid ?? false);
}
