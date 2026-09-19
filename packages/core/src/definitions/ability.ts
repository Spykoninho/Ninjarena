import { z } from 'zod';
import type { StatusEffectType } from './status';
import { StatusEffectTypeSchema } from './status';

export const AbilityKindSchema = z.enum(['basic', 'dash', 'technique']);

export const TelegraphKindSchema = z.enum([
  'orb',
  'ring',
  'flash',
  'ground-circle',
  'ground-mark',
  'charge',
]);

const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const TelegraphSchema = z.object({
  kind: TelegraphKindSchema,
  color: ColorSchema,
  size: z.number().positive(),
  anchor: z.enum(['caster', 'aim']).default('caster'),
});

export const VisualSchema = z.object({
  color: ColorSchema,
  size: z.number().positive(),
  trail: z.boolean().default(false),
});

export const TerrainRuleSchema = z.object({
  tag: z.string().min(1),
  damageMultiplier: z.number().positive().optional(),
  radiusMultiplier: z.number().positive().optional(),
});

export const DamageScalingSchema = z.enum(['physical', 'technique', 'none']);

export type AbilityKind = z.infer<typeof AbilityKindSchema>;
export type TelegraphKind = z.infer<typeof TelegraphKindSchema>;
export type Telegraph = z.infer<typeof TelegraphSchema>;
export type Visual = z.infer<typeof VisualSchema>;
export type TerrainRule = z.infer<typeof TerrainRuleSchema>;
export type DamageScaling = z.infer<typeof DamageScalingSchema>;

export type Effect =
  | {
      type: 'projectile';
      speed: number;
      radius: number;
      lifetimeMs: number;
      visual: Visual;
      onHit: Effect[];
      onExpire: Effect[];
    }
  | {
      type: 'area';
      radius: number;
      delayMs: number;
      origin: 'caster' | 'aim' | 'here';
      range: number;
      visual: Visual;
      onHit: Effect[];
      terrain: TerrainRule[];
    }
  | {
      type: 'dash';
      distance: number;
      durationMs: number;
      invulnerableTicks: number;
      onContact: Effect[];
    }
  | { type: 'melee'; range: number; arcDegrees: number; onHit: Effect[] }
  | { type: 'teleport'; distance: number }
  | {
      type: 'spawnEntity';
      entity: 'wall';
      width: number;
      thickness: number;
      offset: number;
      lifetimeMs: number;
      visual: Visual;
    }
  | { type: 'shield'; amount: number; durationMs: number }
  | { type: 'delayedTrigger'; delayMs: number; effects: Effect[] }
  | { type: 'damage'; amount: number; scaling: DamageScaling; terrain: TerrainRule[] }
  | { type: 'knockback'; speed: number; durationMs: number }
  | { type: 'stun'; durationMs: number }
  | { type: 'applyStatus'; status: StatusEffectType; durationMs: number; magnitude?: number };

export type EffectOfType<K extends Effect['type']> = Extract<Effect, { type: K }>;

// Les quatre briques qui portent des sous-effets rendent le schéma récursif.
export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('projectile'),
      speed: z.number().positive(),
      radius: z.number().positive(),
      lifetimeMs: z.number().positive(),
      visual: VisualSchema,
      onHit: z.array(EffectSchema),
      onExpire: z.array(EffectSchema).default([]),
    }),
    z.object({
      type: z.literal('area'),
      radius: z.number().positive(),
      delayMs: z.number().nonnegative().default(0),
      origin: z.enum(['caster', 'aim', 'here']).default('here'),
      range: z.number().nonnegative().default(0),
      visual: VisualSchema,
      onHit: z.array(EffectSchema),
      terrain: z.array(TerrainRuleSchema).default([]),
    }),
    z.object({
      type: z.literal('dash'),
      distance: z.number().positive(),
      durationMs: z.number().positive(),
      invulnerableTicks: z.number().int().nonnegative().default(0),
      onContact: z.array(EffectSchema).default([]),
    }),
    z.object({
      type: z.literal('melee'),
      range: z.number().positive(),
      arcDegrees: z.number().positive().max(360),
      onHit: z.array(EffectSchema),
    }),
    z.object({ type: z.literal('teleport'), distance: z.number().positive() }),
    z.object({
      type: z.literal('spawnEntity'),
      entity: z.literal('wall'),
      width: z.number().positive(),
      thickness: z.number().positive(),
      offset: z.number().nonnegative(),
      lifetimeMs: z.number().positive(),
      visual: VisualSchema,
    }),
    z.object({
      type: z.literal('shield'),
      amount: z.number().positive(),
      durationMs: z.number().positive(),
    }),
    z.object({
      type: z.literal('delayedTrigger'),
      delayMs: z.number().nonnegative(),
      effects: z.array(EffectSchema),
    }),
    z.object({
      type: z.literal('damage'),
      amount: z.number().positive(),
      scaling: DamageScalingSchema.default('technique'),
      terrain: z.array(TerrainRuleSchema).default([]),
    }),
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
      magnitude: z.number().positive().optional(),
    }),
  ]),
);

export const AbilityDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: AbilityKindSchema,
  description: z.string().min(1).optional(),
  cooldownMs: z.number().nonnegative(),
  chakraCost: z.number().nonnegative(),
  startupMs: z.number().nonnegative(),
  activeMs: z.number().nonnegative().default(0),
  recoveryMs: z.number().nonnegative(),
  canMoveWhileCasting: z.boolean().default(false),
  telegraph: TelegraphSchema.nullable().default(null),
  tags: z.array(z.string()).default([]),
  effects: z.array(EffectSchema).min(1),
});

export type AbilityDefinition = z.infer<typeof AbilityDefinitionSchema>;
