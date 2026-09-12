import type {
  AbilityDefinition,
  CharacterDefinition,
  MatchConfig,
  StatRulesDefinition,
} from '../definitions';
import {
  AbilityDefinitionSchema,
  CharacterDefinitionSchema,
  MapDefinitionSchema,
  MatchConfigSchema,
  StatRulesDefinitionSchema,
  TilesetDefinitionSchema,
} from '../definitions';
import { LoadedMap } from '../map/loadedMap';
import type { PlayerState } from '../player/state';
import { DefinitionCatalog } from '../simulation/catalog';
import type { SimulationContext } from '../simulation/context';
import { createSimulationContext } from '../simulation/context';
import type { AddPlayerParams } from '../simulation/gameSimulation';
import { GameSimulation } from '../simulation/gameSimulation';

const TILESET = TilesetDefinitionSchema.parse({
  id: 'test',
  tileSize: 16,
  tiles: {
    0: { name: 'ground', color: '#404040' },
    1: { name: 'wall', solid: true, color: '#202020' },
    2: { name: 'water', speedMultiplier: 0.5, tags: ['water'], color: '#3060a0' },
    3: { name: 'grass', tags: ['grass'], color: '#40a040' },
  },
});

const MAP = MapDefinitionSchema.parse({
  id: 'test-arena',
  name: 'Test Arena',
  tileset: 'test',
  width: 30,
  height: 15,
  legend: { '.': 0, '#': 1, '~': 2, ',': 3 },
  layers: {
    ground: [
      '##############################',
      '#............................#',
      '#............................#',
      '#.........#..................#',
      '#.........#..................#',
      '#.........#..................#',
      '#.........#..................#',
      '#.........#..................#',
      '#.........#..................#',
      '#............................#',
      '#..~~~~......................#',
      '#..~~~~......................#',
      '#..~~~~......................#',
      '#............................#',
      '##############################',
    ],
    objects: [
      '                              ',
      '                              ',
      '                              ',
      '                              ',
      '                    ,,,,      ',
      '                    ,,,,      ',
      '                              ',
      '                              ',
      '                              ',
      '                              ',
      '                              ',
      '                              ',
      '                              ',
      '                              ',
      '                              ',
    ],
  },
  spawns: [
    { x: 48, y: 120, team: 0 },
    { x: 432, y: 120, team: 1 },
    { x: 240, y: 40 },
    { x: 240, y: 200 },
  ],
});

export function createTestMap(): LoadedMap {
  return LoadedMap.fromDefinitions(MAP, TILESET);
}

