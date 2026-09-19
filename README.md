# Ninjarena

A top-down pixel-art PvP ninja arena with an authoritative server. Players create or join private
rooms by a short code, configure the match in a host-editable lobby (mode, teams, map, best-of,
round length, friendly fire, ranked or not), prepare a stat build and loadout validated live by the server, then
fight in short rounds on a tile map: free movement with circle collisions, a five-slot loadout
(basic attack, dash, three techniques) fuelled by chakra, telegraphed casts built from a
data-driven effect tree, and an authoritative simulation that the browser predicts locally so the
game feels immediate on a real connection.

Match formats are room settings, not fixed presets: free-for-all or teams (2 to 8 teams, 1 to 4
players per team), any of the built-in or player-made maps, and best of 1/3/5/7 rounds all run
through the same round rules.

TypeScript everywhere, ESM, strict mode. The exact same simulation runs on the server and in the
browser, which is what makes prediction and reconciliation possible without a second
implementation of the game.

## Status

What works today:

- the full simulation: movement, collisions, seven-attribute stat builds, chakra, a recursive
  effect-tree ability system with telegraphs, projectiles, melee, dashes with contact effects,
  teleports, delayed zones, spawned walls, shields, statuses, rounds and match,
- private rooms joined by a 6-character code, with an optional password, a host-editable lobby
  (mode, teams, map, build points, best-of, round length, friendly fire), team switching, and a
  loadout panel the server validates on every change, reflected back as a per-player verdict,
  before "Ready" can even be pressed,
- a full-screen tile map editor: the map fills the window with wheel zoom and drag panning, a
  build drawer sorted by ground, walls, decor and spawns with in-game thumbnails, live validation
  (structural, spawn and reachability checks) with click-to-locate issues, save to the server,
  export or import JSON, and jump straight into a test room with the map preselected — see
  [docs/map-format.md](docs/map-format.md),
- an authoritative WebSocket server with a 60 Hz tick loop, 30 snapshots per second, and one
  independent room per code — see [docs/rooms.md](docs/rooms.md),
- a browser client with prediction, reconciliation, entity interpolation, correction smoothing,
  a native 640x360 pixel-art renderer (procedural tiles, a layered ninja rig with drawn attack,
  cast, hit, dash and death poses, slash and impact effects), a feedback layer (particles, screen
  shake, hit stop, procedural audio) and a DOM HUD — see [docs/art](docs/art/README.md),
- a spectator camera that follows a living teammate (or anyone alive in free-for-all) after death,
- a match result kept in the room and shown for a configurable delay before everyone returns to
  the lobby, not ready, for a new round of settings,
- accounts (a unique name and a password, stored salted and hashed on the server) with a rating
  and a rank (Bronze, Argent, Or) shown next to the name; a room can be marked **ranked** in its
  settings, which requires every player to be logged in, shows each player what a win earns and a
  loss costs against the opposing side's average rating, and settles the ratings when the match
  ends (a forfeit counts as a loss); a leaderboard page on the home menu lists every account by
  rating — see [docs/rooms.md](docs/rooms.md#accounts-and-ranked-play),
- content validated at load: abilities, a character, stat rules, a tileset, and maps (built-in and
  player-made, stored on the server).

What is deliberately missing or simplified:

- hand-painted sprite sheets (every texture is generated at load from pixel recipes) and actual
  sound assets (the audio is procedural WebAudio tones, not recordings),
- matchmaking, bots, spectating a room already in progress, kicking a player, editor undo/redo,
  map thumbnails, and password recovery (an account is a name and a password, nothing else),
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
              messages, zod schemas, codec         abilities, characters, tilesets, maps
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
side by side. Open two browser tabs:

The game's UI is in French. Open two browser tabs:

- <http://localhost:5173/?name=a>, pick **Créer une partie** and press **Créer**. The lobby
  header shows the room code (for example `9VHJ3Z`) and a **Copier le lien d'invitation** button
  that copies `?room=9VHJ3Z` appended to the current page.
- <http://localhost:5173/?name=b&room=9VHJ3Z> (or paste the copied link, or pick **Rejoindre une
  partie** and type the code from the home menu) — the code prefills the join form and the second
  tab joins the same room.

The home menu also carries the account bar: **Se connecter** opens a form where a name and a
password either log into an existing account or, with **Créer un compte**, create one. A logged-in
player keeps that name in every room and shows a rank badge next to it; **Classement** lists every
account by rating. Playing as a guest (no account) is still fine for unranked rooms.

