import type {
  AbilityDefinition,
  DamageScaling,
  DefinitionCatalog,
  PlayerId,
  Vec2,
  WorldEvent,
  WorldState,
} from '@ninjarena/core';

export type VisualCue =
  | { kind: 'hitFlash'; playerId: PlayerId }
  | { kind: 'impact'; position: Vec2; color: string; size: number }
  | { kind: 'burst'; position: Vec2; color: string; count: number }
  | { kind: 'dashTrail'; playerId: PlayerId }
  | { kind: 'damageNumber'; position: Vec2; amount: number }
  | { kind: 'castFlash'; playerId: PlayerId; color: string };

export interface FeedbackCue {
  visual: VisualCue[];
  audio: string | null;
  shake: number;
  hitStopMs: number;
}

export interface FeedbackView {
  localPlayerId: PlayerId;
  positionOf(id: PlayerId): Vec2 | null;
  abilityColor(abilityId: string): string;
}

const NEUTRAL_COLOR = '#ffffff';
const HIT_SHAKE = 2;
const DEATH_SHAKE = 4;
const MELEE_HIT_STOP_MS = 40;
const MELEE_SCALING: DamageScaling = 'physical';
const IMPACT_SIZE = 5;
const OBSTACLE_IMPACT_SIZE = 8;
const DEATH_PARTICLES = 18;
const TELEPORT_PARTICLES = 10;
const ZONE_PARTICLES = 14;
const AREA_PARTICLES = 12;

// La vue donne au mapping les seules données de monde dont il a besoin: position et couleur.
export function feedbackView(
  world: WorldState,
  localPlayerId: PlayerId,
  abilities: DefinitionCatalog<AbilityDefinition>,
): FeedbackView {
  return {
    localPlayerId,
    positionOf: (id) => {
      const player = world.players[id];
      return player === undefined ? null : { ...player.position };
    },
    abilityColor: (abilityId) => colorOf(abilities, abilityId),
  };
}

export function cuesForEvent(event: WorldEvent, view: FeedbackView): FeedbackCue {
  switch (event.type) {
    case 'abilityActivated':
      return cue({
        visual: [
          {
            kind: 'castFlash',
            playerId: event.playerId,
            color: view.abilityColor(event.abilityId),
          },
        ],
        audio: 'ability',
      });
    case 'damageDealt':
      return cue({
        visual: [
          { kind: 'hitFlash', playerId: event.targetId },
          { kind: 'damageNumber', position: event.position, amount: event.amount },
        ],
        audio: 'hit',
        shake: involvesLocal(event.targetId, event.sourceId, view) ? HIT_SHAKE : 0,
        // Seul un coup de base du joueur local mérite le gel: les techniques restent fluides.
        hitStopMs:
          event.sourceId === view.localPlayerId && event.scaling === MELEE_SCALING
            ? MELEE_HIT_STOP_MS
            : 0,
      });
    case 'playerDied':
      return cue({
        visual: burstAt(view.positionOf(event.playerId), NEUTRAL_COLOR, DEATH_PARTICLES),
        audio: 'death',
        shake: DEATH_SHAKE,
      });
    case 'projectileDestroyed':
      if (event.reason === 'expired') return cue({});
      return cue({
        visual: [
          { kind: 'impact', position: event.position, color: NEUTRAL_COLOR, size: IMPACT_SIZE },
        ],
        audio: 'impact',
      });
    case 'areaResolved':
      return cue({
        visual: [
          {
            kind: 'impact',
            position: event.position,
            color: event.visual?.color ?? NEUTRAL_COLOR,
            size: event.radius,
          },
          {
            kind: 'burst',
            position: event.position,
            color: event.visual?.color ?? NEUTRAL_COLOR,
            count: AREA_PARTICLES,
          },
        ],
        audio: 'impact',
      });
    case 'zoneTriggered':
      return cue({
        visual: [
          { kind: 'burst', position: event.position, color: NEUTRAL_COLOR, count: ZONE_PARTICLES },
        ],
        audio: 'impact',
      });
    case 'teleported':
      return cue({
        visual: [
          { kind: 'burst', position: event.from, color: NEUTRAL_COLOR, count: TELEPORT_PARTICLES },
          { kind: 'burst', position: event.to, color: NEUTRAL_COLOR, count: TELEPORT_PARTICLES },
        ],
        audio: 'dash',
      });
    case 'dashContact':
      return cue({
        visual: [
          { kind: 'dashTrail', playerId: event.playerId },
          ...impactAt(view.positionOf(event.targetId), NEUTRAL_COLOR, IMPACT_SIZE),
        ],
        audio: 'impact',
      });
    case 'obstacleSpawned':
      return cue({
        visual: impactAt(view.positionOf(event.ownerId), NEUTRAL_COLOR, OBSTACLE_IMPACT_SIZE),
        audio: 'impact',
      });
    case 'roundStarted':
      return cue({ audio: 'round-start' });
    case 'roundEnded':
    case 'matchEnded':
      return cue({ audio: 'round-end' });
    default:
      return cue({});
  }
}

function cue(partial: Partial<FeedbackCue>): FeedbackCue {
  return {
    visual: partial.visual ?? [],
    audio: partial.audio ?? null,
    shake: partial.shake ?? 0,
    hitStopMs: partial.hitStopMs ?? 0,
  };
}

function involvesLocal(targetId: PlayerId, sourceId: PlayerId | null, view: FeedbackView): boolean {
  return targetId === view.localPlayerId || sourceId === view.localPlayerId;
}

function burstAt(position: Vec2 | null, color: string, count: number): VisualCue[] {
  return position === null ? [] : [{ kind: 'burst', position, color, count }];
}

function impactAt(position: Vec2 | null, color: string, size: number): VisualCue[] {
  return position === null ? [] : [{ kind: 'impact', position, color, size }];
}

function colorOf(abilities: DefinitionCatalog<AbilityDefinition>, abilityId: string): string {
  if (!abilities.has(abilityId)) return NEUTRAL_COLOR;
  return abilities.get(abilityId).telegraph?.color ?? NEUTRAL_COLOR;
}
