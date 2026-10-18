import type { Attempt } from './types';

export interface PairStat {
  from: string;
  to: string;
  count: number;
  avgMs: number;
  misses: number;
}

export interface SessionSummary {
  transitions: number;
  /** Share of transitions played right on the first strum, without help. */
  firstTryRate: number;
  avgMs: number;
  totalMisses: number;
  skipped: number;
  /** Slowest transition pairs first. */
  pairs: PairStat[];
}

/** Summarises the transitions (warm-up chord excluded) of a session. */
export function summarize(attempts: Attempt[]): SessionSummary {
  const transitions = attempts.filter((a) => a.from !== null);
  const played = transitions.filter((a) => !a.skipped);
  const byPair = new Map<string, Attempt[]>();
  for (const a of transitions) {
    const key = `${a.from}→${a.to}`;
    byPair.set(key, [...(byPair.get(key) ?? []), a]);
  }
  const pairs = [...byPair.values()]
    .map((list) => {
      const timed = list.filter((a) => !a.skipped);
      return {
        from: list[0].from!,
        to: list[0].to,
        count: list.length,
        avgMs: timed.length ? mean(timed.map((a) => a.timeMs)) : Infinity,
        misses: list.reduce((s, a) => s + a.misses + (a.skipped ? 1 : 0), 0),
      };
    })
    .sort((a, b) => b.avgMs - a.avgMs);

  return {
    transitions: transitions.length,
    firstTryRate: transitions.length ? played.filter((a) => a.misses === 0 && !a.assisted).length / transitions.length : 0,
    avgMs: played.length ? mean(played.map((a) => a.timeMs)) : 0,
    totalMisses: transitions.reduce((s, a) => s + a.misses, 0),
    skipped: transitions.length - played.length,
    pairs,
  };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
