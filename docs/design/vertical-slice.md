# Ninjarena — Vertical Slice Design

Date: 2026-09-12
Status: approved
Builds on: docs/design/foundations.md (all its decisions stand unless amended here)

Superseded on rooms and joining by
[docs/design/lobby-rooms-map-editor.md](lobby-rooms-map-editor.md): there is no single default
room any more, `join` is gone from the protocol, and the pre-match screen described below was
replaced by a lobby and a loadout panel.

## 1. Goal

Turn the foundations into a playable vertical slice: two or more players pick a stat build
and three techniques, then fight with free movement, mouse aim, a free basic attack, a
universal dash and telegraphed techniques that consume chakra, until one team is left
standing; rounds chain until a team reaches the required number of round wins. Priorities,
in order: game feel, network stability, clean architecture.

Everything in the simulation stays authoritative on the server, data-driven, deterministic
and independent of rendering. All new gameplay numbers live in content JSON.

## 2. Decisions

| Topic            | Decision                                                                                                                                                                                         | Why                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Ability model    | Evolve the existing effect lists into a recursive effect tree with per-ability phases and a typed telegraph                                                                                      | Composition from bricks without rewriting the core; examples such as fireball (projectile + damage + explosion) map one-to-one |
| Bricks delivered | projectile, area (instant or delayed), dash (contact effects, optional invulnerability ticks), melee, teleport, spawnEntity (wall), shield, delayedTrigger, damage, knockback, stun, applyStatus | The full set needed for the vertical slice; walls need dynamic colliders, accepted                                             |
| Resource         | `energy` renamed to `chakra` everywhere (state, stats, ability cost, events, HUD, docs)                                                                                                          | Vocabulary of the game                                                                                                         |
| Stats            | Seven attributes distributed from a budget; derived `PlayerStats` computed by pure formulas with coefficients in content                                                                         | Formulas easy to tune; speed never touches cooldowns                                                                           |
| Damage           | `physical` scales with strength, `technique` with power, both mitigated by the target's defense                                                                                                  | Clear separation between the two damage sources                                                                                |
| Loadout          | slot 0 basic attack (character), slot 1 dash (character), slots 2–4 techniques chosen by the player; five ability slots                                                                          | MVP loadout without an ultimate                                                                                                |
| Selection UX     | DOM setup panel before joining (name, seven sliders, three technique selects, Play), prefilled from URL parameters; validated by the server at `join`                                            | Testable by hand today, replaceable by a lobby later                                                                           |
| Transport        | WebSocket kept                                                                                                                                                                                   | TCP orders and retransmits; the only network defect to absorb is delay                                                         |
| Prediction       | Entities owned by the local player render from the predicted simulation, everything else from the interpolator; small reconciliation errors are smoothed visually                                | Own shots and dashes feel instant; corrections stop snapping                                                                   |
| Telegraphs       | Data on the ability and on spatial effects, rendered by the client from casting phase state and pending zones already in the snapshot                                                            | The server never depends on visuals; every technique gets its own signal                                                       |
| Game feel        | A client feedback layer maps simulation events to particles, flashes, shake, trails, hit stop and procedural audio                                                                               | Sells every hit and cast with zero art assets                                                                                  |
| Spectator        | Client-side camera follow of teammates (team) or anyone alive (FFA), cycled with Tab                                                                                                             | Small and enough for a vertical slice                                                                                          |
| Rounds           | Default round 240 s, best-of via `roundsToWin`, timer expiry stays a draw                                                                                                                        | Keeps a round inside a 3–5 minute target                                                                                       |

## 3. Core changes (`@ninjarena/core`)

### 3.1 Chakra

`PlayerState.chakra`, `PlayerStats.maxChakra`, `PlayerStats.chakraRegenPerSecond`,
`AbilityDefinition.chakraCost`, rejection `NOT_ENOUGH_CHAKRA`. Basic attack cost 0, dash 10,
techniques 20–35 (content).

### 3.2 Attributes, builds and derived stats (`core/src/stats/`)

