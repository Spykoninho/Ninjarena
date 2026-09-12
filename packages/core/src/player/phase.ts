import type { EffectRef } from '../abilities/effectRef';
import type { Vec2 } from '../math/vec2';
import type { PlayerId, Tick } from '../simulation/ids';

export interface DashContact {
  source: EffectRef;
  hitPlayerIds: PlayerId[];
}

export type CombatPhaseState =
  | { kind: 'NORMAL' }
  | {
      kind: 'CASTING';
      slot: number;
      abilityId: string;
      startedAt: Tick;
      activatesAt: Tick;
      activeUntil: Tick;
      endsAt: Tick;
      activated: boolean;
    }
  | { kind: 'DASHING'; direction: Vec2; speed: number; endsAt: Tick; contact?: DashContact }
  | { kind: 'STUNNED'; endsAt: Tick }
  | { kind: 'KNOCKBACK'; velocity: Vec2; endsAt: Tick }
  | { kind: 'DEAD'; diedAt: Tick };

export type CombatPhaseKind = CombatPhaseState['kind'];

export function normalPhase(): CombatPhaseState {
  return { kind: 'NORMAL' };
}

export function phaseEndsAt(phase: CombatPhaseState): Tick | null {
  switch (phase.kind) {
    case 'NORMAL':
    case 'DEAD':
      return null;
    default:
      return phase.endsAt;
  }
}
