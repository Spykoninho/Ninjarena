# Ninjarena — Foundations Design

Date: 2026-09-11
Status: approved

## 1. Goal of this step

Lay the foundations of a real-time, top-down, pixel-art PvP ninja game with an
authoritative server. This step delivers an architecture, a minimal but real
game simulation, free movement with continuous collisions, the ability system
structure, the networking structure for prediction/reconciliation/interpolation,
and the essential tests. It does not deliver a content-complete game.

Formats to support without redesign: 1v1, FFA 3–4, 2v2, 3v3, more players later.

## 2. Decisions

| Topic           | Decision                                                                                | Why                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Language        | TypeScript everywhere, strict mode, ESM                                                 | One simulation shared by client and server: prediction and reconciliation reuse the exact server code. |
| Repository      | pnpm workspaces monorepo                                                                | Package boundaries enforce dependency direction between simulation, protocol, server and client.       |
| Simulation rate | Fixed 60 ticks/s, `dt = 1/60 s`                                                         | Gameplay never depends on render framerate.                                                            |
| Snapshot rate   | 30 snapshots/s by default (configurable)                                                | Standard trade-off between bandwidth and smoothness; interpolation hides the gap.                      |
| Transport       | WebSocket behind a `Transport` interface                                                | Simplest reliable transport today; WebRTC data channels can replace it later.                          |
| Wire format     | JSON with schema validation, behind a `MessageCodec` interface                          | Debuggable now; binary codec later without touching game code.                                         |
| Rendering       | PixiJS 8 behind a `Renderer` interface                                                  | WebGL sprite batching, trivial pixel-perfect scaling; the simulation never imports it.                 |
| Data validation | zod schemas for every content file (abilities, characters, tilesets, maps, match modes) | Data-driven balance with early, readable errors.                                                       |
| Tests           | Vitest                                                                                  | Fast, TypeScript-native, works per package.                                                            |
| Docs language   | English                                                                                 | Open source audience; commits are already in English.                                                  |
| License         | MIT                                                                                     | Permissive, standard for game foundations meant to be reused.                                          |

Versions pinned to the current stable majors: TypeScript 5.9, Vitest 4, Vite 7,
ESLint 9, typescript-eslint 8, zod 4, pixi.js 8, ws 8.

## 3. Repository layout

```
ninjarena/
  package.json              workspace root: dev, build, test, lint, typecheck
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.js  .prettierrc  .editorconfig  .gitignore  .nvmrc
  LICENSE  README.md  CONTRIBUTING.md
  .github/workflows/ci.yml
  docs/
    architecture.md         modules, dependency rules, flow of a player action
    networking.md           authoritative model, prediction, reconciliation, interpolation
    conventions.md          code, commit, test and data conventions
  packages/
    core/       @ninjarena/core       pure game simulation (no DOM, no Node APIs)
    protocol/   @ninjarena/protocol   wire messages, codec, validation
    content/    @ninjarena/content    JSON definitions + validated catalogs
    server/     @ninjarena/server     authoritative host: rooms, tick loop, sessions
    client/     @ninjarena/client     browser app: input, netcode, rendering, HUD
```

### Dependency direction (enforced by package boundaries)

```
core  <-  protocol  <-  server
core  <-  content   <-  server, client
core  <-  client
protocol <- client
```

`core` imports nothing from the other packages and compiles with
`lib: ["ES2022"]` only (no DOM types). An ESLint `no-restricted-imports`
rule forbids `@ninjarena/*` imports inside `core`.

## 4. Core simulation (`@ninjarena/core`)

### 4.1 Modules

