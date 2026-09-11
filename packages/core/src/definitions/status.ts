import { z } from 'zod';

export const StatusEffectTypeSchema = z.enum(['ROOTED', 'SLOWED', 'INVISIBLE', 'INVULNERABLE']);

export type StatusEffectType = z.infer<typeof StatusEffectTypeSchema>;
