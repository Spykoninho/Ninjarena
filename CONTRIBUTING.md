# Contributing to Ninjarena

Thanks for looking at the code. This document covers the workflow, the checks to run before a pull
request, and the rules the architecture relies on. The reasoning behind those rules is in
[docs/architecture.md](docs/architecture.md), [docs/networking.md](docs/networking.md) and
[docs/conventions.md](docs/conventions.md).

## Workflow

1. Fork the repository and create a branch from `main`. Name it after what it does, for example
   `feat/melee-parry` or `fix/dash-through-wall`.
2. Work in small, cohesive commits: one change per commit, with the tests that prove it.
3. Write commit messages as [Conventional Commits](https://www.conventionalcommits.org/), in
   English: `feat(core): add parry phase`, `fix(server): drop stale input sequences`,
   `docs: document the match reset`, `chore(deps): bump vitest`. Use the package name as the scope
   when the change belongs to one package.
4. Run the checks below, then open a pull request describing the behaviour you changed and how you
   verified it.

## Before a pull request

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These are exactly the steps CI runs, in that order.
`pnpm format` fixes formatting, and `pnpm test:watch` is the comfortable loop while you work.

When the change is visible in game, also run `pnpm dev` and check it with two tabs: create a room
in one (`http://localhost:5173/?name=a`), copy its link or code, and join from the other
(`?name=b&room=<code>`), ready up both sides and start — the two players must see each other, and
the behaviour must look the same in both tabs.

## Where tests go

Tests live next to the code they cover, named `<module>.test.ts`, and run under Vitest
(`packages/*/src/**/*.test.ts`). Shared simulation fixtures — a small map, test abilities, a duel
config, a ready-made `GameSimulation` — are in `packages/core/src/testing/fixtures.ts`; reuse them
rather than rebuilding a world by hand.

Test **behaviour**, not accessors. A useful test says "a dash stops at a wall", "a cast is
cancelled by a stun", "the round ends when one team is left", "reconciliation converges on the
server state". A test that a getter returns what the constructor was given proves nothing and has
to be rewritten with every refactor.

## Dependency rules

The package boundaries are the architecture. An arrow means "may import":

```
  server -> protocol -> core        client -> protocol -> core
  server -> content  -> core        client -> content  -> core
  server -> core                    client -> core
```

- **`core` imports nothing from the workspace.** It is the simulation: no DOM, no Node APIs, no
  network, no rendering, no randomness, no wall clock. An ESLint `no-restricted-imports` rule fails
  the build if a `@ninjarena/*` import — or a relative import climbing out of `packages/core/src` —
  appears there, and its `tsconfig` excludes DOM types.
- `protocol` and `content` depend on `core` only. They never depend on each other, on the server or
  on the client.
- `server` and `client` are the only packages allowed to touch I/O.

Two consequences worth stating on their own:

- **No gameplay logic in the renderer.** `PixiRenderer` receives a `RenderFrame` of positions,
  team colours and ratios; it never reads `WorldState`, never decides what hits what. If drawing
  something correctly seems to need a rule, the rule belongs in `core` and the result belongs in
  the frame.
- **No gameplay logic in the transport.** `WebSocketTransport` moves strings. `MessageCodec`
  turns strings into validated messages. Neither knows what a ninja is. Anything that decides an
  outcome lives in the simulation, on the server.

## Adding a technique

Techniques are data. In the common case you write no TypeScript at all: any ability of
`kind: "technique"` is automatically offered to every player in the lobby's loadout panel, so
there is no character file to touch.

1. Create `packages/content/src/abilities/<kebab-case-id>.json` with `"kind": "technique"`.
   Durations are in milliseconds, speeds and distances in world units (a tile is 16 units).
2. Register it in `packages/content/src/loadContent.ts` so it is parsed and catalogued.
3. Give it a `telegraph` (`kind`, `color`, `size`, `anchor`) so the client can announce the cast —
   an ability without one casts silently, which reads as a bug rather than a stealth technique —
   and a `visual` (`color`, `size`, optional `trail`) on every `projectile`, `area` and
   `spawnEntity` effect so it has something to draw. A one-sentence `description` is what the
   lobby's card shows on hover; without one the client spells the effects tree out instead, which
   is accurate but reads like a stat sheet.
4. Add a test in `packages/core/src/abilities/effects/executor.test.ts` (or the fixture-driven
   style used by the existing techniques there) for the behaviour you introduced.

A technique declares `cooldownMs`, `chakraCost` (basic attacks cost 0; techniques in this project
run 15–35), `startupMs`, `activeMs` (visual only — how long the client keeps drawing a melee arc or
held pose after activation; 0 does nothing to the simulation), `recoveryMs`, an optional
`canMoveWhileCasting`, `tags`, and an `effects` tree that runs once when the cast activates. See
"Adding a brick" below for what a brick can do, and `packages/content/src/abilities/fireball.json`
or `seismic-slam.json` for worked examples that nest a `damage` inside an `area` inside a
`projectile`.

Give the technique a strategy, not only numbers: the roster is balanced so that every attribute of
the build has techniques that reward it. A `damage` with `scaling: "physical"` belongs to a
strength build (`blade-whirlwind.json`, `ram-charge.json`, `shuriken-fan.json`), `"technique"` to
a power build, a `heal` or a `shield` to vitality and defense, a self `applyStatus` (`target:
"self"`, as in `wind-stride.json` or `smoke-veil.json`) to speed and chakra regeneration. Basic
attacks are free and follow the same idea: fast and weak, slow and heavy, wide and pushing, or
long-ranged.

5. Draw its illustration: add a painter for its id in
   `packages/client/src/rendering/art/abilityIcons.ts` (24 × 24, the palette `P` of
   `nativeArt.js`, no text). Without one the lobby card, the roster and the HUD fall back to the
   icon of its family (`abilityFamily`), which is legible but anonymous. If the technique needs a
   look of its own in the world, name it in the `style` of its `visual` (`"needle"`, `"kunai"`,
   `"shuriken"` on a projectile; `"column"` on an area) and draw it in `telegraphArt.ts` or
   `cues.ts`; a `melee` can carry a `color` so its arc and slash take the technique's tint. The
   [art-review page](http://localhost:5173/art-review.html) shows every icon at HUD scale.

## Adding a brick

A brick is one variant of the `Effect` union. Adding one is three edits, and the compiler forces
the third:

1. Add the variant to `EffectSchema` in `packages/core/src/definitions/ability.ts` (it is a
   `z.discriminatedUnion` under a `z.lazy`, so a brick that carries its own sub-effects, like
   `onHit` or `effects`, stays recursive for free).
2. Add a handler file under `packages/core/src/abilities/effects/handlers/`, matching the
   signature `(effect, context: EffectContext, path: string) => void` used by the existing
   handlers.
3. Register it in `effectHandlers` in `packages/core/src/abilities/effects/executor.ts`.

A brick that places something in the world says where from: `spawnEntity` and an `area` with
`origin: 'caster' | 'aim'` re-anchor on the caster, never on the impact point that triggered them,
so nesting one under an `onHit` list still spawns it at the caster. A brick that acts on a player
says on whom: `damage`, `knockback` and `stun` need the `target` of an `onHit`/`onContact` list,
`shield` and `heal` fall back to the caster without one, and `applyStatus` picks with `target:
'hit' | 'self'`, so a self buff sits directly in the activation list.

`effectHandlers` is typed as `{ [K in Effect['type']]: EffectHandler<K> }`, one entry per
discriminant, so the project does not compile until every brick in the union has a handler — there
is nowhere else to special-case an effect type. Finish with a test that exercises the new brick
through `GameSimulation.step`, in `packages/core/src/abilities/effects/executor.test.ts` for
cross-brick behaviour or next to the system that fires it (`pendingEffectSystem.test.ts`,
`dashContactSystem` is covered in `executor.test.ts`, `obstacleSystem.test.ts`) when the brick
creates or interacts with a world entity.

## Tuning balance

Every number that affects balance is content, not code, so tuning is a JSON edit and a re-run of
the tests that pin the formulas.

- **A technique's own numbers** — `chakraCost`, `cooldownMs`, timings, damage `amount`,
  `knockback.speed`, status `durationMs`/`magnitude` — live in its file under
  `packages/content/src/abilities/`.
- **The build system's shape** — the point budget, each attribute's `min`/`max`, and every
  coefficient that turns a point into a stat (`healthPerVitality`, `physicalDamagePerStrength`,
  `techniqueDamagePerPower`, `moveSpeedPerSpeed`, `chakraPerPoint`, `chakraRegenPerPoint`,
  `defensePerPoint`, and `techniqueSlots`) — lives in `packages/content/src/stat-rules.json`. The
  formulas themselves are fixed in `packages/core/src/stats/formulas.ts` and are not meant to
  change for a balance pass; only the coefficients should.
- **A character's baseline** — base health, chakra, chakra regen, move speed and collider radius —
  lives in `packages/content/src/characters/<id>.json`.
- **A match's pace** — `roundDurationMs`, `buildPoints` and `friendlyFire` are room settings a
  host picks in the lobby (bounds in `packages/core/src/lobby/roomSettings.ts`); `roundsToWin`
  is derived from the room's `bestOf`. `countdownMs` and `roundEndDelayMs` are not tunable per
  match — they are the fixed `DEFAULT_MATCH_TIMING` (3 seconds each) in the same file.
- **Practice** — `practice` is the one room setting that reaches `MatchConfig` without
  changing a number: it only disables the round timer, so a solo test run lasts until the player
  leaves.
- **Tournaments** — `tournamentSize` (4 or 8, `TOURNAMENT_SIZES` in
  `packages/core/src/tournament/bracket.ts`) is the whole room; every duel of the bracket is played
  with the room's `bestOf`, `roundDurationMs` and map, as a `ffa-2x1` match config
  (`matchFormatOf`).
- **The ranked queue** — the accepted rating gap (50 points, plus 10 per second waited) and the
  pairing cadence are the constants at the top of `packages/server/src/matchmaking/matchmaker.ts`;
  the duel a pair lands in is `QUEUE_ROOM_SETTINGS` in `packages/server/src/server.ts`.
- **Mines** — an `area` with `triggerRadius` fires when an enemy comes that close, or at
  `delayMs` otherwise; both are plain fields of the technique's file.
- **Fans** — a `projectile` with `count` above 1 fires that many, evenly spread over
  `spreadDegrees` and centred on the aim; each one carries the full `onHit` list.
- **Buffs** — a self `applyStatus` is tuned by its `durationMs` and `magnitude`: `HASTED`
  multiplies the move speed (1.35 is +35 %, and it stacks with a `SLOWED` magnitude), `INVISIBLE`
  hides the player from the other teams. A `heal` scales with power unless `scaling: "none"`.
- **The ranking** — the starting rating, the K factor, the spread and the tier thresholds are
  the constants at the top of `packages/core/src/ranking/rating.ts`; `rating.test.ts` pins the
  formula. Changing a threshold re-tiers every account on the next read, since a tier is derived
  from the rating rather than stored.

Every one of these files is parsed by its zod schema at load, so an out-of-range or missing value
fails immediately with the file name and the field, rather than shipping a silently broken number.
After a balance edit, `packages/core/src/stats/stats.test.ts` and the relevant ability test are
what confirm the change did what you intended.

## Adding a bundled map

The easiest way to make a map is the in-browser editor (`?editor` — paint, Validate, Save), which
produces a document a host can already select from the lobby without touching a line of code. To
add one as a **bundled**, read-only map instead:

1. Create `packages/content/src/maps/<id>.json` as a v1 map document — see
   [docs/map-format.md](docs/map-format.md) for every field, the validation rules and a full 8×8
   example.
2. Import it and add it to the `maps` catalog in `loadContent.ts`, next to `arena.json`.
3. Give it enough spawns for the room formats you expect it to be played in — `spawnIssues` (used
   by both the server and the editor) is what a room checks before it will start with this map.

Solid tiles become colliders automatically: they are merged into the largest possible rectangles,
so a straight wall is one shape rather than one per tile. Terrain effects come from the tileset —
each tile declares `solid`, `speedMultiplier` and `tags`, and the movement system samples the tile
under the player's centre.

## Adding a map tile

A tile is one entry in a tileset's `tiles` record (`packages/content/src/tilesets/default.json`),
keyed by its numeric id as a string:

1. Add `"<id>": { "name", "color", "layer" }` to the tileset, plus `solid: true` if it should block
   movement and projectiles, `speedMultiplier` if it should not be `1`, and `tags` for anything an
   ability's `TerrainRule` might key off (a fire technique hitting harder on grass, say). `layer` is
   `"ground"` (the default) or `"objects"`: `"ground"` tiles fill every cell of the layer they are
   painted on, `"objects"` tiles can be `null` (nothing) instead.
2. That is the whole schema change — `TileTypeSchema` in `packages/core/src/definitions/tileset.ts`
   validates any tile id the same way, so nothing in `core` needs to know the new id exists.
3. The editor's palette (`paletteOf` in `packages/client/src/editor/editorModel.ts`) reads the
   tileset directly, so the new tile appears there automatically, on the layer it declared, the
   next time a map using this tileset is opened.

## Adding a room rule

A room setting is one field of `RoomSettings` (`packages/core/src/lobby/roomSettings.ts`):

1. Add the field to the `RoomSettings` interface and to the zod object `roomSettingsSchema`
   returns, with whatever bounds make sense (see the existing `min`/`max` constants at the top of
   the file for the pattern).
2. Give it a default in `defaultRoomSettings`, so a freshly created room always has a valid value.
3. If it affects the simulation, add one line to `toMatchConfig` mapping it onto the matching
   `MatchConfig` field (adding a new one to `MatchConfigSchema` first if it does not exist yet).
   A setting that only affects lobby behaviour, like `mapId`, needs no `toMatchConfig` line at all.
4. Add the field to both `RoomSettingsSchema` and `RoomSettingsPatchSchema` (`.optional()` there)
   in `packages/protocol/src/schemas.ts`, with the same bounds as the core schema.
   `RoomSettingsSchema` is declared `z.ZodType<RoomSettings>`, so forgetting the field there is a
   compile error; `RoomSettingsPatchSchema` is not typed against `RoomSettingsPatch`, so a field
   missing there is easy to forget and nothing catches it at build time. Both are `z.strictObject`,
   which does not strip an unrecognized field — it fails the whole parse — so the symptom of
   skipping this step is not a silently stripped field but a `roomState` broadcast or an
   `updateSettings` message that fails to decode and is dropped outright.
5. Add a row for it in `settingsRows` (`packages/client/src/lobby/lobbyModel.ts`) so the host's
   lobby form shows and edits it, and a case in `settingsPatch` in the same file so a change to
   that row turns into the right `RoomSettingsPatch`.

`applySettingsPatch` merges a patch onto the current settings and re-parses the whole object with
the core schema, so a bad value for the new field is rejected (`INVALID_SETTINGS`) before it
reaches the room — but only once it has survived the wire, which is what step 4 is for.

## Code style

Prettier and ESLint decide the rest; these are the choices they cannot enforce.

- **English** for identifiers, types, test names, documentation and commit messages. **French**
  for everything a player reads: UI strings, ability names and descriptions, map validation
  messages.
- **Code comments are one French line**, in every file that carries code — sources, tests and
  configuration alike. They are rare: only for an architectural choice, a piece of non-obvious logic
  or a network constraint. A comment that restates the code is removed instead of updated. This is
  the maintainer's convention; everything else stays in English.
- `import type` for type-only imports (enforced by
  `@typescript-eslint/consistent-type-imports`), relative imports without a file extension.
- No `any`. `strict` and `noUncheckedIndexedAccess` are on: handle the `undefined` an index access
  can return instead of asserting it away.
- Small functions with a name that says what they do; a module exports its public surface through
  its `index.ts`.
- Data files: ids are `kebab-case` and match the file name, durations are in milliseconds and
  named `...Ms`, distances and speeds are in world units.

## Reporting a bug

Open an issue with the match mode, what you did, what happened, and what you expected. For a
gameplay bug, the console output of both tabs and the tick at which it happened help a lot.
