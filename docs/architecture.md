# Architecture

How Ninjarena is put together, and why. The networking half has its own note in
[networking.md](networking.md); the writing and naming rules are in
[conventions.md](conventions.md).

The single idea behind the whole layout: **one simulation, run in two places**. The server runs it
to decide what happens; the browser runs the same code to predict what is about to happen. That is
only possible if the simulation knows nothing about sockets, the DOM, files or the clock — which is
what the package boundaries enforce.

## Packages

| Package               | Responsibility                                                              | May import                    |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| `@ninjarena/core`     | The whole simulation: rules, state, systems, definitions and their schemas. | nothing in the workspace      |
| `@ninjarena/protocol` | Wire messages, their zod schemas, and a `MessageCodec` (JSON today).        | `core`                        |
| `@ninjarena/content`  | Gameplay data as JSON, parsed and validated into typed catalogs at load.    | `core`                        |
| `@ninjarena/server`   | Authoritative host: transport, sessions, rooms, map storage, tick loop.     | `core`, `protocol`, `content` |
| `@ninjarena/client`   | Browser app: input, netcode, renderer, HUD, audio port, frame loop.         | `core`, `protocol`, `content` |

```
  layer 3     @ninjarena/server               @ninjarena/client
                   |      |      |                 |      |      |
                   |      |      +-----------------+      |      |
                   |      |                               |      |
  layer 2     @ninjarena/protocol                  @ninjarena/content
                          |                               |
                          +---------------+---------------+
                                          |
  layer 1                          @ninjarena/core
```

`core` compiles against `ES2022` only — no DOM library — and an ESLint `no-restricted-imports` rule
rejects any `@ninjarena/*` import inside it, as well as a relative import climbing out of
`packages/core/src`. `protocol` and `content` never import each other. The
server and the client are the only packages that perform I/O.

Determinism is a rule, not a hope: `core` contains no randomness and never reads a wall clock. Time
is counted in ticks, and every duration in content is declared in milliseconds and converted with
the simulation's tick rate. The same state plus the same inputs give the same next state on both
sides; the small float differences that remain are absorbed by reconciliation.

## Core module map

```
packages/core/src/
  math/          Vec2 helpers: add, scale, normalize, clampLength, angleBetween, lerp, EPSILON
  time/          SimulationConfig (tickRate), msToTicks, tickDurationMs, FixedStepAccumulator
  definitions/   zod schemas and inferred types for abilities (effects, telegraphs), characters,
                 stat rules, tilesets, the map document (mapDocument.ts, versioned, migration),
                 match configs and status types
  collision/     Shape = Rect | Circle | ConvexPolygon, closest-point resolution, SpatialGrid,
                 mergeSolidTiles
  map/           LoadedMap.fromDocument: a MapDocument's two tile layers -> terrain, merged
                 colliders, spawns in world units, broadphase; validateMap.ts (structural, spawn
                 and reachability checks, plus the room-format spawn-count check)
  stats/         Build, computeStats, computeDamage, validateBuild — see "Stats and builds"
  player/        PlayerState, CombatPhaseState, StatusEffect, setPhase, rules.ts
  combat/        applyDamage, killPlayer, applyStun, applyKnockback, applyStatusEffect, canAffect
  abilities/     casting timeline, loadout validation (loadout.ts), effectRef (dotted paths),
                 effects/ (the executor and one handler file per brick under effects/handlers/)
  projectile/    ProjectileState, spawnProjectile
  match/         MatchState, phases, teams, spawns, round reset
  lobby/         RoomSettings (mode, teams, map, build points, best-of), applySettingsPatch,
                 toMatchConfig — pure, reused by both the server and the client's lobby form
  simulation/    WorldState (players, projectiles, pending, obstacles), PlayerInput, WorldEvent,
                 SimulationContext, GameSimulation, systems/, entities/ (pending effects, obstacles)
  testing/       fixtures shared by the tests
  index.ts       the public surface
```

`SimulationContext` is what every system receives: `{ world, map, abilities, characters, config,
matchConfig, events, now, dt, ticks(ms) }`. `now` is the current tick, `dt` is `1 / tickRate`,
`ticks(ms)` converts a content duration, and `events` is the list a system appends to. Systems are
plain functions over that context — there is no system base class and no registry.

## The step pipeline

`GameSimulation.step(inputs)` runs a fixed order, once per tick:

