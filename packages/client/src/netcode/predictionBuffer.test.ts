import { describe, expect, it } from 'vitest';
import { neutralInput } from '@ninjarena/core';
import { PredictionBuffer } from './predictionBuffer';

describe('PredictionBuffer', () => {
  it('keeps pushed inputs in order', () => {
    const buffer = new PredictionBuffer();
    buffer.push(1, neutralInput());
    buffer.push(2, neutralInput());
    expect(buffer.pending.map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it('ignores a sequence that does not advance past the last pushed one', () => {
    const buffer = new PredictionBuffer();
    buffer.push(2, neutralInput());
    buffer.push(1, neutralInput());
    buffer.push(2, neutralInput());
    buffer.acknowledge(2);
    buffer.push(2, neutralInput());
    buffer.push(3, neutralInput());
    expect(buffer.pending.map((entry) => entry.seq)).toEqual([3]);
  });

  it('drops acknowledged sequences up to and including the last processed one', () => {
    const buffer = new PredictionBuffer();
    for (let seq = 1; seq <= 5; seq++) buffer.push(seq, neutralInput());
    buffer.acknowledge(3);
    expect(buffer.pending.map((entry) => entry.seq)).toEqual([4, 5]);
    buffer.acknowledge(5);
    expect(buffer.pending).toEqual([]);
  });

  it('ignores an acknowledgement older than what it already dropped', () => {
    const buffer = new PredictionBuffer();
    for (let seq = 1; seq <= 3; seq++) buffer.push(seq, neutralInput());
    buffer.acknowledge(2);
    buffer.acknowledge(1);
    expect(buffer.pending.map((entry) => entry.seq)).toEqual([3]);
  });

  it('drops the oldest entries beyond its capacity', () => {
    const buffer = new PredictionBuffer(3);
    for (let seq = 1; seq <= 5; seq++) buffer.push(seq, neutralInput());
    expect(buffer.pending.map((entry) => entry.seq)).toEqual([3, 4, 5]);
  });
});
