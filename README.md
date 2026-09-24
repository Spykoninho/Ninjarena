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
  teleports, delayed zones, proximity mines, spawned walls, shields, statuses, rounds and match,
- private rooms joined by a 6-character code, with an optional password, a host-editable lobby
  (mode, teams, map, build points, best-of, round length, friendly fire), team switching, and a
  loadout panel the server validates on every change, reflected back as a per-player verdict,
  before "Ready" can even be pressed,
- a full-screen tile map editor: the map fills the window with wheel zoom and drag panning, a
  build drawer sorted by ground, walls, decor and spawns with in-game thumbnails, live validation
  (structural, spawn and reachability checks) with click-to-locate issues, save to the server,
  export or import JSON, and a one-click solo test run: **Tester** saves the map, opens a
  practice room behind the editor, equips and starts alone, and **Retour à l'éditeur** (or
  Escape) brings the map back exactly where it was — see [docs/map-format.md](docs/map-format.md),
- a **practice** room setting (`Entraînement`): the host can start alone and the round has no
  timer, for trying a build or a map without an opponent; **Bac à sable** on the home menu opens
  one and starts it without showing the lobby, and **Personnage** (in the HUD corner or the Escape
  menu) changes the build and the attacks mid-match, re-equipping the ninja on the spot,
