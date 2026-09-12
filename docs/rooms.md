# Rooms

A room is the unit of play: one code, one host, one lobby, at most one match at a time. There is
no global default room and no lobby shared by strangers — every match happens inside a room a
player created or joined by its code.

## Lifecycle

```
          createRoom / joinRoom / leaveRoom / updateSettings / setLoadout / setReady / switchTeam
                       ┌──────────────────────────────────────┐
                       ▼                                      │
   WAITING ──startMatch (host, no blocker)──▶ STARTING ──roundStarted──▶ IN_GAME
      ▲                                          │                        │
      │                                          └──── matchEnded ────────┤
      │                                                                   ▼
      └──────────── postMatchTicks elapsed, match discarded ─────────── FINISHED
```

`Room` (`packages/server/src/lobby/room.ts`) holds the code, an optional password hash, the host
(computed, not stored — see below), the current `RoomStatus`, the settings, the roster, and the
active match, if any.

- **WAITING** — the lobby. Players join, leave, switch teams, edit their loadout and toggle ready;
  the host edits settings and starts the match. This is the only status `updateSettings`,
  `setLoadout`, `setReady` and `switchTeam` accept.
- **STARTING** — `start()` has created the match and the round's countdown is running; inputs are
  accepted but the round proper has not opened.
- **IN_GAME** — the round is live. `Room.handleEvents` flips WAITING → STARTING → IN_GAME on the
  simulation's own `roundStarted` event for round 1, not on a timer of the room's own.
- **FINISHED** — the match ended (`matchEnded`); the match host keeps ticking the simulation so its
  final snapshot (scores, standing players) keeps streaming while the result is on screen, but no
  further round starts. After `postMatchTicks` ticks (`round(postMatchMs / tickMs)`, 8 seconds
  worth by default) the room discards the match, marks every player not ready, and returns to
  WAITING. This is tick-driven, not a timer: `Room.tick()` only counts while `status === 'FINISHED'`.

Joining is refused with `ROOM_IN_GAME` whenever `status !== 'WAITING'` — there is no joining a
match in progress, and no spectating from the lobby.

## Client messages

Every message below requires a prior `hello` (`NOT_INTRODUCED` otherwise); the room-scoped ones
also require the session to be in a room (`NOT_IN_ROOM` otherwise).

| Message                               | Preconditions                                                                                                                        | Errors it can produce                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `hello { protocolVersion, name }`     | Not in a room to take effect as a rename; wrong version is always rejected.                                                          | `PROTOCOL_VERSION`, `ALREADY_IN_ROOM` (sent while in a room)                       |
| `createRoom { password?, settings? }` | Not already in a room; server under `maxRooms`.                                                                                      | `ALREADY_IN_ROOM`, `TOO_MANY_ROOMS`, `INVALID_SETTINGS`                            |
| `joinRoom { code, password? }`        | Not already in a room; room exists; status `WAITING`; room not full; password matches.                                               | `ALREADY_IN_ROOM`, `ROOM_NOT_FOUND`, `ROOM_IN_GAME`, `ROOM_FULL`, `WRONG_PASSWORD` |
| `leaveRoom`                           | In a room.                                                                                                                           | — (always succeeds; replies `roomLeft`)                                            |
| `updateSettings { patch }`            | Host; status `WAITING`; patch produces valid settings that still fit the current roster.                                             | `NOT_HOST`, `WRONG_STATUS`, `INVALID_SETTINGS`                                     |
| `setLoadout { loadout }`              | In a room; status `WAITING`.                                                                                                         | `WRONG_STATUS`, `INVALID_LOADOUT`                                                  |
| `setReady { ready }`                  | In a room; status `WAITING`; `ready: true` needs a valid loadout on file.                                                            | `WRONG_STATUS`, `INVALID_LOADOUT`                                                  |
| `switchTeam { team }`                 | In a room; status `WAITING`; team mode; `team` a valid index; target team not full.                                                  | `WRONG_STATUS`, `INVALID_SETTINGS`, `TEAM_FULL`                                    |
| `startMatch`                          | Host; status `WAITING`; `startBlockers()` empty.                                                                                     | `NOT_HOST`, `WRONG_STATUS`, `CANNOT_START`                                         |
| `listMaps`                            | Introduced.                                                                                                                          | `SERVER_ERROR`                                                                     |
| `getMap { id }`                       | Introduced.                                                                                                                          | `MAP_NOT_FOUND`, `SERVER_ERROR`                                                    |
| `saveMap { document }`                | Introduced.                                                                                                                          | `INVALID_MAP`, `MAP_STORE_FULL`, `SERVER_ERROR`                                    |
| `input { seq, input }`                | In a room; only has an effect while the session has a live `playerId` (STARTING/IN_GAME/FINISHED, until the room resets to WAITING). | — (silently ignored outside a match)                                               |
| `ping { sentAt }`                     | Introduced.                                                                                                                          | —                                                                                  |

A `joinRoom` or `createRoom` from a session already in a room does not move it — `ALREADY_IN_ROOM`
either way. Repeating `join`/`leave` from the same session is idempotent: `Room.join` is a no-op if
the session is already seated, `RoomManager.leave` is a no-op with no room.

`CANNOT_START`'s message is the joined list of the current `StartBlocker`s (see below), and
`INVALID_SETTINGS`/`INVALID_LOADOUT` carry the zod-derived reason from `applySettingsPatch` or
`validateLoadout`.

`setLoadout` never mutates the stored loadout on a rejection: an invalid submission is refused with
`INVALID_LOADOUT` and the player's previous loadout (and its validity and readiness) stands as it
was.

## Start blockers

