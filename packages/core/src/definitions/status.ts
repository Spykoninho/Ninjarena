import { z } from 'zod';

export const StatusEffectTypeSchema = z.enum([
  'ROOTED',
  'SLOWED',
  'INVISIBLE',
  'INVULNERABLE',
  'SHIELDED',
  'HASTED',
]);

export type StatusEffectType = z.infer<typeof StatusEffectTypeSchema>;
