import type { PlayerId, WorldEvent } from '@ninjarena/core';

// Le joueur local voit ses propres actions dès la prédiction: la copie serveur ferait double effet.
export function routeEvents(
  local: readonly WorldEvent[],
  server: readonly WorldEvent[],
  localPlayerId: PlayerId,
): WorldEvent[] {
  const routed: WorldEvent[] = [];
  for (const event of local) {
    if (isOwnPrediction(event, localPlayerId)) routed.push(event);
  }
  for (const event of server) {
    if (!isOwnPrediction(event, localPlayerId)) routed.push(event);
  }
  return routed;
}

function isOwnPrediction(event: WorldEvent, localPlayerId: PlayerId): boolean {
  switch (event.type) {
    case 'abilityCast':
    case 'abilityActivated':
    case 'teleported':
      return event.playerId === localPlayerId;
    case 'projectileSpawned':
    case 'zoneCreated':
    case 'obstacleSpawned':
      return event.ownerId === localPlayerId;
    default:
      return false;
  }
}
