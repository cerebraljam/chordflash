import type { Attempt } from './types';

/** Cost of a skip, in "seconds". */
const SKIP_COST = 12;
/** Each failed strum counts like this many extra seconds. */
const MISS_COST = 2;
const ASSIST_COST = 3;
/** Weight of the newest attempt in the running average, so improvement shows quickly. */
const ALPHA = 0.4;
/** Pairs never played yet count as fairly hard, so they get tried early. */
export const UNSEEN_COST = 6;
/** Caps how much more often a very hard pair can come up. */
const MAX_COST = 10;

export const pairKey = (from: string, to: string) => `${from}→${to}`;

/** How hard one change was, in seconds-equivalent: slow changes, misses, help and skips all add up. */
export function attemptCost(a: Attempt): number {
  if (a.skipped) return SKIP_COST;
  return a.timeMs / 1000 + MISS_COST * a.misses + (a.assisted ? ASSIST_COST : 0);
}

/** Exponential moving average of the cost per transition pair, from the history (oldest first). */
export function pairDifficulties(attempts: Attempt[]): Map<string, number> {
  const costs = new Map<string, number>();
  for (const a of attempts) {
    if (a.from === null) continue;
    const key = pairKey(a.from, a.to);
    const prev = costs.get(key);
    const cost = attemptCost(a);
    costs.set(key, prev === undefined ? cost : prev + ALPHA * (cost - prev));
  }
  return costs;
}

/**
 * Picks the next item after `from`, never `from` itself, favouring the
 * changes that have been hard: weight = 1 + cost (capped), so a 10 s change
 * comes up ~4× more often than a 2 s one.
 */
export function weightedPick(from: string, items: string[], difficulty: Map<string, number>, rand: () => number): string {
  const options = items.filter((c) => c !== from);
  const weights = options.map((c) => 1 + Math.min(MAX_COST, difficulty.get(pairKey(from, c)) ?? UNSEEN_COST));
  let r = rand() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r < 0) return options[i];
  }
  return options[options.length - 1];
}

/** Hardest known changes between the given items, hardest first. */
export function hardestPairs(difficulty: Map<string, number>, items: string[], limit = 3): { from: string; to: string; cost: number }[] {
  const out: { from: string; to: string; cost: number }[] = [];
  for (const from of items) {
    for (const to of items) {
      const cost = difficulty.get(pairKey(from, to));
      if (from !== to && cost !== undefined) out.push({ from, to, cost });
    }
  }
  return out.sort((a, b) => b.cost - a.cost).slice(0, limit);
}
