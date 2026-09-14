# Ninjarena — Lobby, Rooms and Map Editor Design

Status: implemented, 2026-09-12.
Builds on `docs/design/foundations.md` and `docs/design/vertical-slice.md`.

## 1. Goal

Replace the single default room with private rooms that players create and join by a short
code, give the host a configurable lobby (mode, teams, build points, map, best-of, round length,
friendly fire), let every player prepare a validated build and loadout in the lobby, and ship a
simple but extensible tile-based map editor whose maps are stored on the server and selectable by
the host.

Everything the server accepts from a client is validated server-side: settings, loadouts, room
codes, passwords and map documents.

## 2. Decisions

| Topic           | Decision                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Editor location | A screen of the web client; maps are saved to the server over the existing WebSocket.                              |
| Map storage     | Server-side `MapRepository` port; file-backed implementation, in-memory one for tests.                             |
| Basic attack    | Player-chosen. A second basic attack, `shuriken-throw`, is added so the choice matters.                            |
| Match start     | The host presses Start; the button is enabled when the room reports no blocker.                                    |
| Map format      | One versioned document format (v1). The legend/rows format is removed; `arena` is converted.                       |
| Room structure  | A room is lobby state; the simulation and match host are created at start and discarded at the end.                |
| Team identity   | Teams are indexes `0..teamCount-1` mapped through the existing `teamIdForIndex`. FFA keeps "one player, one team". |
| Post-match      | The room shows results for a configurable delay, then returns to WAITING with everyone NOT_READY.                  |
| Ownership       | No accounts yet: a stored custom map can be overwritten by anyone who knows its id. Documented as a limitation.    |

## 3. Core changes (`@ninjarena/core`)

### 3.1 Map document v1 (`core/src/definitions/mapDocument.ts`)

```jsonc
{
  "version": 1,
  "id": "arena",                  // slug, ^[a-z0-9][a-z0-9-]{0,39}$
  "name": "Arena",                // 1..40 chars
  "author": "someone",            // optional, ≤ 40 chars
  "createdAt": "2026-09-12T10:00:00.000Z", // optional ISO 8601
  "tileset": "default",
  "width": 40,                    // 8..128
  "height": 30,                   // 8..128
  "layers": {
    "ground": [[0, 0, 1], ...],   // height rows × width tile ids, never null
    "objects": [[null, 3, null], ...] // height rows × width, null = empty
  },
  "colliders": [],                // optional extra shapes (rect/circle/polygon), default []
  "spawns": [{ "x": 3, "y": 4 }, { "x": 36, "y": 25, "team": 1 }] // tile coordinates, ≤ 64
}
```

- `version` is the **format** version. A future per-map revision counter is a separate field.
- Spawns are tile coordinates; the world position is the tile centre `((x + 0.5) * tileSize)`.
- `MapDocumentSchema` validates v1. `migrateMapDocument(raw: unknown): MapDocument` switches on
  `version`: `1` parses, anything else throws `unsupported map format version`. New versions add a
  migration step here and bump `CURRENT_MAP_FORMAT_VERSION`.
- `MapSummary { id, name, width, height, author?, builtin }` is the listing shape shared by
  protocol and client.
- `MapDefinition`, `SpawnPointSchema` (world units), and the ASCII-rows-plus-legend code that used
  to build a `LoadedMap` are removed, along with the empty-tile sentinel it relied on.
  `LoadedMap.fromDocument(doc, tileset)` replaces it and keeps the same runtime shape (terrain,
  merged colliders, spawns in world units, `SpawnPoint.team`).

### 3.2 Tileset (`core/src/definitions/tileset.ts`)

`TileTypeSchema` gains `layer: z.enum(['ground', 'objects']).default('ground')`. The editor uses
it to know which layer a palette entry paints. `default.json` marks wall, tree and building as
`objects`. The fill tile of a new map is the lowest-id `ground` tile that is not solid.

### 3.3 Map validation (`core/src/map/validateMap.ts`)