Both tabs now show the lobby, split in three tabs. **Salon** is the stage: one column per team,
each player drawn as their ninja with their name, a rank badge if they are logged in, a HÔTE badge,
a PRÊT / PAS PRÊT pill and the icons of the attacks they picked; open seats carry a **Rejoindre
cette équipe** button. **Réglages de la partie** holds the host-only form (mode, map, teams,
players per team, build points, rounds, round duration, friendly fire, ranked); with **Partie
classée** ticked, a table under the form shows every player's rating and what a win earns and a
loss costs them. **Personnage** is where each player distributes
the stat points and builds their kit: the five slots show the key each attack is bound to (basic
attack, dash, then technique 1, 2 and 3), and picking a slot lists the techniques as cards — hover
one to read what it does, its damage, chakra cost, cooldown and cast time. Press **Prêt** at the
bottom — the server validates the loadout and reflects the verdict back before Prêt can be pressed
with an invalid one. Once both are ready, the host's **Lancer la partie** button lights up (it is
greyed out with the reason otherwise — see `startBlockers` in [docs/rooms.md](docs/rooms.md)).
Press it: you should see both ninjas, a countdown, then the round banner and the running round
timer in the HUD. First team to win
`roundsToWin` rounds (best of 3 by default) takes the match, and every player returns to the lobby,
not ready, a few seconds after the last round ends.

Add `?editor` (or pick **Éditeur de cartes** on the home menu) to open the map editor — see
[docs/map-format.md](docs/map-format.md).

To play over a LAN, both servers have to leave localhost: the game server binds where
`NINJARENA_HOST` says, and Vite needs `--host` to serve the page to another machine.

```bash
NINJARENA_HOST=0.0.0.0 pnpm dev                      # game server on every interface
pnpm --filter @ninjarena/client dev --host           # or start Vite exposed, on its own
```

Then, from the other machine, open
`http://<host>:5173/?server=ws://<host>:8080&name=b`. There is no authentication, which is why
the default binding is `127.0.0.1`: only expose the server on a network you trust.

## Deployment

The game runs at <https://mathisfremiot.fr/ninjarena> (also reachable through
`www.mathisfremiot.fr`; both hostnames need an `A` record pointing at the VPS, without the
Cloudflare proxy, so that Traefik can pass the TLS-ALPN challenge). Every push on `main` that passes the
`verify` job is deployed by the `deploy` job of [ci.yml](.github/workflows/ci.yml): it opens an
SSH session on the VPS and runs [deploy/deploy.sh](deploy/deploy.sh), which fast-forwards the
clone in `~/ninjarena` to the pushed commit and rebuilds the containers.

[docker-compose.prod.yml](docker-compose.prod.yml) describes the two containers, both built from
the root [Dockerfile](Dockerfile):

- `ninjarena-web`: the Vite build (base path `/ninjarena/`) served by nginx.
- `ninjarena-server`: the bundled Node server, listening on every interface, with player-saved maps
  in the `maps` volume and the accounts file in the `accounts` volume.

Routing and TLS are handled by the Traefik instance already running on the VPS, through container
labels: `/ninjarena` goes to nginx and `/ninjarena/ws` (prefix stripped) to the WebSocket server.
The deploy script ends with a smoke test through Traefik on the VPS itself.
The workflow needs two repository secrets: `VPS_SSH_KEY`, a private key whose public half is in
the VPS user's `authorized_keys`, and `VPS_KNOWN_HOSTS`, the output of `ssh-keyscan` for the VPS.

To build and try the images locally:

```bash
docker build --target web -t ninjarena-web .
docker build --target server -t ninjarena-server .
```

## Configuration

The server reads its configuration from the environment at startup; every value is validated and
an invalid one stops the process.

