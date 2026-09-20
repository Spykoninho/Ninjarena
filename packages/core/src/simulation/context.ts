import type {
  AbilityDefinition,
  CharacterDefinition,
  MatchConfig,
  StatRulesDefinition,
} from '../definitions';
import type { LoadedMap } from '../map/loadedMap';
import { mapForRound } from '../match/roundMap';
import type { SimulationConfig } from '../time/simulationConfig';
import { msToTicks, secondsPerTick } from '../time/simulationConfig';
import type { DefinitionCatalog } from './catalog';
import type { WorldEvent } from './events';
import type { Tick } from './ids';
import type { WorldState } from './world';

export interface SimulationContext {
  readonly world: WorldState;
  readonly maps: readonly LoadedMap[];
  // La carte de la manche en cours: elle change dès que `world.match.round` avance.
  readonly map: LoadedMap;
  readonly abilities: DefinitionCatalog<AbilityDefinition>;
  readonly characters: DefinitionCatalog<CharacterDefinition>;
  readonly config: SimulationConfig;
  readonly matchConfig: MatchConfig;
  readonly rules: StatRulesDefinition;
  readonly events: WorldEvent[];
  readonly now: Tick;
  readonly dt: number;
  ticks(ms: number): number;
}

export function createSimulationContext(
  deps: Omit<SimulationContext, 'events' | 'now' | 'dt' | 'ticks' | 'map'>,
): SimulationContext {
  const config = deps.config;
  return {
    world: deps.world,
    maps: deps.maps,
    get map(): LoadedMap {
      return mapForRound(deps.maps, deps.world.match.round);
    },
    abilities: deps.abilities,
    characters: deps.characters,
    config,
    matchConfig: deps.matchConfig,
    rules: deps.rules,
    events: [],
    now: deps.world.tick,
    dt: secondsPerTick(config),
    ticks: (ms: number) => msToTicks(ms, config),
  };
}
