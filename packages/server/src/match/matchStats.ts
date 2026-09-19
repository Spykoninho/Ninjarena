import type { PlayerId, WorldEvent } from '@ninjarena/core';

export interface PlayerStats {
  damageDealt: number;
  damageTaken: number;
  kills: number;
  deaths: number;
}

const EMPTY: PlayerStats = { damageDealt: 0, damageTaken: 0, kills: 0, deaths: 0 };

// Le bilan se cumule sur tout le match, manche après manche, à partir des événements de la simulation.
export class MatchStats {
  private readonly players = new Map<PlayerId, PlayerStats>();

  record(events: readonly WorldEvent[]): void {
    for (const event of events) {
      if (event.type === 'damageDealt') {
        this.of(event.targetId).damageTaken += event.amount;
        // Se blesser soi-même n'est pas un dégât infligé.
        if (event.sourceId !== null && event.sourceId !== event.targetId) {
          this.of(event.sourceId).damageDealt += event.amount;
        }
      } else if (event.type === 'playerDied') {
        this.of(event.playerId).deaths += 1;
        if (event.killerId !== null && event.killerId !== event.playerId) {
          this.of(event.killerId).kills += 1;
        }
      }
    }
  }

  statsOf(playerId: PlayerId): PlayerStats {
    return { ...(this.players.get(playerId) ?? EMPTY) };
  }

  private of(playerId: PlayerId): PlayerStats {
    let stats = this.players.get(playerId);
    if (stats === undefined) {
      stats = { ...EMPTY };
      this.players.set(playerId, stats);
    }
    return stats;
  }
}
