import { analyze, cosine, lowestStrongPeak, normalize, tuningWeight, CHROMA_MAX_HZ, type Analysis } from './chroma';
import { bassPitchClass, voicingNotes, voicingPitchClasses, type Voicing } from '../music/chords';
import { freqToMidi, midiToFreq, pitchClass } from '../music/notes';

/**
 * Similarity (cosine between heard and expected chroma) that maps to a score
 * of 0 and of 100. Everything in between is linear. These are the main knobs
 * to tune against a real guitar.
 */
export const SIM_ZERO = 0.6;
export const SIM_FULL = 0.92;
/** Share of the played-note energy below which a chord tone counts as missing, above which a non-chord tone counts as wrong. */
const MISSING_SHARE = 0.04;
const EXTRA_SHARE = 0.06;
/** Score multipliers per missing chord tone, per clearly-heard wrong note, and for a wrong bass note. */
const MISSING_PENALTY = 0.6;
const EXTRA_PENALTY = 0.6;
const WRONG_BASS_PENALTY = 0.8;

export interface ChordScore {
  /** 0..100 */
  score: number;
  similarity: number;
  /** Chord tones (pitch classes) that are too quiet or absent. */
  missing: number[];
  /** Non-chord pitch classes that are clearly sounding. */
  extra: number[];
  expectedBass: number;
  heardBass: number | null;
  chroma: Float64Array;
}

/**
 * Expected chroma for a voicing: each sounding note contributes its first
 * harmonics (amplitude 1/h), so e.g. the D in a G chord's B-string 3rd
 * harmonic (F#) is expected rather than counted as a wrong note.
 */
export function chordTemplate(v: Voicing): Float64Array {
  const t = new Float64Array(12);
  for (const note of voicingNotes(v)) {
    const f0 = midiToFreq(note);
    for (let h = 1; h * f0 <= CHROMA_MAX_HZ && h <= 12; h++) {
      const midi = freqToMidi(h * f0);
      t[pitchClass(midi)] += tuningWeight(midi) / h;
    }
  }
  return normalize(t);
}

export function scoreChord(input: Analysis, v: Voicing, reference?: Float64Array): ChordScore {
  const { chroma, noteChroma, peaks } = input;
  const template = reference ?? chordTemplate(v);
  // The notes this shape really plays: C7's usual open shape has no G, so G can't be "missing".
  const tones = voicingPitchClasses(v);
  const similarity = cosine(chroma, template);

  // A tone whose every occurrence sits on an overtone of a lower note in the shape (B7's high F#
  // = 3rd harmonic of the low B) never shows up as a played note; judge it on the full sound.
  const masked = maskedPitchClasses(v);
  const missing = tones.filter((pc) => (masked.has(pc) ? chroma[pc] : noteChroma[pc]) < MISSING_SHARE);
  const extra: number[] = [];
  for (let pc = 0; pc < 12; pc++) {
    if (!tones.includes(pc) && noteChroma[pc] > EXTRA_SHARE) extra.push(pc);
  }

  const expectedBass = bassPitchClass(v);
  const bassPeak = lowestStrongPeak(peaks);
  const heardBass = bassPeak ? pitchClass(bassPeak.midi) : null;

  const base = Math.min(1, Math.max(0, (similarity - SIM_ZERO) / (SIM_FULL - SIM_ZERO)));
  let score = base * MISSING_PENALTY ** missing.length * EXTRA_PENALTY ** extra.length;
  if (heardBass !== null && heardBass !== expectedBass) score *= WRONG_BASS_PENALTY;

  return { score: Math.round(score * 100), similarity, missing, extra, expectedBass, heardBass, chroma };
}

/** Pitch classes of the voicing that only occur exactly on a harmonic (2–12) of a lower note of it. */
function maskedPitchClasses(v: Voicing): Set<number> {
  const notes = voicingNotes(v);
  const hidden = (m: number) => notes.some((low) => low < m && [12, 19, 24, 28, 31, 36, 38, 40, 43].includes(m - low));
  const all = new Set(notes.map(pitchClass));
  const visible = new Set(notes.filter((m) => !hidden(m)).map(pitchClass));
  return new Set([...all].filter((pc) => !visible.has(pc)));
}

export function scoreSamples(samples: Float32Array, sampleRate: number, v: Voicing, reference?: Float64Array): ChordScore {
  return scoreChord(analyze(samples, sampleRate), v, reference);
}
