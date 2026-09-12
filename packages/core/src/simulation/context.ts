import type {
  AbilityDefinition,
  CharacterDefinition,
  MatchConfig,
  StatRulesDefinition,
} from '../definitions';
import type { LoadedMap } from '../map/loadedMap';
import type { SimulationConfig } from '../time/simulationConfig';
import { msToTicks, secondsPerTick } from '../time/simulationConfig';
import type { DefinitionCatalog } from './catalog';
import type { WorldEvent } from './events';
import type { Tick } from './ids';
import type { WorldState } from './world';

export interface SimulationContext {
  readonly world: WorldState;
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
  deps: Omit<SimulationContext, 'events' | 'now' | 'dt' | 'ticks'>,
): SimulationContext {
  const config = deps.config;
  return {
    world: deps.world,
    map: deps.map,
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
