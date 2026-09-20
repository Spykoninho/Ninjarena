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

| Message                               | Preconditions                                                                                                                                    | Errors it can produce                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `hello { protocolVersion, name }`     | Not in a room to take effect as a rename; wrong version is always rejected. A logged-in session keeps its account name.                          | `PROTOCOL_VERSION`, `ALREADY_IN_ROOM` (sent while in a room)                                        |
| `register { name, password }`         | Introduced; not in a room; not logged in; name free (case-insensitively).                                                                        | `ALREADY_IN_ROOM`, `ALREADY_LOGGED_IN`, `NAME_TAKEN`, `SERVER_ERROR`                                |
| `login { name, password }`            | Introduced; not in a room; not logged in; account exists, password matches, account not held by another live session.                            | `ALREADY_IN_ROOM`, `ALREADY_LOGGED_IN`, `BAD_CREDENTIALS`, `SERVER_ERROR`                           |
| `logout`                              | Introduced; not in a room.                                                                                                                       | `ALREADY_IN_ROOM` (replies `accountState { account: null }` otherwise)                              |
| `getLeaderboard`                      | Introduced.                                                                                                                                      | `SERVER_ERROR` (replies `leaderboard { entries }`)                                                  |
| `createRoom { password?, settings? }` | Not already in a room; server under `maxRooms`; logged in if `settings.ranked`. Leaves the ranked queue.                                         | `ALREADY_IN_ROOM`, `TOO_MANY_ROOMS`, `INVALID_SETTINGS`, `NOT_LOGGED_IN`                            |
| `joinRoom { code, password? }`        | Not already in a room; room exists; status `WAITING`; room not full; password matches; logged in if the room is ranked. Leaves the ranked queue. | `ALREADY_IN_ROOM`, `ROOM_NOT_FOUND`, `ROOM_IN_GAME`, `ROOM_FULL`, `WRONG_PASSWORD`, `NOT_LOGGED_IN` |
| `joinQueue`                           | Introduced; logged in; not in a room. Repeating it keeps the ticket's place.                                                                     | `NOT_LOGGED_IN`, `ALREADY_IN_ROOM` (replies `queueState { queued: true, size }`)                    |
| `leaveQueue`                          | Introduced.                                                                                                                                      | — (always replies `queueState { queued: false, size }`)                                             |
| `leaveRoom`                           | In a room.                                                                                                                                       | — (always succeeds; replies `roomLeft`)                                                             |
| `updateSettings { patch }`            | Host; status `WAITING`; room not `locked`; patch produces valid settings that still fit the current roster.                                      | `NOT_HOST`, `WRONG_STATUS`, `INVALID_SETTINGS`                                                      |
| `setLoadout { loadout }`              | In a room; status `WAITING`.                                                                                                                     | `WRONG_STATUS`, `INVALID_LOADOUT`                                                                   |
| `setReady { ready }`                  | In a room; status `WAITING`; `ready: true` needs a valid loadout on file.                                                                        | `WRONG_STATUS`, `INVALID_LOADOUT`                                                                   |
| `switchTeam { team }`                 | In a room; status `WAITING`; team mode; `team` a valid index; target team not full.                                                              | `WRONG_STATUS`, `INVALID_SETTINGS`, `TEAM_FULL`                                                     |
| `startMatch`                          | Host; status `WAITING`; `startBlockers()` empty.                                                                                                 | `NOT_HOST`, `WRONG_STATUS`, `CANNOT_START`                                                          |
| `listMaps`                            | Introduced.                                                                                                                                      | `SERVER_ERROR`                                                                                      |
| `getMap { id }`                       | Introduced.                                                                                                                                      | `MAP_NOT_FOUND`, `SERVER_ERROR`                                                                     |
| `saveMap { document }`                | Introduced.                                                                                                                                      | `INVALID_MAP`, `MAP_STORE_FULL`, `SERVER_ERROR`                                                     |
| `input { seq, input }`                | In a room; only has an effect while the session has a live `playerId` (STARTING/IN_GAME/FINISHED, until the room resets to WAITING).             | — (silently ignored outside a match)                                                                |
| `ping { sentAt }`                     | Introduced.                                                                                                                                      | —                                                                                                   |

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

- Fewer than two players in the room: `NOT_ENOUGH_PLAYERS`, and nothing else is even checked —
  unless the room is a **practice** room (`settings.practice`), which starts alone and skips
  `EMPTY_TEAM` as well.
