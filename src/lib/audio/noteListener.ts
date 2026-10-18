import type { AudioEngine } from './engine';
import { magnitudeSpectrum } from './fft';
import { OnsetDetector } from './onset';
import { freqToMidi, midiToFreq } from '../music/notes';
import { Tuner, readingFromFreq, type TunerReading } from './tuner';

/** Identical consecutive pitch readings needed before a note counts as heard. */
const STABLE_READINGS = 3;

export interface HeardNote {
  midi: number;
  cents: number;
}

/** Samples used to check that a note was played: long enough to separate E1 from A1. */
export const VERIFY_WINDOW = 8192;
/** toneStrength above which a note counts as sounding. */
const SOUNDING = 0.2;
/** Level jump (first harmonics) that makes a note count as freshly played: a pluck from silence. */
const FRESH_GAIN = 1.5;
/**
 * Otherwise, the share of the energy added by the pluck that must land on
 * the note's harmonics. Measured on synthetic bass: re-plucking a ringing
 * note gives 0.46–0.55, a fresh note 0.57–0.70, while a note only left
 * ringing when another is plucked gets 0.25–0.36.
 */
const FRESH_SHARE = 0.4;
/** Harmonics summed for the level comparison; the higher ones separate neighbouring low notes. */
const FRESH_HARMONICS = 4;

/** Amplitude of the component at `freq` in the window (Hann-windowed Goertzel). */
export function toneAmplitude(samples: Float32Array, sampleRate: number, freq: number): number {
  const n = samples.length;
  const w = (2 * Math.PI * freq) / sampleRate;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    const x = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    re += x * Math.cos(w * i);
    im -= x * Math.sin(w * i);
  }
  return (4 * Math.hypot(re, im)) / n;
}

/**
 * Amplitude at `freq` relative to the window's RMS amplitude: about 1 for a
 * pure tone at that frequency, a fraction when it is one note among several,
 * ~0 when absent.
 */
export function toneStrength(samples: Float32Array, sampleRate: number, freq: number): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  const rms = Math.sqrt(energy / samples.length);
  return rms > 0 ? toneAmplitude(samples, sampleRate, freq) / (rms * Math.SQRT2) : 0;
}

/**
 * Share of the energy the pluck added (spectrum now minus spectrum just before
 * the pluck, increases only) that sits on the harmonics of `midi`.
 */
export function pluckShare(now: Float32Array, beforePluck: Float32Array, sampleRate: number, midi: number): number {
  const n = now.length;
  const after = magnitudeSpectrum(now, n);
  const before = magnitudeSpectrum(beforePluck, n);
  const bin = sampleRate / n;
  const f = midiToFreq(midi);
  const mine = new Set<number>();
  for (let h = 1; h * f < 4000; h++) {
    const k = Math.round((h * f) / bin);
    mine.add(k - 1).add(k).add(k + 1);
  }
  let total = 0;
  let on = 0;
  for (let k = Math.floor(30 / bin); k <= Math.ceil(4000 / bin); k++) {
    const added = Math.max(0, after[k] - before[k]);
    total += added;
    if (mine.has(k)) on += added;
  }
  return total > 0 ? on / total : 0;
}

/**
 * Whether `midi` was really played by the last pluck, not just left ringing
 * from earlier: it is clearly present now, and either got much louder or
 * received a good part of the pluck's new energy (re-plucking a note that
 * still rings only raises it ~1.2–1.4×).
 */
export function isFreshNote(now: Float32Array, beforePluck: Float32Array, sampleRate: number, midi: number): boolean {
  const f = midiToFreq(midi);
  if (toneStrength(now, sampleRate, f) <= SOUNDING) return false;
  // At the bottom of the bass, neighbouring notes are < 4 Hz apart and leak into each other's
  // fundamental; their harmonics are further apart, so compare the first few together.
  const level = (w: Float32Array) => {
    let sum = 0;
    for (let h = 1; h <= FRESH_HARMONICS; h++) sum += toneAmplitude(w, sampleRate, h * f);
    return sum;
  };
  return level(now) > FRESH_GAIN * level(beforePluck) || pluckShare(now, beforePluck, sampleRate, midi) > FRESH_SHARE;
}

export interface ReadingOptions {
  /** Lowest playable note (open lowest string). */
  minMidi: number;
  /** The note the player is asked for, if any. */
  expected: number | null;
  /** Whether a note was really played by the last pluck (see isFreshNote). */
  isFresh?: (midi: number) => boolean;
}

