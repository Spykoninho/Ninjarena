import { z } from 'zod';

export const TileTypeSchema = z.object({
  name: z.string().min(1),
  solid: z.boolean().default(false),
  speedMultiplier: z.number().positive().default(1),
  tags: z.array(z.string()).default([]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  layer: z.enum(['ground', 'objects']).default('ground'),
});

export const TilesetDefinitionSchema = z.object({
  id: z.string().min(1),
  tileSize: z.number().int().positive(),
  tiles: z.record(z.string().regex(/^\d+$/), TileTypeSchema),
});

export type TileType = z.infer<typeof TileTypeSchema>;
export type TilesetDefinition = z.infer<typeof TilesetDefinitionSchema>;