- Otherwise, any combination of: `PLAYER_NOT_READY` (someone hasn't readied up), `INVALID_LOADOUT`
  (someone has a loadout on file that the current settings reject), `EMPTY_TEAM` (team mode only:
  some team index below `teamCount` has no player — uneven teams are fine, an empty one is not),
  `MAP_MISSING` (the room's `mapId` did not resolve to a document, or the library has not been read
  yet), `MAP_INVALID` (the map resolved but `validateMapDocument` plus `spawnIssues` for the current
  settings report at least one issue — with the random map, no map of the library passes them),
  `RANKED_NEEDS_ACCOUNT` (the room is ranked and at least one seated player is a guest — possible
  when the host ticks `ranked` after guests joined, since a guest cannot join a ranked room),
  `TOURNAMENT_NOT_FULL` (a tournament room with fewer players than `tournamentSize`: a bracket with
  empty seats would be played by walkovers).

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
even if it falls between two scheduled snapshots, sends every seated player a `matchSummary`
(winner, scores, and per participant the damage dealt and taken, kills and deaths tallied by
`MatchStats` from the simulation's events over the whole match, plus the rating before and after
in a ranked room), and broadcasts `FINISHED`. The client keeps the summary on screen until the
room returns to `WAITING`. The match host keeps
calling `simulation.step` for `postMatchTicks` more ticks, still snapshotting at the normal rate,
so clients watching the result see a live (if static) world rather than a frozen last frame:
players are still seated (`session.playerId` is not cleared yet) and their `input` messages still
reach the simulation, but the match's own phase (`MATCH_END`) neutralises gameplay the same way it
does between rounds — movement is zeroed and abilities are blocked, only aim still moves — so
nothing they send changes the outcome. When the count elapses, the room discards the match, clears
every player's `playerId`, sets `ready` back to `false`, and broadcasts `WAITING`; a client watching
for that status change returns to the lobby on its own — there is no separate "return to lobby"
message.

## Maps and rounds

`mapId` names one map of the library, or `RANDOM_MAP_ID` (`'random'`, the default of every room
the server creates) to draw a different map for every round. `RoomMapCache` reads the whole
library in that case (built-in maps first, then the player-saved ones) and keeps as _playable_
those that pass `validateMapDocument` and `spawnIssues` for the current format; the lobby's
`RoomView.map` is `null`, since there is no single map to show. On `startMatch` (or the auto-start
of a matchmade room) the room draws `bestOf` maps with `drawRoundMaps` — the injected `randomInt`,
never twice the same map in a row while the pool allows it, one map only for a practice room —
and hands them to `startRoomMatch`, which builds a `GameSimulation` over the whole list. The
simulation's `map` follows `world.match.round` (`mapForRound`), so `resetWorldForRound` respawns
everyone on the next map and collisions switch with it; the client, which receives the same list in
`matchStarted.maps`, predicts on the same map and redraws the tiles when its simulation moves on.
Returning to the lobby after a random-map match reloads the pool, so maps saved during the match
join the next draw.

## Practice rooms and map test runs

`practice` is a room setting (never combined with `ranked`: the core schema refuses both at once)
that lets the host start alone. It reaches the simulation as `MatchConfig.practice`, where a round
opens with no `phaseEndsAt`, so it never ends on the timer; a lone team cannot be eliminated
either, so the match lasts until the player leaves (a second player who joined can still be
eliminated normally). The editor's **Tester** button relies on it: the client saves the map,
creates a room with `{ mapId, practice: true }` and drives it from the `roomState` broadcasts
without mounting the lobby — `setLoadout` with the panel's current loadout, `setReady`, then
`startMatch` once `startBlockers` is empty (`MAP_MISSING` is waited out while the map loads; any
other blocker, or a server error, shows the lobby instead). Leaving the match (`leaveRoom`, from
the HUD's exit button or the pause menu on Escape) returns to the editor with the document intact.
The home menu's **Bac à sable** drives the very same run from a `createRoom { practice: true }`
on the default map, the home screen staying up instead of the editor, and comes back to it on
exit.

## Tournaments

`tournament` is a room setting (with `tournamentSize`, 4 or 8) that `applySettingsPatch` normalises
like free-for-all: the room becomes `mode: 'ffa'`, one player per team, `teamCount =
tournamentSize`, so the room holds exactly the bracket. It is neither ranked nor a practice room.
Every match of a tournament is a duel: `matchFormatOf(settings)` yields `ffa-2x1` for
`toMatchConfig` and for the spawn check, whatever the room's own size.

On `startMatch` the room draws the bracket (`createBracket` in `packages/core/src/tournament/`,
seats shuffled with the injected `randomInt`, names frozen for display) and opens its first match.
Only the two players of the current match are added to the simulation and get `matchStarted` with
`spectator: false`; every other player in the room gets `matchStarted { spectator: true,
playerId: <their own id> }` — a player id that does not exist in the world — and receives the
same snapshots, since `sessionsInMatch()` is now the whole roster. The client draws the match, lets
Tab cycle the camera through the fighters from the countdown on, and sends no inputs.

When a duel ends (`matchEnded`, or a forfeit through the same `finish()`), the winner's team id —
their session id, in free-for-all — is fed into the bracket (`resolveMatch`), the result and the
summary go out as for any match, and after `postMatchTicks` the room opens the **next** match
straight away instead of returning to the lobby: `discardMatch()` clears the seated players'
`playerId` and inputs, `ready` stays as it was, and a new `matchStarted` reaches everyone. A
player who leaves is withdrawn from every match they have not played yet (`withdrawPlayer`); a
match left with one player is a walkover resolved on the spot when its turn comes, and a match
left with none passes an empty seat forward. Once the final is played (or walked over) the room
goes back to `WAITING` as usual, everyone not ready; the finished bracket stays in
`RoomView.tournament` until the settings change or the next start, so the lobby can still show it.

`RoomView.tournament` is `{ size, rounds: TournamentMatchView[][], championId }`, one array per
round from the first to the final, each match `{ players: [seat, seat], winnerId, status:
'pending' | 'live' | 'done' }` with a seat `{ id, name }` or `null`.

## The ranked queue

`joinQueue` puts a logged-in session in the `Matchmaker` (`packages/server/src/matchmaking/`), a
second producer of rooms next to `createRoom`. Every queued session receives `queueState { queued:
true, size }` each time the queue changes size. Once a second, on the server's tick loop, the
tickets are sorted by rating and adjacent pairs whose gap is at most `50 + 10 × seconds waited`
(by the one who has waited longer) are matched. A pair leaves the queue and lands in a room created
with `QUEUE_ROOM_SETTINGS` (`ranked`, teams, 2 × 1, best of 3, a map drawn per round) and `locked: true`:
the first of the two is the host in name only, `updateSettings` is refused with `WRONG_STATUS`,
and `Room.tick()` starts the match by itself as soon as `startBlockers()` is empty — which is what
`RoomManager.tick` now ticking every room, match or not, is for. Both players get `queueState {
queued: false }` then the `roomState` of their room. Leaving the queue (`leaveQueue`), opening or
joining a room, logging out or disconnecting drops the ticket silently.

## Accounts and ranked play

An account is a unique name (compared case-insensitively) and a password. `AccountService`
(`packages/server/src/accounts/accountService.ts`) registers and logs sessions in against an
`AccountRepository` — `FileAccountRepository` keeps every account in the JSON file named by
`NINJARENA_ACCOUNTS_FILE`, rewritten atomically on every save. Passwords are salted and stretched
with scrypt (`accountPassword.ts`) and never stored in the clear. A logged-in session carries an
`AccountView { name, rating, wins, losses }`: its name replaces whatever `hello` said, and the
`accountState` message reflects the view back on login, on logout (`null`) and whenever a ranked
match changes it. One account is held by at most one live session at a time (`ALREADY_LOGGED_IN`
otherwise), which also rules out playing ranked against oneself.

`ranked` is a room setting like any other. A ranked room refuses guests at `joinRoom` and
`createRoom` (`NOT_LOGGED_IN`) and will not start while a guest is seated
(`RANKED_NEEDS_ACCOUNT`). `RoomPlayerView.rating` carries each player's current rating (`null` for
a guest) so the lobby can show the rank badge and, in the settings tab, what every player stands to
win or lose.

The formula lives in `packages/core/src/ranking/rating.ts`, shared by the server and the client:
an Elo update with K = 30 on a 200-point spread, floored at 0, starting at 100. Each player is
rated against the **mean rating of the opposing side** — the other team in team mode, everyone
else in free-for-all — so the same rule serves duels, 2v2s and a five-player brawl; the expected
score is symmetric, so an underdog's win gains what the favourite's loss costs. Tiers are
`bronze` (0–149), `silver` (150–299) and `gold` (300+), rendered as Bronze / Argent / Or.

Ratings are settled from the `MatchResult`: `participantsOf` freezes each seated player's account
name and rating at kick-off, so a settings change or a rating change elsewhere cannot alter what
the match was played for. On `matchEnded` — including a forfeit, which goes through the same
`finish()` — the server runs `settleRatings` when `settings.ranked` is set, updates the live
sessions' `AccountView` synchronously (so the `roomState` broadcast that follows already shows the
new ratings), sends each affected session an `accountState`, and persists the new rating, wins and
losses in the background. A draw (`winnerTeamId: null`) moves equal players by nothing and counts
neither a win nor a loss.

