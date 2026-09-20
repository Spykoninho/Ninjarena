import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

export interface IssuedSessionToken {
  // Le jeton part chez le client; seule son empreinte est conservée avec le compte.
  token: string;
  hash: string;
}

export function issueSessionToken(): IssuedSessionToken {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
