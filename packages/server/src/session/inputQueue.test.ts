import { describe, expect, it } from 'vitest';
import { neutralInput } from '@ninjarena/core';
import { InputQueue } from './inputQueue';

describe('InputQueue', () => {
  it('consumes inputs in order and reports the last processed sequence', () => {
    const queue = new InputQueue(8);
    queue.push(1, neutralInput());
    queue.push(2, neutralInput());
    expect(queue.next()?.seq).toBe(1);
    expect(queue.lastProcessedSeq).toBe(1);
    expect(queue.next()?.seq).toBe(2);
  });

  it('repeats the last input when the client is late, without advancing the sequence', () => {
    const queue = new InputQueue(8);
    queue.push(5, { ...neutralInput(), move: { x: 1, y: 0 } });
    queue.next();
    const repeated = queue.next();
    expect(repeated?.seq).toBe(5);
    expect(repeated?.input.move.x).toBe(1);
  });

  it('drops the oldest inputs when a fast client overflows the queue', () => {
    const queue = new InputQueue(2);
    queue.push(1, neutralInput());
    queue.push(2, neutralInput());
    queue.push(3, neutralInput());
    expect(queue.size).toBe(2);
    expect(queue.next()?.seq).toBe(2);
  });

  it('ignores stale or duplicate sequences', () => {
    const queue = new InputQueue(8);
    queue.push(3, neutralInput());
    queue.push(3, neutralInput());
    queue.push(2, neutralInput());
    expect(queue.size).toBe(1);
  });

  it('returns null until the client has sent something', () => {
    expect(new InputQueue(8).next()).toBeNull();
    expect(new InputQueue(8).lastProcessedSeq).toBe(-1);
  });
});
