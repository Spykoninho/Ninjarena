# Map format

A map is one versioned JSON document: two tile layers, optional extra colliders, and spawn
points. There is a single format in play at a time — version 1 today — and a migration function
that will grow a step per future version rather than a second parser living next to the first.

## The v1 document

```json
{
  "version": 1,
  "id": "training-ground",
  "name": "Training Ground",
  "author": "kunoichi",
  "createdAt": "2026-09-12T10:00:00.000Z",
  "tileset": "default",
  "width": 8,
  "height": 8,
  "layers": {
    "ground": [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 2, 2, 0, 0, 1],
      [1, 0, 0, 2, 2, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ],
    "objects": [
      [3, 3, 3, 3, 3, 3, 3, 3],
      [3, null, null, null, null, null, null, 3],
      [3, null, 4, null, null, 4, null, 3],
      [3, null, null, null, null, null, null, 3],
      [3, null, null, null, null, null, null, 3],
      [3, null, 4, null, null, 4, null, 3],
      [3, null, null, null, null, null, null, 3],
      [3, 3, 3, 3, 3, 3, 3, 3]
    ]
  },
  "colliders": [],
  "spawns": [
    { "x": 2, "y": 1, "team": 0 },
    { "x": 5, "y": 1, "team": 0 },
    { "x": 2, "y": 6, "team": 1 },
    { "x": 5, "y": 6, "team": 1 }
  ]
}
```

This is a valid, self-contained map: an 8×8 arena with a wall ring, a small pond in the middle,
four trees, and two spawns per team. It loads on the `default` tileset, whose ids are listed
under "Tile ids" below.
It is a **team** map — every spawn is tagged with a `team` — so a free-for-all room would need its
own generic (untagged) spawns instead; see `spawnIssues` under "Validation" below.

## Tile ids

`packages/content/src/tilesets/default.json` is the source of truth; ids are append-only, so a
saved map keeps meaning when the tileset grows.

| Id  | Name       | Layer     | Solid | Tags       | Notes                                                                 |
| --- | ---------- | --------- | ----- | ---------- | --------------------------------------------------------------------- |
| 0   | `ground`   | `ground`  | no    |            | Bare sand, the editor's default fill                                  |
| 1   | `grass`    | `ground`  | no    | `grass`    |                                                                       |
| 2   | `water`    | `ground`  | no    | `water`    | `speedMultiplier` 0.6                                                 |
| 3   | `wall`     | `objects` | yes   |            |                                                                       |
| 4   | `tree`     | `objects` | yes   | `tree`     | Canopy overhangs without widening the footprint                       |
| 5   | `building` | `objects` | yes   | `building` | Adjacent cells merge into one rectangle                               |
| 6   | `paving`   | `ground`  | no    |            |                                                                       |
| 7   | `bridge`   | `ground`  | no    | `bridge`   |                                                                       |
| 8   | `bush`     | `objects` | yes   | `bush`     |                                                                       |
| 9   | `path`     | `ground`  | no    |            | Packed dirt; autotiles its ruts on the run axis                       |
| 10  | `flowers`  | `ground`  | no    | `grass`    | Grass, so fire techniques keep their grass bonus                      |
| 11  | `lantern`  | `objects` | yes   |            | Stone lantern, one tile, ~44 art px tall                              |
| 12  | `rock`     | `objects` | yes   |            | 3 variants chosen by position                                         |
| 13  | `fence`    | `objects` | yes   |            | Autotiles from its cardinal `fence` neighbours                        |
| 14  | `well`     | `objects` | yes   |            | ~48 art px tall                                                       |
| 15  | `crate`    | `objects` | yes   |            | 2 variants, one or two stacked crates                                 |
| 16  | `torii`    | `objects` | yes   |            | Two side-by-side tiles draw one gate; its lintel fades over a fighter |

## Fields

`MapDocumentSchema` in `packages/core/src/definitions/mapDocument.ts` is the source of truth;
this is a description of what it accepts.

