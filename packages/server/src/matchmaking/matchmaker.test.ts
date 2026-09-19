import { describe, expect, it } from 'vitest';
import { ClientSession } from '../session/clientSession';
import { FakeConnection } from '../testing/fakeConnection';
import { Matchmaker } from './matchmaker';

function account(id: string, rating: number): ClientSession {
  const session = new ClientSession(new FakeConnection(id), 8);
  session.account = { name: id, rating, wins: 0, losses: 0 };
  return session;
}

function harness(): { matchmaker: Matchmaker; matches: string[][]; clock: { now: number } } {
  const clock = { now: 0 };
  const matches: string[][] = [];
  const matchmaker = new Matchmaker({
    now: () => clock.now,
    onMatch: (one, two) => matches.push([one.id, two.id]),
  });
  return { matchmaker, matches, clock };
}

describe('Matchmaker', () => {
  it('only queues logged-in sessions that are not in a room', () => {
    const { matchmaker } = harness();
    const guest = new ClientSession(new FakeConnection('g'), 8);
    expect(matchmaker.join(guest)).toMatchObject({ ok: false, error: { code: 'NOT_LOGGED_IN' } });
    const player = account('a', 100);
    expect(matchmaker.join(player)).toEqual({ ok: true });
    expect(matchmaker.join(player)).toEqual({ ok: true });
    expect(matchmaker.size).toBe(1);
    expect(matchmaker.leave(player)).toBe(true);
    expect(matchmaker.leave(player)).toBe(false);
  });

  it('pairs two players of close rating and leaves the odd one waiting', () => {
    const { matchmaker, matches } = harness();
    for (const [id, rating] of [
      ['a', 100],
      ['b', 300],
      ['c', 130],
    ] as const) {
      matchmaker.join(account(id, rating));
    }
    matchmaker.tick();
    expect(matches).toEqual([['a', 'c']]);
    expect(matchmaker.sessions().map((session) => session.id)).toEqual(['b']);
  });

  it('widens the accepted rating gap the longer a player waits', () => {
    const { matchmaker, matches, clock } = harness();
    matchmaker.join(account('a', 100));
    matchmaker.join(account('b', 200));
    matchmaker.tick();
    expect(matches).toEqual([]);
    // 100 points d'écart: 50 de base plus 10 par seconde, soit cinq secondes d'attente.
    clock.now = 4000;
    matchmaker.tick();
    expect(matches).toEqual([]);
    clock.now = 5000;
    matchmaker.tick();
    expect(matches).toEqual([['a', 'b']]);
    expect(matchmaker.size).toBe(0);
  });

  it('runs the pairing at most once per second whatever the tick rate', () => {
    const { matchmaker, matches, clock } = harness();
    matchmaker.tick();
    matchmaker.join(account('a', 100));
    matchmaker.join(account('b', 100));
    clock.now = 500;
    matchmaker.tick();
    expect(matches).toEqual([]);
    clock.now = 1000;
    matchmaker.tick();
    expect(matches).toEqual([['a', 'b']]);
  });
});
