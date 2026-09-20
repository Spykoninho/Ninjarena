import type {
  AbilityDefinition,
  DamageScaling,
  DefinitionCatalog,
  PlayerId,
  Vec2,
  WorldEvent,
} from '@ninjarena/core';

// Le chiffre de dégâts dit d'un coup d'oeil qui a frappé: mes coups, ceux que je prends, les autres.
export type DamageTone = 'dealt' | 'taken' | 'other' | 'heal';

// Une gerbe ancrée sur un joueur suit le corps dessiné, en retard sur le monde prédit.
export type VisualCue =
  | { kind: 'portal'; position: Vec2; arriving: boolean }
  | { kind: 'hitFlash'; playerId: PlayerId }
  | { kind: 'impact'; position: Vec2; color: string; size: number }
  | { kind: 'playerImpact'; playerId: PlayerId; color: string; size: number }
  | { kind: 'burst'; position: Vec2; color: string; count: number }
  | { kind: 'playerBurst'; playerId: PlayerId; color: string; count: number }
  | { kind: 'dashTrail'; playerId: PlayerId }
  | { kind: 'damageNumber'; position: Vec2; amount: number; tone: DamageTone }
  | { kind: 'playerDamageNumber'; playerId: PlayerId; amount: number; tone: DamageTone }
  | { kind: 'castFlash'; playerId: PlayerId; color: string }
  | { kind: 'column'; position: Vec2; color: string; radius: number }
  | { kind: 'playerPuff'; playerId: PlayerId; color: string };

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
const HEAL_PARTICLES = 10;
const HASTE_PARTICLES = 8;
const HEAL_COLOR = '#92d8b4';
const HASTE_COLOR = '#b8f0d8';
const SMOKE_COLOR = '#a7aa8b';

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
          {
            kind: 'playerDamageNumber',
            playerId: event.targetId,
            amount: event.amount,
            tone: damageTone(event.targetId, event.sourceId, view),
          },
        ],
        audio: 'hit',
        shake: involvesLocal(event.targetId, event.sourceId, view) ? HIT_SHAKE : 0,
        // Seul un coup de base du joueur local mérite le gel: les techniques restent fluides.
        hitStopMs:
          event.sourceId === view.localPlayerId && event.scaling === MELEE_SCALING
            ? MELEE_HIT_STOP_MS
            : 0,
      });
    case 'healed':
      return cue({
        visual: [
          {
            kind: 'playerBurst',
            playerId: event.targetId,
            color: HEAL_COLOR,
            count: HEAL_PARTICLES,
          },
          {
            kind: 'playerDamageNumber',
            playerId: event.targetId,
            amount: event.amount,
            tone: 'heal',
          },
        ],
        audio: 'ability',
      });
    case 'statusApplied':
      // Seuls les renforts s'annoncent: un ralentissement ou une entrave accompagne déjà un coup.
      if (event.status === 'INVISIBLE')
        return cue({
          visual: [{ kind: 'playerPuff', playerId: event.playerId, color: SMOKE_COLOR }],
          audio: 'dash',
        });
      if (event.status === 'HASTED')
        return cue({
          visual: [
            {
              kind: 'playerBurst',
              playerId: event.playerId,
              color: HASTE_COLOR,
              count: HASTE_PARTICLES,
            },
          ],
        });
      return cue({});
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
          ...(event.visual?.style === 'column'
            ? [
                {
                  kind: 'column' as const,
                  position: event.position,
                  color: event.visual.color,
                  radius: event.radius,
                },
              ]
            : []),
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
          { kind: 'portal', position: event.from, arriving: false },
          { kind: 'portal', position: event.to, arriving: true },
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

function damageTone(targetId: PlayerId, sourceId: PlayerId | null, view: FeedbackView): DamageTone {
  if (targetId === view.localPlayerId) return 'taken';
  return sourceId === view.localPlayerId ? 'dealt' : 'other';
}

function involvesLocal(targetId: PlayerId, sourceId: PlayerId | null, view: FeedbackView): boolean {
  return targetId === view.localPlayerId || sourceId === view.localPlayerId;
}

function colorOf(abilities: DefinitionCatalog<AbilityDefinition>, abilityId: string): string {
  if (!abilities.has(abilityId)) return NEUTRAL_COLOR;
  return abilities.get(abilityId).telegraph?.color ?? NEUTRAL_COLOR;
}
