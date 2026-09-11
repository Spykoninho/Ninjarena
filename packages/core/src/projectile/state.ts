import type { Vec2 } from '../math/vec2';
import type { EntityId, PlayerId, TeamId, Tick } from '../simulation/ids';

export interface ProjectileState {
  id: EntityId;
  ownerId: PlayerId;
  teamId: TeamId;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  expiresAt: Tick;
  source: { abilityId: string; effectIndex: number };
}
