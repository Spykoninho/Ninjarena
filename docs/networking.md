# Networking

The netcode: who decides what, what travels on the wire, and how the browser hides the round trip.
The package layout that makes this possible is described in [architecture.md](architecture.md).

## Authority model

The server owns the game state. A client sends **intent**, never outcome.

| The client may send                                | The server alone decides                                     |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `join { protocolVersion, name }`                   | the player id (it comes from the connection, never the wire) |
| `ready`                                            | when a match starts, and the team a joining player gets      |
| `input { seq, input: { move, aim, abilityHeld } }` | whether an ability is allowed, and what it hits              |
| `ping { sentAt }`                                  | damage, deaths, statuses, knockback                          |
|                                                    | positions, collisions, projectile flight                     |
|                                                    | round and match results                                      |

Every client frame is validated by a zod schema before it reaches game code
(`ClientMessageSchema`, strict objects, name limited to 24 characters). A frame that fails to parse
is dropped silently and counted; after 20 bad frames the session is closed with code `1008`. The
transport accepts text only — a binary frame is ignored — and `maxPayload` is 64 KiB, well above
the largest legitimate message.

Even a well-formed input is not trusted: `sanitizePlayerInput` clamps `move` to length 1,
normalizes `aim`, masks `abilityHeld` to the four real slots, and replaces the whole input with a
neutral one if any component is not finite.

The server sends:

- `welcome { playerId, tickRate, snapshotRate, mapId, matchConfig }` — sent before the room
  broadcast, so the client knows which player it is,
- `roomState { players }` — broadcast whenever someone joins, leaves or toggles ready,
- `snapshot { tick, lastProcessedSeq, world, events }`,
- `error { code, message }` — `PROTOCOL_VERSION`, `ROOM_FULL`, `NOT_JOINED`, and `INVALID_MESSAGE`,
  which the protocol declares but the server does not currently send: a malformed frame gets no
  answer at all,
- `pong { sentAt, serverTime }`.

`PROTOCOL_VERSION` is a single integer, checked on `join`. A client speaking another version is
told so and never enters the room.

## Rates

| Quantity            | Value                                                           | Where                             |
| ------------------- | --------------------------------------------------------------- | --------------------------------- |
| Simulation tick     | 60 Hz, `dt = 1/60 s`                                            | server and client, identical code |
| Snapshot rate       | 30 Hz (every `tickRate / snapshotRate` ticks, so every 2 ticks) | server                            |
| Input rate          | one `input` message per predicted tick, so 60 Hz                | client                            |
| Interpolation delay | 6 ticks, i.e. 100 ms                                            | client, `?delay=`                 |

Both sides drive the simulation through the same `FixedStepAccumulator`, the server from its tick
loop and the client from `requestAnimationFrame` timestamps. A 60, 120, 144 or 240 FPS display
therefore runs exactly 60 simulation ticks per second; only the number of rendered frames between
two ticks changes, and the render interpolates the local player with the accumulator's `alpha`.

The server's `TickLoop` subtracts the time already spent in the current wake-up before scheduling
the next one, so drift does not accumulate, and its clock and scheduler are injectable — which is
how it is tested without waiting. That clock is `performance.now()` and not `Date.now()`: it is
monotonic, so an NTP step cannot make one tick last a negative or an enormous amount of time. Both
accumulators cap catch-up: a long freeze (a hidden tab, a paused process) is abandoned rather than
replayed in a burst.

## Sequence numbers and `lastProcessedSeq`

Every input the client sends carries a strictly increasing `seq`.

On the server, each session has an `InputQueue`:

- a `seq` that does not move forward is dropped — a replayed or reordered packet must never make a
  player's input go backwards,
- one input is consumed per player per tick,
- when the queue is empty (a client that is late or has stalled), the **last consumed input is
  repeated** and the acknowledgement does not advance: the player keeps walking rather than
  freezing, and the client is not told an input was processed twice,
- the queue is capped at `NINJARENA_INPUT_QUEUE` entries (8 by default); a client sending faster
  than the tick rate loses its oldest inputs rather than accumulating a growing delay.

`lastProcessedSeq` is the `seq` of the last input actually consumed for that session. It is sent in
that session's snapshot, and it is the only thing reconciliation needs.

## Prediction

