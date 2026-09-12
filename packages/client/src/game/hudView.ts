import type {
  AbilityDefinition,
  AbilitySlot,
  DefinitionCatalog,
  MatchState,
  PlayerState,
} from '@ninjarena/core';
import type { HudAbilityView, HudView } from '../ui/hud';

export interface HudViewInput {
  localPlayer: PlayerState | undefined;
  abilities: DefinitionCatalog<AbilityDefinition>;
  match: MatchState | null;
  tick: number;
  tickDurationMs: number;
  status: string;
  rttMs: number | null;
}

export function buildHudView(input: HudViewInput): HudView {
  const local = input.localPlayer;
  return {
    health: local?.health ?? 0,
    maxHealth: local?.stats.maxHealth ?? 0,
    chakra: local?.chakra ?? 0,
    maxChakra: local?.stats.maxChakra ?? 0,
    abilities: local === undefined ? [] : local.abilities.map((slot) => abilityView(input, slot)),
    // L'état de match affiché vient du serveur: la prédiction locale ne décide pas des phases.
    matchPhase: input.match?.phase ?? 'WAITING',
    round: input.match?.round ?? 0,
    scores: input.match?.scores ?? {},
    status: input.status,
    rttMs: input.rttMs,
  };
}

function abilityView(input: HudViewInput, slot: AbilitySlot): HudAbilityView {
  const ability = input.abilities.get(slot.abilityId);
  return {
    name: ability.name,
    remainingMs: Math.max(0, (slot.readyAt - input.tick) * input.tickDurationMs),
    cooldownMs: ability.cooldownMs,
  };
}