`Room.startBlockers()` (`packages/server/src/lobby/room.ts`, delegating to `computeStartBlockers`
in `packages/server/src/lobby/startBlockers.ts`) is recomputed on demand — it backs both
`RoomView.startBlockers` (shown to every player) and the `startMatch` check — and is also what a
client uses to grey out its Start button and explain why:

- Fewer than two players in the room: `NOT_ENOUGH_PLAYERS`, and nothing else is even checked.
- Otherwise, any combination of: `PLAYER_NOT_READY` (someone hasn't readied up), `INVALID_LOADOUT`
  (someone has a loadout on file that the current settings reject), `EMPTY_TEAM` (team mode only:
  some team index below `teamCount` has no player — uneven teams are fine, an empty one is not),
  `MAP_MISSING` (the room's `mapId` did not resolve to a document), `MAP_INVALID` (the map resolved
  but `validateMapDocument` plus `spawnIssues` for the current settings report at least one issue).

## Host migration and empty rooms

There is no stored "host" field: `Room.hostId` is computed as the earliest-joined player still
present (`joinedAt` is a room-local counter, not a wall-clock timestamp). When the host leaves, the
next-earliest player becomes host on the very next read — nothing needs to be reassigned. A room
that reaches zero players is removed by `RoomManager.leave`, and its code becomes available again
immediately.

## Leaving mid-match and forfeit

Leaving while `STARTING` or `IN_GAME` removes the player from the simulation
(`GameSimulation.removePlayer`). If that drops the number of teams still present in the world below
two, the room finishes immediately with the remaining team declared the winner (`present[0] ?? null`
— `null` if the room somehow empties both sides at once, an unranked draw). This is a forfeit, not
a special code path: it goes through the same `finish()` a normal `matchEnded` event does, so
`FINISHED` behaves identically either way — flush the final snapshot, store the result, wait
`postMatchTicks`, return to WAITING.

## Post-match

On `matchEnded`, the room stores a `MatchResult` (skipped only if the room emptied in the same
tick) through `MatchResultRepository`, flushes one last snapshot so the terminal state is visible
even if it falls between two scheduled snapshots, and broadcasts `FINISHED`. The match host keeps
calling `simulation.step` for `postMatchTicks` more ticks, still snapshotting at the normal rate,
so clients watching the result see a live (if static) world rather than a frozen last frame:
players are still seated (`session.playerId` is not cleared yet) and their `input` messages still
reach the simulation, but the match's own phase (`MATCH_END`) neutralises gameplay the same way it
does between rounds — movement is zeroed and abilities are blocked, only aim still moves — so
nothing they send changes the outcome. When the count elapses, the room discards the match, clears
every player's `playerId`, sets `ready` back to `false`, and broadcasts `WAITING`; a client watching
for that status change returns to the lobby on its own — there is no separate "return to lobby"
message.

## Settings → match config

`toMatchConfig(settings, timing)` (`packages/core/src/lobby/roomSettings.ts`) is the only place a
`RoomSettings` becomes a `MatchConfig`:

```ts
id: `${mode}-${teamCount}x${playersPerTeam}`
roundsToWin: Math.floor(bestOf / 2) + 1        // best of 1/3/5/7 -> 1/2/3/4
countdownMs, roundEndDelayMs: from MatchTiming  // fixed, not a room setting: 3000ms each
buildPoints, roundDurationMs, friendlyFire: copied as-is
mode, teamCount, playersPerTeam: copied as-is
```

`applySettingsPatch` normalises free-for-all before validating: whatever `playersPerTeam` a patch
requests, `mode: 'ffa'` forces it back to `1`, so a free-for-all room is always exactly "one player,
one team" even mid-edit. A patch that would make `teamCount × playersPerTeam` exceed
`MAX_ROOM_PLAYERS` (16) or drop the cap below the current roster size is rejected with
`INVALID_SETTINGS` before anything changes; changing `mapId` schedules an async reload rather than
blocking the reply, and changing any other field revalidates every stored loadout in place
(clearing `ready` on whichever ones no longer fit the new `buildPoints`) and reassigns any player
whose team index no longer exists.

## Passwords and codes

A room's password, if any, is hashed with SHA-256 on `createRoom` (`hashPassword`,
`packages/server/src/lobby/password.ts`) and never stored or compared in the clear;
`passwordMatches` recomputes the candidate's hash and compares it to the stored one with
`timingSafeEqual` so a wrong guess cannot be timed apart from a right one hash-length-for-hash-length.
This protects against timing attacks on the comparison, not against interception: the connection is
plain WebSocket in development (`ws://`), so a password is visible to anyone who can observe the
traffic. Deploying behind TLS (`wss://`) is an infrastructure concern outside this server's scope,
not something the protocol changes for.

A room code is 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 symbols, ambiguous
characters `I`, `O`, `0`, `1` excluded so a code can be read aloud or copied by hand without
confusion) — 32^6, about 1.07 billion possible codes — generated with `crypto.randomInt` and
retried up to 100 times on collision (`RoomManager.freeCode`). Codes are compared
case-insensitively (`normalizeRoomCode` upper-cases both sides).

## Seams for the roadmap

- **Fog of war.** `MatchHost.sendSnapshots` (`packages/server/src/match/matchHost.ts`) is the one
  place every session's outgoing snapshot is built; a per-session visibility filter (already
  informed client-side by `isVisibleTo` as a rendering hint) would slot in there without changing
  the `snapshot` message shape.
- **Ranked.** `MatchResult` (`packages/server/src/persistence/matchResultRepository.ts`) already
  carries `roomCode`, `settings` and a `players: { id, name, teamId }[]` list with everyone's team
  at the final whistle, which is what a rating update needs. A matchmaking queue would be a second
  producer of rooms next to `createRoom`, and a rating repository would sit next to
  `MatchResultRepository` as another persistence port.
