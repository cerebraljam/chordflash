/**
 * The game layer: XP, levels, combos, streaks and stars, all computed from the
 * practice history, so past sessions count and rule changes apply everywhere.
 */
import { HintTracker, isClean } from './hints';
import type { SessionSummary } from './summary';
import type { Attempt } from './types';

export const XP = {
  /** First try, no help, under the clean time. */
  clean: 15,
  /** First try but slower. */
  firstTry: 10,
  /** Got there after misses or with the diagram's help. */
  done: 5,
  /** Bonus when a chord / note position becomes mastered (diagram retired). */
  mastered: 50,
};
/** Combo bonus per change (the combo number itself) is capped at this. */
export const COMBO_CAP = 10;

export const isFirstTry = (a: Attempt) => !a.skipped && !a.assisted && a.misses === 0;

/** XP for one attempt played with `combo` first tries in a row (itself included). */
export function attemptXp(a: Attempt, combo: number): number {
  if (a.skipped) return 0;
  const base = isClean(a) ? XP.clean : isFirstTry(a) ? XP.firstTry : XP.done;
  return base + (combo >= 2 ? Math.min(combo, COMBO_CAP) : 0);
}

export interface SessionGame {
  xp: number;
  /** Current run of first tries (as of the session's last attempt). */
  combo: number;
  bestCombo: number;
  /** Items (chord ids / note positions) that became mastered in this session. */
  mastered: string[];
}

/** XP of the whole history, and per session. */
export function xpLedger(attempts: Attempt[]): { total: number; sessions: Map<string, SessionGame> } {
  const hints = new HintTracker();
  const sessions = new Map<string, SessionGame>();
  let total = 0;
  for (const a of attempts) {
    const s = sessions.get(a.sessionId) ?? { xp: 0, combo: 0, bestCombo: 0, mastered: [] };
    s.combo = isFirstTry(a) ? s.combo + 1 : 0;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    let xp = attemptXp(a, s.combo);
    const { before, after } = hints.push(a);
    if (before === 'diagram' && after === 'name') {
      xp += XP.mastered;
      s.mastered.push(a.to);
    }
    s.xp += xp;
    total += xp;
    sessions.set(a.sessionId, s);
  }
  return { total, sessions };
}

const TITLES: [number, string][] = [
  [1, 'Newcomer'],
  [3, 'Picker'],
  [5, 'Strummer'],
  [8, 'Chord Changer'],
  [11, 'Rhythm Keeper'],
  [15, 'Riff Maker'],
  [20, 'Stage Ready'],
];

/** XP to go from level `n` to `n + 1`: 300, 500, 700… */
export const xpForLevel = (n: number) => 300 + 200 * (n - 1);

export interface Level {
  level: number;
  title: string;
  /** XP earned within this level, and needed to reach the next. */
  into: number;
  need: number;
}

export function levelFor(xp: number): Level {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= xpForLevel(level)) rest -= xpForLevel(level++);
  const title = [...TITLES].reverse().find(([from]) => level >= from)![1];
  return { level, title, into: rest, need: xpForLevel(level) };
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Days in a row with practice. A streak stays alive through today even if you
 * haven't played yet: it ends only after a whole day without practice.
 */
export function dayStreak(attempts: Attempt[], now: number): { days: number; playedToday: boolean } {
  const days = new Set(attempts.map((a) => dayKey(a.at)));
  const playedToday = days.has(dayKey(now));
  const day = new Date(now);
  if (!playedToday) day.setDate(day.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(day.getTime()))) {
    count++;
    day.setDate(day.getDate() - 1);
  }
  return { days: count, playedToday };
}

/** Stars for a session: 1 for finishing it, 2 at 50% first try, 3 at 80%. Stopped early: 0. */
export function stars(summary: SessionSummary, completed: boolean): number {
  if (!completed || !summary.transitions) return 0;
  return summary.firstTryRate >= 0.8 ? 3 : summary.firstTryRate >= 0.5 ? 2 : 1;
}

/** How an attempt looks on a progress strip: first try, needed help or misses, or skipped. */
export function attemptGrade(a: Attempt): 'good' | 'warn' | 'bad' {
  return a.skipped ? 'bad' : isFirstTry(a) ? 'good' : 'warn';
}
