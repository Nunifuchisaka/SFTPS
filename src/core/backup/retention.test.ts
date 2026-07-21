import { describe, it, expect } from 'vitest';
import { planBackupRetention, DEFAULT_BACKUP_RETENTION } from './retention';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-07-21T00:00:00.000Z');
const gen = (daysAgo: number) => ({ timestamp: new Date(now.getTime() - daysAgo * day) });

describe('DEFAULT_BACKUP_RETENTION', () => {
  it('keeps 20 generations and no age limit (previous fixed behaviour)', () => {
    expect(DEFAULT_BACKUP_RETENTION).toEqual({ maxGenerations: 20, maxAgeDays: null });
  });
});

describe('planBackupRetention', () => {
  it('keeps everything within both limits', () => {
    const generations = [gen(1), gen(2)];
    const plan = planBackupRetention(generations, { maxGenerations: 20, maxAgeDays: 30 }, now);
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toHaveLength(2);
  });

  it('drops the oldest generations beyond the generation cap', () => {
    const generations = [gen(1), gen(2), gen(3)];
    const plan = planBackupRetention(generations, { maxGenerations: 2, maxAgeDays: null }, now);
    expect(plan.remove.map((g) => g.timestamp)).toEqual([gen(3).timestamp]);
    expect(plan.keep.map((g) => g.timestamp)).toEqual([gen(1).timestamp, gen(2).timestamp]);
  });

  it('drops generations older than the age limit (injected clock)', () => {
    const generations = [gen(1), gen(10), gen(31)];
    const plan = planBackupRetention(generations, { maxGenerations: 20, maxAgeDays: 30 }, now);
    expect(plan.remove.map((g) => g.timestamp)).toEqual([gen(31).timestamp]);
  });

  it('drops every generation once they are all expired (credentials must not linger)', () => {
    const generations = [gen(40), gen(50)];
    const plan = planBackupRetention(generations, { maxGenerations: 20, maxAgeDays: 30 }, now);
    expect(plan.keep).toEqual([]);
    expect(plan.remove).toHaveLength(2);
  });

  it('treats maxAgeDays null as unlimited retention time', () => {
    const plan = planBackupRetention([gen(3650)], { maxGenerations: 20, maxAgeDays: null }, now);
    expect(plan.remove).toEqual([]);
  });

  it('applies both limits together (age first, then generation cap)', () => {
    const generations = [gen(1), gen(2), gen(3), gen(90)];
    const plan = planBackupRetention(generations, { maxGenerations: 2, maxAgeDays: 30 }, now);
    expect(plan.remove.map((g) => g.timestamp)).toEqual([gen(3).timestamp, gen(90).timestamp]);
    expect(plan.keep.map((g) => g.timestamp)).toEqual([gen(1).timestamp, gen(2).timestamp]);
  });

  it('returns generations newest-first and does not mutate the input', () => {
    const generations = [gen(3), gen(1), gen(2)];
    const plan = planBackupRetention(generations, { maxGenerations: 20, maxAgeDays: null }, now);
    expect(plan.keep.map((g) => g.timestamp)).toEqual([gen(1).timestamp, gen(2).timestamp, gen(3).timestamp]);
    expect(generations[0].timestamp).toEqual(gen(3).timestamp);
  });

  it('drops everything when the generation cap is 0', () => {
    const plan = planBackupRetention([gen(1)], { maxGenerations: 0, maxAgeDays: null }, now);
    expect(plan.keep).toEqual([]);
    expect(plan.remove).toHaveLength(1);
  });
});
