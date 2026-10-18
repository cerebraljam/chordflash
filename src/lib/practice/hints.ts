import type { Attempt } from './types';

export type HintLevel = 'diagram' | 'name';

/** A play only counts as clean when it is this fast. */
export const CLEAN_TIME_MS = 3000;
/** Look at this many recent attempts per chord. */
const WINDOW = 5;
/** Misses within the window that bring the diagram back. */
const SHOW_AFTER_MISSES = 2;
/** When only the name is shown and the player is stuck this long, reveal the diagram. */
export const RESCUE_AFTER_MS = 5000;

export const isClean = (a: Attempt) => !a.skipped && !a.assisted && a.misses === 0 && a.timeMs <= CLEAN_TIME_MS;
export const isMiss = (a: Attempt) => a.skipped || a.assisted || a.misses > 0;

/**
 * Follows the attempt history (oldest first), one attempt at a time, to know
 * per item (chord or note position) whether its diagram is still needed: it
 * disappears after WINDOW clean plays in a row and comes back once
 * SHOW_AFTER_MISSES of the last WINDOW attempts were misses.
 */
export class HintTracker {
  readonly levels = new Map<string, HintLevel>();
  private recent = new Map<string, Attempt[]>();

  /** Adds one attempt; returns its item's level before and after. */
  push(a: Attempt): { before: HintLevel; after: HintLevel } {
    const list = [...(this.recent.get(a.to) ?? []), a].slice(-WINDOW);
    this.recent.set(a.to, list);
    const before = this.levels.get(a.to) ?? 'diagram';
    let after = before;
    if (before === 'diagram' && list.length === WINDOW && list.every(isClean)) after = 'name';
    else if (before === 'name' && list.filter(isMiss).length >= SHOW_AFTER_MISSES) after = 'diagram';
    this.levels.set(a.to, after);
    return { before, after };
  }
}

/** Hint level per item after the whole history (oldest first). */
export function hintLevels(attempts: Attempt[]): Map<string, HintLevel> {
  const t = new HintTracker();
  for (const a of attempts) t.push(a);
  return t.levels;
}