1. **`matchPreStep`** — advances the match phase if its timer expired (`COUNTDOWN` opens the round,
   `ROUND_END` starts the next one; up to three transitions can chain in a single tick). It returns
   whether gameplay is active.
2. **Input resolution** — a player with no input this tick gets a neutral one, and every input is
   sanitized. Outside `IN_ROUND` gameplay is neutralized: `move` is zeroed and `abilityHeld` is
   cleared, but the aim is kept so players can look around during a countdown.
3. **`playerStateSystem`** — expires timed phases (`DASHING`, `STUNNED`, `KNOCKBACK` return to
   `NORMAL`), drops expired statuses, regenerates chakra. `CASTING` is deliberately excluded: the
   ability system owns the end of a cast.
4. **`abilitySystem`** — detects press edges (`held & ~previousAbilityHeld`), validates the first
   pressed slot, starts the cast, and progresses a cast in flight.
5. **`movementSystem`** — derives a velocity from the phase and the input, integrates it, resolves
   collisions and writes the velocity actually travelled.
6. **`dashContactSystem`** — a `DASHING` player carrying a `contact` payload (source effect
   reference plus the ids already hit) applies its `onContact` effect list once to each affectable
   player it overlaps this tick.
7. **`projectileSystem`** — moves projectiles in sub-steps, applies hits, destroys them.
8. **`pendingEffectSystem`** — fires every delayed area or trigger whose `fireAt` has arrived (see
   "Effects, bricks and the executor" below), then deletes it.
9. **`obstacleSystem`** — removes spawned walls whose `expiresAt` has passed.
10. **`matchPostStep`** — decides whether the round is over and updates the scores.
11. `tick` is incremented and the events collected during the step are returned.

`startMatch()` is separate: it resets the world, zeroes the scores and enters `COUNTDOWN`. The
events it produces are held and flushed at the beginning of the next `step`, so no event is lost
between the two calls.

`snapshot()` returns a deep clone of the `WorldState` and `restore(state)` replaces it with a deep
clone. `WorldState` is plain data on purpose — records and arrays, no `Map`, no class instances —
so cloning, serializing and restoring are all the same trivial operation. This is what makes
reconciliation a two-line function.

## Phases and statuses

A player is in exactly one **phase** and carries any number of **statuses**.

```
  phase (exclusive)                       statuses (stackable)
  NORMAL                                  ROOTED
  CASTING   slot, abilityId,              SLOWED      (magnitude, default 0.5)
            startedAt, activatesAt,       INVISIBLE
            activeUntil, endsAt,          INVULNERABLE
            activated                     SHIELDED    (magnitude = remaining absorb)
  DASHING   direction, speed, endsAt,
            contact? { source, hitPlayerIds }
  STUNNED   endsAt                        each carries expiresAt; re-applying keeps the
  KNOCKBACK velocity, endsAt              furthest end and adopts the new magnitude
  DEAD      diedAt
```

Every transition goes through `setPhase`, which refuses to leave `DEAD` — death is terminal within
a round, and only the round reset writes the phase back directly. A stun or a knockback replaces
`CASTING`, which cancels the cast with no refund of chakra or cooldown.

The rules that read this model are six small predicates in `player/rules.ts`: `isAlive`,
`isDamageable` (alive and not `INVULNERABLE`), `canAct` (phase is `NORMAL`), `controlsMovement`
(phase allows it and not `ROOTED`), `statusSpeedMultiplier`, `isVisibleTo` (an `INVISIBLE` player
is still visible to themselves and their team). `isVisibleTo` is a rendering hint the client
applies, not an authority: the server broadcasts the same unfiltered snapshot to everyone. Adding a
status means adding a variant and touching the one rule that cares — not rewriting a state machine.

## Stats and builds

A player distributes an integer number of points across seven attributes — `vitality`,
`strength`, `power`, `speed`, `maxChakra`, `chakraRegen`, `defense` — within a shared budget
(`MatchConfig.buildPoints`, falling back to `StatRulesDefinition.defaultPointBudget`) and a
per-attribute range (`stat-rules.json`, 0 to 5 by default). `validateBuild` checks the shape,
the ranges and the budget and is what the server calls at `join`; a rejection answers
`INVALID_LOADOUT` with a human-readable reason.

