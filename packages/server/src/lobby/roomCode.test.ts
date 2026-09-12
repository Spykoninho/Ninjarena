import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  normalizeRoomCode,
} from './roomCode';

describe('generateRoomCode', () => {
  it('draws six characters from the alphabet', () => {
    const code = generateRoomCode((max) => Math.floor(Math.random() * max));
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const character of code) expect(ROOM_CODE_ALPHABET).toContain(character);
  });

  it('follows the draws in order', () => {
    const draws = [0, 1, 29, 9, 24, 13];
    let index = 0;
    const code = generateRoomCode(() => draws[index++] ?? 0);
    expect(code).toBe('AB7K2P');
  });

  it('asks for a draw bounded by the alphabet length', () => {
    const bounds: number[] = [];
    generateRoomCode((max) => {
      bounds.push(max);
      return 0;
    });
    expect(bounds).toEqual(new Array<number>(ROOM_CODE_LENGTH).fill(ROOM_CODE_ALPHABET.length));
  });
});

describe('normalizeRoomCode', () => {
  it('trims and uppercases a typed code', () => {
    expect(normalizeRoomCode(' ab7k2p ')).toBe('AB7K2P');
  });
});
