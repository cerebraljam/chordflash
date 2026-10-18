import { describe, expect, it } from 'vitest';
import { chordCollection, masteredCount, tonightsFocus, weekStats } from './home';
import type { Attempt } from './types';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const play = (to: string, over: Partial<Attempt> = {}): Attempt => ({
  at: NOW - DAY,
  sessionId: 's1',
  from: 'X',
  to,
  timeMs: 1500,
  misses: 0,
  assisted: false,
  skipped: false,
  score: 100,
  ...over,
});

describe('tonightsFocus', () => {
  it('lists the slowest changes within the set, with their recent time', () => {
    const history = [
      play('D', { from: 'Em', timeMs: 11000, misses: 3 }),
      play('C', { from: 'G', timeMs: 3000 }),
      play('G', { from: 'C', timeMs: 1000 }),
      play('A', { from: 'E', timeMs: 20000 }), // not in tonight's chords
    ];
    const focus = tonightsFocus(history, ['G', 'C', 'D', 'Em']);
    expect(focus.map((f) => `${f.from}→${f.to}`)).toEqual(['Em→D', 'G→C', 'C→G']);
    expect(focus[0].avgMs).toBe(11000);
    expect(tonightsFocus([], ['G', 'C'])).toEqual([]);
  });
});

describe('chordCollection', () => {
  it('marks chords mastered, learning with their clean streak, or new', () => {
    const history = [
      ...Array.from({ length: 5 }, () => play('G')),
      play('C', { misses: 1 }),
      play('C'),
      play('C'),
    ];
    expect(chordCollection(history, ['G', 'C', 'F#m'])).toEqual([
      { chord: 'G', state: 'mastered', streak: 5 },
      { chord: 'C', state: 'learning', streak: 2 },
      { chord: 'F#m', state: 'new', streak: 0 },
    ]);
    expect(masteredCount(history, ['G', 'C', 'F#m'])).toBe(1);
    expect(chordCollection([], ['Am', 'F#m'], ['Am']).map((c) => c.state)).toEqual(['learning', 'new']);
  });

  it('does not count slow plays toward the streak', () => {
    expect(chordCollection([play('D'), play('D', { timeMs: 9000 })], ['D'])[0].streak).toBe(0);
  });
});

describe('weekStats', () => {
  it('compares the last 7 days with the 7 before', () => {
    const history = [
      play('G', { from: null, sessionId: 'a' }), // warm-up: not a change
      play('C', { sessionId: 'a', timeMs: 2000 }),
      play('G', { sessionId: 'b', timeMs: 4000, misses: 1 }),
      play('C', { at: NOW - 9 * DAY, sessionId: 'old', timeMs: 6000 }),
    ];
    const { week, previous } = weekStats(history, NOW);
    expect(week).toEqual({ changes: 2, sessions: 2, firstTry: 0.5, avgMs: 3000 });
    expect(previous).toMatchObject({ changes: 1, sessions: 1, avgMs: 6000 });
    expect(weekStats([], NOW).week.firstTry).toBeNaN();
  });
});
