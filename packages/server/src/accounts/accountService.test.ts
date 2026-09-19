import { describe, expect, it } from 'vitest';
import { defaultRoomSettings } from '@ninjarena/core';
import { loadContent } from '@ninjarena/content';
import type { ServerMessage } from '@ninjarena/protocol';
import { serverMessageCodec } from '@ninjarena/protocol';
import { InMemoryAccountRepository } from '../persistence/accountRepository';
import type { MatchResult } from '../persistence/matchResultRepository';
import { ClientSession } from '../session/clientSession';
import { FakeConnection } from '../testing/fakeConnection';
import { AccountService } from './accountService';

const RULES = loadContent().statRules;

function createSession(id: string): { connection: FakeConnection; session: ClientSession } {
  const connection = new FakeConnection(id);
  return { connection, session: new ClientSession(connection, 8) };
}

function createService(): { service: AccountService; repository: InMemoryAccountRepository } {
  const repository = new InMemoryAccountRepository();
  return { service: new AccountService({ repository }), repository };
}

function sentAccounts(connection: FakeConnection): (ServerMessage & { type: 'accountState' })[] {
  return connection.sent
    .map((raw) => serverMessageCodec.decode(raw))
    .filter(
      (message): message is ServerMessage & { type: 'accountState' } =>
        message !== null && message.type === 'accountState',
    );
}

function rankedResult(winnerTeamId: string | null): MatchResult {
  return {
    roomCode: 'AB7K2P',
    settings: { ...defaultRoomSettings(RULES, 'arena'), ranked: true },
    players: [
      { id: 'c1', name: 'kage', teamId: 'team-0', account: { name: 'kage', rating: 100 } },
      { id: 'c2', name: 'hanzo', teamId: 'team-1', account: { name: 'hanzo', rating: 100 } },
      { id: 'c3', name: 'guest', teamId: 'team-1', account: null },
    ],
    winnerTeamId,
    scores: {},
    endedAt: 0,
  };
}

describe('AccountService access', () => {
  it('registers a fresh account at the initial rating and renames the session after it', async () => {
    const { service } = createService();
    const { session } = createSession('c1');
    const result = await service.register(session, 'Kage', 'shadow');
    expect(result).toEqual({
      ok: true,
      account: { name: 'Kage', rating: 100, wins: 0, losses: 0 },
    });
    expect(session.name).toBe('Kage');
    expect(session.account?.name).toBe('Kage');
  });

  it('refuses a taken name whatever its case, and a wrong password', async () => {
    const { service } = createService();
    await service.register(createSession('c1').session, 'kage', 'shadow');
    const other = createSession('c2').session;
    expect(await service.register(other, 'KAGE', 'other')).toMatchObject({
      ok: false,
      error: { code: 'NAME_TAKEN' },
    });
    expect(await service.login(other, 'kage', 'wrong')).toMatchObject({
      ok: false,
      error: { code: 'BAD_CREDENTIALS' },
    });
    expect(await service.login(other, 'nobody', 'shadow')).toMatchObject({
      ok: false,
      error: { code: 'BAD_CREDENTIALS' },
    });
  });

  it('holds an account for one live session at a time and frees it on logout or close', async () => {
    const { service } = createService();
    const first = createSession('c1');
    const second = createSession('c2');
    await service.register(first.session, 'kage', 'shadow');

    expect(await service.login(second.session, 'kage', 'shadow')).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_LOGGED_IN' },
    });
    expect(await service.login(first.session, 'kage', 'shadow')).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_LOGGED_IN' },
    });

    service.logout(first.session);
    expect(first.session.account).toBeNull();
    expect((await service.login(second.session, 'kage', 'shadow')).ok).toBe(true);

    second.session.close(1000, 'bye');
    const third = createSession('c3');
    expect((await service.login(third.session, 'kage', 'shadow')).ok).toBe(true);
  });
});

describe('AccountService settlement', () => {
  it('moves the ratings of the accounts in play, tells the live sessions and stores them', async () => {
    const { service, repository } = createService();
    const kage = createSession('c1');
    const hanzo = createSession('c2');
    await service.register(kage.session, 'kage', 'shadow');
    await service.register(hanzo.session, 'hanzo', 'shadow');

    const changes = service.settle(rankedResult('team-0'));
    expect(changes).toEqual([
      { id: 'kage', before: 100, after: 115 },
      { id: 'hanzo', before: 100, after: 85 },
    ]);
    expect(sentAccounts(kage.connection).at(-1)?.account).toEqual({
      name: 'kage',
      rating: 115,
      wins: 1,
      losses: 0,
    });
    expect(sentAccounts(hanzo.connection).at(-1)?.account).toEqual({
      name: 'hanzo',
      rating: 85,
      wins: 0,
      losses: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await repository.get('kage')).toMatchObject({ rating: 115, wins: 1 });
    expect(await repository.get('hanzo')).toMatchObject({ rating: 85, losses: 1 });
  });

  it('counts neither a win nor a loss on a draw', async () => {
    const { service, repository } = createService();
    const kage = createSession('c1');
    await service.register(kage.session, 'kage', 'shadow');
    service.settle(rankedResult(null));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await repository.get('kage')).toMatchObject({ rating: 100, wins: 0, losses: 0 });
  });

  it('ranks the leaderboard by rating, then wins, then name', async () => {
    const { service } = createService();
    for (const [name, connection] of [
      ['zed', 'c1'],
      ['ame', 'c2'],
      ['kage', 'c3'],
    ] as const) {
      await service.register(createSession(connection).session, name, 'shadow');
    }
    service.settle({
      ...rankedResult('team-0'),
      players: [
        { id: 'c3', name: 'kage', teamId: 'team-0', account: { name: 'kage', rating: 100 } },
        { id: 'c1', name: 'zed', teamId: 'team-1', account: { name: 'zed', rating: 100 } },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await service.leaderboard()).map((entry) => entry.name)).toEqual([
      'kage',
      'ame',
      'zed',
    ]);
  });
});