```ts
type AttributeId = 'vitality' | 'strength' | 'power' | 'speed' | 'maxChakra' | 'chakraRegen' | 'defense';
type Build = Record<AttributeId, number>;            // integer points per attribute

// content: stat-rules.json
interface StatRulesDefinition {
  defaultPointBudget: number;                          // 10
  attributes: Record<AttributeId, { min: number; max: number }>;   // 0..5 each
  coefficients: {
    healthPerVitality: number;          // +12 HP per point
    physicalDamagePerStrength: number;  // +6 % per point
    techniqueDamagePerPower: number;    // +6 % per point
    moveSpeedPerSpeed: number;          // +3 % per point
    chakraPerPoint: number;             // +10 max chakra
    chakraRegenPerPoint: number;        // +1 chakra/s
    defensePerPoint: number;            // +8 defense rating
  };
  techniqueSlots: number;               // 3
}

interface PlayerStats {
  maxHealth: number; maxChakra: number; chakraRegenPerSecond: number; moveSpeed: number;
  colliderRadius: number;
  physicalDamageMultiplier: number; techniqueDamageMultiplier: number; defense: number;
}

computeStats(base: CharacterBaseStats, build: Build, rules: StatRulesDefinition): PlayerStats
validateBuild(build: unknown, rules, budget: number): { ok: true; build: Build } | { ok: false; reason: string }
computeDamage(input: { base: number; scaling: 'physical' | 'technique' | 'none'; attacker?: PlayerStats; defender: PlayerStats }): number
  // amount = base × attackerMultiplier(scaling) × 100 / (100 + defender.defense), rounded to 0.1
```

Formulas live in `stats/formulas.ts` only; coefficients come from content. Speed affects
`moveSpeed` and nothing else. `CharacterDefinition` gains `baseStats` (health, chakra, regen,
moveSpeed, colliderRadius), `basicAttackId` and `dashId`; its `abilities` array disappears.
`PlayerState` stores `build` and the derived `stats`. `MatchConfig` gains `buildPoints`
(default = rules budget).

### 3.3 Loadout

`LoadoutDefinition = { basicAttackId, dashId, techniqueIds: string[3] }`.
`validateLoadout(techniqueIds: unknown, catalog, rules)` requires exactly `techniqueSlots`
distinct existing abilities of `kind: 'technique'`. `createPlayerState` receives the
loadout and produces five `AbilitySlot`s in fixed order; `MAX_ABILITY_SLOTS = 5`.

### 3.4 Ability definition v2

```ts
interface AbilityDefinition {
  id; name; kind: 'basic' | 'dash' | 'technique';
  cooldownMs; chakraCost; startupMs; activeMs (default 0); recoveryMs;
  canMoveWhileCasting (default false);
  telegraph: Telegraph | null;     // shown from cast start until activation
  tags: string[];
  effects: Effect[];               // run once at activation
}

interface Telegraph { kind: 'orb' | 'ring' | 'flash' | 'ground-circle' | 'ground-mark' | 'charge';
                      color: '#rrggbb'; size: number; anchor: 'caster' | 'aim' }

interface Visual { color: '#rrggbb'; size: number; trail?: boolean }   // projectiles and zones

type Effect =
  | { type: 'projectile'; speed; radius; lifetimeMs; visual: Visual; onHit: Effect[]; onExpire: Effect[] }
  | { type: 'area'; radius; delayMs (0 = instant); origin: 'caster' | 'aim' | 'here'; range?: number;
      visual: Visual; onHit: Effect[]; terrain?: TerrainRule[] }
  | { type: 'dash'; distance; durationMs; invulnerableTicks (default 0); onContact: Effect[] }
  | { type: 'melee'; range; arcDegrees; onHit: Effect[] }
  | { type: 'teleport'; distance }
  | { type: 'spawnEntity'; entity: 'wall'; width; thickness; offset; lifetimeMs; visual: Visual }
  | { type: 'shield'; amount; durationMs }
  | { type: 'delayedTrigger'; delayMs; effects: Effect[] }
  | { type: 'damage'; amount; scaling: 'physical' | 'technique' | 'none' (default technique); terrain?: TerrainRule[] }
  | { type: 'knockback'; speed; durationMs }
  | { type: 'stun'; durationMs }
  | { type: 'applyStatus'; status; durationMs; magnitude? };

interface TerrainRule { tag: string; damageMultiplier?: number; radiusMultiplier?: number }
```

The schema is recursive (`z.lazy`). Effects execute through one executor:

```ts
interface EffectContext {
  ctx: SimulationContext; casterId: PlayerId; teamId: TeamId;
  origin: Vec2; direction: Vec2;          // where and which way the effect happens
  target?: PlayerState;                   // set when the effect list is an onHit list
  source: EffectRef;                      // { abilityId, path } for entities that must reference their effects later
}
executeEffects(effects: Effect[], context: EffectContext, pathPrefix: string): void
```

