# Architecture

How Ninjarena is put together, and why. The networking half has its own note in
[networking.md](networking.md); the writing and naming rules are in
[conventions.md](conventions.md).

The single idea behind the whole layout: **one simulation, run in two places**. The server runs it
to decide what happens; the browser runs the same code to predict what is about to happen. That is
only possible if the simulation knows nothing about sockets, the DOM, files or the clock — which is
what the package boundaries enforce.

## Packages

| Package               | Responsibility                                                                | May import                    |
| --------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| `@ninjarena/core`     | The whole simulation: rules, state, systems, definitions and their schemas.   | nothing in the workspace      |
| `@ninjarena/protocol` | Wire messages, their zod schemas, and a `MessageCodec` (JSON today).          | `core`                        |
| `@ninjarena/content`  | Gameplay data as JSON, parsed and validated into typed catalogs at load.      | `core`                        |
| `@ninjarena/server`   | Authoritative host: transport, sessions, room, tick loop, snapshot broadcast. | `core`, `protocol`, `content` |
| `@ninjarena/client`   | Browser app: input, netcode, renderer, HUD, audio port, frame loop.           | `core`, `protocol`, `content` |

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
rejects any `@ninjarena/*` import inside it. `protocol` and `content` never import each other. The
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
  definitions/   zod schemas and inferred types for abilities, characters, tilesets, maps,
                 match configs and status types
  collision/     Shape = Rect | Circle | ConvexPolygon, closest-point resolution, SpatialGrid,
                 mergeSolidTiles
  map/           LoadedMap: ASCII layers + legend -> terrain, merged colliders, spawns, broadphase
  player/        PlayerState, CombatPhaseState, StatusEffect, setPhase, rules.ts
  combat/        applyDamage, killPlayer, applyStun, applyKnockback, applyStatusEffect, canAffect
  abilities/     validation, casting timeline, activation and hit effect handlers
  projectile/    ProjectileState, spawnProjectile
  match/         MatchState, phases, teams, spawns, round reset
  simulation/    WorldState, PlayerInput, WorldEvent, SimulationContext, GameSimulation, systems/
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
   `NORMAL`), drops expired statuses, regenerates energy. `CASTING` is deliberately excluded: the
   ability system owns the end of a cast.
4. **`abilitySystem`** — detects press edges (`held & ~previousAbilityHeld`), validates the first
   pressed slot, starts the cast, and progresses a cast in flight.
5. **`movementSystem`** — derives a velocity from the phase and the input, integrates it, resolves
   collisions and writes the velocity actually travelled.
6. **`projectileSystem`** — moves projectiles in sub-steps, applies hits, destroys them.
7. **`matchPostStep`** — decides whether the round is over and updates the scores.
8. `tick` is incremented and the events collected during the step are returned.

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
            endsAt, activated             INVULNERABLE
  DASHING   direction, speed, endsAt
  STUNNED   endsAt                        each carries expiresAt; re-applying keeps the
  KNOCKBACK velocity, endsAt              furthest end and adopts the new magnitude
  DEAD      diedAt
```

Every transition goes through `setPhase`, which refuses to leave `DEAD` — death is terminal within
a round, and only the round reset writes the phase back directly. A stun or a knockback replaces
`CASTING`, which cancels the cast with no refund of energy or cooldown.

The rules that read this model are six small predicates in `player/rules.ts`: `isAlive`,
`isDamageable` (alive and not `INVULNERABLE`), `canAct` (phase is `NORMAL`), `controlsMovement`
(phase allows it and not `ROOTED`), `statusSpeedMultiplier`, `isVisibleTo` (an `INVISIBLE` player
is still visible to themselves and their team). Adding a status means adding a variant and touching
the one rule that cares — not rewriting a state machine.

## Abilities

A press is validated in a fixed order, and the first failing check is the reported reason:

```
  DEAD -> NO_SUCH_SLOT -> BUSY -> ON_COOLDOWN -> NOT_ENOUGH_ENERGY
```

A rejection emits an `abilityRejected` event rather than failing silently. On success the cast
timeline begins:

```
  press        activation                        end of recovery
    |               |                                   |
    v               v                                   v
    [--- startupMs ---][---------- recoveryMs ----------]
    ^                  ^
    energy spent,      activation effects fire once
    cooldown started,  (projectile / dash / melee)
    phase = CASTING                                     phase = NORMAL
```

Energy is deducted and the cooldown starts at the press, not at the activation, so an interrupted
cast still costs. A zero-startup ability activates inside the tick of the press. A `dash` effect
replaces the `CASTING` phase with `DASHING`, which is why dash abilities declare `recoveryMs: 0`.

Effects are dispatched through two typed handler records keyed by the effect's discriminant —
`activationHandlers` for `projectile | dash | melee`, `hitHandlers` for `damage | knockback | stun |
applyStatus`. Adding an effect type means adding a schema variant and a handler; the type of the
record makes the compiler insist on it.

`applyDamage` is the single door to health: it ignores a target that is dead or `INVULNERABLE`,
clamps the amount to the remaining health, emits `damageDealt`, and calls `killPlayer` at zero,
which emits `playerDied`. `canAffect` is the single door to "may this hit that": never yourself,
and never a team-mate unless the match config enables friendly fire.

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

This is **discrete** resolution: it assumes one tick of displacement is smaller than the collider
radius, which holds at the current speeds (a ninja moves 140 units/s, about 2.3 units per tick,
against a radius of 5). Projectiles, which are much faster, are sub-stepped instead: each sub-step
advances at most one radius, so a shuriken cannot tunnel through a wall or a target.

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
through the `MatchResultRepository` port.

Ending a round clears the projectiles still in flight so a shot fired before the last kill cannot
score during the delay. Starting the next round respawns everyone at a spawn point for their team
with full health and energy, all cooldowns reset and no statuses, then freezes gameplay for the
countdown.

The presets live in `packages/content/src/match-modes.json`: `duel`, `ffa-3`, `ffa-4`, `2v2`,
`3v3`, all first to 3 rounds, 90-second rounds, 3-second countdown and round-end delay, friendly
fire off.

## The flow of a player action, end to end

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
 13  client, every frame            local player from the predicted state, interpolated with
                                    alpha; remotes and projectiles from the interpolator at
                                    estimatedServerTick - interpolationDelayTicks
 14  Renderer.render(frame)         camera, player views, projectile views — nothing else
```

Steps 3 and 4 happen in the same tick: the client does not wait for the server to move. Step 12 is
the correction, and because the world is plain data it costs a clone and a handful of replayed
steps.

## Seams left open on purpose

| Seam                    | Today                           | Meant for                                  |
| ----------------------- | ------------------------------- | ------------------------------------------ |
| `ServerTransport`       | `WebSocketTransport` (`ws`)     | WebRTC data channels                       |
| `MessageCodec`          | JSON + zod                      | a binary, delta-compressed codec           |
| `Renderer`              | `PixiRenderer` (PixiJS 8)       | another renderer, or a headless one        |
| `AudioPort`             | `NullAudio`                     | an actual audio implementation             |
| `MatchResultRepository` | in-memory                       | a database                                 |
| `RoomManager`           | one default room                | many rooms, matchmaking                    |
| `TickLoop` clock        | injectable `now` and `schedule` | deterministic tests, already used that way |
