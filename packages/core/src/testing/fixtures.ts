import type { AbilityDefinition, CharacterDefinition, MatchConfig } from '../definitions';
import {
  AbilityDefinitionSchema,
  CharacterDefinitionSchema,
  MapDefinitionSchema,
  MatchConfigSchema,
  TilesetDefinitionSchema,
} from '../definitions';
import { LoadedMap } from '../map/loadedMap';
import { DefinitionCatalog } from '../simulation/catalog';
import type { SimulationContext } from '../simulation/context';
import { createSimulationContext } from '../simulation/context';
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
    id: 'shuriken',
    name: 'Shuriken',
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
        onHit: [{ type: 'damage', amount: 18 }],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'slash',
    name: 'Slash',
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
          { type: 'damage', amount: 30 },
          { type: 'knockback', speed: 200, durationMs: 100 },
        ],
      },
    ],
  }),
  AbilityDefinitionSchema.parse({
    id: 'dash',
    name: 'Dash',
    cooldownMs: 3000,
    chakraCost: 20,
    startupMs: 0,
    recoveryMs: 0,
    effects: [{ type: 'dash', distance: 64, durationMs: 100 }],
  }),
  AbilityDefinitionSchema.parse({
    id: 'seal',
    name: 'Seal',
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
        onHit: [
          { type: 'stun', durationMs: 500 },
          { type: 'applyStatus', status: 'SLOWED', durationMs: 1000, magnitude: 0.5 },
        ],
      },
    ],
  }),
];

export const NINJA: CharacterDefinition = CharacterDefinitionSchema.parse({
  id: 'ninja',
  name: 'Ninja',
  stats: {
    maxHealth: 100,
    maxChakra: 100,
    moveSpeed: 140,
    chakraRegenPerSecond: 8,
    colliderRadius: 5,
  },
  abilities: ['shuriken', 'slash', 'dash', 'seal'],
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
  });
}

export function contextOf(sim: GameSimulation): SimulationContext {
  return createSimulationContext({
    world: sim.world,
    map: sim.map,
    abilities: ABILITY_CATALOG,
    characters: CHARACTER_CATALOG,
    config: sim.config,
    matchConfig: sim.matchConfig,
  });
}
