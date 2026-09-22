import type { Loadout } from '../abilities/loadout';
import { loadoutAbilityIds } from '../abilities/loadout';
import type {
  AbilityDefinition,
  CharacterDefinition,
  MatchConfig,
  StatRulesDefinition,
} from '../definitions';
import type { LoadedMap } from '../map/loadedMap';
import { matchPostStep, matchPreStep, startMatch } from '../match/matchSystem';
import { respawnPlayer } from '../match/reset';
import { mapForRound } from '../match/roundMap';
import { spawnPositionFor } from '../match/spawns';
import type { Vec2 } from '../math/vec2';
import type { PlayerState } from '../player/state';
import { createPlayerState } from '../player/state';
import type { Build } from '../stats/build';
import { emptyBuild } from '../stats/build';
import { computeStats } from '../stats/formulas';
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
  // Une carte par manche, dans l'ordre; une seule carte sert à toutes les manches.
  maps: readonly LoadedMap[];
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
  private readonly loadedMaps: readonly LoadedMap[];
  private readonly abilityCatalog: DefinitionCatalog<AbilityDefinition>;
  private readonly characterCatalog: DefinitionCatalog<CharacterDefinition>;
  private readonly match: MatchConfig;
  private readonly statRules: StatRulesDefinition;
  private readonly simulationConfig: SimulationConfig;

  constructor(options: GameSimulationOptions) {
    this.worldState = createWorldState();
    if (options.maps.length === 0) throw new Error('a simulation needs at least one map');
    this.loadedMaps = options.maps;
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

  get maps(): readonly LoadedMap[] {
    return this.loadedMaps;
  }

  // La carte de la manche en cours.
  get map(): LoadedMap {
    return mapForRound(this.loadedMaps, this.worldState.match.round);
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
      abilityIds: loadoutAbilityIds(character, {
        basicAttackId: params.basicAttackId ?? character.basicAttackId,
        techniqueIds: params.techniqueIds ?? [],
      }),
      rules: this.statRules,
    });
    if (params.position === undefined) {
      player.position = spawnPositionFor(this.map, this.match, player, this.worldState);
    }
    this.worldState.players[params.id] = player;
    return player;
  }

  // Change l'équipement d'un joueur en plein match: un vivant repart sur place comme à une renaissance.
  equipPlayer(id: PlayerId, loadout: Loadout): void {
    const player = this.worldState.players[id];
    if (player === undefined) return;
    const character = this.characterCatalog.get(player.characterId);
    player.build = { ...loadout.build };
    player.abilities = loadoutAbilityIds(character, loadout).map((abilityId) => ({
      abilityId,
      readyAt: 0,
    }));
    player.stats = computeStats(character.baseStats, player.build, this.statRules);
    // Un mort ne revient pas en se rééquipant: il attend la manche suivante comme les autres.
    if (player.phase.kind === 'DEAD') return;
    const ctx = this.createContext();
    respawnPlayer(ctx, player, player.position);
    this.pendingEvents.push(...ctx.events);
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
      maps: this.loadedMaps,
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
