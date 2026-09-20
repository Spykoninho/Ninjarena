import { INITIAL_RATING, settleRatings } from '@ninjarena/core';
import type { RatingChange } from '@ninjarena/core';
import type { AccountView } from '@ninjarena/protocol';
import type { MatchResult } from '../persistence/matchResultRepository';
import type { AccountRecord, AccountRepository } from '../persistence/accountRepository';
import { accountKey } from '../persistence/accountRepository';
import type { ClientSession } from '../session/clientSession';
import { accountPasswordMatches, hashAccountPassword } from './accountPassword';
import { hashSessionToken, issueSessionToken } from './sessionToken';

export type AccountErrorCode = 'NAME_TAKEN' | 'BAD_CREDENTIALS' | 'ALREADY_LOGGED_IN';

// Le jeton n'est remis que sur une connexion par mot de passe: une reprise n'en tire pas un neuf.
export type AccountResult =
  | { ok: true; account: AccountView; token?: string }
  | { ok: false; error: { code: AccountErrorCode; message: string } };

export interface AccountServiceOptions {
  repository: AccountRepository;
  log?: (line: string) => void;
  now?: () => Date;
}

const MAX_LEADERBOARD_ENTRIES = 100;
// Un compte garde autant de sessions ouvertes que d'appareils raisonnables; la plus vieille tombe.
const MAX_SESSION_TOKENS = 5;

export class AccountService {
  private readonly repository: AccountRepository;
  private readonly log: (line: string) => void;
  private readonly now: () => Date;
  // Un compte n'est tenu que par une session à la fois: on ne joue pas en classé contre soi-même.
  private readonly online = new Map<string, ClientSession>();
  private readonly claiming = new Set<string>();

  constructor(options: AccountServiceOptions) {
    this.repository = options.repository;
    this.log = options.log ?? (() => {});
    this.now = options.now ?? (() => new Date());
  }

  async register(session: ClientSession, name: string, password: string): Promise<AccountResult> {
    if (session.account !== null) return alreadyLoggedIn(session.account.name);
    const key = accountKey(name);
    // Deux inscriptions simultanées sur le même pseudo: la première réserve le nom avant d'écrire.
    if (this.claiming.has(key) || (await this.repository.get(name)) !== null) {
      return fail('NAME_TAKEN', `"${name}" is already taken`);
    }
    this.claiming.add(key);
    try {
      const record: AccountRecord = {
        name,
        passwordHash: await hashAccountPassword(password),
        rating: INITIAL_RATING,
        wins: 0,
        losses: 0,
        createdAt: this.now().toISOString(),
        sessionTokens: [],
      };
      // Le nom reste réservé jusqu'à l'écriture: un `return` nu relâcherait la réservation avant.
      return await this.open(session, record);
    } finally {
      this.claiming.delete(key);
    }
  }

  async login(session: ClientSession, name: string, password: string): Promise<AccountResult> {
    if (session.account !== null) return alreadyLoggedIn(session.account.name);
    const record = await this.repository.get(name);
    if (record === null || !(await accountPasswordMatches(record.passwordHash, password))) {
      return fail('BAD_CREDENTIALS', 'unknown account or wrong password');
    }
    return this.open(session, record);
  }

  // Un jeton inconnu ou révoqué vaut de mauvais identifiants: le client l'oublie et redevient invité.
  async resume(session: ClientSession, token: string): Promise<AccountResult> {
    if (session.account !== null) return alreadyLoggedIn(session.account.name);
    const hash = hashSessionToken(token);
    const record = await this.repository.findBySessionToken(hash);
    if (record === null) return fail('BAD_CREDENTIALS', 'unknown or expired session');
    const result = this.attach(session, record);
    if (result.ok) session.sessionToken = hash;
    return result;
  }