```ts
type MapIssueCode =
  | 'UNKNOWN_TILE' | 'NO_SPAWN' | 'SPAWN_OUT_OF_BOUNDS' | 'SPAWN_ON_SOLID'
  | 'SPAWN_DUPLICATE' | 'SPAWN_UNREACHABLE' | 'NOT_ENOUGH_SPAWNS';
interface MapIssue { code: MapIssueCode; message: string; x?: number; y?: number }

validateMapDocument(doc: MapDocument, tileset: TilesetDefinition): MapIssue[]
spawnIssues(doc: MapDocument, requirement: SpawnRequirement): MapIssue[]
```

- Structural issues: every tile id exists in the tileset; at least one spawn; spawns inside the
  map, not on a solid tile (ground or object solid), no two spawns on the same tile.
- Reachability: 4-neighbour flood fill over non-solid tiles from the first spawn; every spawn not
  reached is `SPAWN_UNREACHABLE` at its coordinates. This is the "simply detectable" check.
- `spawnIssues` applies the room format (`SpawnRequirement { mode, teamCount, playersPerTeam }`):
  - FFA: generic spawns (no `team`) ≥ `teamCount`.
  - Team: every team index `< teamCount` has ≥ `playersPerTeam` spawns tagged with it; if the map
    tags no spawn at all, generic spawns ≥ `teamCount × playersPerTeam` is enough (the existing
    `spawnPositionFor` fallback cycles over all spawns).
- The editor shows the same issues and highlights `x, y`. The server runs `validateMapDocument` on
  save and both functions at start.

### 3.4 Room settings (`core/src/lobby/roomSettings.ts`)

```ts
interface RoomSettings {
  mode: 'ffa' | 'team';
  teamCount: number;        // 2..8
  playersPerTeam: number;   // 1..4, forced to 1 in ffa
  buildPoints: number;      // sum(attribute.min)..sum(attribute.max) from stat rules
  mapId: string;
  bestOf: 1 | 3 | 5 | 7;
  roundDurationMs: number;  // 30_000..600_000
  friendlyFire: boolean;
}
const MAX_ROOM_PLAYERS = 16;  // teamCount × playersPerTeam
defaultRoomSettings(rules, defaultMapId): RoomSettings   // team, 2, 1, rules.defaultPointBudget, map, 3, 240_000, false
applySettingsPatch(current, patch: unknown, rules): { ok: true; settings } | { ok: false; reason }
roomMaxPlayers(settings): number
toMatchConfig(settings, timing: MatchTiming): MatchConfig  // roundsToWin = floor(bestOf / 2) + 1, id = `${mode}-${teamCount}x${playersPerTeam}`
interface MatchTiming { countdownMs: number; roundEndDelayMs: number }
const DEFAULT_MATCH_TIMING = { countdownMs: 3000, roundEndDelayMs: 3000 }
```

`applySettingsPatch` merges, normalises (`ffa` ⇒ `playersPerTeam = 1`), then parses with the zod
schema so a patch can never produce an invalid settings object, and separately refuses a patch
whose `teamCount × playersPerTeam` would exceed `MAX_ROOM_PLAYERS`. It does not know the room's
current roster, though: a patch that would shrink capacity below the number of players already
seated is refused one layer up, by `Room.updateSettings`, which is the one place that both applies
the patch and knows how many players are in the room. Adding a rule = one schema field with a
default, one line in `toMatchConfig` if it maps to the simulation, one row in the lobby form.
`match-modes.json` and `MatchConfig`-by-id lookups are removed (dead once rooms derive configs).

### 3.5 Loadout (`core/src/abilities/loadout.ts`)

```ts
interface Loadout { build: Build; basicAttackId: string; techniqueIds: string[] }
validateLoadout(raw: unknown, abilities, rules, budget): { ok: true; loadout } | { ok: false; reason }
loadoutAbilityIds(character, loadout): string[]   // [basicAttackId, character.dashId, ...techniqueIds]
```