`getLeaderboard` answers with the top 100 accounts by rating, then wins, then name.

## Settings → match config

`toMatchConfig(settings, timing)` (`packages/core/src/lobby/roomSettings.ts`) is the only place a
`RoomSettings` becomes a `MatchConfig`:

```ts
id: `${mode}-${teamCount}x${playersPerTeam}`   // from matchFormatOf: ffa-2x1 for a tournament duel
roundsToWin: Math.floor(bestOf / 2) + 1        // best of 1/3/5/7 -> 1/2/3/4
countdownMs, roundEndDelayMs: from MatchTiming  // fixed, not a room setting: 3000ms each
buildPoints, roundDurationMs, friendlyFire: copied as-is
mode, teamCount, playersPerTeam: copied as-is, except in a tournament (a duel)
ranked, tournament, tournamentSize: lobby-only settings, not part of MatchConfig
```

`applySettingsPatch` normalises free-for-all before validating: whatever `playersPerTeam` a patch
requests, `mode: 'ffa'` forces it back to `1`, so a free-for-all room is always exactly "one player,
one team" even mid-edit; `tournament: true` goes further and also sets `mode: 'ffa'` and
`teamCount: tournamentSize`. A patch that would make `teamCount × playersPerTeam` exceed
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
- **Matchmaking for team formats.** The `Matchmaker` only makes duels; pairing four or more
  tickets into a `2 × 2` room would reuse the same locked, self-starting room.
