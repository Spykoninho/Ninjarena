import type {
  AbilityDefinition,
  CharacterDefinition,
  MatchConfig,
  StatRulesDefinition,
} from '../definitions';
import type { LoadedMap } from '../map/loadedMap';
import { matchPostStep, matchPreStep, startMatch } from '../match/matchSystem';
import { spawnPositionFor } from '../match/spawns';
import type { Vec2 } from '../math/vec2';
import type { PlayerState } from '../player/state';
import { createPlayerState } from '../player/state';
import type { Build } from '../stats/build';
import { emptyBuild } from '../stats/build';
import type { SimulationConfig } from '../time/simulationConfig';
import { DEFAULT_SIMULATION_CONFIG } from '../time/simulationConfig';
import type { DefinitionCatalog } from './catalog';
import { clonePlain } from './clone';
import type { SimulationContext } from './context';
import { createSimulationContext } from './context';
import type { WorldEvent } from './events';
import type { PlayerId, TeamId } from './ids';
import type { PlayerInput, PlayerInputs } from './input';
import { neutralInput, sanitizePlayerInput } from './input';
import { abilitySystem } from './systems/abilitySystem';
import { dashContactSystem } from './systems/dashContactSystem';
import { movementSystem } from './systems/movementSystem';
import { obstacleSystem } from './systems/obstacleSystem';
import { pendingEffectSystem } from './systems/pendingEffectSystem';
import { playerStateSystem } from './systems/playerStateSystem';
import { projectileSystem } from './systems/projectileSystem';
import type { WorldState } from './world';
import { createWorldState, playersOf } from './world';

export interface GameSimulationOptions {
  map: LoadedMap;
  abilities: DefinitionCatalog<AbilityDefinition>;
  characters: DefinitionCatalog<CharacterDefinition>;
  matchConfig: MatchConfig;
  rules: StatRulesDefinition;
  config?: SimulationConfig;
}

export interface AddPlayerParams {
  id: PlayerId;
  teamId: TeamId;
  characterId: string;
  build?: Build;
  basicAttackId?: string;
  techniqueIds?: readonly string[];
  position?: Vec2;
}

export class GameSimulation {
  private worldState: WorldState;
  private pendingEvents: WorldEvent[] = [];
  private readonly loadedMap: LoadedMap;
  private readonly abilityCatalog: DefinitionCatalog<AbilityDefinition>;
  private readonly characterCatalog: DefinitionCatalog<CharacterDefinition>;
  private readonly match: MatchConfig;
  private readonly statRules: StatRulesDefinition;
  private readonly simulationConfig: SimulationConfig;

  constructor(options: GameSimulationOptions) {
    this.worldState = createWorldState();
    this.loadedMap = options.map;
    this.abilityCatalog = options.abilities;
    this.characterCatalog = options.characters;
    this.match = options.matchConfig;
    this.statRules = options.rules;
    this.simulationConfig = options.config ?? DEFAULT_SIMULATION_CONFIG;
  }

  get world(): WorldState {
    return this.worldState;
  }

  get config(): SimulationConfig {
    return this.simulationConfig;
  }

  get matchConfig(): MatchConfig {
    return this.match;
  }

  get map(): LoadedMap {
    return this.loadedMap;
  }

  get rules(): StatRulesDefinition {
    return this.statRules;
  }

  addPlayer(params: AddPlayerParams): PlayerState {
    const character = this.characterCatalog.get(params.characterId);
    const player = createPlayerState({
      id: params.id,
      teamId: params.teamId,
      character,
      position: params.position ?? { x: 0, y: 0 },
      build: params.build ?? emptyBuild(),
      // L'ordre des slots est figé: attaque de base, esquive, puis les techniques choisies.
      abilityIds: [
        params.basicAttackId ?? character.basicAttackId,
        character.dashId,
        ...(params.techniqueIds ?? []),
      ],
      rules: this.statRules,
    });
    if (params.position === undefined) {
      player.position = spawnPositionFor(this.loadedMap, this.match, player, this.worldState);
    }
    this.worldState.players[params.id] = player;
    return player;
  }

  removePlayer(id: PlayerId): void {
    delete this.worldState.players[id];
  }

  startMatch(): void {
    const ctx = this.createContext();
    startMatch(ctx);
    this.pendingEvents.push(...ctx.events);
  }

  step(inputs: PlayerInputs): WorldEvent[] {
    const ctx = this.createContext();
    ctx.events.push(...this.pendingEvents);
    this.pendingEvents = [];
    const gameplayActive = matchPreStep(ctx);
    const effective = gameplayActive
      ? withNeutralForMissing(ctx.world, inputs)
      : neutralizeGameplay(ctx.world, inputs);
    playerStateSystem(ctx);
    abilitySystem(ctx, effective);
    movementSystem(ctx, effective);
    dashContactSystem(ctx);
    projectileSystem(ctx);
    pendingEffectSystem(ctx);
    obstacleSystem(ctx);
    matchPostStep(ctx);
    this.worldState.tick += 1;
    return ctx.events;
  }

  snapshot(): WorldState {
    return clonePlain(this.worldState);
  }

  restore(state: WorldState): void {
    this.worldState = clonePlain(state);
  }

  private createContext(): SimulationContext {
    return createSimulationContext({
      world: this.worldState,
      map: this.loadedMap,
      abilities: this.abilityCatalog,
      characters: this.characterCatalog,
      config: this.simulationConfig,
      matchConfig: this.match,
      rules: this.statRules,
    });
  }
}

function withNeutralForMissing(world: WorldState, inputs: PlayerInputs): PlayerInputs {
  const resolved: Record<PlayerId, PlayerInput> = {};
  for (const player of playersOf(world)) {
    const raw = inputs[player.id];
    resolved[player.id] = raw === undefined ? neutralInput() : sanitizePlayerInput(raw);
  }
  return resolved;
}

function neutralizeGameplay(world: WorldState, inputs: PlayerInputs): PlayerInputs {
  const resolved: Record<PlayerId, PlayerInput> = {};
  for (const [id, input] of Object.entries(withNeutralForMissing(world, inputs))) {
    // Hors gameplay on garde la visée: les joueurs peuvent regarder autour d'eux sans agir.
    resolved[id] = { move: { x: 0, y: 0 }, aim: input.aim, abilityHeld: 0 };
  }
  return resolved;
}
