import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const derive = promisify<string, Buffer, number, Buffer>(scrypt);

// Un mot de passe de compte est salé et étiré, à la différence de celui d'une salle, jetable.
export async function hashAccountPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function accountPasswordMatches(stored: string, candidate: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (saltHex === undefined || keyHex === undefined) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await derive(candidate, Buffer.from(saltHex, 'hex'), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