```
src/
  math/          Vec2 helpers, angles, clamp, epsilon
  time/          SimulationConfig (tick rate), msToTicks, FixedStepAccumulator
  definitions/   zod schemas + inferred types: AbilityDefinition, CharacterDefinition,
                 TilesetDefinition, MapDefinition, MatchConfig
  collision/     shapes (rect, circle, convex polygon), circle resolution, SpatialGrid
  map/           LoadedMap: tiles, terrain lookup, collider generation, spawn points
  player/        PlayerState, CombatPhaseState, StatusEffect, rules (canMove, canAct...)
  abilities/     validation, casting timeline, effect registry, activation & hit handlers
  combat/        applyDamage, death, knockback/stun helpers
  projectile/    ProjectileState and its system
  match/         MatchState, MatchConfig presets, round/match rules, spawning
  simulation/    WorldState, PlayerInput, WorldEvent, GameSimulation, step pipeline
  index.ts       public API
```

### 4.2 Fundamental types

```ts
type Tick = number; // integer simulation tick
type PlayerId = string; // assigned by the server
type TeamId = string; // 'team-0' ... ; in FFA the team id equals the player id
type EntityId = string; // projectiles and future entities

interface Vec2 {
  x: number;
  y: number;
}

// Intent for one tick. This is the only thing a client ever sends about gameplay.
interface PlayerInput {
  move: Vec2; // clamped to length <= 1
  aim: Vec2; // unit vector, world space
  abilityHeld: number; // bitmask: bit i set while slot i is held
}
```

World units are pixels at native resolution (a tile is 16 units). Speeds are
units per second and are multiplied by `dt` inside the simulation.

### 4.3 World state

```ts
interface WorldState {
  tick: Tick;
  players: Record<PlayerId, PlayerState>;
  projectiles: Record<EntityId, ProjectileState>;
  nextEntityId: number;
  match: MatchState;
}
```

Plain objects only (no `Map`, no class instances): a snapshot is a deep clone,
serializable as-is, and `restore` is a structural copy. This keeps
reconciliation trivial.

### 4.4 Player

```ts
type CombatPhaseState =
  | { kind: 'NORMAL' }
  | {
      kind: 'CASTING';
      slot: number;
      abilityId: string;
      startedAt: Tick;
      activatesAt: Tick;
      endsAt: Tick;
      activated: boolean;
    }
  | { kind: 'DASHING'; direction: Vec2; speed: number; endsAt: Tick }
  | { kind: 'STUNNED'; endsAt: Tick }
  | { kind: 'KNOCKBACK'; velocity: Vec2; endsAt: Tick }
  | { kind: 'DEAD'; diedAt: Tick };

type StatusEffectType = 'ROOTED' | 'SLOWED' | 'INVISIBLE' | 'INVULNERABLE';
interface StatusEffect {
  type: StatusEffectType;
  expiresAt: Tick;
  magnitude?: number;
}

interface PlayerStats {
  maxHealth: number;
  maxChakra: number;
  moveSpeed: number;
  chakraRegenPerSecond: number;
  colliderRadius: number;
}

interface AbilitySlot {
  abilityId: string;
  readyAt: Tick;
}

interface PlayerState {
  id: PlayerId;
  teamId: TeamId;
  characterId: string;
  position: Vec2;
  velocity: Vec2;
  aim: Vec2;
  health: number;
  chakra: number;
  stats: PlayerStats; // resolved from the character definition
  phase: CombatPhaseState; // exclusive primary state
  statuses: StatusEffect[]; // non-exclusive modifiers
  abilities: AbilitySlot[];
  previousAbilityHeld: number; // for press-edge detection inside the simulation
}
```

Design rule: the **phase** is exclusive (a player is in exactly one), the
**statuses** stack. Adding `ROOTED`/`SLOWED`/`INVISIBLE`/`INVULNERABLE` or a
future status touches only the union and the relevant rule in `player/rules.ts`
(`canMove`, `canAct`, `speedMultiplier`, `isDamageable`, `isVisibleTo`). No
state machine rewrite.

Phase precedence, applied by a single `setPhase` helper:
`DEAD` overrides everything; `STUNNED` and `KNOCKBACK` interrupt `CASTING` and
`DASHING`; a phase with `endsAt` returns to `NORMAL` when it expires.

### 4.5 Step pipeline

`GameSimulation.step(inputs: Record<PlayerId, PlayerInput>): WorldEvent[]`
runs, in this order:

1. `matchSystem.preStep` — advances match phase timers; when the match is not
   `IN_ROUND`, gameplay inputs are neutralized (no movement, no abilities).
2. `playerStateSystem` — expires phases and statuses, regenerates chakra,
   progresses casting timelines.
3. `abilitySystem` — detects ability presses (held now, not held previously),
   validates (alive, phase `NORMAL`, slot exists, cooldown ready, enough
   chakra), starts a cast; fires activation effects when `activatesAt` is
   reached.
4. `movementSystem` — computes the velocity from input and phase (dash and
   knockback impose their own velocity), applies terrain and status
   multipliers, integrates, resolves collisions against static colliders and
   other players, clamps to the map.
5. `projectileSystem` — integrates projectiles with sub-steps (each sub-step
   moves at most one radius), collides with statics (destroyed) and with
   damageable players (hit effects applied), expires by lifetime.
6. `matchSystem.postStep` — evaluates round end (one team left, or timer),
   updates scores, advances to `ROUND_END`/`MATCH_END`, resets the world for the
   next round when the delay elapses.
7. increments `tick`, returns and clears the events of this tick.

Systems are functions taking a `SimulationContext { world, map, catalogs,
config, events }`. Determinism: no randomness and no wall-clock in the
simulation; the same state and inputs produce the same result on server and
client (small float divergences are absorbed by reconciliation).

### 4.6 Timing

`FixedStepAccumulator` (pure): `advance(elapsedMs) -> stepsToRun` with a cap to
prevent the spiral of death, and `alpha` (0..1) for render interpolation between
the previous and current simulated tick. Server and client both drive the
simulation through it, so a 60, 120, 144 or 240 FPS render loop always produces
exactly 60 steps per second.

## 5. Collision and map

- Player collider: **circle** with `colliderRadius` from the character
  definition, independent of the sprite. Circles slide naturally along walls
  and corners.
- Static colliders are `Shape = Rect | Circle | ConvexPolygon`. Each shape
  implements `closestPoint(point)`; resolution pushes the circle out along the
  closest-point normal, iterated 3 times per move. Convex polygons cover
  buildings and diagonal walls that a tile grid cannot express.
- **Tile to collider generation**: the map declares which tiles are solid
  through its tileset. Solid tiles are merged into rectangles by greedy
  horizontal runs then vertical merging of identical runs, so a 6-tile wall is
  one rectangle. Map files may add explicit shapes under `colliders`.
- **Broadphase**: uniform `SpatialGrid` over the map; shapes are inserted in
  every cell their bounds overlap; queries return candidates for an AABB.
- **Terrain effects** are data: each tile type declares `solid`,
  `speedMultiplier` and `tags`. Water is walkable with `speedMultiplier: 0.6`,
  grass is walkable with tag `grass` (future invisibility), ground is neutral.
  The movement system samples the tile under the player's center.
- Player vs player: circles are separated symmetrically (soft push), then
  statics are re-resolved.
- Dash uses the same movement resolution, so walls stop dashes.

Gap rule: a player passes between two obstacles when the gap is at least the
collider diameter; this is covered by tests.

## 6. Abilities

Definitions are data (`packages/content/abilities/*.json`):

```jsonc
{
  "id": "shuriken",
  "name": "Shuriken",
  "cooldownMs": 900,
  "chakraCost": 10,
  "startupMs": 100,
  "recoveryMs": 150,
  "canMoveWhileCasting": false,
  "tags": ["projectile", "ranged"],
  "effects": [
    {
      "type": "projectile",
      "speed": 420,
      "radius": 3,
      "lifetimeMs": 900,
      "onHit": [{ "type": "damage", "amount": 18 }],
    },
  ],
}
```

Two effect families, each dispatched through a registry keyed by `type`
(adding an effect type adds one handler, nothing else changes):

- **Activation effects** (run when the cast activates):
  `projectile`, `dash { distance, durationMs }`,
  `melee { range, arcDegrees, onHit }`.
