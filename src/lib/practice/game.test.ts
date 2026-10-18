import { describe, expect, it } from 'vitest';
import { XP, attemptXp, dayStreak, levelFor, stars, xpForLevel, xpLedger } from './game';
import { summarize } from './summary';
import type { Attempt } from './types';

const DAY = 86_400_000;
const play = (to: string, over: Partial<Attempt> = {}): Attempt => ({
  at: 0,
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

describe('XP', () => {
  it('rewards clean changes most, then first tries, then finishing', () => {
    expect(attemptXp(play('G'), 1)).toBe(XP.clean);
    expect(attemptXp(play('G', { timeMs: 5000 }), 1)).toBe(XP.firstTry);
    expect(attemptXp(play('G', { misses: 2 }), 0)).toBe(XP.done);
    expect(attemptXp(play('G', { skipped: true }), 0)).toBe(0);
  });

  it('adds the combo as a bonus from ×2, capped', () => {
    expect(attemptXp(play('G'), 2)).toBe(XP.clean + 2);
    expect(attemptXp(play('G'), 25)).toBe(XP.clean + 10);
  });

  it('tracks combos per session, and the mastery bonus', () => {
    const history = [
      play('C', { sessionId: 'a' }),
      play('C', { sessionId: 'a' }),
      play('G', { sessionId: 'a', misses: 1 }),
      play('C', { sessionId: 'a' }),
      play('C', { sessionId: 'b' }),
      play('C', { sessionId: 'b' }), // 5th clean C in a row: mastered
    ];
    const { total, sessions } = xpLedger(history);
    const a = sessions.get('a')!;
    expect(a).toMatchObject({ combo: 1, bestCombo: 2, mastered: [] });
    expect(a.xp).toBe(15 + (15 + 2) + 5 + 15);
    const b = sessions.get('b')!;
    expect(b.mastered).toEqual(['C']);
    expect(b.xp).toBe(15 + (15 + 2) + XP.mastered);
    expect(total).toBe(a.xp + b.xp);
  });
});

describe('levels', () => {
  it('needs 200 more XP per level and names it', () => {
    expect(xpForLevel(1)).toBe(300);
    expect(levelFor(0)).toEqual({ level: 1, title: 'Newcomer', into: 0, need: 300 });
    expect(levelFor(299).level).toBe(1);
    expect(levelFor(300)).toMatchObject({ level: 2, into: 0, need: 500 });
    // 300+500+700+900+1100+1300 = 4800 → level 7, a Strummer
    expect(levelFor(4800 + 1240)).toEqual({ level: 7, title: 'Strummer', into: 1240, need: 1500 });
  });
});

describe('dayStreak', () => {
  const now = new Date(2026, 9, 18, 20, 0).getTime();
  const on = (daysAgo: number) => play('G', { at: now - daysAgo * DAY });

  it('counts days in a row up to today', () => {
    expect(dayStreak([on(0), on(1), on(2), on(4)], now)).toEqual({ days: 3, playedToday: true });
  });

  it('stays alive today if you played yesterday', () => {
    expect(dayStreak([on(1), on(2)], now)).toEqual({ days: 2, playedToday: false });
    expect(dayStreak([on(2)], now).days).toBe(0);
    expect(dayStreak([], now).days).toBe(0);
  });
});

describe('stars', () => {
  const session = (firstTries: number, of: number) =>
    summarize(Array.from({ length: of }, (_, i) => play('G', { misses: i < firstTries ? 0 : 1 })));

  it('gives 1 for finishing, 2 at 50% first try, 3 at 80%, 0 when stopped early', () => {
    expect(stars(session(2, 10), true)).toBe(1);
    expect(stars(session(5, 10), true)).toBe(2);
    expect(stars(session(8, 10), true)).toBe(3);
    expect(stars(session(8, 10), false)).toBe(0);
  });
});
