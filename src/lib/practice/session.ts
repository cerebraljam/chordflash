import type { Attempt, PracticeKind } from './types';

export type Goal = { kind: 'count'; transitions: number } | { kind: 'time'; minutes: number };

/** Chooses the item after `from` (null for the very first one), given this session's attempts so far. */
export type Picker = (from: string | null, items: string[], sessionAttempts: Attempt[]) => string;

export interface SessionOptions {
  kind: PracticeKind;
  /** Chord ids or note position ids to practise. */
  items: string[];
  goal: Goal;
  threshold: number;
  rand?: () => number;
  /** Defaults to uniform random without repeats. */
  pick?: Picker;
}

export type StrumOutcome = 'pass' | 'miss' | 'ignored';

/** Picks an item, never the same as `prev`. */
export function pickNext(items: string[], prev: string | null, rand: () => number): string {
  const options = items.length > 1 ? items.filter((c) => c !== prev) : items;
  return options[Math.floor(rand() * options.length)];
}

/**
 * Practice session state machine, independent of audio and UI. Times are
 * passed in so it can be driven by tests.
 *
 * Works on chords or single notes ("items"). The first item is a warm-up; a
 * "transition" is every item after it.
 */
export class PracticeSession {
  readonly id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  readonly attempts: Attempt[] = [];
  current: string;
  upcoming: string;
  private prev: string | null = null;
  private startedAt = 0;
  private shownAt = 0;
  private misses = 0;
  private assisted = false;
  private pick: (from: string | null) => string;

  constructor(private opts: SessionOptions) {
    if (opts.items.length < 2) throw new Error('Pick at least two items');
    const rand = opts.rand ?? Math.random;
    const picker: Picker = opts.pick ?? ((from, items) => pickNext(items, from, rand));
    this.pick = (from) => picker(from, opts.items, this.attempts);
    this.current = this.pick(null);
    this.upcoming = this.pick(this.current);
  }

  start(now: number): void {
    this.startedAt = now;
    this.shownAt = now;
  }

  /** Transitions completed so far (the warm-up chord doesn't count). */
  get transitions(): number {
    return this.attempts.filter((a) => a.from !== null).length;
  }

  elapsed(now: number): number {
    return now - this.startedAt;
  }

  /** Time spent on the current chord. */
  sinceShown(now: number): number {
    return now - this.shownAt;
  }

  get currentMisses(): number {
    return this.misses;
  }

  get done(): boolean {
    const g = this.opts.goal;
    if (g.kind === 'count') return this.transitions >= g.transitions;
    return this.attempts.length > 0 && this.attempts[this.attempts.length - 1].at - this.startedAt >= g.minutes * 60_000;
  }

  /** Feed the score of a strum. On a pass the session moves to the next chord. */
  strum(score: number, now: number): StrumOutcome {
    if (this.done) return 'ignored';
    if (score < this.opts.threshold) {
      this.misses++;
      return 'miss';
    }
    this.finish(now, score, false);
    return 'pass';
  }

  /** The diagram was revealed because the player was stuck. */
  assist(): void {
    this.assisted = true;
  }

  skip(now: number): void {
    if (!this.done) this.finish(now, 0, true);
  }

  private finish(now: number, score: number, skipped: boolean): void {
    this.attempts.push({
      kind: this.opts.kind,
      at: now,
      sessionId: this.id,
      from: this.prev,
      to: this.current,
      timeMs: now - this.shownAt,
      misses: this.misses,
      assisted: this.assisted,
      skipped,
      score,
    });
    this.prev = this.current;
    this.current = this.upcoming;
    this.upcoming = this.pick(this.current);
    this.shownAt = now;
    this.misses = 0;
    this.assisted = false;
  }
}

/**
 * Plays `sequence` in order, looping. Chord songs (merged repeats): when the
 * loop wraps onto the chord just played (song ends and starts on G), that
 * repeat is skipped. Riffs keep every note, repeats included (`keepRepeats`).
 */
export function sequencePicker(sequence: string[], keepRepeats = false): Picker {
  return sequenceCursor(sequence, keepRepeats).pick;
}

/**
 * sequencePicker that also records where each pick came from: `positions[k]`
 * is the index in `sequence` of the k-th item picked (the session picks the
 * warm-up item first, so the item on screen is `positions[attempts.length]`).
 */
export function sequenceCursor(sequence: string[], keepRepeats = false): { pick: Picker; positions: number[] } {
  let i = 0;
  const positions: number[] = [];
  const pick: Picker = (from) => {
    let at = i++ % sequence.length;
    if (!keepRepeats && sequence[at] === from) at = i++ % sequence.length;
    positions.push(at);
    return sequence[at];
  };
  return { pick, positions };
}
