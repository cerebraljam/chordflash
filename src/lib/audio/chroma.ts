import { magnitudeSpectrum, nextPow2 } from './fft';
import { freqToMidi, pitchClass } from '../music/notes';

/** Frequency range used for chroma: just below low E on guitar up to the useful harmonics. */
export const CHROMA_MIN_HZ = 70;
export const CHROMA_MAX_HZ = 1600;
/** Peaks quieter than this fraction of the loudest peak are ignored (~ -30 dB, above Hann sidelobes). */
const PEAK_FLOOR = 0.03;

export interface Peak {
  freq: number;
  mag: number;
  midi: number;
}

export interface Analysis {
  /** Energy per pitch class (C = 0), sums to 1 (all zeros if silent). */
  chroma: Float64Array;
  /** Same, but only from peaks that look like played notes rather than overtones. */
  noteChroma: Float64Array;
  peaks: Peak[];
  /** Peaks not explained as a harmonic of a lower peak, i.e. likely played notes. */
  fundamentals: Peak[];
}

/**
 * How much a peak counts toward its pitch class, from its distance to the
 * nearest semitone (0..0.5): 1 when in tune, 0 when exactly between two notes.
 */
export function tuningWeight(midi: number): number {
  const dev = Math.abs(midi - Math.round(midi));
  return 1 - (2 * dev) ** 2;
}

export function analyze(samples: Float32Array, sampleRate: number): Analysis {
  const fftSize = nextPow2(samples.length);
  const mags = magnitudeSpectrum(samples, fftSize);
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.ceil(CHROMA_MIN_HZ / binHz));
  const hi = Math.min(Math.floor(CHROMA_MAX_HZ / binHz), mags.length - 2);

  let max = 0;
  for (let k = lo; k <= hi; k++) max = Math.max(max, mags[k]);
  const floor = max * PEAK_FLOOR;

  const peaks: Peak[] = [];
  for (let k = lo; k <= hi; k++) {
    const m = mags[k];
    if (m <= floor || m <= mags[k - 1] || m < mags[k + 1]) continue;
    // Parabolic interpolation on log magnitude for sub-bin frequency.
    const a = Math.log(mags[k - 1] + 1e-12);
    const b = Math.log(m);
    const c = Math.log(mags[k + 1] + 1e-12);
    const denom = a - 2 * b + c;
    const p = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    const freq = (k + p) * binHz;
    peaks.push({ freq, mag: Math.exp(b - 0.25 * (a - c) * p), midi: freqToMidi(freq) });
  }

  const fundamentals = peaks.filter((pk) => !isHarmonic(pk, peaks));
  return { chroma: chromaOf(peaks), noteChroma: chromaOf(fundamentals), peaks, fundamentals };
}

function chromaOf(peaks: Peak[]): Float64Array {
  const chroma = new Float64Array(12);
  for (const pk of peaks) chroma[pitchClass(pk.midi)] += pk.mag * tuningWeight(pk.midi);
  return normalize(chroma);
}

/** Highest harmonic number checked, and how close (in semitones) a peak must be to it. */
const MAX_HARMONIC = 12;
const HARMONIC_TOLERANCE = 0.3;

/**
 * True when `pk` sits on the 2nd..12th harmonic of a lower peak that is not
 * negligible next to it. Guitar overtones can be louder than the fundamental,
 * hence the generous 0.2 ratio.
 */
function isHarmonic(pk: Peak, peaks: Peak[]): boolean {
  for (const low of peaks) {
    if (low.freq >= pk.freq / 1.9) break;
    if (low.mag < pk.mag * 0.2) continue;
    const h = Math.round(pk.freq / low.freq);
    if (h < 2 || h > MAX_HARMONIC) continue;
    const dev = Math.abs(pk.midi - low.midi - 12 * Math.log2(h));
    if (dev < HARMONIC_TOLERANCE) return true;
  }
  return false;
}

/** Lowest peak that is at least `rel` times the loudest one — a rough bass note estimate. */
export function lowestStrongPeak(peaks: Peak[], rel = 0.15): Peak | null {
  const max = peaks.reduce((m, p) => Math.max(m, p.mag), 0);
  return peaks.find((p) => p.mag >= max * rel) ?? null;
}

export function normalize(v: Float64Array): Float64Array {
  const sum = v.reduce((s, x) => s + x, 0);
  if (sum > 0) for (let i = 0; i < v.length; i++) v[i] /= sum;
  return v;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
