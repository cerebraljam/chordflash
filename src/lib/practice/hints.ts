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
 * Replays the attempt history (oldest first) to find, per chord, whether the
 * diagram is still needed: it disappears after WINDOW clean plays in a row and
 * comes back once SHOW_AFTER_MISSES of the last WINDOW attempts were misses.
 */
export function hintLevels(attempts: Attempt[]): Map<string, HintLevel> {
  const recent = new Map<string, Attempt[]>();
  const levels = new Map<string, HintLevel>();
  for (const a of attempts) {
    const list = [...(recent.get(a.to) ?? []), a].slice(-WINDOW);
    recent.set(a.to, list);
    const level = levels.get(a.to) ?? 'diagram';
    if (level === 'diagram' && list.length === WINDOW && list.every(isClean)) levels.set(a.to, 'name');
    else if (level === 'name' && list.filter(isMiss).length >= SHOW_AFTER_MISSES) levels.set(a.to, 'diagram');
    else levels.set(a.to, level);
  }
  return levels;
}
