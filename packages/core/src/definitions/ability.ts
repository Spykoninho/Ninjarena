import { z } from 'zod';
import { StatusEffectTypeSchema } from './status';

export const HitEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('damage'), amount: z.number().positive() }),
  z.object({
    type: z.literal('knockback'),
    speed: z.number().positive(),
    durationMs: z.number().positive(),
  }),
  z.object({ type: z.literal('stun'), durationMs: z.number().positive() }),
  z.object({
    type: z.literal('applyStatus'),
    status: StatusEffectTypeSchema,
    durationMs: z.number().positive(),
    magnitude: z.number().optional(),
  }),
]);

export const ActivationEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('projectile'),
    speed: z.number().positive(),
    radius: z.number().positive(),
    lifetimeMs: z.number().positive(),
    onHit: z.array(HitEffectSchema),
  }),
  z.object({
    type: z.literal('dash'),
    distance: z.number().positive(),
    durationMs: z.number().positive(),
  }),
  z.object({
    type: z.literal('melee'),
    range: z.number().positive(),
    arcDegrees: z.number().positive().max(360),
    onHit: z.array(HitEffectSchema),
  }),
]);

export const AbilityDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cooldownMs: z.number().nonnegative(),
  energyCost: z.number().nonnegative(),
  startupMs: z.number().nonnegative(),
  recoveryMs: z.number().nonnegative(),
  canMoveWhileCasting: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  effects: z.array(ActivationEffectSchema).min(1),
});

export type HitEffect = z.infer<typeof HitEffectSchema>;
export type ActivationEffect = z.infer<typeof ActivationEffectSchema>;
export type AbilityDefinition = z.infer<typeof AbilityDefinitionSchema>;