`computeStats` (`packages/core/src/stats/formulas.ts`) turns a character's `baseStats` plus a
`Build` into the derived `PlayerStats` a player actually fights with, through coefficients that
live entirely in content:

```
maxHealth                = baseStats.maxHealth + vitality × healthPerVitality
maxChakra                = baseStats.maxChakra + maxChakra(attribute) × chakraPerPoint
chakraRegenPerSecond     = baseStats.chakraRegenPerSecond + chakraRegen × chakraRegenPerPoint
moveSpeed                = baseStats.moveSpeed × (1 + speed × moveSpeedPerSpeed)
physicalDamageMultiplier = 1 + strength × physicalDamagePerStrength
techniqueDamageMultiplier= 1 + power × techniqueDamagePerPower
defense                  = defense(attribute) × defensePerPoint
```

`speed` only ever touches `moveSpeed`: cooldowns, cast timings and everything else in milliseconds
stay exactly what the ability declares, on every build. `computeDamage` is the other half: a
`damage` effect's `amount` is multiplied by the attacker's `physicalDamageMultiplier` or
`techniqueDamageMultiplier` depending on its `scaling` (`'none'` skips the multiplier, used for
effects without an attacking player behind them), then mitigated by the target's `defense` as
`amount × 100 / (100 + defense)`, rounded to one decimal place so the simulation stays exact and
readable. `chakraCost` is checked and spent the same way for every ability kind; the basic attack
always costs 0, so a build that dumps every point outside `maxChakra`/`chakraRegen` still has an
attack that always works.

A character (`CharacterDefinition`) no longer lists an `abilities` array: it only names
`basicAttackId` and `dashId`. Every other ability of `kind: 'technique'` is fair game, and the
player's own three picks (`techniqueIds`, validated by `validateLoadout` against
`StatRulesDefinition.techniqueSlots`) fill the remaining ability slots — `createPlayerState`
builds them in the fixed order `[basicAttackId, dashId, ...techniqueIds]`, five slots
(`MAX_ABILITY_SLOTS = 5`) in total.

## Abilities

A press is validated in a fixed order, and the first failing check is the reported reason:

```
  DEAD -> NO_SUCH_SLOT -> BUSY -> ON_COOLDOWN -> NOT_ENOUGH_CHAKRA
```

A rejection emits an `abilityRejected` event rather than failing silently. On success the cast
timeline begins:

```
  press        activation                        end of recovery
    |               |                                   |
    v               v                                   v
    [--- startupMs ---][---------- recoveryMs ----------]
    ^                  ^
    chakra spent,      the effect tree fires once
    cooldown started,  (see "Effects, bricks" below)
    phase = CASTING                                     phase = NORMAL
```

Chakra is deducted and the cooldown starts at the press, not at the activation, so an interrupted
cast still costs. A zero-startup ability activates inside the tick of the press. A `dash` effect
replaces the `CASTING` phase with `DASHING`, which is why dash abilities declare `recoveryMs: 0`.
`activeMs` (defaulting to 0) has no effect on the simulation: it only tells the client how long to
keep drawing a melee arc or a held pose after activation.

`applyDamage` is the single door to health: it ignores a target that is dead or `INVULNERABLE`,
subtracts from a `SHIELDED` status first (emitting `shieldAbsorbed`, then `shieldBroken` once it is
spent) before touching health, clamps the remaining amount to the target's health, emits
`damageDealt`, and calls `killPlayer` at zero, which emits `playerDied`. `canAffect` is the single
door to "may this hit that": never yourself, and never a team-mate unless the match config enables
friendly fire. A `SHIELDED` status that simply runs out of time emits the same `shieldBroken`, from
`playerStateSystem`, so the client has one cue for both endings.

## Effects, bricks and the executor

An ability's `effects` array is a **recursive tree**, not a flat list: any brick that can carry a
follow-up (`projectile.onHit`/`onExpire`, `area.onHit`, `dash.onContact`, `delayedTrigger.effects`)
nests more effects inside it, so a fireball is one `projectile` whose `onHit` is a `damage` next to
an `area` whose own `onHit` is another `damage` next to a `knockback`. The schema
(`packages/core/src/definitions/ability.ts`) is declared with `z.lazy` to allow this.

