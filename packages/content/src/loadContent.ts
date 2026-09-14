import {
  AbilityDefinitionSchema,
  CharacterDefinitionSchema,
  DefinitionCatalog,
  LoadedMap,
  migrateMapDocument,
  StatRulesDefinitionSchema,
  TilesetDefinitionSchema,
} from '@ninjarena/core';
import type {
  AbilityDefinition,
  CharacterDefinition,
  MapDocument,
  StatRulesDefinition,
  TilesetDefinition,
} from '@ninjarena/core';

import blink from './abilities/blink.json';
import chakraShield from './abilities/chakra-shield.json';
import earthWall from './abilities/earth-wall.json';
import fireball from './abilities/fireball.json';
import kunaiStrike from './abilities/kunai-strike.json';
import lightningDash from './abilities/lightning-dash.json';
import paralysisSeal from './abilities/paralysis-seal.json';
import seismicSlam from './abilities/seismic-slam.json';
import shadowStep from './abilities/shadow-step.json';
import shurikenThrow from './abilities/shuriken-throw.json';
import ninja from './characters/ninja.json';
import arena from './maps/arena.json';
import courtyard from './maps/cour-des-berges.json';
import statRules from './stat-rules.json';
import defaultTileset from './tilesets/default.json';

export const DEFAULT_MAP_ID = 'cour-des-berges';
export const DEFAULT_CHARACTER_ID = 'ninja';

export interface GameContent {
  abilities: DefinitionCatalog<AbilityDefinition>;
  characters: DefinitionCatalog<CharacterDefinition>;
  tilesets: DefinitionCatalog<TilesetDefinition>;
  maps: DefinitionCatalog<MapDocument>;
  statRules: StatRulesDefinition;
}

interface DefinitionParser<T> {
  parse(value: unknown): T;
}

export function loadContent(): GameContent {
  return {
    abilities: new DefinitionCatalog<AbilityDefinition>([
      parseFile(AbilityDefinitionSchema, 'abilities/kunai-strike.json', kunaiStrike),
      parseFile(AbilityDefinitionSchema, 'abilities/shuriken-throw.json', shurikenThrow),
      parseFile(AbilityDefinitionSchema, 'abilities/shadow-step.json', shadowStep),
      parseFile(AbilityDefinitionSchema, 'abilities/blink.json', blink),
      parseFile(AbilityDefinitionSchema, 'abilities/lightning-dash.json', lightningDash),
      parseFile(AbilityDefinitionSchema, 'abilities/chakra-shield.json', chakraShield),
      parseFile(AbilityDefinitionSchema, 'abilities/paralysis-seal.json', paralysisSeal),
      parseFile(AbilityDefinitionSchema, 'abilities/fireball.json', fireball),
      parseFile(AbilityDefinitionSchema, 'abilities/seismic-slam.json', seismicSlam),
      parseFile(AbilityDefinitionSchema, 'abilities/earth-wall.json', earthWall),
    ]),
    characters: new DefinitionCatalog<CharacterDefinition>([
      parseFile(CharacterDefinitionSchema, 'characters/ninja.json', ninja),
    ]),
    tilesets: new DefinitionCatalog<TilesetDefinition>([
      parseFile(TilesetDefinitionSchema, 'tilesets/default.json', defaultTileset),
    ]),
    maps: new DefinitionCatalog<MapDocument>([
      parseFile({ parse: migrateMapDocument }, 'maps/arena.json', arena),
      parseFile({ parse: migrateMapDocument }, 'maps/cour-des-berges.json', courtyard),
    ]),
    statRules: parseFile(StatRulesDefinitionSchema, 'stat-rules.json', statRules),
  };
}

export function loadMap(content: GameContent, mapId: string): LoadedMap {
  const map = content.maps.get(mapId);
  return LoadedMap.fromDocument(map, content.tilesets.get(map.tileset));
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
