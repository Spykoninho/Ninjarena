# Ninjarena

A top-down pixel-art PvP ninja arena with an authoritative server. Two to six ninjas pick a stat
build and three techniques on a pre-join setup screen, then fight in short rounds on a small tiled
map: free movement with circle collisions, a five-slot loadout (basic attack, dash, three
techniques) fuelled by chakra, telegraphed casts built from a data-driven effect tree, and an
authoritative simulation that the browser predicts locally so the game feels immediate on a real
connection.

Formats are described by data, not by code: `duel` (1v1), `ffa-3`, `ffa-4`, `2v2` and `3v3` all run
through the same round rules.

TypeScript everywhere, ESM, strict mode. The exact same simulation runs on the server and in the
browser, which is what makes prediction and reconciliation possible without a second
implementation of the game.

## Status

This repository is the **vertical slice** step. What works today:

- the full simulation: movement, collisions, seven-attribute stat builds, chakra, a recursive
  effect-tree ability system with telegraphs, projectiles, melee, dashes with contact effects,
  teleports, delayed zones, spawned walls, shields, statuses, rounds and match,
- a pre-join setup panel (name, stat sliders, three technique picks) validated by the server at
  `join`,
- an authoritative WebSocket server with a 60 Hz tick loop and 30 snapshots per second,
- a browser client with prediction, reconciliation, entity interpolation, correction smoothing,
  a feedback layer (particles, screen shake, hit stop, procedural audio) and a DOM HUD,
- a spectator camera that follows a living teammate (or anyone alive in free-for-all) after death,
- content validated at load: abilities, a character, stat rules, a tileset, a map and the match
  modes.

What is deliberately missing or simplified:

- real sprites and animations (players are coloured shapes) and actual sound assets (the audio
  is procedural WebAudio tones, not recordings),
- a lobby UI beyond the setup panel, matchmaking, bots, more than one room per server process,
- an automatic restart after a match ends (the server holds the finished match in `MATCH_END`),
- snapshot filtering: every session receives the same unfiltered `WorldState`, so an `INVISIBLE`
  status is a rendering hint the client honours, not a secret,
