import { describe, expect, it } from 'vitest';
import { rng } from '../audio/synth';
import { PracticeSession } from './session';
import type { Attempt } from './types';
import { UNSEEN_COST, attemptCost, hardestPairs, pairDifficulties, pairKey, weightedPick } from './weighting';

const change = (from: string | null, to: string, over: Partial<Attempt> = {}): Attempt => ({
  at: 0,
  sessionId: 's',
  from,
  to,
  timeMs: 2000,
  misses: 0,
  assisted: false,
  skipped: false,
  score: 100,
  ...over,
});

function frequencies(from: string, chords: string[], difficulty: Map<string, number>, n = 4000) {
  const rand = rng(11);
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const c = weightedPick(from, chords, difficulty, rand);
    counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}

describe('attemptCost', () => {
  it('adds misses and help to the time, and makes skips expensive', () => {
    expect(attemptCost(change('G', 'C', { timeMs: 3000, misses: 2, assisted: true }))).toBe(3 + 4 + 3);
    expect(attemptCost(change('G', 'C', { skipped: true }))).toBeGreaterThan(10);
  });
});

describe('pairDifficulties', () => {
  it('tracks each direction separately and ignores warm-up chords', () => {
    const d = pairDifficulties([change(null, 'G'), change('G', 'C', { timeMs: 8000 }), change('C', 'G', { timeMs: 1000 })]);
    expect(d.get(pairKey('G', 'C'))).toBe(8);
    expect(d.get(pairKey('C', 'G'))).toBe(1);
    expect(d.size).toBe(2);
  });

  it('drops as the player gets faster', () => {
    const slow = [change('Em', 'D', { timeMs: 11000, misses: 3 })];
    const better = [...slow, change('Em', 'D', { timeMs: 3000 }), change('Em', 'D', { timeMs: 2500 })];
    expect(pairDifficulties(better).get('Em→D')!).toBeLessThan(pairDifficulties(slow).get('Em→D')! / 2);
  });
});

describe('weightedPick', () => {
  const chords = ['G', 'C', 'D', 'Em'];

  it('never repeats the current chord', () => {
    expect(frequencies('G', chords, new Map()).G).toBeUndefined();
  });

  it('brings hard changes back more often', () => {
    const d = new Map([
      ['Em→D', 11.6 + 5],
      ['Em→C', 5.1],
      ['Em→G', 2.0],
    ]);
    const f = frequencies('Em', chords, d);
    expect(f.D).toBeGreaterThan(f.C);
    expect(f.C).toBeGreaterThan(f.G);
    expect(f.D / f.G).toBeGreaterThan(3);
  });

  it('treats never-played changes as fairly hard', () => {
    const f = frequencies('G', chords, new Map([['G→C', 1], ['G→D', 1]]));
    expect(f.Em / f.C).toBeCloseTo((1 + UNSEEN_COST) / 2, 0);
  });
});

describe('hardestPairs', () => {
  it('lists known changes between the selected chords, hardest first', () => {
    const d = new Map([
      ['Em→D', 16],
      ['G→D', 12],
      ['C→Em', 9],
      ['A→D', 30],
    ]);
    expect(hardestPairs(d, ['G', 'C', 'D', 'Em'], 2).map((p) => `${p.from}→${p.to}`)).toEqual(['Em→D', 'G→D']);
  });
});

describe('PracticeSession with a picker', () => {
  it('uses the picker, passing the attempts made so far', () => {
    const seen: number[] = [];
    const s = new PracticeSession({
      kind: 'chord',
      items: ['G', 'C'],
      goal: { kind: 'count', transitions: 3 },
      threshold: 70,
      pick: (from, _items, attempts) => {
        seen.push(attempts.length);
        return from === 'G' ? 'C' : 'G';
      },
    });
    s.start(0);
    s.strum(100, 1000);
    expect([s.attempts[0].to, s.current, s.upcoming]).toEqual(['G', 'C', 'G']);
    expect(seen).toEqual([0, 0, 1]);
  });
});