- a **tournament** room setting: 4 or 8 players, drawn into a single-elimination bracket at kick-off,
  play their duels one after the other while everyone else in the room watches the current one;
  the bracket is a lobby tab and a page of the in-game Escape menu — see
  [docs/rooms.md](docs/rooms.md#tournaments),
- a **ranked queue** (`Partie classée` on the home menu): logged-in players are paired by rating,
  with a gap that widens as they wait, into a locked ranked duel room that starts by itself once
  both are ready — see [docs/rooms.md](docs/rooms.md#the-ranked-queue),
- an in-game **Escape menu**: resume, quit the match, read the tournament bracket, change the
  character in a practice match, and rebind the five attack keys (kept in `localStorage`; the
  lobby's character tab shows the current ones),
- **touch controls** on phones and tablets: a floating joystick under the left thumb, and five
  attack buttons under the right one that fire at the nearest enemy on a tap or aim along a drag,
  with a guide drawn from the ninja; a computer never sees any of it — see [Controls](#controls),
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
- bots, spectating a room already in progress from outside it, kicking a player, editor undo/redo,
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

On a touch screen, `touchPlayerInput` builds the same `PlayerInput` from the joystick and the
attack buttons instead, so everything downstream is unchanged.

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

- <http://localhost:5173/?name=a>, pick **Créer une partie**, then **Partie personnalisée** and
  press **Créer**. The lobby header shows the room code (for example `9VHJ3Z`) and a **Copier le
  lien d'invitation** button that copies `?room=9VHJ3Z` appended to the current page.
- <http://localhost:5173/?name=b&room=9VHJ3Z> (or paste the copied link, or pick **Rejoindre une
  partie** and type the code from the home menu) — the code prefills the join form and the second
  tab joins the same room.

**Créer une partie** offers four kinds. **Bac à sable** opens a practice room and starts it alone,
without a lobby, to walk around a map and try a build. **Personnage**, in the HUD corner or the
Escape menu, opens the lobby's build and attack panel over the match: every change re-equips the
ninja where it stands, with full gauges and every attack ready, and the same picks carry over to
the next lobby. **Quitter le bac à sable** comes back to the menu. **Tournoi** asks for 4 or 8
players and opens a room whose code the others join; once every seat is taken and everyone is
ready, the host launches it and the bracket is drawn. **Partie classée** joins the ranked queue
(an account is required): the home screen shows how many players are waiting, with **Annuler**,
until the server pairs two close ratings into a locked ranked room that starts as soon as both are
ready. **Partie personnalisée** is the plain room with every setting in the host's hands.

The home menu also carries the account bar: **Se connecter** opens the login form (a name and a
password), and its **Pas encore de compte ? En créer un** link turns the same form into the
registration one. The browser keeps the session afterwards: reloading the page, or coming back the
next day, lands logged in until **Déconnexion**. A logged-in player keeps that name in every room
and shows a rank badge next to it; **Classement** lists every account by rating. Playing as a guest
(no account) is still fine for unranked rooms.

Both tabs now show the lobby, split in tabs. **Salon** is the stage: one column per team,
each player drawn as their ninja with their name, a rank badge if they are logged in, a HÔTE badge,
a PRÊT / PAS PRÊT pill and the icons of the attacks they picked; open seats carry a **Rejoindre
cette équipe** button. **Réglages de la partie** holds the host-only form (mode, map — **Aléatoire**
by default, a different map for every round, or any one map of the library — teams,
players per team, build points, rounds, round duration, friendly fire, ranked, tournament); with
**Partie classée** ticked, a table under the form shows every player's rating and what a win earns
and a loss costs them, and with **Tournoi** ticked the format rows fold away behind the bracket
size. **Personnage** is where each player distributes
the stat points and builds their kit: the five slots show the key each attack is bound to (basic
attack, dash, then technique 1, 2 and 3 — **Modifier mes touches** under the kit rebinds them),
and picking a slot lists the techniques as cards — hover
one to read what it does, its damage, chakra cost, cooldown and cast time. A **Tournoi** tab
appears in a tournament room and shows the bracket, live match highlighted. Press **Prêt** at the
bottom — the server validates the loadout and reflects the verdict back before Prêt can be pressed
with an invalid one. Once both are ready, the host's **Lancer la partie** button lights up (it is
greyed out with the reason otherwise — see `startBlockers` in [docs/rooms.md](docs/rooms.md)).
Press it: you should see both ninjas, a countdown, then the round banner and the running round
timer in the HUD. First team to win
`roundsToWin` rounds (best of 3 by default) takes the match, and every player returns to the lobby,
not ready, a few seconds after the last round ends.

Add `?editor` (or pick **Éditeur de cartes** on the home menu) to open the map editor — see
[docs/map-format.md](docs/map-format.md). Its **Tester** button plays the map alone: the client
saves it, opens a practice room without showing the lobby, equips the current loadout, readies up
and starts; **Retour à l'éditeur** in the HUD (or Escape, then the same button in the pause menu)
leaves the room and lands back on the map. If the room refuses to start (an invalid map, a
rejected loadout), the lobby appears instead so the reason can be read.

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
| `touch`      | the device decides  | `?touch` forces the touch controls, `?touch=0` removes them; absent, only a touch-only screen gets them.     |

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
  abilities/kunai-strike.json  shuriken-throw.json  staff-sweep.json  iron-fist.json
            senbon-volley.json  shadow-step.json  fireball.json  seismic-slam.json
            lightning-dash.json  earth-wall.json  blink.json  paralysis-seal.json
            chakra-shield.json  explosive-mine.json  blade-whirlwind.json  ram-charge.json
            pinning-kunai.json  shuriken-fan.json  frost-breath.json  sky-strike.json
            smoke-veil.json  wind-stride.json  meditation.json
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

The bricks are `projectile` (one, or a fan of `count` spread by `spreadDegrees`; `pierce` makes
it a wave that crosses every target once), `area` (at the caster, at the aim's full `range`,
under the `cursor`, or `here`; a `count` scattered over `scatterRadius` makes a cluster, and
`fragile` lets an enemy attack set it off, the whole cluster with it), `dash`, `melee`,
`teleport`, `spawnEntity` (a wall), `shield`, `heal`, `sacrificeChakra`, `delayedTrigger`,
`damage`, `knockback`, `stun` and `applyStatus` (on the target hit, or on the caster with
`target: "self"`);
the ones that carry sub-effects (`projectile.onHit`/`onExpire`, `area.onHit`, `dash.onContact`,
`delayedTrigger.effects`) make the tree recursive, so an explosion can knock back into a stun into
a slow. Damage `scaling` is `physical` (scales with the attacker's strength), `technique` (scales
with power) or `none`. The roster is built so that every stat carries a strategy: five basic
attacks (kunai, shuriken, staff sweep, iron fist, senbon) and seventeen techniques split between
physical ones for strength builds (blade whirlwind, ram charge, pinning kunai, shuriken fan),
technique-scaled ones for power builds (fireball, the seismic wave, lightning dash, frost breath,
sky strike, the mine cluster), control (paralysis seal, pinning kunai, frost breath), self buffs
(smoke veil, wind stride), sustain (meditation, which costs half the chakra pool for the round,
and chakra shield) and utility (earth wall, blink).
Adding a technique is JSON only — see
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
| —      | F                    | Toggle fullscreen              |
| —      | Escape               | Pause menu                     |

The five attack slots can be rebound from the pause menu (**Touches**) or the lobby's character
tab: click a slot, press a key or a mouse button, and the new binding is saved in the browser; a
key already used by another slot swaps places with it. Escape opens the pause menu in any match:
**Reprendre**, **Tournoi** (the bracket, in a tournament room), **Personnage** (the build and the
attacks, in a practice match), **Touches**, and **Quitter la partie** — which leaves the room,
forfeiting the match if it is still running.

Every ninja shares the same basic attack (Kunai Strike, a free melee arc) and dash (Shadow Step,
which walls still stop); the three technique slots are whatever the player picked on the setup
panel, each with its own chakra cost, cooldown and telegraph. Chakra regenerates over time and
gates everything but the basic attack; a technique whose cost is not available is rejected.
Holding a button does not repeat the cast: only the press matters. Tab only does something once
the local player is dead and the match is `IN_ROUND` — or from the start, for a tournament
spectator: it cycles the camera through living teammates (or every living player in a free-for-all
mode). F toggles fullscreen from any screen
(except while typing in a field); during a match the system pointer is replaced by a pixel reticle
drawn at load like the rest of the art. The visual effects — wind and water, impact flashes, screen
shake — are always on and have no setting; only the system's reduced-motion preference turns them
off.

### Touch controls

A phone or a tablet — a screen whose only pointer is a finger, with no hover — plays with touch
controls instead; a computer, even one with a touch screen, keeps the keyboard and the mouse and
sees no difference. During a match:

- the **left half** of the screen is a joystick: it appears under the thumb and runs at full speed
  in the direction pushed; the ninja faces where it walks,
- the **attack buttons** sit in an arc under the right thumb (the basic attack is the big one, the
  dash on its left, the three techniques above) and show the same cooldown, chakra cost and lock
  as the keyboard HUD,
- a **tap** fires at once: an attack turns toward the nearest visible enemy in range, a dash or a
  blink goes where the joystick points, a self buff, a shield or a whirlwind simply goes off,
- a **drag** out of a button aims by hand: a dotted guide leaves the ninja (a line, a cone, a
  wall or the circle where a strike lands, at the share of its range dragged), the shot leaves on
  release, and sliding back to the button's centre cancels it,
- a pressed attack that cannot go yet (another cast, a cooldown about to end) waits a quarter of a
  second rather than being lost,
- **Menu**, in the top corner, opens the pause menu (resume, character in practice, quit), and
  **Joueur suivant** replaces Tab while spectating.

The vitals move to the top-left corner with the minimap under them (under the menu in portrait),
and a hint suggests turning the phone to landscape, where the arena reads best.

The page goes fullscreen at the first tap wherever the browser allows it (Android, iPad). An iPhone
keeps its browser bars on any web page, so there the game is meant to be added to the home screen
(Share, then **Sur l'écran d'accueil**): it then opens fullscreen with its own icon, and an
installed Android copy also locks itself to landscape. The phone keeps an installed copy's page
alive in the background, so when it comes back on the home screen it asks the server for the
current build and reloads if a deployment replaced it; in a room or a match it waits for the next
return to the home screen.

When the match ends, a result panel names the winner or winners and lists every player's damage
dealt, damage taken, eliminations and deaths — plus, in a ranked room, the new rating and how much
it moved — until the room returns to the lobby.

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
  accounts exist now), spectating a room already in progress from outside it, ranked queues for
  team formats (the queue only makes duels today),
- a persistence backend behind `MatchResultRepository`,
- more techniques, more characters, and bots.

## License

MIT — see [LICENSE](LICENSE).
