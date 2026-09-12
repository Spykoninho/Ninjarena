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

When the change is visible in game, also run `pnpm dev` and check it with two tabs
(`http://localhost:5173/?name=a` and `?name=b`): the two players must see each other, and the
behaviour must look the same in both tabs.

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
`kind: "technique"` is automatically offered to every player on the setup panel, so there is no
character file to touch.

1. Create `packages/content/src/abilities/<kebab-case-id>.json` with `"kind": "technique"`.
   Durations are in milliseconds, speeds and distances in world units (a tile is 16 units).
2. Register it in `packages/content/src/loadContent.ts` so it is parsed and catalogued.
3. Give it a `telegraph` (`kind`, `color`, `size`, `anchor`) so the client can announce the cast —
   an ability without one casts silently, which reads as a bug rather than a stealth technique —
   and a `visual` (`color`, `size`, optional `trail`) on every `projectile`, `area` and
   `spawnEntity` effect so it has something to draw.
4. Add a test in `packages/core/src/abilities/effects/executor.test.ts` (or the fixture-driven
   style used by the existing techniques there) for the behaviour you introduced.

A technique declares `cooldownMs`, `chakraCost` (basic attacks cost 0; techniques in this project
run 20–35), `startupMs`, `activeMs` (visual only — how long the client keeps drawing a melee arc or
held pose after activation; 0 does nothing to the simulation), `recoveryMs`, an optional
`canMoveWhileCasting`, `tags`, and an `effects` tree that runs once when the cast activates. See
"Adding a brick" below for what a brick can do, and `packages/content/src/abilities/fireball.json`
or `seismic-slam.json` for worked examples that nest a `damage` inside an `area` inside a
`projectile`.

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
so nesting one under an `onHit` list still spawns it at the caster.

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
- **A match preset's pace** — `roundDurationMs`, `buildPoints`, `roundsToWin`, `countdownMs`,
  `roundEndDelayMs`, `friendlyFire` — lives in `packages/content/src/match-modes.json`.

Every one of these files is parsed by its zod schema at load, so an out-of-range or missing value
fails immediately with the file name and the field, rather than shipping a silently broken number.
After a balance edit, `packages/core/src/stats/stats.test.ts` and the relevant ability test are
what confirm the change did what you intended.

## Adding a map

1. Create `packages/content/src/maps/<id>.json` and register it in `loadContent.ts`.
2. Declare `width`, `height`, the `tileset` id, and a `legend` mapping single characters to tile
   ids of that tileset.
3. Draw two ASCII layers of exactly `height` rows of exactly `width` characters: `ground` must be
   fully tiled, `objects` may use a space for "nothing".
4. Add `spawns`. A spawn with a `team` index belongs to that team in team modes; spawns without a
   `team` are the free-for-all slots. Give a format at least as many spawns as it has players per
   team, or the same points will be reused.
5. Optionally add explicit `colliders` (`rect`, `circle`, `polygon`) for shapes the tile grid
   cannot express, such as a diagonal wall.

Solid tiles become colliders automatically: they are merged into the largest possible rectangles,
so a straight wall is one shape rather than one per tile. Terrain effects come from the tileset —
each tile declares `solid`, `speedMultiplier` and `tags`, and the movement system samples the tile
under the player's centre.

## Code style

Prettier and ESLint decide the rest; these are the choices they cannot enforce.

- **English** for identifiers, types, test names, documentation, UI strings and commit messages.
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