export const TEST_ABILITIES: readonly AbilityDefinition[] = [
  AbilityDefinitionSchema.parse({
    id: 'slash',
    name: 'Slash',
    kind: 'basic',
    cooldownMs: 500,
    chakraCost: 5,
    startupMs: 100,
    recoveryMs: 100,
    effects: [
      {
        type: 'melee',
        range: 24,
        arcDegrees: 120,
        onHit: [
          { type: 'damage', amount: 30, scaling: 'physical' },
          { type: 'knockback', speed: 200, durationMs: 100 },
        ],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'dash',
    name: 'Dash',
    kind: 'dash',
    cooldownMs: 3000,
    chakraCost: 20,
    startupMs: 0,
    recoveryMs: 0,
    effects: [{ type: 'dash', distance: 64, durationMs: 100 }],
  }),
  AbilityDefinitionSchema.parse({
    id: 'shuriken',
    name: 'Shuriken',
    kind: 'technique',
    cooldownMs: 900,
    chakraCost: 10,
    startupMs: 100,
    recoveryMs: 150,
    effects: [
      {
        type: 'projectile',
        speed: 420,
        radius: 3,
        lifetimeMs: 900,
        visual: { color: '#d0d0d0', size: 3 },
        onHit: [{ type: 'damage', amount: 18 }],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'seal',
    name: 'Seal',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 10,
    startupMs: 0,
    recoveryMs: 0,
    effects: [
      {
        type: 'projectile',
        speed: 300,
        radius: 4,
        lifetimeMs: 1000,
        visual: { color: '#b58cff', size: 4 },
        onHit: [
          { type: 'stun', durationMs: 500 },
          { type: 'applyStatus', status: 'SLOWED', durationMs: 1000, magnitude: 0.5 },
        ],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'spark-dash',
    name: 'Spark Dash',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 0,
    startupMs: 0,
    recoveryMs: 0,
    effects: [
      {
        type: 'dash',
        distance: 64,
        durationMs: 100,
        onContact: [{ type: 'damage', amount: 10 }],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'blink',
    name: 'Blink',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 0,
    startupMs: 0,
    recoveryMs: 0,
    effects: [{ type: 'teleport', distance: 80 }],
  }),
  AbilityDefinitionSchema.parse({
    id: 'chakra-shield-test',
    name: 'Chakra Shield',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 0,
    startupMs: 0,
    recoveryMs: 0,
    effects: [{ type: 'shield', amount: 25, durationMs: 2000 }],
  }),
  AbilityDefinitionSchema.parse({
    id: 'quake',
    name: 'Quake',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 0,
    startupMs: 0,
    recoveryMs: 0,
    effects: [
      {
        type: 'area',
        origin: 'aim',
        range: 64,
        radius: 30,
        delayMs: 500,
        visual: { color: '#c9a26b', size: 30 },
        onHit: [{ type: 'damage', amount: 20, scaling: 'technique' }],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'quake-water',
    name: 'Quake (Water)',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 0,
    startupMs: 0,
    recoveryMs: 0,
    effects: [
      {
        type: 'area',
        origin: 'aim',
        range: 64,
        radius: 30,
        delayMs: 500,
        visual: { color: '#c9a26b', size: 30 },
        onHit: [{ type: 'damage', amount: 20, scaling: 'technique' }],
        terrain: [{ tag: 'water', radiusMultiplier: 2 }],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'boom',
    name: 'Boom',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 0,
    startupMs: 0,
    recoveryMs: 0,
    effects: [
      {
        type: 'projectile',
        speed: 300,
        radius: 3,
        lifetimeMs: 1000,
        visual: { color: '#ff6a3d', size: 3 },
        onHit: [
          { type: 'damage', amount: 10 },
          {
            type: 'area',
            radius: 24,
            origin: 'here',
            visual: { color: '#ff9a3d', size: 24 },
            onHit: [{ type: 'damage', amount: 5 }],
          },
        ],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'fuse',
    name: 'Fuse',
    kind: 'technique',
    cooldownMs: 1000,
    chakraCost: 0,
    startupMs: 0,
    recoveryMs: 0,
    effects: [
      {
        type: 'delayedTrigger',
        delayMs: 500,
        effects: [
          {
            type: 'area',
            radius: 24,
            origin: 'here',
            visual: { color: '#ff9a3d', size: 24 },
            onHit: [{ type: 'damage', amount: 15 }],
          },
        ],
      },
    ],
  }),
];

const RANGE = { min: 0, max: 5 };

export const TEST_RULES: StatRulesDefinition = StatRulesDefinitionSchema.parse({
  defaultPointBudget: 10,
  attributes: {
    vitality: RANGE,
    strength: RANGE,
    power: RANGE,
    speed: RANGE,
    maxChakra: RANGE,
    chakraRegen: RANGE,
    defense: RANGE,
  },
  coefficients: {
    healthPerVitality: 12,
    physicalDamagePerStrength: 0.06,
    techniqueDamagePerPower: 0.06,
    moveSpeedPerSpeed: 0.03,
    chakraPerPoint: 10,
    chakraRegenPerPoint: 1,
    defensePerPoint: 8,
  },
  techniqueSlots: 3,
});

export const NINJA: CharacterDefinition = CharacterDefinitionSchema.parse({
  id: 'ninja',
  name: 'Ninja',
  baseStats: {
    maxHealth: 100,
    maxChakra: 100,
    chakraRegenPerSecond: 8,
    moveSpeed: 140,
    colliderRadius: 5,
  },
  basicAttackId: 'slash',
  dashId: 'dash',
});

export const DUEL_CONFIG: MatchConfig = MatchConfigSchema.parse({
  id: 'duel',
  mode: 'team',
  teamCount: 2,
  playersPerTeam: 1,
  roundsToWin: 2,
  roundDurationMs: 60000,
  countdownMs: 0,
  roundEndDelayMs: 0,
  friendlyFire: false,
});

const ABILITY_CATALOG = new DefinitionCatalog(TEST_ABILITIES);
const CHARACTER_CATALOG = new DefinitionCatalog([NINJA]);

export function createTestSimulation(overrides?: {
  matchConfig?: Partial<MatchConfig>;
}): GameSimulation {
  return new GameSimulation({
    map: createTestMap(),
    abilities: ABILITY_CATALOG,
    characters: CHARACTER_CATALOG,
    matchConfig: MatchConfigSchema.parse({ ...DUEL_CONFIG, ...overrides?.matchConfig }),
    rules: TEST_RULES,
  });
}

// Les tests d'abilités veulent les cinq slots: 0 slash, 1 dash, 2 shuriken, 3 seal, 4 blink.
export function addTestPlayer(sim: GameSimulation, params: AddPlayerParams): PlayerState {
  return sim.addPlayer({ techniqueIds: ['shuriken', 'seal', 'blink'], ...params });
}

export function contextOf(sim: GameSimulation): SimulationContext {
  return createSimulationContext({
    world: sim.world,
    map: sim.map,
    abilities: ABILITY_CATALOG,
    characters: CHARACTER_CATALOG,
    config: sim.config,
    matchConfig: sim.matchConfig,
    rules: sim.rules,
  });
}