The fourteen bricks are `projectile` (`count` and `spreadDegrees` turn one into a fan, `pierce`
into a wave that crosses every target once), `area` (instant or delayed, `origin: 'caster' |
'aim' | 'cursor' | 'here'`, scattered into a `fragile` cluster by `count` and `scatterRadius`),
`dash` (with optional `invulnerableTicks` and an `onContact` list), `melee`, `teleport`,
`spawnEntity` (currently only `entity: 'wall'`), `shield`, `heal`, `sacrificeChakra`,
`delayedTrigger`, and the four target-bound bricks `damage`, `knockback`, `stun`, `applyStatus`
(which `target: 'self'` turns into a self buff). All fourteen run through **one**
executor (`packages/core/src/abilities/effects/executor.ts`) instead of the two lists the
foundations step used: a single typed record, `effectHandlers: { [K in Effect['type']]:
EffectHandler<K> }`, maps every discriminant to its handler file under
`abilities/effects/handlers/`. Because the record's type is derived from the `Effect` union, the
compiler refuses to compile until a new brick has both a schema variant and a handler — see
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-brick).

A brick executes with an `EffectContext { ctx, casterId, teamId, origin, direction, target?,
source }`. `target` is only set while executing an `onHit`/`onContact` list against a specific
player, so `damage`, `knockback`, `stun`, a hit-targeted `applyStatus` and a `shield` used inside
such a list are no-ops without one — `shield` and `heal` used directly in an ability's activation
list instead apply to the caster, and `applyStatus` with `target: 'self'` always does. `source` is an `EffectRef { abilityId, path }`, a dotted path into the ability's own tree
(`"0"`, `"0.onHit.1"`, `"2.effects.0"`); `resolveEffect` walks it on demand, so a projectile, a
pending zone or a dashing player's `contact` never copies effect data, only the coordinates to find
it again. `TerrainRule[]` on `damage` and `area` multiplies the damage or the radius when the
effect resolves over a tagged tile (fireball hits harder on grass, lightning dash on water).

Two bricks do not resolve immediately:

- **`area` with `delayMs > 0`** and **`delayedTrigger`** both create a `PendingEffect` in
  `world.pending` instead of running there and then. Only a pending effect that carries a radius —
  an `area` — emits `zoneCreated`; a `delayedTrigger` has none and stays invisible to the client
  until it fires. The
  `pendingEffectSystem` step (see the pipeline above) fires every pending effect whose `fireAt` has
  arrived — an area hits every affectable player within its radius at its position, applying
  terrain rules there; a trigger just executes its referenced effect list — deletes it, and emits
  `zoneTriggered`. This is what lets the client draw a filling telegraph on the ground for the
  whole delay: the pending zone is already in the snapshot. An `area` with a `triggerRadius > 0`
  is a **mine**: the same pending zone also fires early, on the tick a player it can affect (so
  never its owner, and never an ally unless friendly fire is on) comes within that radius of its
  centre — `explosive-mine` arms one under the caster for ten seconds.
- **`spawnEntity` (wall)** creates an `ObstacleState` in `world.obstacles` instead: a convex quad
  built perpendicular to the caster's aim at `offset` units, and emits `obstacleSpawned`. It blocks
  players and projectiles of every team, including its owner — movement and projectile resolution
  check `map.collidersNear(bounds)` plus every live obstacle shape, a linear scan since walls are
  few. The `obstacleSystem` step removes an obstacle once `expiresAt` passes and emits
  `obstacleRemoved`.

`dash.onContact` does not resolve through `pendingEffectSystem` either: a dash records its source
effect and an empty `hitPlayerIds` list on the `DASHING` phase, and the `dashContactSystem` step
applies the list once to each affectable player the dash overlaps, appending to `hitPlayerIds` so
the same target is never hit twice by one dash, and emitting `dashContact`. `invulnerableTicks > 0`
on a `dash` applies the `INVULNERABLE` status for that many ticks starting at the dash.

## Collision and terrain

- A player is a **circle** of `colliderRadius` from the character definition, independent of the
  sprite. Circles slide along walls and corners instead of catching on them.
- Static obstacles are `Rect`, `Circle` or `ConvexPolygon`. Each answers "closest point on my
  boundary"; a penetrating circle is pushed out along that normal, and the resolution is iterated
  three times so a corner between two shapes settles.
- **Solid tiles become rectangles**: greedy horizontal runs are merged, then identical runs on
  consecutive rows are merged vertically. A map's explicit `colliders` are appended to the result.
