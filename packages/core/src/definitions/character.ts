import { z } from 'zod';

export const CharacterDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseStats: z.object({
    maxHealth: z.number().positive(),
    maxChakra: z.number().positive(),
    chakraRegenPerSecond: z.number().nonnegative(),
    moveSpeed: z.number().positive(),
    colliderRadius: z.number().positive(),
  }),
  basicAttackId: z.string().min(1),
  dashId: z.string().min(1),
});

export type CharacterDefinition = z.infer<typeof CharacterDefinitionSchema>;
