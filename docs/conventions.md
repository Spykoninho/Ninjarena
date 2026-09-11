# Conventions

The rules Prettier and ESLint cannot enforce. [CONTRIBUTING.md](../CONTRIBUTING.md) is the short
version for a first pull request; this note is the reference.

## Language

- **English** for identifiers, types, file names, test names, documentation, commit messages,
  issues and anything a player can read.
- **Code comments are the one exception: one French line each.** This is the maintainer's
  convention and it applies to every file that carries code — sources, tests and configuration
  files alike.

## Naming

| Kind                                    | Style                                                     | Example                                           |
| --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Types, interfaces, classes              | `PascalCase`                                              | `PlayerState`, `SnapshotInterpolator`             |
| Functions, variables, properties        | `camelCase`                                               | `applyDamage`, `interpolationDelayTicks`          |
| Module-level constants                  | `SCREAMING_SNAKE`                                         | `DEFAULT_SIMULATION_CONFIG`, `MAX_ABILITY_SLOTS`  |
| Union members, phases, statuses, events | `SCREAMING_SNAKE` for states, `camelCase` for event types | `IN_ROUND`, `INVULNERABLE`, `projectileDestroyed` |
| Source files                            | `camelCase.ts`                                            | `matchSystem.ts`, `buildPlayerInput.ts`           |
| Data files and their ids                | `kebab-case`                                              | `kunai-slash.json` holding `"id": "kunai-slash"`  |
| Test files                              | `<module>.test.ts`                                        | `movementSystem.test.ts`                          |

A duration ends in `Ms` when it is milliseconds (`cooldownMs`, `roundDurationMs`) and in `Ticks`
when it is ticks (`interpolationDelayTicks`). A tick value that is an absolute point in time is
`...At` (`readyAt`, `expiresAt`, `phaseEndsAt`). Booleans read as questions answered yes:
`friendlyFire`, `autoStartWhenFull`, `canMoveWhileCasting`.

## File layout per module

A module is a directory under `src/` with one concern, small files, and an `index.ts` that
re-exports its public surface. Nothing outside a module reaches past that barrel except inside the
same package, where a direct relative import is fine and avoids cycles.

```
  collision/
    shapes.ts          the data and the geometry it can answer
    resolve.ts         what uses that geometry
    spatialGrid.ts     one independent structure, one file
    tileMerge.ts
    index.ts           export * from each of the above
    *.test.ts          next to what they cover
```

Systems live in `simulation/systems/` and are plain functions taking `SimulationContext`. State
shapes and their constructors live in `state.ts`; predicates over that state live in `rules.ts`;
transitions live in their own file. A file that has grown two unrelated halves is split, not
sectioned with comments.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `isolatedModules` are on. An
  index access returns `T | undefined`: handle it, do not assert it away.
- **No `any`.** `unknown` at a boundary, then narrow. Casts are exceptional and each one is
  justified on the spot: the two effect handler lookups (where the discriminant guarantees a match
  the compiler cannot correlate), the structural deep clone, and the opaque timer handle.
- `import type` for type-only imports — enforced by `@typescript-eslint/consistent-type-imports`.
- Relative imports without a file extension; workspace packages by their `@ninjarena/*` name.
- Prefer a discriminated union over a flag plus optional fields, and exhaustive `switch` over a
  chain of `if`. `noFallthroughCasesInSwitch` and a `never` default catch the variant you forgot.
- Classes only where there is genuine identity and lifetime (`GameSimulation`, `InputQueue`,
  `PixiRenderer`). Everything else is a function over plain data.
- State that crosses the wire or gets cloned is plain data: records and arrays, no `Map`, no `Set`,
  no class instances, no getters. `WorldState` depends on this.

## Comments

Rare, one line, in French, above the thing they explain — in sources, tests and configuration files
alike. Write one only for:

- an **architectural choice** that the code cannot show — why a seam exists, why an order matters,
- **non-obvious logic** — an invariant, a guard that looks removable but is not,
- a **network or timing constraint** — why a frame is dropped, why a clock is smoothed.

```ts
// Une trame réseau est hostile par défaut: le décodage renvoie null au lieu de lever.
```

Never write a comment that restates the code, never a banner or a section separator, never a
commented-out block, never a TODO without an issue. If a comment is needed to explain _what_ a
function does, the function needs a better name instead. A comment that stops being true is deleted
with the code it described.

## Tests

Vitest, `packages/*/src/**/*.test.ts`, next to the code under test. Shared simulation fixtures are
in `packages/core/src/testing/fixtures.ts`.

**Test behaviour, not accessors.** The question a test answers is "does the rule hold?", not "does
this field exist?".

```ts
// Worth writing
it('stops a dash at a wall', () => {});
it('cancels a cast when the caster is stunned', () => {});
it('ends the round when only one team is alive', () => {});
it('converges on the server state after replaying pending inputs', () => {});

// Not worth writing
it('returns the health that was set', () => {});
it('exposes the config it was constructed with', () => {});
```

Each test names the behaviour in the `it` string, arranges through a fixture, acts through the
public API (`simulation.step`, `applyDamage`, `queue.next`), and asserts on the observable result —
state, returned value, or emitted events. Prefer asserting on `WorldEvent`s over reaching into
private fields: the events are the contract the client consumes.

Cover the branch you added, including its rejection: an ability test that only checks the happy
path leaves `ON_COOLDOWN` and `NOT_ENOUGH_ENERGY` undefended. A bug fix comes with the test that
fails without it.

## Data files

- One definition per file for abilities, characters, tilesets and maps; the presets that only make
  sense as a set (match modes) share one file.
- The `id` is `kebab-case` and matches the file name. Ids are the currency between files: a
  character lists ability ids, a map names its tileset, the server config names a map and a match
  mode.
- **Durations in milliseconds**, always suffixed `Ms`. The simulation converts them to ticks with
  `msToTicks`, so changing the tick rate does not change balance.
- Distances, speeds and radii are in **world units**; a tile is 16 units. Speeds are per second and
  the simulation multiplies by `dt`.
- Every file is parsed by its zod schema at load, and a failure names the file and the field.
  Schema defaults (`canMoveWhileCasting: false`, `tags: []`, `solid: false`, `speedMultiplier: 1`,
  `friendlyFire: false`) mean optional fields can simply be omitted.
- A new file must be registered in `packages/content/src/loadContent.ts`; the JSON is imported, not
  read from disk, so the same content ships to the browser and the server.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), in English, imperative mood, no
trailing period.

```
  feat(core): add parry phase
  fix(server): drop stale input sequences
  refactor(client): extract the snapshot interpolator
  test(core): cover the gap-passing rule
  docs: document the match reset
  chore(deps): bump vitest to 4.1
```

Types in use: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. The scope is the package name
(`core`, `protocol`, `content`, `server`, `client`) and is omitted for repository-wide changes.

Keep commits small and cohesive: one behavioural change plus the tests that prove it. A commit that
touches five packages for three unrelated reasons is three commits. The commit message says what
changes and, when it is not obvious, why — the diff already says how.