- **Broadphase**: a uniform `SpatialGrid` over the map, cells four tiles wide. Every collider is
  inserted into each cell its bounds touch, and a query returns the candidates for an AABB.
- **Terrain is data**: each tile declares `solid`, `speedMultiplier` and `tags`. Water is walkable
  at `0.6`, grass is walkable and tagged, walls, trees and buildings are solid. The movement system
  samples the tile under the player's centre. Solidity is the union of both layers; the other
  effects come from the object layer when there is one, otherwise from the ground.
- Movement order per tick: velocity from the phase or the input, integrate, clamp inside the map,
  push out of nearby statics, then separate overlapping players symmetrically and push each out of
  the statics again. The published `velocity` is the distance actually travelled divided by `dt`,
  so a player pressed against a wall reports zero.
- A dash uses the same resolution, so walls stop dashes.
- **Spawned walls are not map statics.** A `spawnEntity` obstacle lives in `world.obstacles`, not
  in the map's own collider list, and expires; movement and projectile resolution check both
  `map.collidersNear(bounds)` and every live obstacle, so a wall someone just cast blocks exactly
  like a map wall until its `lifetimeMs` runs out.

This is **discrete** resolution: it assumes one tick of displacement is smaller than the collider
radius, which holds at the current speeds (a ninja moves 140 units/s, about 2.3 units per tick,
against a radius of 5). Projectiles, which are much faster, are sub-stepped instead: each sub-step
advances at most one radius, so a fireball cannot tunnel through a wall or a target.

## Match rules

```
  WAITING --startMatch--> COUNTDOWN --timer--> IN_ROUND
                              ^                   |
                              |                   | one team left, or the round timer expires
                              |                   v
                              +---timer--- ROUND_END
                                                  |
                                                  | a team reached roundsToWin
                                                  v
                                              MATCH_END
```

Free-for-all is modelled as "every player is their own team" — the team id is the player id — so a
single rule serves every format: the round ends when at most one team still has a living player
(and an opponent was actually eliminated), or when the round timer expires, which is a draw. The
winning team scores a point; the first to `roundsToWin` wins the match, and `matchEnded` is stored
through the `MatchResultRepository` port. A room's simulation is created fresh at `startMatch` and
discarded once its post-match delay elapses — see [rooms.md](rooms.md) for the room-level lifecycle
(WAITING/STARTING/IN_GAME/FINISHED) this sits inside; `GameSimulation` itself just runs one match
from `WAITING` (its own phase, unrelated to the room's) to `MATCH_END` and is not reused.

Ending a round clears the projectiles still in flight, every pending zone and every spawned wall,
so a shot, a delayed area or an obstacle from before the last kill cannot linger into the next
round. Starting the next round respawns everyone at a spawn point for their team with full health
and chakra, all cooldowns reset and no statuses, then freezes gameplay for the countdown.

There is no fixed set of presets any more: a room's `RoomSettings` (mode, team count, players per
team, build points, map, best-of, round length, friendly fire) is turned into a `MatchConfig` by
`toMatchConfig` (`packages/core/src/lobby/roomSettings.ts`) when the host starts the match —
`roundsToWin = Math.floor(bestOf / 2) + 1`, `countdownMs`/`roundEndDelayMs` come from a fixed
`MatchTiming` (3 seconds each), everything else is copied across. See [rooms.md](rooms.md) for how
a room gets from a settings patch to a running match.

## Rooms, maps and the client shell

Everything above this line runs the same whether one room or a hundred are open — `core` still
knows nothing about rooms, sessions or the network. The layer that turns a `MatchConfig` and a
`MapDocument` into an actual match, and turns a browser tab into a lobby, lives in the server and
the client:

```
packages/server/src/
  lobby/     room.ts (WAITING/STARTING/IN_GAME/FINISHED, join/leave/settings/loadout/ready/team),
             roomMatch.ts (spins up the GameSimulation and MatchHost at start, builds the
             MatchResult at the end), roomMap.ts (the room's cached MapDocument + issues),
             roomManager.ts (codes, create/join/leave, ticks every room with a match),
             startBlockers.ts, roomCode.ts, password.ts, roomPlayer.ts
  maps/      MapLibrary — merges @ninjarena/content's built-in maps with the MapRepository,
             assigns ids, validates on save
  persistence/  MapRepository (file-backed and in-memory), MatchResultRepository (in-memory)

packages/client/src/
  app/       clientApp.ts + appModel.ts — owns the NetworkClient, the current RoomView and map
             list, and which screen (home/lobby/editor/game) is mounted
  lobby/     lobbyModel.ts — pure: team grouping, blocker text, settings form state
  editor/    editorModel.ts + editorViewport.ts (pure), mapCanvas.ts, mapFile.ts — the map
             editor's own state, pan/zoom math and canvas drawing, independent of the lobby
  ui/        homeScreen.ts, lobbyScreen.ts + lobbySections.ts, loadoutModel.ts + loadoutPanel.ts,
             editorScreen.ts + editorPalette.ts, editorFilePanel.ts, editorIssues.ts,
             editorToolbar.ts — the DOM for every non-game screen
```

