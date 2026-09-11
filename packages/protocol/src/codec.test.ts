import { describe, expect, it } from 'vitest';
import { clientMessageCodec, serverMessageCodec } from './codec';

describe('protocol codec', () => {
  it('round-trips an input message', () => {
    const message = {
      type: 'input',
      seq: 12,
      input: { move: { x: 1, y: 0 }, aim: { x: 0, y: 1 }, abilityHeld: 2 },
    } as const;
    expect(clientMessageCodec.decode(clientMessageCodec.encode(message))).toEqual(message);
  });

  it('rejects malformed or unknown messages', () => {
    expect(clientMessageCodec.decode('{not json')).toBeNull();
    expect(clientMessageCodec.decode(JSON.stringify({ type: 'hack', damage: 50 }))).toBeNull();
    expect(
      clientMessageCodec.decode(JSON.stringify({ type: 'input', seq: -1, input: {} })),
    ).toBeNull();
  });

  it('round-trips a server error message', () => {
    const message = { type: 'error', code: 'ROOM_FULL', message: 'full' } as const;
    expect(serverMessageCodec.decode(serverMessageCodec.encode(message))).toEqual(message);
  });
});
