import { describe, it, expect } from 'vitest';
import { aggregateProgress } from './progress';

describe('aggregateProgress', () => {
  it('sums transferred and total across tasks and computes the ratio', () => {
    expect(
      aggregateProgress([
        { transferred: 50, total: 100 },
        { transferred: 0, total: 100 },
      ]),
    ).toEqual({ transferred: 50, total: 200, ratio: 0.25 });
  });

  it('returns a zero ratio for an empty set', () => {
    expect(aggregateProgress([])).toEqual({ transferred: 0, total: 0, ratio: 0 });
  });

  it('reports ratio 1 when everything is transferred', () => {
    expect(aggregateProgress([{ transferred: 100, total: 100 }])).toEqual({
      transferred: 100,
      total: 100,
      ratio: 1,
    });
  });
});