`Room` does not hold a `GameSimulation` before the match starts, and drops it once the post-match
delay elapses — a room is lobby state first, and a match is something it creates and discards, not
something it always has. See [rooms.md](rooms.md) for the full lifecycle, every client message and
its preconditions, and [map-format.md](map-format.md) for the document `MapLibrary` and the editor
both speak.

## The flow of a player action, end to end

Before any of this, a room already exists and a match is running inside it: a player pressed
**Create a room** or joined one by code, the host started the match once `startBlockers()` was
empty, and the client is now mounted on the `game` screen rather than the `lobby` one (see
[rooms.md](rooms.md)). What follows is unchanged by rooms — one room's tick loop feeds one
`GameSimulation`, exactly as a single default room did before rooms existed.

```
  1  keydown / mousemove            DomInputAdapter writes physical codes into InputState
  2  once per predicted tick        buildPlayerInput(state, bindings, playerScreenPosition)
                                    -> PlayerInput { move, aim, abilityHeld }
  3  client                         seq += 1; network.send({ type: 'input', seq, input })
  4  client (prediction)            buffer.push(seq, input); simulation.step({ [me]: input })
  5  wire                           JSON, validated by ClientMessageSchema on arrival
  6  server                         session.inputs.push(seq, input)   (stale seqs ignored,
                                    queue capped at NINJARENA_INPUT_QUEUE)
  7  server, every tick             MatchHost.tick(): one input per player, sanitized
  8  server                         GameSimulation.step(inputs) -> WorldState mutated, events
  9  server, every 2 ticks          snapshot { tick, lastProcessedSeq, world, events }
 10  client                         clock.observe(tick); interpolator.push(world)
 11  client                         buffer.acknowledge(lastProcessedSeq)
 12  client (reconciliation)        simulation.restore(world); replay every pending input
 13  client, every frame            the local player and everything it owns (its projectiles,
                                    pending zones, walls) from the predicted state, interpolated
                                    with alpha; every other entity from the interpolator at
                                    estimatedServerTick - interpolationDelayTicks
 14  Renderer.render(frame)         camera, player views, projectile/zone/obstacle views — nothing
                                    else; see networking.md for the full rendering-source rule
```

Steps 3 and 4 happen in the same tick: the client does not wait for the server to move. Step 12 is
the correction, and because the world is plain data it costs a clone and a handful of replayed
steps.

## Seams left open on purpose

| Seam                      | Today                                                                    | Meant for                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `ServerTransport`         | `WebSocketTransport` (`ws`)                                              | WebRTC data channels                                                                                                |
| `MessageCodec`            | JSON + zod                                                               | a binary, delta-compressed codec                                                                                    |
| `Renderer`                | `PixiRenderer` (PixiJS 8)                                                | another renderer, or a headless one                                                                                 |
| `AudioPort`               | `WebAudioSynth` (procedural tones); `NullAudio` for tests                | recorded sound assets                                                                                               |
| `MatchResultRepository`   | in-memory                                                                | a database; `MatchResult` already carries per-player teams, which a rating repository sitting next to it would need |
| `MapRepository`           | file-backed (`FileMapRepository`) and in-memory                          | a database, the same way                                                                                            |
| `MatchHost.sendSnapshots` | broadcasts the same unfiltered `WorldState` to every session in the room | fog of war: a per-session visibility filter slots in here without changing the `snapshot` shape                     |
| `RoomManager`             | many independent rooms, joined by code                                   | matchmaking as a second producer of rooms next to `createRoom`                                                      |
| `TickLoop` clock          | injectable `now` and `schedule`                                          | deterministic tests, already used that way                                                                          |
