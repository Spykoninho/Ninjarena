import { z } from 'zod';

export const ATTRIBUTE_IDS = [
  'vitality',
  'strength',
  'power',
  'speed',
  'maxChakra',
  'chakraRegen',
  'defense',
] as const;

export const AttributeIdSchema = z.enum(ATTRIBUTE_IDS);

export type AttributeId = z.infer<typeof AttributeIdSchema>;

const RangeSchema = z
  .object({ min: z.number().int().nonnegative(), max: z.number().int().positive() })
  .refine((r) => r.max >= r.min, { message: 'max must be at least min' });

export const StatRulesDefinitionSchema = z.object({
  defaultPointBudget: z.number().int().nonnegative(),
  attributes: z.object({
    vitality: RangeSchema,
    strength: RangeSchema,
    power: RangeSchema,
    speed: RangeSchema,
    maxChakra: RangeSchema,
    chakraRegen: RangeSchema,
    defense: RangeSchema,
  }),
  coefficients: z.object({
    healthPerVitality: z.number().nonnegative(),
    physicalDamagePerStrength: z.number().nonnegative(),
    techniqueDamagePerPower: z.number().nonnegative(),
    moveSpeedPerSpeed: z.number().nonnegative(),
    chakraPerPoint: z.number().nonnegative(),
    chakraRegenPerPoint: z.number().nonnegative(),
    defensePerPoint: z.number().nonnegative(),
  }),
  techniqueSlots: z.number().int().min(1).max(3),
});

export type StatRulesDefinition = z.infer<typeof StatRulesDefinitionSchema>;
