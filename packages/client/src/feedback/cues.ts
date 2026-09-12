import type {
  AbilityDefinition,
  DamageScaling,
  DefinitionCatalog,
  PlayerId,
  Vec2,
  WorldEvent,
} from '@ninjarena/core';

// Une gerbe ancrée sur un joueur suit le corps dessiné, en retard sur le monde prédit.
export type VisualCue =
  | { kind: 'hitFlash'; playerId: PlayerId }
  | { kind: 'impact'; position: Vec2; color: string; size: number }
  | { kind: 'playerImpact'; playerId: PlayerId; color: string; size: number }
  | { kind: 'burst'; position: Vec2; color: string; count: number }
  | { kind: 'playerBurst'; playerId: PlayerId; color: string; count: number }
  | { kind: 'dashTrail'; playerId: PlayerId }
  | { kind: 'damageNumber'; position: Vec2; amount: number }
  | { kind: 'playerDamageNumber'; playerId: PlayerId; amount: number }
  | { kind: 'castFlash'; playerId: PlayerId; color: string };

export interface FeedbackCue {
  visual: VisualCue[];
  audio: string | null;
  shake: number;
  hitStopMs: number;
}

export interface FeedbackView {
  localPlayerId: PlayerId;
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

// La vue donne au mapping les seules données dont il a besoin: le joueur local et une couleur.
export function feedbackView(
  localPlayerId: PlayerId,
  abilities: DefinitionCatalog<AbilityDefinition>,
): FeedbackView {
  return {
    localPlayerId,
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
          { kind: 'playerDamageNumber', playerId: event.targetId, amount: event.amount },
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
        visual: [
          {
            kind: 'playerBurst',
            playerId: event.playerId,
            color: NEUTRAL_COLOR,
            count: DEATH_PARTICLES,
          },
        ],
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
          {
            kind: 'playerImpact',
            playerId: event.targetId,
            color: NEUTRAL_COLOR,
            size: IMPACT_SIZE,
          },
        ],
        audio: 'impact',
      });
    case 'obstacleSpawned':
      return cue({
        visual: [
          {
            kind: 'impact',
            position: event.position,
            color: NEUTRAL_COLOR,
            size: OBSTACLE_IMPACT_SIZE,
          },
        ],
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

function colorOf(abilities: DefinitionCatalog<AbilityDefinition>, abilityId: string): string {
  if (!abilities.has(abilityId)) return NEUTRAL_COLOR;
  return abilities.get(abilityId).telegraph?.color ?? NEUTRAL_COLOR;
}
