import { describe, expect, it } from 'vitest';
import { chordStats, pairStats, periodStat, sessionStats } from './stats';
import type { Attempt } from './types';

let clock = 0;
const play = (sessionId: string, from: string | null, to: string, timeMs: number, over: Partial<Attempt> = {}): Attempt => {
  clock += timeMs;
  return { at: clock, sessionId, from, to, timeMs, misses: 0, assisted: false, skipped: false, score: 100, ...over };
};

const history = [
  play('a', null, 'G', 3000),
  play('a', 'G', 'C', 6000, { misses: 2 }),
  play('a', 'C', 'G', 2000),
  play('b', null, 'C', 1000),
  play('b', 'C', 'G', 1000),
  play('b', 'G', 'C', 3000),
  play('c', null, 'G', 1000), // warm-up only: not a session with transitions
];

describe('sessionStats', () => {
  it('summarises each session with transitions, oldest first', () => {
    const s = sessionStats(history);
    expect(s.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s[0]).toMatchObject({ transitions: 2, firstTryRate: 0.5, avgMs: 4000, misses: 2 });
    expect(s[1]).toMatchObject({ transitions: 2, firstTryRate: 1, avgMs: 2000 });
    expect(s[0].start).toBeLessThan(s[1].start);
  });
});

describe('periodStat', () => {
  it('weights sessions by their number of transitions', () => {
    const p = periodStat([
      { id: 'x', start: 0, transitions: 1, firstTryRate: 0, avgMs: 10000, misses: 1 },
      { id: 'y', start: 1, transitions: 3, firstTryRate: 1, avgMs: 2000, misses: 0 },
    ]);
    expect(p).toMatchObject({ sessions: 2, transitions: 4, firstTryRate: 0.75, avgMs: 4000 });
  });
});

describe('chordStats', () => {
  it('counts every play of a chord, slowest first', () => {
    const s = chordStats(history, new Map([['G', 'name']]));
    expect(s.map((x) => x.chord)).toEqual(['C', 'G']);
    expect(s[0]).toMatchObject({ plays: 3, recentAvgMs: 10000 / 3, level: 'diagram' });
    expect(s[1]).toMatchObject({ plays: 4, firstTryRate: 1, level: 'name' });
  });
});

describe('pairStats', () => {
  it('aggregates per direction, ignoring warm-ups and skips in the time', () => {
    const p = pairStats([...history, play('d', 'G', 'C', 9000, { skipped: true })]);
    expect(p.get('G→C')).toMatchObject({ count: 3, recentAvgMs: 4500, misses: 2, firstTryRate: 1 / 3 });
    expect(p.get('C→G')).toMatchObject({ count: 2, recentAvgMs: 1500 });
    expect(p.size).toBe(2);
  });
});
