import { z } from 'zod';

export const EMPTY_TILE_CHAR = ' ';

const LAYER_NAMES = ['ground', 'objects'] as const;

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

export const SpawnPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  team: z.number().int().nonnegative().optional(),
});

export const MapDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    tileset: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    legend: z.record(z.string().length(1), z.number().int().nonnegative()),
    layers: z.object({ ground: z.array(z.string()), objects: z.array(z.string()) }),
    colliders: z.array(ShapeDefinitionSchema).default([]),
    spawns: z.array(SpawnPointSchema).min(1),
  })
  .superRefine((map, ctx) => {
    for (const layer of LAYER_NAMES) {
      const rows = map.layers[layer];
      if (rows.length !== map.height) {
        ctx.addIssue({
          code: 'custom',
          message: `layer "${layer}" must have ${map.height} rows, got ${rows.length}`,
          path: ['layers', layer],
        });
      }
      rows.forEach((row, y) => {
        if (row.length !== map.width) {
          ctx.addIssue({
            code: 'custom',
            message: `row ${y} of layer "${layer}" must be ${map.width} characters wide, got ${row.length}`,
            path: ['layers', layer, y],
          });
        }
        for (const char of row) {
          if (char === EMPTY_TILE_CHAR) {
            if (layer === 'objects') continue;
            ctx.addIssue({
              code: 'custom',
              message: 'layer "ground" must be fully tiled and cannot contain the empty character',
              path: ['layers', layer, y],
            });
            continue;
          }
          if (map.legend[char] === undefined) {
            ctx.addIssue({
              code: 'custom',
              message: `character "${char}" of layer "${layer}" is missing from the legend`,
              path: ['layers', layer, y],
            });
          }
        }
      });
    }
  });

export type ShapeDefinition = z.infer<typeof ShapeDefinitionSchema>;
export type SpawnPointDefinition = z.infer<typeof SpawnPointSchema>;
export type MapDefinition = z.infer<typeof MapDefinitionSchema>;
