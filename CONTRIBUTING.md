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
  the build if a `@ninjarena/*` import appears there, and its `tsconfig` excludes DOM types.
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

## Adding an ability

Abilities are data. In the common case you write no TypeScript at all.

1. Create `packages/content/src/abilities/<kebab-case-id>.json`. Durations are in milliseconds,
   speeds and distances in world units (a tile is 16 units).
2. Register it in `packages/content/src/loadContent.ts` so it is parsed and catalogued.
3. Add its id to a character's `abilities` array in `packages/content/src/characters/`. A
   character has at most four slots, and the slot order is the binding order (left click, right
   click, Space, E).
4. Add a test in `packages/core/src/abilities/abilities.test.ts` for the behaviour you introduced.

An ability declares `cooldownMs`, `energyCost`, `startupMs`, `recoveryMs`, an optional
`canMoveWhileCasting`, `tags`, and one or more activation effects. Activation effects
(`projectile`, `dash`, `melee`) fire when the cast activates; hit effects (`damage`, `knockback`,
`stun`, `applyStatus`) apply to a target that was reached.

**A new kind of effect** is two edits and nothing else:

- add a variant to `ActivationEffectSchema` or `HitEffectSchema` in
  `packages/core/src/definitions/ability.ts`,
- add the matching handler to `activationHandlers` in
  `packages/core/src/abilities/effects/activationEffects.ts` or to `hitHandlers` in
  `effects/hitEffects.ts`.

Both handler records are typed by the effect's discriminant, so TypeScript refuses to compile until
the handler exists and its effect parameter is narrowed correctly. Do not special-case an effect
type inside a system.

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

- **English** for identifiers, types, tests, documentation and anything a player sees.
- **Comments are rare.** One line, in French, only for an architectural choice, a piece of
  non-obvious logic or a network constraint. A comment that restates the code is removed instead of
  updated. This is the maintainer's convention; everything else stays in English.
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
