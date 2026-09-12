import { createHash, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): Buffer {
  return createHash('sha256').update(password, 'utf8').digest();
}

export function passwordMatches(hash: Buffer, candidate: string): boolean {
  const candidateHash = hashPassword(candidate);
  // Les empreintes ont toujours la même taille: la comparaison reste à temps constant.
  if (candidateHash.length !== hash.length) return false;
  return timingSafeEqual(candidateHash, hash);
}
