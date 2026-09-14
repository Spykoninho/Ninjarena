import type {
  AbilityDefinition,
  AbilitySlot,
  AttributeId,
  Build,
  DefinitionCatalog,
  MatchState,
  PlayerState,
} from '@ninjarena/core';
import { abilityFamily } from '../rendering/art/abilityVisual';
import { skinIndex, teamCodes } from '../rendering/art/presentation';
import { ATTRIBUTE_IDS, getStatus } from '@ninjarena/core';
import type { InputBindings } from '../input/bindings';
import { bindingLabel } from '../input/bindings';
import type { HudAbilityBlock, HudAbilityView, HudView } from '../ui/hud';

export interface HudViewInput {
  localPlayer: PlayerState | undefined;
  abilities: DefinitionCatalog<AbilityDefinition>;
  bindings: InputBindings;
  match: MatchState | null;
  tick: number;
  tickDurationMs: number;
  status: string;
  rttMs: number | null;
  spectating: string | null;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const CONTROLLED_PHASES = ['STUNNED', 'DEAD', 'CASTING', 'DASHING', 'KNOCKBACK'];

const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  vitality: 'VIT',
  strength: 'STR',
  power: 'POW',
  speed: 'SPD',
  maxChakra: 'CHK',
  chakraRegen: 'REG',
  defense: 'DEF',
};

export function buildHudView(input: HudViewInput): HudView {
  const local = input.localPlayer;
  return {
    health: local?.health ?? 0,
    maxHealth: local?.stats.maxHealth ?? 0,
    chakra: local?.chakra ?? 0,
    maxChakra: local?.stats.maxChakra ?? 0,
    // La magnitude d'un bouclier est l'absorption qui lui reste.
    shield: local === undefined ? 0 : (getStatus(local, 'SHIELDED')?.magnitude ?? 0),
    abilities:
      local === undefined ? [] : local.abilities.map((slot, i) => abilityView(input, slot, i)),
    // L'état de match affiché vient du serveur: la prédiction locale ne décide pas des phases.
    matchPhase: input.match?.phase ?? 'WAITING',
    round: input.match?.round ?? 0,
    scores: input.match?.scores ?? {},
    roundTimer: roundTimer(input),
    buildSummary: local === undefined ? '' : buildSummary(local.build),
    status: input.status,
    rttMs: input.rttMs,
    spectating: input.spectating,
    teamId: local?.teamId ?? null,
    teamCode: teamCode(local, input.match),
    skin: local === undefined ? 0 : skinIndex(local.id),
  };
}

// Le code d'équipe du HUD vient de la liste des équipes du match, comme celui des marqueurs du sol.
function teamCode(local: PlayerState | undefined, match: MatchState | null): number {
  if (local === undefined) return 0;
  const ids = Object.keys(match?.scores ?? {});
  return teamCodes(ids.length > 0 ? ids : [local.teamId]).get(local.teamId) ?? 0;
}

function abilityView(input: HudViewInput, slot: AbilitySlot, index: number): HudAbilityView {
  const ability = input.abilities.get(slot.abilityId);
  const binding = input.bindings.abilities[index];
  const reason = abilityBlock(input, ability.chakraCost);
  return {
    name: ability.name,
    family: abilityFamily(ability),
    available: reason === null,
    reason,
    binding: binding === undefined ? '' : bindingLabel(binding),
    chakraCost: ability.chakraCost,
    remainingMs: Math.max(0, (slot.readyAt - input.tick) * input.tickDurationMs),
    cooldownMs: ability.cooldownMs,
  };
}

// Un état de contrôle bloque toutes les touches: il prime sur le manque de chakra d'une seule.
function abilityBlock(input: HudViewInput, chakraCost: number): HudAbilityBlock | null {
  if (CONTROLLED_PHASES.includes(input.localPlayer?.phase.kind ?? 'DEAD')) return 'control';
  return (input.localPlayer?.chakra ?? 0) < chakraCost ? 'chakra' : null;
}

function roundTimer(input: HudViewInput): string | null {
  const match = input.match;
  if (match === null || match.phase !== 'IN_ROUND' || match.phaseEndsAt === null) return null;
  const remainingMs = Math.max(0, (match.phaseEndsAt - input.tick) * input.tickDurationMs);
  // L'arrondi précède le plafond: un tick fractionnaire ne doit pas ajouter une seconde entière.
  const seconds = Math.ceil(Math.round(remainingMs) / MS_PER_SECOND);
  return `${pad(Math.floor(seconds / SECONDS_PER_MINUTE))}:${pad(seconds % SECONDS_PER_MINUTE)}`;
}

function buildSummary(build: Build): string {
  return ATTRIBUTE_IDS.map((id) => `${ATTRIBUTE_LABELS[id]} ${build[id]}`).join(' · ');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