/**
 * Converts a raw pitch to a note reading. Two strings ringing together (an
 * open string left ringing under the next note) can make the detector lock
 * onto their shared period, far below the instrument's range: E1 + A1 reads
 * as 13.7 Hz (= 41.2 / 3 = 55 / 4). When the expected note is a whole
 * multiple of such a reading and it was really just played, the reading
 * counts as it. The second check matters: a single G3 can also read as
 * 65.3 Hz (= 196 / 3), and 4 × 65.3 is C4, which isn't sounding at all.
 */
export function toReading(freq: number, clarity: number, opts: ReadingOptions): TunerReading | null {
  if (freq <= 0) return null;
  const midi = freqToMidi(freq);
  if (midi >= opts.minMidi - 1) return readingFromFreq(freq, clarity);
  if (opts.expected === null || !opts.isFresh?.(opts.expected)) return null;
  for (let k = 2; k <= 8; k++) {
    if (Math.abs(freqToMidi(freq * k) - opts.expected) < 0.35) return readingFromFreq(freq * k, clarity);
  }
  return null;
}

/**
 * Turns a stream of (onset, pitch reading) steps into played notes.
 *
 * A note is reported once per pluck, when the pitch has been steady for a few
 * readings. Readings are ignored until the pitch window only contains audio
 * from after the pluck, otherwise the previous note still ringing would be
 * reported. Pitch changes without a pluck are not reported: with several
 * strings ringing the reading can flip to an older note, which must not
 * count as playing it.
 */
export class NoteTracker {
  private candidate: number | null = null;
  private count = 0;
  private armed = false;
  private samplesSinceOnset = Infinity;

  /** @param settleSamples samples to wait after a pluck: the pitch window length. */
  constructor(private settleSamples: number) {}

  push(onset: boolean, reading: TunerReading | null, blockSamples: number): HeardNote | null {
    if (onset) {
      this.armed = true;
      this.samplesSinceOnset = 0;
      this.candidate = null;
      this.count = 0;
    }
    this.samplesSinceOnset += blockSamples;
    if (this.samplesSinceOnset < this.settleSamples) return null;

    if (!reading) {
      this.candidate = null;
      this.count = 0;
      return null;
    }
    if (reading.midi === this.candidate) this.count++;
    else {
      this.candidate = reading.midi;
      this.count = 1;
    }
    if (this.armed && this.count === STABLE_READINGS) {
      this.armed = false;
      return { midi: reading.midi, cents: reading.cents };
    }
    return null;
  }
}

/** Listens to the engine and calls `onNote` for every single note played. */
export class NoteListener {
  private onsets: OnsetDetector;
  private tuner = new Tuner(4096);
  private tracker: NoteTracker;
  private unsubscribe: (() => void) | null = null;
  /** Engine position of the last pluck. */
  private onsetAt = 0;
  /** Latest pitch reading, for a live "hearing" display. */
  current: TunerReading | null = null;
  /** The note currently asked for (helps when two strings ring together). */
  expected: number | null = null;

  constructor(
    private engine: AudioEngine,
    public gateDb: number,
    /** Lowest note of the instrument. */
    private minMidi: number,
    private onNote: (note: HeardNote) => void,
  ) {
    this.onsets = new OnsetDetector(engine.sampleRate, { gateDb });
    this.tracker = new NoteTracker(this.tuner.windowSize);
  }

  start(): void {
    this.unsubscribe = this.engine.onBlock((block, db) => {
      this.onsets.opts.gateDb = this.gateDb;
      const sr = this.engine.sampleRate;
      const onset = this.onsets.process(block);
      if (onset) this.onsetAt = this.engine.position - block.length;
      const isFresh = (midi: number) =>
        isFreshNote(this.engine.read(VERIFY_WINDOW), this.engine.read(VERIFY_WINDOW, this.onsetAt), sr, midi);
      // Pitch detection still works a little below the strum gate, while a note fades.
      const [freq, clarity] = db > this.gateDb - 10 ? this.tuner.raw(this.engine.read(this.tuner.windowSize), sr) : [0, 0];
      const reading = toReading(freq, clarity, { minMidi: this.minMidi, expected: this.expected, isFresh });
      this.current = reading;
      const note = this.tracker.push(onset, reading, block.length);
      // The pitch detector can latch onto an older note still ringing; such a pluck reports nothing.
      if (note && isFresh(note.midi)) this.onNote(note);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