- **Hit effects** (applied to a target): `damage`, `knockback { speed,
durationMs }`, `stun { durationMs }`, `applyStatus { status, durationMs,
magnitude? }`.

Casting timeline: press → validation → chakra deducted, cooldown starts,
phase `CASTING` with `activatesAt = now + startup`, `endsAt = activatesAt +
recovery` → activation effects fire once at `activatesAt` → back to `NORMAL`
at `endsAt`. A stun or knockback during the cast cancels it (no refund).
All durations are declared in milliseconds and converted to ticks by the
simulation config.

Projectiles reference their source (`abilityId`, `effectIndex`) instead of
copying effect lists, keeping snapshots small. Friendly fire is a
`MatchConfig` flag (default off); projectiles never hit their owner.

`applyDamage(ctx, targetId, amount, sourceId)` is the single entry point for
damage: it ignores dead and `INVULNERABLE` targets, clamps health, switches the
phase to `DEAD` at zero and emits `playerDied`.

## 7. Match rules

```ts
type MatchPhase = 'WAITING' | 'COUNTDOWN' | 'IN_ROUND' | 'ROUND_END' | 'MATCH_END';
interface MatchState {
  phase: MatchPhase;
  phaseEndsAt: Tick | null;
  round: number;
  scores: Record<TeamId, number>;
  lastRoundWinner: TeamId | null;
  winner: TeamId | null;
}
interface MatchConfig {
  id: string;
  mode: 'ffa' | 'team';
  teamCount: number;
  playersPerTeam: number;
  roundsToWin: number;
  roundDurationMs: number;
  countdownMs: number;
  roundEndDelayMs: number;
  friendlyFire: boolean;
}
```

Presets live in content (`match-modes.json`): `duel` (team, 2×1), `ffa-3`,
`ffa-4`, `2v2`, `3v3`. FFA is modelled as "every player is their own team", so
one rule serves all formats: a round ends when at most one team has a living
player, or when the round timer expires (draw). First team to `roundsToWin`
wins the match. Between rounds the world is reset: players respawn at
team-assigned spawn points with full health, chakra and cooldowns, projectiles
are cleared, and a countdown freezes gameplay.

## 8. Protocol (`@ninjarena/protocol`)

```ts
type ClientMessage =
  | { type: 'join'; protocolVersion: number; name: string }
  | { type: 'ready' }
  | { type: 'input'; seq: number; input: PlayerInput }
  | { type: 'ping'; sentAt: number };

type ServerMessage =
  | {
      type: 'welcome';
      playerId: PlayerId;
      tickRate: number;
      snapshotRate: number;
      mapId: string;
      matchConfig: MatchConfig;
    }
  | { type: 'roomState'; players: { id: PlayerId; name: string; teamId: TeamId; ready: boolean }[] }
  | {
      type: 'snapshot';
      tick: Tick;
      lastProcessedSeq: number;
      world: WorldState;
      events: WorldEvent[];
    }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; sentAt: number; serverTime: number };
```

Every client message is validated with a zod schema before reaching game code;
invalid messages are dropped and counted. `MessageCodec` has a JSON
implementation now; the interface allows a binary codec later. Snapshots are
full (no delta compression) in this step; the message shape does not preclude
deltas later.

## 9. Server (`@ninjarena/server`)

```
src/
  config/        ServerConfig from environment with defaults and validation
  transport/     ServerTransport interface + WebSocket implementation (ws)
  session/       ClientSession: connection, playerId, per-player input queue
  lobby/         Room: joined players, readiness, match config, start condition
  match/         MatchHost: GameSimulation + TickLoop + snapshot broadcast
  persistence/   MatchResultRepository interface + in-memory implementation
  main.ts        wires everything; one default room for now, RoomManager keeps
                 the door open for many
```

- `TickLoop` runs at 60 Hz with a drift-correcting accumulator on
  `performance.now()`.