`EffectRef.path` is a dotted path through the tree (`"0"`, `"0.onHit.1"`,
`"2.effects.0"`); `resolveEffect(ability, path)` walks it so world entities never copy
effect data. Target-bound effects (`damage`, `knockback`, `stun`, `applyStatus`, `shield`
when used in an onHit list) are ignored when `target` is absent; `shield` in an activation
list applies to the caster. `origin: 'here'` for an area means the context origin (an
explosion at an impact point); `'aim'` places the zone `range` units along the aim from the
caster, clamped to the map; `'caster'` centers it on the caster.

Handler registry stays a typed record keyed by `Effect['type']`, so a new brick is a
schema variant plus one handler.

### 3.5 New world entities

```ts
interface WorldState {
  tick; players; projectiles; nextEntityId; match;
  pending: Record<EntityId, PendingEffect>;   // delayed areas and triggers
  obstacles: Record<EntityId, ObstacleState>; // spawned walls
}
interface PendingEffect { id; ownerId; teamId; position: Vec2; direction: Vec2; createdAt: Tick;
                          fireAt: Tick; source: EffectRef; radius: number | null; visual: Visual | null }
interface ObstacleState { id; ownerId; teamId; shape: ConvexPolygon; expiresAt: Tick; visual: Visual }
interface ProjectileState { …existing…; visual: Visual }   // source becomes EffectRef
```

Systems (step order unchanged, two insertions):
`matchPreStep → playerStateSystem → abilitySystem → movementSystem → dashContactSystem →
projectileSystem → pendingEffectSystem → obstacleSystem → matchPostStep`.

- `pendingEffectSystem` fires every pending effect whose `fireAt <= now` (area: hit every
  affectable player within `radius` of `position`, terrain rules applied at `position`;
  trigger: execute the referenced list), then deletes it and emits `zoneTriggered`.
- `obstacleSystem` expires walls (`obstacleRemoved`). Walls are convex quads built
  perpendicular to the caster's aim at `offset` units; they block players and projectiles
  of every team including the owner. Movement and projectiles resolve against
  `map.collidersNear(bounds)` plus every live obstacle shape (a linear scan; walls are few).
- `dashContactSystem`: a `DASHING` player carrying `contact: { source, hitPlayerIds }`
  applies the `onContact` list once to each affectable player it overlaps.
- Dash `invulnerableTicks > 0` applies `INVULNERABLE` for that many ticks at dash start.
- `shield` adds status `SHIELDED` with `magnitude` = remaining absorb; `applyDamage` consumes
  the shield before health and removes it when empty (`statusExpired`-style event
  `shieldBroken`).
- Death, rounds, spectating: unchanged rules; `endRound` also clears `pending` and
  `obstacles`.

### 3.6 Events added

`zoneCreated { id, ownerId, position, radius, fireAt }`, `zoneTriggered { id, position }`,
`obstacleSpawned { id, ownerId, position }`, `obstacleRemoved { id }`, `shieldAbsorbed { playerId,
amount, remaining }`, `shieldBroken { playerId }`, `teleported { playerId, from, to }`,
`dashContact { playerId, targetId }`. `damageDealt` gains `scaling` and `position`.

## 4. Protocol v2 (`@ninjarena/protocol`)

`PROTOCOL_VERSION = 2`. `join { protocolVersion, name, build: Build, techniqueIds: string[] }`
validated strictly (integers, seven keys, exactly the configured number of techniques).
New error code `INVALID_LOADOUT` with a human message. `roomState` players gain
`techniqueIds`. Snapshot shape unchanged (the world grew).

## 5. Server (`@ninjarena/server`)

`Room.join(session, name, build, techniqueIds)` validates with `validateBuild` (budget =
`matchConfig.buildPoints`) and `validateLoadout`, refuses with `INVALID_LOADOUT`, then
`simulation.addPlayer({ id, teamId, characterId, build, techniqueIds })`. Nothing else
changes: one input per tick, sanitized, snapshots every two ticks.

## 6. Client (`@ninjarena/client`)

- **Pre-match screen** (a panel and its pure model, since renamed and folded into the lobby's
  loadout panel): name, seven sliders bounded by the rules with a live "points left" counter,
  three distinct technique selects listing content abilities of kind `technique` with their
  chakra cost and cooldown, Play. Prefilled from `?name=&build=v,s,p,sp,c,r,d&techniques=a,b,c`;
  shows the server's `INVALID_LOADOUT` message inline.
- **Bindings**: slot 0 `Mouse0` basic attack, slot 1 `Space` dash, slots 2–4 `Mouse2`, `KeyE`,
  `KeyR` techniques; `Tab` cycles the spectator target; `abilityHeld` mask keeps five bits.