- the netcode refinements listed in [Roadmap](#roadmap), including lag compensation.

## Architecture overview

Five packages in a pnpm workspace. An arrow means "may import":

```
  layer 3     @ninjarena/server               @ninjarena/client
              rooms, sessions, tick loop      input, netcode, renderer, HUD
                   |      |      |                 |      |      |
                   |      |      +-----------------+      |      |
                   |      |                               |      |
  layer 2     @ninjarena/protocol                  @ninjarena/content
              messages, zod schemas, codec         abilities, maps, match modes
                          |                               |
                          +---------------+---------------+
                                          |
  layer 1                          @ninjarena/core
                                   the whole simulation
```

- `server -> protocol`, `server -> content`, `server -> core`
- `client -> protocol`, `client -> content`, `client -> core`
- `protocol -> core`, `content -> core`
- `core` imports nothing from the workspace; an ESLint rule enforces it.

**Data flow of one action.** A key press lands in the client's `InputState`;
`buildPlayerInput` turns the keys, the mouse position and the held ability buttons into a
`PlayerInput { move, aim, abilityHeld }` — the only gameplay data a client ever sends. The client
stamps it with a `seq`, sends it as an `input` message, applies it to its own `GameSimulation`
(prediction) and keeps it pending. The server queues it, consumes one input per player per tick,
sanitizes it and feeds it to its own `GameSimulation.step`, which mutates the `WorldState` and
returns the events of the tick. Every second tick the server broadcasts a `snapshot { tick,
lastProcessedSeq, world, events }`. The client restores that world, replays the inputs the server
has not processed yet (reconciliation), and the `Renderer` draws the local player from the
predicted state and everyone else from the interpolator, a few ticks in the past.

```
  key / mouse
      |
      v
  InputState --> buildPlayerInput --> PlayerInput { move, aim, abilityHeld }
                                            |
                 +--------------------------+--------------------------+
                 |                                                     |
                 v                                                     v
     input { seq, input } over WebSocket                  local GameSimulation.step
                 |                                              (prediction)
                 v
     InputQueue --> MatchHost.tick --> GameSimulation.step --> WorldState + events
                                                     |
                 snapshot { tick, lastProcessedSeq, world, events }
                                                     |
                 +-----------------------------------+
                 |                                   |
                 v                                   v
     reconcile: restore + replay          SnapshotInterpolator (remotes)
                 |                                   |
                 +----------------+------------------+
                                  v
                              Renderer
```

More detail in [docs/architecture.md](docs/architecture.md) and
[docs/networking.md](docs/networking.md); the designs these packages were built from are kept as
[docs/design/foundations.md](docs/design/foundations.md) and
[docs/design/vertical-slice.md](docs/design/vertical-slice.md).

## Requirements

- Node.js >= 22 (see `.nvmrc`)
- pnpm 10 (`corepack enable` is enough; the exact version is pinned in `package.json`)

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev
```

This starts the server (`ws://localhost:8080`) and the Vite dev server (`http://localhost:5173`)
side by side. The default match mode is `duel`, so the match needs exactly two players. Open two
browser tabs:

- <http://localhost:5173/?name=a>
- <http://localhost:5173/?name=b>

Each tab opens on a setup panel: pick a name, distribute the stat points and choose three
techniques, then press Play. The client sends the build to the server, which validates it and, on
success, joins the room and declares itself ready automatically; the match starts as soon as the
room is full. You should see both ninjas, a countdown, then `IN_ROUND` in the HUD. First team to
win `roundsToWin` rounds (2 by default, 3 for `3v3`) takes the match.

The setup panel can be prefilled from the URL, which is convenient for opening several tabs at
once: `?name=a&build=1,1,1,1,3,1,2&techniques=fireball,blink,chakra-shield` sets the name, the
seven attribute points in `vitality,strength,power,speed,maxChakra,chakraRegen,defense` order, and
the three technique ids. Values outside the rules or over budget are clamped, and missing or
invalid technique ids are filled in, so the panel always opens ready to tweak or play immediately.

To play over a LAN, both servers have to leave localhost: the game server binds where
`NINJARENA_HOST` says, and Vite needs `--host` to serve the page to another machine.

```bash
NINJARENA_HOST=0.0.0.0 pnpm dev                      # game server on every interface
pnpm --filter @ninjarena/client dev --host           # or start Vite exposed, on its own
```

Then, from the other machine, open
`http://<host>:5173/?server=ws://<host>:8080&name=b`. There is no authentication, which is why
the default binding is `127.0.0.1`: only expose the server on a network you trust.

## Configuration

The server reads its configuration from the environment at startup; every value is validated and
an invalid one stops the process.

| Variable                     | Default     | Meaning                                                                                           |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `NINJARENA_HOST`             | `127.0.0.1` | Interface to bind. Use `0.0.0.0` to accept LAN connections.                                       |
| `NINJARENA_PORT`             | `8080`      | WebSocket port (1-65535).                                                                         |
| `NINJARENA_TICK_RATE`        | `60`        | Simulation ticks per second (1-240).                                                              |
| `NINJARENA_SNAPSHOT_RATE`    | `30`        | Snapshots per second (1-240).                                                                     |
| `NINJARENA_MAP`              | `arena`     | Map id from `@ninjarena/content`.                                                                 |
| `NINJARENA_MATCH_MODE`       | `duel`      | `duel`, `ffa-3`, `ffa-4`, `2v2` or `3v3`.                                                         |
| `NINJARENA_INPUT_QUEUE`      | `8`         | Inputs buffered per player before the oldest are dropped.                                         |
| `NINJARENA_MAX_CONNECTIONS`  | `32`        | Sockets accepted at once (1-1024); the next one is closed with `1013`.                            |
| `NINJARENA_AUTO_START`       | `true`      | Start as soon as the room is full; `false` waits for everyone to be ready (at least two players). |
| `NINJARENA_MATCH_RESTART_MS` | `8000`      | Delay before a finished match restarts, in milliseconds (0-600000).                               |

The client is configured through query parameters:

| Parameter    | Default               | Meaning                                                                                                 |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `server`     | `ws://localhost:8080` | Server URL.                                                                                             |
| `name`       | random `ninja-xxxx`   | Display name, 1 to 24 characters.                                                                       |
| `build`      | none                  | Prefills the setup panel's stat sliders: `vitality,strength,power,speed,maxChakra,chakraRegen,defense`. |
| `techniques` | none                  | Prefills the setup panel's technique picks: a comma-separated list of ability ids.                      |
| `delay`      | `6`                   | Interpolation delay for remote entities, in ticks (100 ms).                                             |
| `zoom`       | `3`                   | Render scale; the world is 16-unit tiles at native resolution.                                          |

## Development

```bash
pnpm dev           # server (tsx watch) + client (Vite)
pnpm test          # Vitest, once
pnpm test:watch    # Vitest, watching
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit in every package
pnpm format        # Prettier, write
pnpm format:check  # Prettier, check only
pnpm build         # server bundle (tsup) + client bundle (Vite)
```

CI runs install, `format:check`, `lint`, `typecheck`, `test` and `build` on every push to `main`
and on every pull request. Run the same commands locally before opening one.

Package layout:

```
packages/
  core/       @ninjarena/core       math, time, definitions, collision, map, player, stats,
                                    abilities (effects/handlers), combat, projectile, match, simulation
  protocol/   @ninjarena/protocol   client and server messages, zod schemas, JSON codec
  content/    @ninjarena/content    abilities/, characters/, tilesets/, maps/, match-modes.json,
                                    stat-rules.json
  server/     @ninjarena/server     config, transport, session, lobby, match host, persistence
  client/     @ninjarena/client     config, input, network, netcode, rendering, feedback, audio, ui, game
```

Tests live next to the code they cover, as `*.test.ts`. Vitest picks up
`packages/*/src/**/*.test.ts`.

## Data-driven gameplay

Balance and content are JSON, not code. Every file is validated by a zod schema when the game
loads, so a typo fails immediately with the file name and the offending field.

```
packages/content/src/
  abilities/kunai-strike.json  shadow-step.json  fireball.json  seismic-slam.json
            lightning-dash.json  earth-wall.json  blink.json  paralysis-seal.json  chakra-shield.json
  characters/ninja.json
  stat-rules.json
  tilesets/default.json
  maps/arena.json
  match-modes.json
```

A character (`characters/ninja.json`) names its `basicAttackId` and `dashId`; every other ability
of `kind: "technique"` is available to any player, picked at the setup panel. An ability declares
its cost, its phase timings in milliseconds, an optional telegraph, and an effect tree that runs
once at activation:

```json
{
  "id": "fireball",
  "name": "Fireball",
  "kind": "technique",
  "cooldownMs": 4000,
  "chakraCost": 25,
  "startupMs": 250,
  "recoveryMs": 150,
  "telegraph": { "kind": "orb", "color": "#ff6a3d", "size": 8, "anchor": "aim" },
  "tags": ["ranged", "fire"],
  "effects": [
    {
      "type": "projectile",
      "speed": 380,
      "radius": 4,
      "lifetimeMs": 900,
      "visual": { "color": "#ff6a3d", "size": 5, "trail": true },
      "onHit": [
        { "type": "damage", "amount": 22, "scaling": "technique" },
        {
          "type": "area",
          "radius": 28,
          "origin": "here",
          "visual": { "color": "#ff9a3d", "size": 28 },
          "onHit": [{ "type": "damage", "amount": 12, "scaling": "technique" }]
        }
      ],
      "onExpire": []
    }
  ]
}
```

The bricks are `projectile`, `area`, `dash`, `melee`, `teleport`, `spawnEntity` (a wall),
`shield`, `delayedTrigger`, `damage`, `knockback`, `stun` and `applyStatus`; the ones that carry
sub-effects (`projectile.onHit`/`onExpire`, `area.onHit`, `dash.onContact`,
`delayedTrigger.effects`) make the tree recursive, so an explosion can knock back into a stun into
a slow. Damage `scaling` is `physical` (scales with the attacker's strength), `technique` (scales
with power) or `none`. Adding a technique is JSON only — see
[CONTRIBUTING.md](CONTRIBUTING.md#adding-a-technique). A new kind of brick means one schema
variant plus one handler — see
[CONTRIBUTING.md](CONTRIBUTING.md#adding-a-brick).

**Adding a map.** A map is two ASCII layers (`ground`, fully tiled, and `objects`, where a space
means "nothing"), a `legend` mapping characters to tile ids of its tileset, optional explicit
`colliders` for shapes a grid cannot express, and the spawn points. Solid tiles are merged into
rectangles automatically, so a long wall costs one collider rather than one per tile.

## Controls

Bindings use **physical key positions**, so ZQSD on an AZERTY keyboard and WASD on a QWERTY one
are the same keys without any setting.

| Action | Binding              | Slot                           |
| ------ | -------------------- | ------------------------------ |
| Move   | W / A / S / D (ZQSD) | —                              |
| Aim    | Mouse                | —                              |
| Slot 0 | Left click           | Basic attack (character, free) |
| Slot 1 | Space                | Dash (character, costs chakra) |
| Slot 2 | Right click          | Technique 1 (chosen at setup)  |
| Slot 3 | E                    | Technique 2 (chosen at setup)  |
| Slot 4 | R                    | Technique 3 (chosen at setup)  |
| —      | Tab                  | Cycle the spectator target     |

Every ninja shares the same basic attack (Kunai Strike, a free melee arc) and dash (Shadow Step,
which walls still stop); the three technique slots are whatever the player picked on the setup
panel, each with its own chakra cost, cooldown and telegraph. Chakra regenerates over time and
gates everything but the basic attack; a technique whose cost is not available is rejected.
Holding a button does not repeat the cast: only the press matters. Tab only does something once
the local player is dead and the match is `IN_ROUND`: it cycles the camera through living
teammates (or every living player in a free-for-all mode).

## Roadmap

Planned next, in no particular order:

- an automatic restart when a match ends, instead of holding `MATCH_END` forever,
- lag compensation (server-side rewind when validating hits),
- per-viewer snapshot filtering, so `INVISIBLE` becomes a real secret instead of a rendering hint,
- delta-compressed and binary snapshots behind the existing `MessageCodec` seam,
- input redundancy for lossy transports, and smoothing for large mispredictions (only small
  corrections are eased today; a large one still snaps),
- real sprites, animations and recorded audio, replacing the placeholder shapes and procedural
  tones,
- a lobby UI beyond the setup panel, matchmaking, and more than one room per server,
- a persistence backend behind `MatchResultRepository`,
- more techniques, more characters, and bots.

## License

MIT — see [LICENSE](LICENSE).