  // La déconnexion voulue révoque le jeton de cette session; les autres appareils gardent le leur.
  async logout(session: ClientSession): Promise<void> {
    const account = session.account;
    const hash = session.sessionToken;
    this.disconnect(session);
    if (account === null || hash === null) return;
    const record = await this.repository.get(account.name);
    if (record === null) return;
    await this.repository.save({
      ...record,
      sessionTokens: record.sessionTokens.filter((stored) => stored !== hash),
    });
  }

  // Une coupure libère le compte sans toucher au jeton: la page rechargée le reprendra.
  disconnect(session: ClientSession): void {
    const account = session.account;
    if (account === null) return;
    const key = accountKey(account.name);
    if (this.online.get(key) === session) this.online.delete(key);
    session.account = null;
    session.sessionToken = null;
  }

  // Les scores changent en mémoire tout de suite; leur écriture suit sans retenir la fin de partie.
  settle(result: MatchResult): RatingChange[] {
    const rated = result.players.flatMap((player) =>
      player.account === null
        ? []
        : [{ id: player.account.name, teamId: player.teamId, rating: player.account.rating }],
    );
    const changes = settleRatings(rated, result.winnerTeamId);
    for (const change of changes) {
      const teamId = rated.find((player) => player.id === change.id)?.teamId ?? null;
      const won = result.winnerTeamId !== null && result.winnerTeamId === teamId;
      const lost = result.winnerTeamId !== null && !won;
      this.applyChange(change, won, lost);
    }
    return changes;
  }

  async leaderboard(): Promise<AccountView[]> {
    const records = await this.repository.list();
    return records
      .sort(byStanding)
      .slice(0, MAX_LEADERBOARD_ENTRIES)
      .map((record) => viewOf(record));
  }

  // Une connexion par mot de passe ouvre une session durable: son jeton est écrit avec le compte.
  private async open(session: ClientSession, record: AccountRecord): Promise<AccountResult> {
    const issued = issueSessionToken();
    const stored: AccountRecord = {
      ...record,
      sessionTokens: [...record.sessionTokens, issued.hash].slice(-MAX_SESSION_TOKENS),
    };
    const result = this.attach(session, stored);
    if (!result.ok) return result;
    await this.repository.save(stored);
    session.sessionToken = issued.hash;
    return { ...result, token: issued.token };
  }

  private attach(session: ClientSession, record: AccountRecord): AccountResult {
    const key = accountKey(record.name);
    const holder = this.online.get(key);
    if (holder !== undefined && holder !== session && !holder.closed) {
      return fail('ALREADY_LOGGED_IN', `"${record.name}" is already connected`);
    }
    const account = viewOf(record);
    session.account = account;
    session.name = account.name;
    this.online.set(key, session);
    return { ok: true, account };
  }

  private applyChange(change: RatingChange, won: boolean, lost: boolean): void {
    const session = this.online.get(accountKey(change.id));
    if (session?.account !== null && session?.account !== undefined) {
      session.account = {
        ...session.account,
        rating: change.after,
        wins: session.account.wins + (won ? 1 : 0),
        losses: session.account.losses + (lost ? 1 : 0),
      };
      session.send({ type: 'accountState', account: session.account });
    }
    void this.persistChange(change, won, lost).catch((error: unknown) => {
      this.log(`failed to store the rating of ${change.id}: ${reasonOf(error)}`);
    });
  }

  private async persistChange(change: RatingChange, won: boolean, lost: boolean): Promise<void> {
    const record = await this.repository.get(change.id);
    if (record === null) return;
    await this.repository.save({
      ...record,
      rating: change.after,
      wins: record.wins + (won ? 1 : 0),
      losses: record.losses + (lost ? 1 : 0),
    });
  }
}

function viewOf(record: AccountRecord): AccountView {
  return { name: record.name, rating: record.rating, wins: record.wins, losses: record.losses };
}

function byStanding(a: AccountRecord, b: AccountRecord): number {
  return b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name);
}

function alreadyLoggedIn(name: string): AccountResult {
  return fail('ALREADY_LOGGED_IN', `already logged in as "${name}"`);
}

function fail(code: AccountErrorCode, message: string): AccountResult {
  return { ok: false, error: { code, message } };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
