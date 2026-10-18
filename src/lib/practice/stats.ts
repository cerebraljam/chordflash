import { pairKey } from './weighting';
import type { HintLevel } from './hints';
import { summarize } from './summary';
import type { Attempt } from './types';

export interface SessionStat {
  id: string;
  /** Time of the session's first attempt. */
  start: number;
  transitions: number;
  firstTryRate: number;
  avgMs: number;
  misses: number;
}

export interface ChordStat {
  chord: string;
  plays: number;
  firstTryRate: number;
  /** Average time over the last few plays, so it reflects the current level. */
  recentAvgMs: number;
  level: HintLevel;
}

export interface PairStat {
  from: string;
  to: string;
  count: number;
  recentAvgMs: number;
  firstTryRate: number;
  misses: number;
}

export interface PeriodStat {
  sessions: number;
  transitions: number;
  firstTryRate: number;
  avgMs: number;
}

/** Plays per chord / pair used for the "recent" averages. */
const RECENT_CHORD = 10;
const RECENT_PAIR = 5;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const firstTry = (a: Attempt) => !a.skipped && a.misses === 0 && !a.assisted;
const recentAvg = (list: Attempt[], n: number) => mean(list.filter((a) => !a.skipped).slice(-n).map((a) => a.timeMs));

function groupBy<K>(attempts: Attempt[], key: (a: Attempt) => K): Map<K, Attempt[]> {
  const out = new Map<K, Attempt[]>();
  for (const a of attempts) {
    const k = key(a);
    const list = out.get(k);
    if (list) list.push(a);
    else out.set(k, [a]);
  }
  return out;
}

/** One entry per session that had at least one transition, oldest first. */
export function sessionStats(attempts: Attempt[]): SessionStat[] {
  return [...groupBy(attempts, (a) => a.sessionId)]
    .map(([id, list]) => {
      const s = summarize(list);
      return {
        id,
        start: Math.min(...list.map((a) => a.at - a.timeMs)),
        transitions: s.transitions,
        firstTryRate: s.firstTryRate,
        avgMs: s.avgMs,
        misses: s.totalMisses,
      };
    })
    .filter((s) => s.transitions > 0)
    .sort((a, b) => a.start - b.start);
}

/** Per chord (every play, warm-up included), slowest first. */
export function chordStats(attempts: Attempt[], levels: Map<string, HintLevel>): ChordStat[] {
  return [...groupBy(attempts, (a) => a.to)]
    .map(([chord, list]) => ({
      chord,
      plays: list.length,
      firstTryRate: list.filter(firstTry).length / list.length,
      recentAvgMs: recentAvg(list, RECENT_CHORD),
      level: levels.get(chord) ?? 'diagram',
    }))
    .sort((a, b) => (b.recentAvgMs || Infinity) - (a.recentAvgMs || Infinity));
}

/** Per transition pair, keyed by pairKey(from, to). */
export function pairStats(attempts: Attempt[]): Map<string, PairStat> {
  const out = new Map<string, PairStat>();
  for (const [key, list] of groupBy(
    attempts.filter((a) => a.from !== null),
    (a) => pairKey(a.from!, a.to),
  )) {
    out.set(key, {
      from: list[0].from!,
      to: list[0].to,
      count: list.length,
      recentAvgMs: recentAvg(list, RECENT_PAIR),
      firstTryRate: list.filter(firstTry).length / list.length,
      misses: list.reduce((s, a) => s + a.misses, 0),
    });
  }
  return out;
}

/** Totals over a run of sessions, weighted by their number of transitions. */
export function periodStat(sessions: SessionStat[]): PeriodStat {
  const transitions = sessions.reduce((s, x) => s + x.transitions, 0);
  const weighted = (f: (s: SessionStat) => number) =>
    transitions ? sessions.reduce((s, x) => s + f(x) * x.transitions, 0) / transitions : NaN;
  return {
    sessions: sessions.length,
    transitions,
    firstTryRate: weighted((s) => s.firstTryRate),
    avgMs: weighted((s) => s.avgMs),
  };
}