| Field             | Type                 | Rules                                                                                                                                                                          |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`         | `1`                  | The document format version, not a per-map revision counter.                                                                                                                   |
| `id`              | string               | `^[a-z0-9][a-z0-9-]{0,39}$` — a slug, used as the storage key and the room's `mapId`.                                                                                          |
| `name`            | string               | 1 to 40 characters.                                                                                                                                                            |
| `author`          | string, optional     | ≤ 40 characters. Set by the server on save, ignored on input.                                                                                                                  |
| `createdAt`       | string, optional     | ISO 8601. Set by the server on save (see "Storage" below).                                                                                                                     |
| `tileset`         | string               | The id of a loaded `TilesetDefinition` (`default` is the only one shipped).                                                                                                    |
| `width`, `height` | integer              | 8 to 128 tiles.                                                                                                                                                                |
| `layers.ground`   | number[][]           | Exactly `height` rows of exactly `width` non-negative tile ids. Never `null` — every ground cell is tiled.                                                                     |
| `layers.objects`  | (number \| null)[][] | Same shape as `ground`; `null` means "nothing on this cell".                                                                                                                   |
| `colliders`       | array, default `[]`  | Extra shapes (`rect`, `circle`, `polygon`) a tile grid cannot express, in world units.                                                                                         |
| `spawns`          | array, ≤ 64          | `{ x, y, team? }` in tile coordinates. `team` is a zero-based team index; a spawn without one is generic (free-for-all, or a filler for team mode — see "Spawn requirements"). |

A tile's world position is its centre: `spawnWorldPosition` places a spawn at
`((x + 0.5) * tileSize, (y + 0.5) * tileSize)`, and `tileSize` comes from the tileset (16 units for
`default`). Solidity comes from the tileset: a cell is solid if either its ground tile or its
object tile (when not `null`) declares `solid: true` (`isSolidTile`); every solid entry in
`default.json` is declared on the `objects` layer (see "Tile ids" above). Every other terrain
effect (`speedMultiplier`, `tags`) is read from the object tile when there is one, otherwise from
the ground tile (`LoadedMap.fromDocument`, `packages/core/src/map/loadedMap.ts`).

## Validation

`validateMapDocument(doc, tileset)` (`packages/core/src/map/validateMap.ts`) checks the document on
its own, independent of any room:

- **Structural** — every ground and object tile id must exist in the tileset (`UNKNOWN_TILE`,
  reported per cell); a cell whose id is unknown counts as non-walkable for every other check.
- **Spawns** — at least one spawn (`NO_SPAWN`); a spawn must be inside the map
  (`SPAWN_OUT_OF_BOUNDS`) and not on a solid tile (`SPAWN_ON_SOLID`); two spawns cannot share a
  tile (`SPAWN_DUPLICATE`).
- **Reachability** — a 4-neighbour flood fill from the first spawn over every walkable tile; any
  other spawn the fill never reaches is `SPAWN_UNREACHABLE`, reported at its coordinates. This is
  a "simply detectable" check, not a guarantee that every point of the walkable area is reachable
  from every spawn beyond that.

Every `MapIssue` carries a `code`, a human-readable `message`, and `x`/`y` when it points at a
specific cell.

`spawnIssues(doc, requirement)`, with `requirement = { mode, teamCount, playersPerTeam }`, checks
whether the map has enough spawns for a given room format, independently of the structural checks
above:

- **Free-for-all** — the number of generic spawns (no `team`) must be at least `teamCount` (one
  living player's worth of teams, since FFA gives one team per player).
- **Team, no spawn tagged at all** — the generic pool must be at least
  `teamCount × playersPerTeam`; `spawnPositionFor`'s existing fallback cycles over it.
- **Team, at least one spawn tagged** — once any spawn carries a `team`, the generic pool no
  longer completes a team: every team index below `teamCount` must have at least
  `playersPerTeam` spawns tagged with it, or that team gets `NOT_ENOUGH_SPAWNS`.

The server runs `validateMapDocument` on every `saveMap`, and both `validateMapDocument` and
`spawnIssues` (against the room's current settings) as part of a room's start blockers
(`MAP_INVALID` — see [rooms.md](rooms.md)). The editor runs `validateMapDocument` locally after
every edit and highlights the reported `x, y`; `spawnIssues` only runs when Validate is pressed,
checked against a fixed 2×1 team format (`teamCount: 2, playersPerTeam: 1`) rather than any actual
room's settings.

## Storage

A map is either **built-in** (bundled in `@ninjarena/content`, `packages/content/src/maps/*.json`,
loaded once at startup) or **stored** (saved by a client at runtime). `MapLibrary`
(`packages/server/src/maps/mapLibrary.ts`) is the single entry point that merges both: `list()`
returns builtin maps before stored ones, each group sorted by name; `get(id)` checks the builtin
catalog first.

Stored maps live under `NINJARENA_MAPS_DIR` (default `data/maps`, git-ignored), one `<id>.json`
file per map, written atomically (a temp file renamed into place) by `FileMapRepository`. Tests use
an `InMemoryMapRepository` instead; both implement the same `MapRepository` port.

`MapLibrary.save(raw, author)`:

1. Runs `migrateMapDocument` on the raw input — this is also where an unsupported `version`
   is rejected.
2. Checks the tileset is known and runs `validateMapDocument`; the first three issues are reported
   as the error message (`INVALID_MAP`).
3. Decides the id: if the submitted `id` matches an existing stored map, this is an **overwrite**
   of that map; otherwise a fresh id is generated as `slug(name)-xxxx` (a 4-character random
   suffix, retried until it collides with neither a built-in nor a stored id) and the submitted id
   is discarded. A document whose `id` names a built-in map always takes this second path —
   **built-in maps are read-only**, so saving or testing one from the editor stores a copy. A brand-new map counts against `NINJARENA_MAX_STORED_MAPS` (default 100) and is
   refused with `MAP_STORE_FULL` once the store is full; overwriting an existing map never is.
4. Stamps `author` (the session's display name) and `createdAt`. An overwrite **keeps the original
   `createdAt`** — only a document with no existing stored copy gets a fresh timestamp.

Because the id is reassigned server-side for a new map, and an overwrite is only possible by
submitting the id an earlier save returned, **anything sent by a client is either a new map or one
whose id it already knows** — but nothing about the id proves the sender created it.

**Known limitation: there are no accounts.** A stored map's id is a bearer token: whoever knows it
— because they created it, or because someone shared a `mapId` — can overwrite it with `saveMap`.
There is no ownership check today; this is an accepted gap until an account system exists.

## Migration policy

`migrateMapDocument(raw: unknown): MapDocument` is the one function that turns arbitrary input
(a save request, an imported file, a file read back from disk) into a validated `MapDocument`. It
switches on the input's `version` field: `1` parses it with `MapDocumentSchema`, anything else
throws `unsupported map format version <version>`.

`CURRENT_MAP_FORMAT_VERSION` names the version new maps are written in (`1` today). Introducing a
v2 means: add a new schema and a new branch to the `switch` that converts a v1 document into v2
shape (or parses a v2 document directly), and bump `CURRENT_MAP_FORMAT_VERSION`. The v1 branch
stays — old files on disk and old exports must keep loading through the same function rather than
gaining a second migration path.

## The editor's export and import

The map editor (`packages/client/src/ui/editorScreen.ts`, model in
`packages/client/src/editor/editorModel.ts`) works on a `MapDocument` in memory:

- **Export** serializes the current document with `JSON.stringify(document, null, 2)` and offers
  it as a file download named `<id>.json`.
- **Import** reads a local file and runs it through `migrateMapDocument`, so an old export or a
  hand-edited file is accepted exactly like a fresh save would be, and a `version` the client does
  not understand is rejected with the same message a bad save gets.
- **Save** sends the in-memory document as `saveMap`; the server's `mapSaved { id }` reply is what
  the editor adopts as the document's id from then on (so the next save overwrites rather than
  creating a duplicate). **Test** does the same save, then opens a room with that map preselected.

A new document starts as `id: "draft"`, `version: CURRENT_MAP_FORMAT_VERSION`, fully tiled with the
lowest-id non-solid ground tile, and no spawns; painting a tile writes to the layer the tileset
declares for it (`ground` or `objects`), so the palette decides which layer a click touches.

## Biomes and arena collection

The following append-only ids extend `default`; existing saved maps keep their original ids.
All new ground tiles have normal movement speed except mud (0.8). Snow is a cosmetic surface,
not sliding ice. Water retains its existing 0.6 speed multiplier. Objects are solid cover;
buildings have closed façades and cannot be entered.

| Id  | Name             | Layer   | Appearance / behavior                            |
| --- | ---------------- | ------- | ------------------------------------------------ |
| 17  | `sand`           | ground  | Warm sand with wind marks                        |
| 18  | `snow`           | ground  | Pale snow and small drifts                       |
| 19  | `gravel`         | ground  | Pebbled gravel                                   |
| 20  | `tatami`         | ground  | Woven mats with dark borders                     |
| 21  | `basalt`         | ground  | Dark stone slabs                                 |
| 22  | `mud`            | ground  | Mud, speed ×0.8                                  |
| 23  | `sandstone-wall` | objects | Joined sandstone masonry                         |
| 24  | `palisade`       | objects | Pointed timber stakes                            |
| 25  | `ice-wall`       | objects | Joined frost-blue masonry                        |
| 26  | `dojo`           | objects | Red roof and entrance curtains; `building` tag   |
| 27  | `tea-house`      | objects | Green roof and entrance curtains; `building` tag |
| 28  | `warehouse`      | objects | Slate roof and shutter; `building` tag           |
| 29  | `bamboo`         | objects | Bamboo stems; `tree` tag                         |
| 30  | `pine`           | objects | Snow-tipped pine; `tree` tag                     |
| 31  | `barrel`         | objects | Banded wooden barrel                             |
| 32  | `statue`         | objects | Stone guardian on a plinth                       |

Building cells merge only with the same tile id, so adjacent building styles stay distinct.
The editor and match renderer share the new art recipes. All elements are available in the
editor palette. Overhanging art fades when it would cover a fighter.

| Map id                 | Size (tiles) | Intended players | Layout                                             |
| ---------------------- | ------------ | ---------------- | -------------------------------------------------- |
| `dojo-des-roseaux`     | 22 × 18      | 1v1              | Tatami court, bamboo cover and two dojos           |
| `jardin-de-givre`      | 26 × 20      | 1v1              | Snow garden, paired pools and ice walls            |
| `cercle-des-dunes`     | 28 × 22      | 1v1              | Basalt fighting ring and staggered sandstone cover |
| `village-des-canaux`   | 48 × 40      | 4–8              | Three bridges, canal banks and village streets     |
| `citadelle-des-sables` | 56 × 44      | 4–8              | Central plaza, four buildings and flank routes     |
| `vallee-des-pins`      | 64 × 48      | 4–8              | River, three crossings and snowy groves            |

New duel maps have two generic spawns, large maps have eight. They support FFA and team formats
through the existing generic-spawn fallback (including 2v2 and 4v4 on large maps); they do not
assign fixed team bases. Each spawn has a clear 3 × 3 area. Tests check advertised capacity,
spawn clearance, border collisions and reachability. Competitive balance still needs playtesting.
