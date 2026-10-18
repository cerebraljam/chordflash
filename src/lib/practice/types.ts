export type PracticeKind = 'chord' | 'note';

/** One chord or note to play during a practice session, from the moment it is shown until it is played right (or skipped). */
export interface Attempt {
  /** What was practised; missing on attempts saved before note practice existed (= chord). */
  kind?: PracticeKind;
  /** Timestamp (ms since epoch) when the item was completed. */
  at: number;
  sessionId: string;
  /** Previous item id (chord id or note position id), null for the first of a session. */
  from: string | null;
  to: string;
  /** Time from showing the item to the successful strum or note. */
  timeMs: number;
  /** Failed strums / wrong notes before the successful one. */
  misses: number;
  /** The diagram had to be revealed (player was stuck). */
  assisted: boolean;
  skipped: boolean;
  /** Score of the successful strum, 100 for a right note (0 when skipped). */
  score: number;
}

export const kindOf = (a: Attempt): PracticeKind => a.kind ?? 'chord';
