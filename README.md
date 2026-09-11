# Ninjarena

A top-down pixel-art PvP ninja arena with an authoritative server. Two to six ninjas fight in
short rounds on a small tiled map: free movement with circle collisions, four data-driven
abilities, and an authoritative simulation that the browser predicts locally so the game feels
immediate on a real connection.

Formats are described by data, not by code: `duel` (1v1), `ffa-3`, `ffa-4`, `2v2` and `3v3` all run
through the same round rules.

TypeScript everywhere, ESM, strict mode. The exact same simulation runs on the server and in the
browser, which is what makes prediction and reconciliation possible without a second
implementation of the game.

## Status

This repository is the **foundations** step. What works today:

- the full simulation (movement, collisions, abilities, projectiles, combat, rounds and match),
- an authoritative WebSocket server with a 60 Hz tick loop and 30 snapshots per second,
- a browser client with prediction, reconciliation, entity interpolation and a DOM HUD,
- content validated at load: abilities, a character, a tileset, a map and the match modes.

What is deliberately missing: real sprites and animations (players are coloured shapes), audio
(the port exists, it plays nothing), a lobby UI, matchmaking, bots, more than one room per server
process, and the netcode refinements listed in [Roadmap](#roadmap).

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
[docs/networking.md](docs/networking.md); the design these packages were built from is kept as
[docs/design/foundations.md](docs/design/foundations.md).

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

Each tab joins the single room, declares itself ready, and the match starts by itself as soon as
the room is full. You should see both ninjas, a countdown, then `IN_ROUND` in the HUD. First team
to win 3 rounds takes the match.

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

| Variable                    | Default     | Meaning                                                                                           |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `NINJARENA_HOST`            | `127.0.0.1` | Interface to bind. Use `0.0.0.0` to accept LAN connections.                                       |
| `NINJARENA_PORT`            | `8080`      | WebSocket port (1-65535).                                                                         |
| `NINJARENA_TICK_RATE`       | `60`        | Simulation ticks per second (1-240).                                                              |
| `NINJARENA_SNAPSHOT_RATE`   | `30`        | Snapshots per second (1-240).                                                                     |
| `NINJARENA_MAP`             | `arena`     | Map id from `@ninjarena/content`.                                                                 |
| `NINJARENA_MATCH_MODE`      | `duel`      | `duel`, `ffa-3`, `ffa-4`, `2v2` or `3v3`.                                                         |
| `NINJARENA_INPUT_QUEUE`     | `8`         | Inputs buffered per player before the oldest are dropped.                                         |
| `NINJARENA_MAX_CONNECTIONS` | `32`        | Sockets accepted at once (1-1024); the next one is closed with `1013`.                            |
| `NINJARENA_AUTO_START`      | `true`      | Start as soon as the room is full; `false` waits for everyone to be ready (at least two players). |

The client is configured through query parameters:

| Parameter | Default               | Meaning                                                        |
| --------- | --------------------- | -------------------------------------------------------------- |
| `server`  | `ws://localhost:8080` | Server URL.                                                    |
| `name`    | random `ninja-xxxx`   | Display name, 1 to 24 characters.                              |
| `delay`   | `6`                   | Interpolation delay for remote entities, in ticks (100 ms).    |
| `zoom`    | `3`                   | Render scale; the world is 16-unit tiles at native resolution. |

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
  core/       @ninjarena/core       math, time, definitions, collision, map, player,
                                    abilities, combat, projectile, match, simulation
  protocol/   @ninjarena/protocol   client and server messages, zod schemas, JSON codec
  content/    @ninjarena/content    abilities/, characters/, tilesets/, maps/, match-modes.json
  server/     @ninjarena/server     config, transport, session, lobby, match host, persistence
  client/     @ninjarena/client     config, input, network, netcode, rendering, ui, audio, game
```

Tests live next to the code they cover, as `*.test.ts`. Vitest picks up
`packages/*/src/**/*.test.ts`.

## Data-driven gameplay

Balance and content are JSON, not code. Every file is validated by a zod schema when the game
loads, so a typo fails immediately with the file name and the offending field.

```
packages/content/src/
  abilities/shuriken.json  kunai-slash.json  shadow-step.json  paralysis-seal.json
  characters/ninja.json
  tilesets/default.json
  maps/arena.json
  match-modes.json
```

**Adding an ability.** Drop a JSON file in `abilities/`, register it in
`packages/content/src/loadContent.ts`, and list its id in a character's `abilities` array (four
slots maximum). An ability declares its cost and timings in milliseconds plus a list of activation
effects:

```json
{
  "id": "shuriken",
  "name": "Shuriken",
  "cooldownMs": 900,
  "energyCost": 10,
  "startupMs": 100,
  "recoveryMs": 150,
  "tags": ["ranged", "projectile"],
  "effects": [
    {
      "type": "projectile",
      "speed": 420,
      "radius": 3,
      "lifetimeMs": 900,
      "onHit": [{ "type": "damage", "amount": 18 }]
    }
  ]
}
```

Activation effects are `projectile`, `dash` and `melee`; hit effects are `damage`, `knockback`,
`stun` and `applyStatus`. A new kind of effect means one schema variant plus one handler — see
[CONTRIBUTING.md](CONTRIBUTING.md#adding-an-ability).

**Adding a map.** A map is two ASCII layers (`ground`, fully tiled, and `objects`, where a space
means "nothing"), a `legend` mapping characters to tile ids of its tileset, optional explicit
`colliders` for shapes a grid cannot express, and the spawn points. Solid tiles are merged into
rectangles automatically, so a long wall costs one collider rather than one per tile.

## Controls

Bindings use **physical key positions**, so ZQSD on an AZERTY keyboard and WASD on a QWERTY one
are the same keys without any setting.

| Action | Binding              | Ability        |
| ------ | -------------------- | -------------- |
| Move   | W / A / S / D (ZQSD) | —              |
| Aim    | Mouse                | —              |
| Slot 1 | Left click           | Shuriken       |
| Slot 2 | Right click          | Kunai Slash    |
| Slot 3 | Space                | Shadow Step    |
| Slot 4 | E                    | Paralysis Seal |

Shuriken is a fast projectile, Kunai Slash a short melee arc that knocks back, Shadow Step a dash
that walls still stop, and Paralysis Seal a slow projectile that stuns and slows. Holding a button
does not repeat the cast: only the press matters.

## Roadmap

Planned next, in no particular order:

- lag compensation (server-side rewind when validating hits),
- delta-compressed and binary snapshots behind the existing `MessageCodec` seam,
- input redundancy for lossy transports, and misprediction smoothing,
- real sprites and animations, and an actual audio implementation behind `AudioPort`,
- a lobby UI, matchmaking, and more than one room per server,
- a persistence backend behind `MatchResultRepository`,
- more abilities, more characters, and bots.

## License

MIT — see [LICENSE](LICENSE).
