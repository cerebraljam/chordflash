import { hintLevels, isClean } from './hints';
import { pairStats } from './stats';
import type { Attempt } from './types';
import { hardestPairs, pairDifficulties } from './weighting';

export interface SetChange {
  from: string;
  to: string;
  /** Recent average change time; NaN if only skipped so far. */
  avgMs: number;
}

/** The slowest changes between the chords of the set, hardest first (empty for a new player). */
export function tonightsFocus(chordAttempts: Attempt[], chords: string[], limit = 3): SetChange[] {
  const pairs = pairStats(chordAttempts);
  return hardestPairs(pairDifficulties(chordAttempts), chords, limit).map((p) => ({
    from: p.from,
    to: p.to,
    avgMs: pairs.get(`${p.from}→${p.to}`)?.recentAvgMs ?? NaN,
  }));
}

export type CollectionState = 'mastered' | 'learning' | 'new';

export interface CollectionCard {
  chord: string;
  state: CollectionState;
  /** Clean plays in a row (0–5): five hide the diagram. */
  streak: number;
}

/** Five clean plays in a row master a chord (its diagram is hidden). */
export const MASTER_STREAK = 5;

/**
 * The chord collection: mastered (diagram hidden), learning (with its current
 * clean streak) or new (joined from a song, never played yet). Starter chords
 * are never "new": unplayed, they are simply learning with no streak.
 */
export function chordCollection(chordAttempts: Attempt[], chords: string[], starters: string[] = []): CollectionCard[] {
  const levels = hintLevels(chordAttempts);
  return chords.map((chord) => {
    const plays = chordAttempts.filter((a) => a.to === chord);
    let streak = 0;
    for (let i = plays.length - 1; i >= 0 && isClean(plays[i]) && streak < MASTER_STREAK; i--) streak++;
    const state: CollectionState =
      levels.get(chord) === 'name' ? 'mastered' : plays.length || starters.includes(chord) ? 'learning' : 'new';
    return { chord, state, streak };
  });
}

/** How many of the given items (chords or note positions) are mastered. */
export const masteredCount = (attempts: Attempt[], items: string[]) => {
  const levels = hintLevels(attempts);
  return items.filter((id) => levels.get(id) === 'name').length;
};

export interface WeekStat {
  /** Changes played (warm-up items excluded). */
  changes: number;
  sessions: number;
  /** Share of changes right on the first strum without help; NaN without changes. */
  firstTry: number;
  /** Average change time (skips excluded); NaN without changes. */
  avgMs: number;
}

const DAY = 86_400_000;

function weekOf(attempts: Attempt[]): WeekStat {
  const changes = attempts.filter((a) => a.from !== null);
  const played = changes.filter((a) => !a.skipped);
  return {
    changes: changes.length,
    sessions: new Set(attempts.map((a) => a.sessionId)).size,
    firstTry: changes.length ? played.filter((a) => a.misses === 0 && !a.assisted).length / changes.length : NaN,
    avgMs: played.length ? played.reduce((s, a) => s + a.timeMs, 0) / played.length : NaN,
  };
}

/** The last 7 days, and the 7 before for comparison. */
export function weekStats(attempts: Attempt[], now: number): { week: WeekStat; previous: WeekStat } {
  return {
    week: weekOf(attempts.filter((a) => a.at > now - 7 * DAY && a.at <= now)),
    previous: weekOf(attempts.filter((a) => a.at > now - 14 * DAY && a.at <= now - 7 * DAY)),
  };
}
