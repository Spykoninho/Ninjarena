import type { PlayerId, WorldState } from '@ninjarena/core';
import { nextSpectateTarget, spectatorCandidates } from './spectator';

// Suit la cible de spectateur d'une image à l'autre; reste `null` tant que le joueur local est en vie.
// Un pur spectateur (tournoi) n'a pas de joueur dans le monde: il suit quelqu'un dès le début.
export class SpectatorController {
  private target: PlayerId | null = null;

  get current(): PlayerId | null {
    return this.target;
  }

  update(
    world: WorldState | null,
    localPlayerId: PlayerId,
    isFfa: boolean,
    cyclePressed: boolean,
    spectator = false,
  ): PlayerId | null {
    const local = world?.players[localPlayerId];
    const spectating =
      world !== null &&
      (spectator
        ? local === undefined
        : local !== undefined && local.phase.kind === 'DEAD' && world.match.phase === 'IN_ROUND');
    if (!spectating) {
      this.target = null;
      return null;
    }
    const candidates = spectatorCandidates(world, localPlayerId, isFfa);
    this.target = nextSpectateTarget(candidates, this.target, cyclePressed);
    return this.target;
  }

  reset(): void {
    this.target = null;
  }
}
