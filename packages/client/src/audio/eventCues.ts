import type { WorldEvent } from '@ninjarena/core';

export function cueForEvent(event: WorldEvent): string | null {
  switch (event.type) {
    case 'abilityActivated':
      return 'ability';
    case 'damageDealt':
      return 'hit';
    case 'playerDied':
      return 'death';
    case 'roundStarted':
      return 'round-start';
    case 'roundEnded':
    case 'matchEnded':
      return 'round-end';
    default:
      return null;
  }
}
