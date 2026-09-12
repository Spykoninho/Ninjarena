import { z } from 'zod';

export const CharacterDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stats: z.object({
    maxHealth: z.number().positive(),
    maxChakra: z.number().positive(),
    moveSpeed: z.number().positive(),
    chakraRegenPerSecond: z.number().nonnegative(),
    colliderRadius: z.number().positive(),
  }),
  abilities: z.array(z.string().min(1)).min(1).max(4),
});

export type CharacterDefinition = z.infer<typeof CharacterDefinitionSchema>;
