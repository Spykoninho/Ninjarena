import {
  AbilityDefinitionSchema,
  CharacterDefinitionSchema,
  DefinitionCatalog,
  LoadedMap,
  MapDefinitionSchema,
  MatchConfigSchema,
  StatRulesDefinitionSchema,
  TilesetDefinitionSchema,
} from '@ninjarena/core';
import type {
  AbilityDefinition,
  CharacterDefinition,
  MapDefinition,
  MatchConfig,
  StatRulesDefinition,
  TilesetDefinition,
} from '@ninjarena/core';

import kunaiSlash from './abilities/kunai-slash.json';
import paralysisSeal from './abilities/paralysis-seal.json';
import shadowStep from './abilities/shadow-step.json';
import shuriken from './abilities/shuriken.json';
import ninja from './characters/ninja.json';
import arena from './maps/arena.json';
import matchModes from './match-modes.json';
import statRules from './stat-rules.json';
import defaultTileset from './tilesets/default.json';

export const DEFAULT_MAP_ID = 'arena';
export const DEFAULT_CHARACTER_ID = 'ninja';

export interface GameContent {
  abilities: DefinitionCatalog<AbilityDefinition>;
  characters: DefinitionCatalog<CharacterDefinition>;
  tilesets: DefinitionCatalog<TilesetDefinition>;
  maps: DefinitionCatalog<MapDefinition>;
  matchModes: DefinitionCatalog<MatchConfig>;
  statRules: StatRulesDefinition;
}

interface DefinitionParser<T> {
  parse(value: unknown): T;
}

export function loadContent(): GameContent {
  return {
    abilities: new DefinitionCatalog<AbilityDefinition>([
      parseFile(AbilityDefinitionSchema, 'abilities/shuriken.json', shuriken),
      parseFile(AbilityDefinitionSchema, 'abilities/kunai-slash.json', kunaiSlash),
      parseFile(AbilityDefinitionSchema, 'abilities/shadow-step.json', shadowStep),
      parseFile(AbilityDefinitionSchema, 'abilities/paralysis-seal.json', paralysisSeal),
    ]),
    characters: new DefinitionCatalog<CharacterDefinition>([
      parseFile(CharacterDefinitionSchema, 'characters/ninja.json', ninja),
    ]),
    tilesets: new DefinitionCatalog<TilesetDefinition>([
      parseFile(TilesetDefinitionSchema, 'tilesets/default.json', defaultTileset),
    ]),
    maps: new DefinitionCatalog<MapDefinition>([
      parseFile(MapDefinitionSchema, 'maps/arena.json', arena),
    ]),
    matchModes: new DefinitionCatalog<MatchConfig>(
      matchModes.map((mode, index) =>
        parseFile(MatchConfigSchema, `match-modes.json[${index}]`, mode),
      ),
    ),
    statRules: parseFile(StatRulesDefinitionSchema, 'stat-rules.json', statRules),
  };
}

export function loadMap(content: GameContent, mapId: string): LoadedMap {
  const map = content.maps.get(mapId);
  return LoadedMap.fromDefinitions(map, content.tilesets.get(map.tileset));
}

// La forme TypeScript d'un JSON n'est pas une preuve: chaque fichier passe par son schéma.
function parseFile<T>(schema: DefinitionParser<T>, file: string, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid content file "${file}": ${reason}`, { cause: error });
  }
}
