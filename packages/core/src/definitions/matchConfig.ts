import { z } from 'zod';

export const MatchConfigSchema = z
  .object({
    id: z.string().min(1),
    mode: z.enum(['ffa', 'team']),
    teamCount: z.number().int().min(1),
    playersPerTeam: z.number().int().min(1),
    roundsToWin: z.number().int().min(1),
    roundDurationMs: z.number().positive(),
    countdownMs: z.number().nonnegative(),
    roundEndDelayMs: z.number().nonnegative(),
    friendlyFire: z.boolean().default(false),
    buildPoints: z.number().int().nonnegative().optional(),
    // Un entraînement n'a pas de chronomètre: la manche dure tant que le joueur reste.
    practice: z.boolean().default(false),
  })
  .refine((c) => c.mode === 'team' || c.playersPerTeam === 1, {
    message: 'ffa uses one player per team',
  });

export type MatchConfig = z.infer<typeof MatchConfigSchema>;

export function maxPlayers(config: MatchConfig): number {
  return config.teamCount * config.playersPerTeam;
}