- Input handling: each session queues inputs in order; each tick consumes one
  input per player (the last input is reused when the queue is empty, and the
  queue is capped to bound clock drift). The consumed `seq` is reported to that
  client in its snapshot as `lastProcessedSeq`, which is what reconciliation
  needs.
- The server sanitizes inputs (clamps `move`, normalizes `aim`, rejects NaN).
  It alone applies damage, deaths, ability validation and round results.
- Snapshots are sent every `tickRate / snapshotRate` ticks together with the
  events of the covered interval.

## 10. Client (`@ninjarena/client`)

```
src/
  config/        ClientConfig: server URL, interpolation delay
  input/         InputSource interface, KeyboardMouseInput (physical key codes, so
                 ZQSD on AZERTY and WASD on QWERTY work unchanged), InputBindings data
  network/       NetworkClient over WebSocket using the protocol codec
  netcode/       PredictionBuffer (pending inputs, replay), SnapshotInterpolator
                 (remote entities), ServerClock (estimated server tick)
  rendering/     Renderer interface, PixiRenderer (tilemap, entity sprites,
                 camera, pixel-perfect integer scaling), placeholder pixel art
  ui/            DOM HUD: health, chakra, cooldowns, match phase and scores
  audio/         AudioPort interface + NullAudio (seam only in this step)
  game/          ClientGame: frame loop with FixedStepAccumulator, ties the above
  main.ts
```

Per frame: accumulate elapsed time; for each due tick, sample input, stamp
`seq`, send it, apply it to the local `GameSimulation` (prediction) and keep it
pending. On snapshot: restore the world, replay pending inputs newer than
`lastProcessedSeq` (reconciliation), push the snapshot to the interpolator.
Render: the local player from the predicted state (interpolated with `alpha`),
remote players and projectiles from the interpolator at
`estimatedServerTick − interpolationDelay`.

## 11. Content (`@ninjarena/content`)

JSON files validated at load by the core schemas and exposed as typed
catalogs: `abilities/`, `characters/` (one default ninja), `tilesets/`
(`default` with ground, grass, water, wall), `maps/` (one arena with walls,
a building footprint as a polygon collider, water and grass zones, spawn
points for up to 6 players in 2 teams and 4 FFA slots), `match-modes.json`.

## 12. Testing strategy

Behaviour tests on the simulation, not getters:

- collision: push-out from a wall, sliding along a wall, passing a gap equal
  to the diameter, blocked by a narrower gap, tile merging output, grid queries
- movement: speed × dt, diagonal normalization, water slows, `ROOTED` blocks,
  `SLOWED` multiplies, `STUNNED`/`DEAD` do not move, dash blocked by a wall
- abilities: rejection on cooldown / chakra / wrong phase, timeline
  (startup → activation → recovery → NORMAL), cooldown and chakra accounting,
  press-edge detection, projectile spawn and hit, melee arc hit
- combat: damage, `INVULNERABLE` ignores damage, death at zero, no damage on
  dead, knockback and stun expiry, status expiry, cast cancelled by stun
- match: FFA last player standing, team round win, `roundsToWin` ends the
  match, timer expiry is a draw, round reset respawns and restores players
- simulation: same inputs produce the same state; snapshot/restore roundtrip
- protocol: encode/decode roundtrip, malformed messages rejected
- client netcode: reconciliation converges on the server state after replay;
  interpolation returns positions between two snapshots
- server: input queue consumption and cap

## 13. Tooling and conventions

- `pnpm dev` runs server (tsx watch) and client (Vite) together; `pnpm test`,
  `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- ESLint (typescript-eslint recommended) + Prettier; `.editorconfig`.
- GitHub Actions: install, lint, typecheck, test on push and pull request.
- Conventional Commits in English, small and cohesive.
- Comments only for architectural choices, non-obvious logic and network
  constraints.

## 14. Out of scope (next steps)

Lag compensation (server-side rewind for hit validation), delta-compressed
binary snapshots, input redundancy for lossy transports, misprediction
smoothing, real sprites and animations, audio implementation, lobby UI and
matchmaking, persistence backend, more abilities and characters, bots.