Once per due tick, the client:

1. samples the input and stamps it with the next `seq`,
2. sends it,
3. pushes it into the `PredictionBuffer` (capped at 120 entries, duplicates ignored),
4. applies it to its local `GameSimulation` immediately.

The local player therefore reacts on the same frame as the key press. Remote players are also
present in the local simulation — they are what the last snapshot said — but they are not drawn
from it.

## Reconciliation

When a snapshot arrives:

```
  buffer.acknowledge(lastProcessedSeq)     drop inputs the server has already consumed
  simulation.restore(world)                adopt the authoritative state wholesale
  for each pending input: simulation.step({ [me]: input })
```

That is the whole of it, and it is short because `WorldState` is plain data: `restore` is a
structural clone, not a merge. After the replay the local player sits where the server's decisions
plus the client's un-acknowledged inputs put it.

During the replay the other players receive no input, so they stand still for those few steps.
That is fine and intentional: they are never rendered from this simulation. Their drawn position
comes from the interpolator.

## Interpolation

Snapshots are pushed into a `SnapshotInterpolator` (32 kept, out-of-order or duplicate ticks
ignored). A `ServerClock` estimates the current server tick from the ticks observed and the local
elapsed time, smoothing each observation around the current extrapolation so a late packet does not
make the clock jump.

Remote entities are sampled at `estimatedServerTick - interpolationDelayTicks`:

```
  snapshots received:   ... 100      102      104      106      108
                                              :                  ^
                                              :                  |
                              render tick 102.4 = 108.4 - 6      estimated server tick
                                                                 (extrapolated, fractional)

  102.4 is bracketed by the snapshots at 102 and 104 -> positions blended 20% of the way
```

Positions are blended linearly between the two bracketing snapshots. **Discrete state — phase,
health, statuses — is taken from the older of the two**, because it must describe the instant being
rendered, not a future the client has already received. An entity that exists only in the newer
snapshot is drawn from it directly.

The delay is the price of smoothness: a remote player is shown roughly 100 ms in the past by
default, which is enough to cover a missed or late snapshot at 30 Hz. Lower it with `?delay=` to
trade smoothness for freshness.

## Seams

Two interfaces keep the transport and the wire format replaceable without touching game code:

```ts
interface ServerTransport {
  onConnection(handler: (connection: Connection) => void): void;
  listen(): Promise<void>;
  close(): Promise<void>;
}

interface MessageCodec<T> {
  encode(message: T): string;
  decode(raw: string): T | null;
}
```

`WebSocketTransport` is the only implementation of the first today; WebRTC data channels would be
another. `createJsonCodec` is the only implementation of the second; it returns `null` on anything
malformed rather than throwing, because a network frame is hostile by default. A binary or
delta-compressed codec slots in at the same place — the message shapes do not preclude it.

On the client side the equivalent boundary is `NetworkClient`, which owns the `WebSocket` and hands
decoded `ServerMessage` values to `ClientGame`. Neither the transport nor the codec knows what a
ninja is.

## What is deliberately not done yet

Stating the gaps is more useful than implying they do not exist.

- **No lag compensation.** The server does not rewind the world to the shooter's view when
  validating a hit, so a shot is evaluated against positions that are one round trip ahead of what
  the shooter saw. At LAN and low-latency internet distances this is barely noticeable; it is the
  first thing to add.
- **No delta or binary snapshots.** Every snapshot carries the whole `WorldState` as JSON. It is
  small at six players on one map, and it is easy to read while debugging. It will not scale.
- **No input redundancy.** Each input is sent once. On a lossy link a dropped input is simply
  missing, and the server repeats the previous one. Sending the last few inputs in each message is
  the usual fix.
- **No misprediction smoothing.** A correction snaps the local player to the reconciled position
  instead of easing towards it over a few frames.
- **No teleport handling in interpolation.** A remote entity that moves discontinuously is blended
  across the gap rather than jumped, so a future blink ability would look like a very fast slide.
- **The snapshot world is not validated in depth.** The client trusts its server: `world` and
  `events` are only checked to be objects. A hostile server is not part of the threat model.
- **Joining a match in progress is not supported**, and a player who disconnects mid-round leaves
  the round to run until its timer, because the surviving team never gains the "an opponent was
  eliminated" condition.