- **Rendering sources**: the local player, its projectiles, zones and walls come from the
  predicted simulation (positions lerped with `alpha`); every other entity from the
  interpolator. Telegraphs: during `CASTING` the renderer draws the ability's `Telegraph`
  with progress `(now − startedAt) / (activatesAt − startedAt)`; pending zones draw a
  ground circle filling with progress to `fireAt`; walls draw their polygon; projectiles use
  their `Visual`. Casting `activeMs` draws the melee arc for its duration.
- **Correction smoothing**: after each reconcile, the visual position offset between the
  pre-reconcile render position and the new predicted position decays to zero over 100 ms
  when it is under 24 units; larger errors snap.
- **Event routing**: events from local predicted steps drive immediate feedback for the
  local player's own `abilityCast`, `abilityActivated`, `projectileSpawned`, `zoneCreated`,
  `obstacleSpawned`, `teleported`; the server's copies of those for the local player are
  skipped; every other server event drives feedback.
- **Feedback layer** (`feedback/`): `FeedbackCues` maps events to cues (data table);
  `EffectsLayer` renders pooled particles, hit flash (60 ms white tint), impact rings, dash
  afterimages, floating damage numbers; `CameraShake` adds a decaying offset; `HitStop`
  freezes the render alpha for 40 ms on the local player's melee hits; `WebAudioSynth`
  implements `AudioPort` with short procedural tones per cue (resumed on first gesture).
  The simulation never reads any of this.
- **Spectator** (`game/spectator.ts`, pure selection): when the local player is `DEAD`
  during `IN_ROUND`, the camera follows the current target; candidates are living teammates
  (team) or every living player (FFA); Tab cycles; HUD shows "Spectating <name>".
- **HUD**: chakra bar, five ability chips with their binding, cost and cooldown, build
  summary, shield amount, spectator line, round timer.

## 7. Content

- `stat-rules.json` as in §3.2.
- `characters/ninja.json`: `baseStats { health 100, chakra 100, chakraRegen 8, moveSpeed 140,
colliderRadius 5 }`, `basicAttackId: 'kunai-strike'`, `dashId: 'shadow-step'`.
- Abilities: `kunai-strike` (basic melee, 0 chakra, cd 350, startup 60, active 80, recovery
  120, damage 14 physical, ring telegraph), `shadow-step` (dash, 10 chakra, cd 3000, 96 units
  in 150 ms, `invulnerableTicks 0`, flash telegraph), techniques: `fireball` (orb telegraph
  250 ms, projectile 380/4/900 with explosion area r 28 on hit and on expire, grass ×1.25
  damage), `seismic-slam` (ground-circle telegraph, area at aim range 140 r 40 delay 600,
  damage 30 + stun 400), `lightning-dash` (flash telegraph 120 ms, dash 140 units 180 ms,
  contact damage 20 + SLOWED 1500 ×0.5, water damage ×1.3), `earth-wall` (ground-mark
  telegraph 300 ms, wall 48×8 at 32 units, lifetime 4000), `blink` (charge telegraph 100 ms,
  teleport 120), `paralysis-seal` (projectile stun, retuned), `chakra-shield` (shield 40 for
  3000 ms). Technique costs 20–35, cooldowns (dash included) 3–9 s.
- `match-modes.json`: `roundDurationMs 240000`, `buildPoints 10`, `roundsToWin 2` (best of
  three) for all modes except `3v3` at 3.

## 8. Tests (behaviour)

Stats: budget/min/max validation, each formula, speed leaves cooldowns untouched, defense
mitigation, physical vs technique scaling. Loadout validation. Chakra cost and regen.
Effect tree: fireball projectile hit applies damage then an explosion that hits a
bystander; expire explosion; effect path resolution round-trip. Pending area: telegraph
state exists during the delay, fires at `fireAt`, hits only players inside, terrain radius
multiplier. Dash contact once per target, invulnerability ticks when configured, none by
default. Teleport stops at walls and map bounds. Wall blocks a projectile (player behind it
takes no damage), blocks movement, expires. Shield absorbs then breaks. Round end clears
zones and walls. Protocol join round-trip and rejection of malformed builds. Server join
rejects over-budget and unknown techniques. Client pure parts: setup model points
arithmetic, spectator candidate selection, correction smoothing decay, cue mapping,
render-source split (own entities from prediction).

## 9. Out of scope

Lag compensation, delta snapshots, sprite art and skeletal animation, a real lobby and
matchmaking, destructible terrain, ultimates, persistence backend, bots.
