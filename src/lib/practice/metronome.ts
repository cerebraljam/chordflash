/** Rhythm practice: chords change on the beat, the tempo follows how well you keep up. */

export type Grade = 'onTime' | 'late' | 'missed';

/** A strum this much before the beat still counts as on the beat (seconds). */
export const EARLY_TOLERANCE = 0.15;
/** Round score needed for the tempo to go up, and below which it goes down. */
export const TEMPO_UP_AT = 0.8;
export const TEMPO_DOWN_BELOW = 0.5;
export const MIN_BPM = 40;
export const MAX_BPM = 200;

export interface Slot {
  /** Index in the round. */
  index: number;
  chord: string;
  /** Time (audio clock, seconds) of the beat the chord starts on. */
  start: number;
  /** Seconds per beat. */
  beat: number;
  beats: number;
  /** First correct strum, audio clock time. */
  hitAt: number | null;
}

export interface Round {
  bpm: number;
  /** Count-in (first round) or rest bar (later rounds) before the first chord. */
  leadIn: { start: number; beats: number };
  slots: Slot[];
  /** When the round's last chord ends. */
  end: number;
}

/**
 * Lays out one round: a bar of clicks to come in on, then `chords`, each held
 * `beatsPerChord` beats at `bpm`.
 */
export function planRound(chords: string[], bpm: number, beatsPerChord: number, start: number, leadInBeats = 4): Round {
  const beat = 60 / bpm;
  const first = start + leadInBeats * beat;
  const slots = chords.map((chord, index) => ({
    index,
    chord,
    start: first + index * beatsPerChord * beat,
    beat,
    beats: beatsPerChord,
    hitAt: null,
  }));
  return { bpm, leadIn: { start, beats: leadInBeats }, slots, end: first + chords.length * beatsPerChord * beat };
}

/** The slot a strum at time `t` belongs to: its window opens a little before its first beat. */
export function slotAt(round: Round, t: number): Slot | null {
  return round.slots.find((s) => t >= s.start - EARLY_TOLERANCE && t < s.start + s.beats * s.beat - EARLY_TOLERANCE) ?? null;
}

/** On time = first correct strum within the chord's first beat; late = later in its slot. */
export function grade(slot: Slot): Grade {
  if (slot.hitAt === null) return 'missed';
  return slot.hitAt < slot.start + slot.beat ? 'onTime' : 'late';
}

/** 0..1: on-time chords count fully, late ones half. */
export function roundScore(slots: Slot[]): number {
  if (!slots.length) return 0;
  const points = slots.reduce((s, x) => s + ({ onTime: 1, late: 0.5, missed: 0 } as const)[grade(x)], 0);
  return points / slots.length;
}

/** Tempo for the next round. */
export function nextBpm(bpm: number, score: number, step: number): number {
  const next = score >= TEMPO_UP_AT ? bpm + step : score < TEMPO_DOWN_BELOW ? bpm - step : bpm;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, next));
}

/**
 * Tempo from tapped beats (seconds, oldest first): the median gap of the last
 * 8 taps, so one stray tap doesn't throw it off. Null before 2 taps.
 */
export function tapTempo(times: number[]): number | null {
  const recent = times.slice(-8);
  if (recent.length < 2) return null;
  const gaps = recent.slice(1).map((t, i) => t - recent[i]).sort((a, b) => a - b);
  const mid = gaps.length / 2;
  const gap = gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(60 / gap)));
}