`validateLoadout` composes `validateBuild` with the ability checks: `basicAttackId` must be an
ability of kind `basic`; techniques as today. `AddPlayerParams` gains `basicAttackId?` (defaults to
the character's). `CharacterDefinition.basicAttackId` stays as the default.

### 3.6 Teams

No change to `teamIdForIndex` / `teamIndexOf`. The lobby assigns team indexes; the simulation keeps
receiving `TeamId` strings. Nothing in core assumes two teams.

## 4. Protocol v3 (`@ninjarena/protocol`)

`PROTOCOL_VERSION = 3`. `join` is removed.

Client → server:

| Message          | Fields                                          | Allowed when                                                  |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `hello`          | `protocolVersion`, `name` (1..24)               | before anything; repeated `hello` renames only outside a room |
| `createRoom`     | `password?` (1..32), `settings?` (partial)      | introduced, not in a room                                     |
| `joinRoom`       | `code` (6 chars, case-insensitive), `password?` | introduced, not in a room                                     |
| `leaveRoom`      | —                                               | in a room                                                     |
| `updateSettings` | `patch` (partial settings)                      | host, WAITING                                                 |
| `setLoadout`     | `loadout`                                       | in a room, WAITING                                            |
| `setReady`       | `ready`                                         | in a room, WAITING, loadout valid                             |
| `switchTeam`     | `team` (index)                                  | in a room, WAITING, team mode                                 |
| `startMatch`     | —                                               | host, WAITING, no blocker                                     |
| `listMaps`       | —                                               | introduced                                                    |
| `getMap`         | `id`                                            | introduced                                                    |
| `saveMap`        | `document`                                      | introduced                                                    |
| `input`          | `seq`, `input`                                  | STARTING / IN_GAME                                            |
| `ping`           | `sentAt`                                        | always                                                        |

Server → client:

| Message        | Fields                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| `welcome`      | `sessionId`                                                               |
| `roomState`    | `room: RoomView`                                                          |
| `roomLeft`     | — (acknowledges `leaveRoom`)                                              |
| `matchStarted` | `playerId`, `tickRate`, `snapshotRate`, `matchConfig`, `map: MapDocument` |
| `snapshot`     | unchanged                                                                 |
| `mapList`      | `maps: MapSummary[]`                                                      |
| `mapSaved`     | `id`                                                                      |
| `mapDocument`  | `document`                                                                |
| `error`        | `code`, `message`                                                         |
| `pong`         | unchanged                                                                 |

```ts
type RoomStatus = 'WAITING' | 'STARTING' | 'IN_GAME' | 'FINISHED';
type StartBlocker =
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYER_NOT_READY'
  | 'INVALID_LOADOUT'
  | 'EMPTY_TEAM'
  | 'MAP_MISSING'
  | 'MAP_INVALID';
interface RoomPlayerView {
  id: string;
  name: string;
  team: number | null; // null in ffa
  ready: boolean;
  loadout: Loadout | null;
  loadoutValid: boolean;
}
interface RoomView {
  code: string;
  hasPassword: boolean;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  map: MapSummary | null;
  players: RoomPlayerView[];
  startBlockers: StartBlocker[];
}
```

Error codes: `PROTOCOL_VERSION`, `INVALID_MESSAGE`, `NOT_INTRODUCED`, `NOT_IN_ROOM`,
`ALREADY_IN_ROOM`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `WRONG_PASSWORD`, `ROOM_IN_GAME`,
`TOO_MANY_ROOMS`, `NOT_HOST`, `WRONG_STATUS`, `INVALID_SETTINGS`, `INVALID_LOADOUT`,
`TEAM_FULL`, `CANNOT_START`, `INVALID_MAP`, `MAP_NOT_FOUND`, `MAP_STORE_FULL`.

Schemas stay strict (`z.strictObject`) with explicit bounds: the map document schema bounds rows
and columns to 128, spawns to 64, so an oversized frame is rejected before any allocation.

## 5. Server (`@ninjarena/server`)

### 5.1 Room lifecycle

```
          createRoom / joinRoom / leave / settings / loadout / ready / switchTeam
                       ┌──────────────────────────────────────┐
                       ▼                                      │
   WAITING ──startMatch (host, no blocker)──▶ STARTING ──roundStarted──▶ IN_GAME
      ▲                                          │                        │
      │                                          └──── matchEnded ────────┤
      │                                                                   ▼
      └──────────── postMatchMs elapsed, match discarded ───────────── FINISHED
```

- A room's lobby state and its behaviour outgrew one file and are split across three:
  `lobby/room.ts` (`Room` — status, roster, settings, join/leave/settings/loadout/ready/team,
  `startBlockers()`, the tick/finish/reset state machine), `lobby/roomMatch.ts` (pure helpers that
  build a `GameSimulation` and `MatchHost` at `start()` and a `MatchResult` at `finish()`), and
  `lobby/roomMap.ts` (`RoomMapCache` — the room's cached `MapDocument`, its `MapSummary` and its
  `spawnIssues`, reloaded whenever `mapId` changes). `Room` holds `code`, `passwordHash | null`,
  the settings, `players: RoomPlayer[]` (`session`, `team`, `ready`, `loadout`, `loadoutValid`,
  `joinedAt`) and `match: RoomMatch | null` (`{ simulation, host, participants }`); `hostId` is
  computed from `joinedAt`, not stored.
- Join is allowed only in WAITING; otherwise `ROOM_IN_GAME`. New players get the least-filled team
  (team mode) and `ready = false`, `loadout = null`, `loadoutValid = false`.
- `updateSettings` (host, WAITING): applies the patch, refuses one that would shrink capacity below
  the current roster size, reassigns players whose team index no longer exists, revalidates every
  loadout against the new budget (invalid ⇒ `ready = false`), broadcasts.
- `setLoadout`: validated with the room budget; on success stores it and marks it valid. On
  rejection the player's previous loadout — and its validity and readiness — is left exactly as it
  was; a bad submission never overwrites a good loadout with a bad one.
- `setReady(true)` needs a valid loadout, else `INVALID_LOADOUT`.
- `startBlockers()`: at least two players (`NOT_ENOUGH_PLAYERS`), everyone ready, every loadout
  valid, in team mode every team index has at least one player (`EMPTY_TEAM`, uneven teams are
  allowed), the selected map exists (`MAP_MISSING`) and passes `validateMapDocument` plus
  `spawnIssues` for the current settings (`MAP_INVALID`). `start()` refuses with `CANNOT_START`
  when the list is not empty. On success: `toMatchConfig`, load the map through the `MapLibrary`, create a
  `GameSimulation`, add every player with its loadout and `teamIdForIndex(team)` (FFA: `playerId`),
  create a `MatchHost` over the room's sessions, `startMatch()`, status `STARTING`.
- `tick()`: forwards to the match host when a match exists; `roundStarted` flips STARTING → IN_GAME,
  `matchEnded` flips → FINISHED and stores the result; after `postMatchMs` worth of ticks the match
  is discarded, every player is NOT_READY, status WAITING, broadcast. Tick-driven, no timers.
- Leaving during STARTING / IN_GAME removes the player from the simulation (and clears its
  `InputQueue`, as any leave does) and, when fewer than two teams remain present, ends the match
  immediately as a **forfeit**: the remaining team is the winner (or nobody, if the room emptied on
  both sides at once). This goes through the exact same `finish()` a normal `matchEnded` event does,
  so a forfeited match is stored, streamed and returned to the lobby identically to one that ended
  on the simulation's own terms.
- Host migration: when the host leaves, the earliest-joined remaining player becomes host — this
  falls out of `hostId` being computed, not reassigned. An empty room is removed by the manager.

### 5.2 RoomManager (`lobby/roomManager.ts`)

`create(session, request)`, `join(session, code, password)`, `leave(session)`, `tick()` over rooms
with a match, `count`. Codes come from `lobby/roomCode.ts` (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`,
6 characters, `crypto.randomInt`, retry on collision). `maxRooms` enforced with `TOO_MANY_ROOMS`.
Passwords are hashed (`sha256`) and compared with `timingSafeEqual` in `lobby/password.ts`.

### 5.3 Maps (`maps/mapLibrary.ts`, `persistence/mapRepository.ts`, `persistence/fileMapRepository.ts`)

- `MapRepository { list(): Promise<MapDocument[]>; get(id): Promise<MapDocument | null>; save(doc): Promise<void>; count(): Promise<number> }`.
- `FileMapRepository(dir)`: one `<id>.json` per map, atomic write (temp file + rename), directory
  created on demand, unreadable files logged and skipped.
- `InMemoryMapRepository` for tests.
- `MapLibrary` merges bundled content maps (`builtin: true`, read-only) with the repository:
  `list()`, `get(id)`, `save(doc, author)`; `save` runs `migrateMapDocument`, `validateMapDocument`,
  refuses builtin ids and the store cap (`MAP_STORE_FULL`), assigns `id = slug(name)-<4 random>`
  when the document has no id or an unknown one, stamps `author`, and stamps `createdAt` **only**
  when the stored copy being overwritten has none (a brand-new map) — overwriting an existing one
  keeps its original `createdAt`.
- The bundled map moves to the same document format so there is one loader.

### 5.4 GameServer and sessions

- `ClientSession` gains `introduced` (after `hello`), `room: Room | null`; `techniqueIds` and
  `ready` move to `RoomPlayer`.
- Dispatch: decode → `hello` handled first; other messages require `introduced`; room messages
  require `session.room`; the rest is a per-type switch. The old single-room "you haven't joined"
  error code is replaced by `NOT_INTRODUCED`, sent to anything but `hello` before one arrives.
- One `TickLoop` calls `rooms.tick()`. Snapshots go only to the sessions of the room.
- `ServerConfig`: the single-room fields for a fixed map id, a fixed match mode and starting once
  full are removed; the post-match delay field is `postMatchMs` (`NINJARENA_POST_MATCH_MS`,
  default 8000); add `maxRooms`
  (`NINJARENA_MAX_ROOMS`, 64), `mapsDir` (`NINJARENA_MAPS_DIR`, `data/maps`), `maxStoredMaps`
  (`NINJARENA_MAX_STORED_MAPS`, 100). `data/` is git-ignored.
- `MatchResult` gains `roomCode`, `settings` and `players: { id, name, teamId }[]` (ranked will
  need per-player outcomes). `matchModeId` is removed.
- Connection close ⇒ `rooms.leave(session)`.

### 5.5 Seams for the roadmap (documented, not built)

- Fog of war: `MatchHost.sendSnapshots` is the single place a per-session filter would be
  applied, using `isVisibleTo` from core. The snapshot message shape does not change.
- Ranked: a matchmaking queue is a second producer of rooms next to `createRoom`; results already
  carry per-player teams; a rating repository would sit next to `MatchResultRepository`.

## 6. Client (`@ninjarena/client`)

### 6.1 Screens and orchestration

`app/clientApp.ts` owns the `NetworkClient`, sends `hello`, keeps the current `RoomView`, the map
list and the active screen, and routes messages: room and map messages to the lobby or editor,
`matchStarted` / `snapshot` to the game. Screens: `home` → `lobby` → `game` → `lobby`; `editor` from
home. `index.html` keeps `#app` (canvas) and `#hud`, and replaces `#setup` with `#ui` where each
screen mounts its own element.

- `ui/homeScreen.ts`: name, Create room (password optional), Join (code + password), Map editor.
  `?room=CODE` prefills and focuses the join form.
- `lobby/lobbyModel.ts` (pure) + `ui/lobbyScreen.ts`: code with a copy-link button
  (`?room=CODE`), players grouped by team (or a flat list in FFA) with READY / NOT READY badges and
  a host marker, team switch buttons, the host form (mode, teams, players per team, build points,
  map select from `mapList`, best of, round length, friendly fire; disabled for others), the
  loadout panel, Ready toggle, Start (host, disabled with the blocker reasons listed), Leave.
  FINISHED does not add a dedicated result screen: the room stays on the `game` screen (the HUD
  already renders the match's final phase and scores from the streamed snapshot) until the server's
  `roomState` reports `WAITING` again, at which point the client returns to the lobby on its own —
  there is no separate countdown UI.
- The pre-lobby build screen from the vertical slice becomes `ui/loadoutModel.ts` /
  `ui/loadoutPanel.ts`: same build logic plus a basic-attack select; the budget comes from the room
  settings. The client sends `setLoadout` on lobby entry and on every change (debounced), so players
  never need an Apply button; the server's verdict is reflected as `loadoutValid`, styled with a
  visible border on the panel when invalid.
- `game/clientGame.ts` keeps only match concerns: `beginMatch(matchStarted)`, `handleSnapshot`,
  `endMatch()`, the frame loop and feedback. Connection, hello and setup leave it.
- `config/clientConfig.ts`: `roomCode` (`?room`), `editor` (`?editor`), `basicAttackId` (`?basic`)
  next to the existing prefills.

### 6.2 Map editor (`editor/`)

- `editor/editorModel.ts` (pure): the document under edition, the active tool, and issues.
  `EditorTool` is `{ kind: 'tile', id, layer }` (layer `'ground'` or `'objects'`, carried on the
  tool itself rather than looked up from the tileset each time — the model does not need the
  tileset to know which layer a click should paint), `{ kind: 'erase' }`, or
  `{ kind: 'spawn', team: number | null }`. `paint`/`erase`/spawn placement are applied through one
  `applyTool(state, x, y)` entry point; `newMap(name, width, height, tileset)`, `loadDocument`,
  `withIssues(state, tileset, requirement)`. Painting a tile writes it on the layer the tool
  carries; erasing clears the object layer and any spawn on that tile — the ground layer is always
  filled, so there is nothing to erase there.
- `editor/mapCanvas.ts`: 2D canvas drawing (the same tile recipes as the game renderer, spawn
  markers with the team index, issue highlights), screen → tile hit testing, and per-tile
  thumbnails for the palette.
- `editor/editorViewport.ts` (pure): the view transform of the full-screen map — fit inside the
  band left free by the overlaid bars, zoom around the pointer, pan, center on a tile.
- `ui/editorScreen.ts`: the full-screen layout. The map fills the window (wheel zooms, middle
  drag or Space+drag pans, `F` fits); a top bar holds Menu / name / a live check badge / File /
  Save / Test; a bottom strip switches Paint / Erase / Move; a build drawer (`editorPalette.ts`,
  toggled by the bottom-right button) lists the tileset by category — Ground, Walls,
  Decor (from `categoryOf`) and Spawns — with in-game thumbnails. `editorFilePanel.ts` gathers
  New (size) / Open (from `mapList`) / Import JSON / Export JSON behind the File button, and
  `editorIssues.ts` lists the checks behind the badge, each located issue clickable to highlight
  and center its tile. Continuous painting on drag, right-click removes the object or spawn under
  the pointer. Test = save, then `createRoom` with `mapId` preselected and go to the lobby. Export
  uses a Blob download; Import reads a file through `migrateMapDocument`.

## 7. Content

- `abilities/shuriken-throw.json`: kind `basic`, cooldown 500 ms, cost 0, startup 80 / recovery
  140, orb telegraph anchored on aim, projectile speed 400, radius 3, lifetime 450 ms, 9 physical
  damage. Cheaper and shorter than the kunai in exchange for range.
- `maps/arena.json` converted to the v1 document (spawns in tile coordinates).
- `tilesets/default.json` gains `layer` on wall, tree and building.
- `match-modes.json` deleted; `loadContent` exposes `maps` as `MapDocument` catalog.

## 8. Tests (behaviour)

Core: v1 parse and migration errors; `LoadedMap.fromDocument` (terrain, colliders, spawn centre);
every `MapIssueCode` including the reachability case; `applySettingsPatch` (bounds, ffa
normalisation, unknown field); `toMatchConfig`; `validateLoadout` (basic kind, budget, duplicates).
Server: room codes (alphabet, length, uniqueness); password compare; create / join by code / wrong
password / full / in game / too many rooms; host migration and empty-room removal; settings patch
revalidating loadouts and reassigning teams; ready requires a valid loadout; blockers; the full
lifecycle WAITING → STARTING → IN_GAME → FINISHED → WAITING through ticks; leave mid-game ending
the match; `FileMapRepository` round trip in a temp dir; `MapLibrary` id assignment, builtin
refusal, cap, `createdAt` kept on overwrite; `GameServer` with fake connections: hello gate, room
messages, snapshots reaching only room members, `NOT_INTRODUCED`, `WRONG_STATUS`. Client: lobby
model (grouping, blocker text, form state), loadout model (basic attack), editor model (paint on
the right layer, erase, spawn tools, round-trip to document, issues), client config parsing.

## 9. Documentation

- `docs/map-format.md`: the v1 document, validation rules, migration policy, storage.
- `docs/rooms.md`: room lifecycle, statuses, every message with its preconditions and errors.
- `README.md`: run flow (create in one tab, join by code in another), env variables, `?room=`.
- `docs/architecture.md` and `docs/networking.md`: new modules, protocol v3, seams.
- This design promoted to `docs/design/lobby-rooms-map-editor.md`.

## 10. Out of scope

Pickups, replays, post-match statistics, alternative modes, ranked, destructible terrain, map
marketplace, likes, rankings, comments, spectators joining a room in progress, kicking players,
editor undo/redo, map thumbnails.
