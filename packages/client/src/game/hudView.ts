import type {
  AbilityDefinition,
  AbilitySlot,
  AttributeId,
  Build,
  DefinitionCatalog,
  LoadedMap,
  MatchState,
  PlayerState,
  TilesetDefinition,
  WorldState,
} from '@ninjarena/core';
import { abilityFamily } from '../rendering/art/abilityVisual';
import { skinIndex, teamCodes } from '../rendering/art/presentation';
import { ATTRIBUTE_IDS, getStatus, isVisibleTo } from '@ninjarena/core';
import type { InputBindings } from '../input/bindings';
import { shortBindingLabel } from '../input/bindings';
import type {
  HudAbilityBlock,
  HudAbilityView,
  HudMinimapMarker,
  HudMinimapTerrain,
  HudMinimapView,
  HudView,
} from '../ui/hud';

export interface HudViewInput {
  localPlayer: PlayerState | undefined;
  abilities: DefinitionCatalog<AbilityDefinition>;
  bindings: InputBindings;
  match: MatchState | null;
  // Le dernier snapshot serveur: la minicarte place les autres joueurs d'après lui.
  world: WorldState | null;
  minimapTerrain: HudMinimapTerrain | null;
  playerNames: Record<string, string>;
  tick: number;
  tickDurationMs: number;
  status: string;
  spectating: string | null;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const CONTROLLED_PHASES = ['STUNNED', 'DEAD', 'CASTING', 'DASHING', 'KNOCKBACK'];

const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  vitality: 'PV',
  strength: 'FOR',
  power: 'PUI',
  speed: 'VIT',
  maxChakra: 'CHA',
  chakraRegen: 'RÉG',
  defense: 'DÉF',
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
    spectating: input.spectating,
    teamId: local?.teamId ?? null,
    teamCode: teamCode(local, input.match),
    skin: local === undefined ? 0 : skinIndex(local.id),
    // Sans joueur local on regarde le match des autres: rien à piloter, rien à jauger.
    watching: local === undefined,
    minimap: minimapView(input),
  };
}

// Une couleur par tuile, l'objet couvrant le sol: la minicarte se peint sans le jeu de tuiles.
export function minimapTerrain(map: LoadedMap, tileset: TilesetDefinition): HudMinimapTerrain {
  const colors: (string | null)[] = [];
  for (let ty = 0; ty < map.heightInTiles; ty++) {
    for (let tx = 0; tx < map.widthInTiles; tx++) {
      const object = tileset.tiles[String(map.objectTileIdAt(tx, ty))];
      const ground = tileset.tiles[String(map.groundTileIdAt(tx, ty))];
      colors.push(object?.color ?? ground?.color ?? null);
    }
  }
  return {
    mapId: map.id,
    widthInTiles: map.widthInTiles,
    heightInTiles: map.heightInTiles,
    tileSize: map.tileSize,
    colors,
  };
}

function minimapView(input: HudViewInput): HudMinimapView | null {
  if (input.minimapTerrain === null) return null;
  const local = input.localPlayer;
  const players = Object.values(input.world?.players ?? {});
  const codes = teamCodes(
    Object.keys(input.match?.scores ?? {}).concat(players.map((player) => player.teamId)),
  );
  const markers: HudMinimapMarker[] = [];
  for (const player of players) {
    if (local !== undefined && player.id === local.id) continue;
    // Un ennemi invisible ne se lit pas plus sur la carte qu'à l'écran; un allié, si.
    if (player.phase.kind === 'DEAD' || (local !== undefined && !isVisibleTo(player, local))) {
      continue;
    }
    markers.push(marker(input, player, codes, false));
  }
  // Le joueur local vient de la prédiction et passe en dernier: il se dessine au-dessus.
  if (local !== undefined && local.phase.kind !== 'DEAD') {
    markers.push(marker(input, local, codes, true));
  }
  return { terrain: input.minimapTerrain, markers };
}

function marker(
  input: HudViewInput,
  player: PlayerState,
  codes: Map<string, number>,
  isLocal: boolean,
): HudMinimapMarker {
  return {
    id: player.id,
    name: input.playerNames[player.id] ?? player.id,
    teamCode: codes.get(player.teamId) ?? 0,
    isLocal,
    x: player.position.x,
    y: player.position.y,
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
    id: ability.id,
    name: ability.name,
    family: abilityFamily(ability),
    available: reason === null,
    reason,
    binding: binding === undefined ? '' : shortBindingLabel(binding),
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