| Variable                    | Default              | Meaning                                                                                                             |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NINJARENA_HOST`            | `127.0.0.1`          | Interface to bind. Use `0.0.0.0` to accept LAN connections.                                                         |
| `NINJARENA_PORT`            | `8080`               | WebSocket port (1-65535).                                                                                           |
| `NINJARENA_TICK_RATE`       | `60`                 | Simulation ticks per second (1-240).                                                                                |
| `NINJARENA_SNAPSHOT_RATE`   | `30`                 | Snapshots per second (1-240).                                                                                       |
| `NINJARENA_INPUT_QUEUE`     | `8`                  | Inputs buffered per player before the oldest are dropped (1-64).                                                    |
| `NINJARENA_MAX_CONNECTIONS` | `32`                 | Sockets accepted at once (1-1024); the next one is closed with `1013`.                                              |
| `NINJARENA_MAX_ROOMS`       | `64`                 | Rooms that can exist at once (1-1024); `createRoom` beyond that gets `TOO_MANY_ROOMS`.                              |
| `NINJARENA_POST_MATCH_MS`   | `8000`               | How long a finished match's result stays up before the room returns to the lobby, in ms (0-600000).                 |
| `NINJARENA_MAPS_DIR`        | `data/maps`          | Directory holding player-saved maps, one JSON file per map. Created on first save; `data/` is git-ignored.          |
| `NINJARENA_MAX_STORED_MAPS` | `100`                | Player-saved maps kept at once (0-10000); a new one beyond that gets `MAP_STORE_FULL` (overwriting one never does). |
| `NINJARENA_ACCOUNTS_FILE`   | `data/accounts.json` | JSON file holding every account (name, salted password hash, rating, wins, losses). Created on first registration.  |

The client is configured through query parameters:

| Parameter    | Default             | Meaning                                                                                                      |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `server`     | same origin + `/ws` | Server URL. The default is derived from the page's origin (`wss://` under HTTPS); Vite proxies `/ws` in dev. |
| `name`       | random `ninja-xxxx` | Display name, 1 to 24 characters.                                                                            |
| `room`       | none                | Room code; prefills and focuses the join form on the home screen.                                            |
| `editor`     | absent              | Opens the map editor instead of the home screen when present, regardless of value (`?editor`).               |
| `build`      | none                | Prefills the loadout panel's stat sliders: `vitality,strength,power,speed,maxChakra,chakraRegen,defense`.    |
| `basic`      | character's default | Prefills the loadout panel's basic attack pick, by ability id.                                               |
| `techniques` | none                | Prefills the loadout panel's technique picks: a comma-separated list of ability ids.                         |
| `delay`      | `6`                 | Interpolation delay for remote entities, in ticks (100 ms).                                                  |
| `zoom`       | `3`                 | Maximum integer display zoom for the fixed 640×360 view; 2 art pixels per world unit.                        |

The server also writes to `data/` (the `NINJARENA_MAPS_DIR` and `NINJARENA_ACCOUNTS_FILE`
defaults): player-saved maps land there as one JSON file per map, created on first save, and the
accounts in a single `accounts.json`, created on the first registration. The whole directory is
git-ignored — it is local, disposable state, not something to commit.

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
                                    abilities (effects/handlers), combat, projectile, match,
                                    ranking, simulation
  protocol/   @ninjarena/protocol   client and server messages, zod schemas, JSON codec
  content/    @ninjarena/content    abilities/, characters/, tilesets/, maps/, stat-rules.json
  server/     @ninjarena/server     config, transport, session, accounts, lobby, maps, match host,
                                    persistence
  client/     @ninjarena/client     config, input, network, netcode, rendering, feedback, audio,
                                    app, lobby, editor, ui, game
```

Tests live next to the code they cover, as `*.test.ts`. Vitest picks up
`packages/*/src/**/*.test.ts`.

## Data-driven gameplay

Balance and content are JSON, not code. Every file is validated by a zod schema when the game
loads, so a typo fails immediately with the file name and the offending field.

```
packages/content/src/
  abilities/kunai-strike.json  shuriken-throw.json  shadow-step.json  fireball.json
            seismic-slam.json  lightning-dash.json  earth-wall.json  blink.json
            paralysis-seal.json  chakra-shield.json
  characters/ninja.json
  stat-rules.json
  tilesets/default.json
  maps/arena.json
```

A character (`characters/ninja.json`) names its `basicAttackId` and `dashId`; every other ability
of `kind: "basic"` or `kind: "technique"` is available to any player, picked in the lobby's loadout
panel (a basic attack, plus three techniques). An ability declares its cost, its phase timings in
milliseconds, an optional telegraph, and an effect tree that runs once at activation:

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

**Adding a map.** A map is a versioned JSON document: two tile layers (`ground`, fully tiled, and
`objects`, where `null` means "nothing"), optional explicit `colliders` for shapes a grid cannot
express, and the spawn points, each optionally tagged with a team. Solid tiles are merged into
rectangles automatically, so a long wall costs one collider rather than one per tile. A bundled map
is one file under `packages/content/src/maps/`; a player-made one is drawn in the in-browser map
editor (`?editor`) and saved to the server. Both go through the same schema and validation — see
[docs/map-format.md](docs/map-format.md) for the full format and rules.

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

- lag compensation (server-side rewind when validating hits),
- per-viewer snapshot filtering, so `INVISIBLE` becomes a real secret instead of a rendering hint,
- delta-compressed and binary snapshots behind the existing `MessageCodec` seam,
- input redundancy for lossy transports, and smoothing for large mispredictions (only small
  corrections are eased today; a large one still snaps),
- painted sprite sheets and recorded audio, replacing the generated pixel recipes and procedural
  tones,
- map ownership (a stored map is still overwritable by anyone who knows its id, even though
  accounts exist now), matchmaking, spectating a room already in progress,
- a persistence backend behind `MatchResultRepository`,
- more techniques, more characters, and bots.

## License

MIT — see [LICENSE](LICENSE).
