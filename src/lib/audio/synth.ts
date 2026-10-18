import { midiToFreq } from '../music/notes';

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StrumOptions {
  sampleRate?: number;
  /** Seconds of audio to render. */
  duration?: number;
  /** Seconds of silence before the strum. */
  lead?: number;
  seed?: number;
  /** Max random detuning per string, in cents. */
  detuneCents?: number;
  noiseLevel?: number;
}

/**
 * Rough plucked-string model for tests: each note gets ~20 slightly
 * inharmonic partials with randomised amplitudes, a strum delay between
 * strings and an exponential decay.
 */
export function synthStrum(midiNotes: number[], opts: StrumOptions = {}): Float32Array {
  const { sampleRate = 48000, duration = 0.6, lead = 0, seed = 1, detuneCents = 8, noiseLevel = 0.002 } = opts;
  const rand = rng(seed);
  const out = new Float32Array(Math.round(duration * sampleRate));
  midiNotes.forEach((midi, s) => {
    const f0 = midiToFreq(midi + ((rand() * 2 - 1) * detuneCents) / 100);
    const start = lead + s * (0.004 + rand() * 0.008);
    const gain = 0.5 + rand() * 0.5;
    const tau = 0.6 + rand() * 1.5;
    const tilt = 0.7 + rand() * 0.6;
    for (let h = 1; h <= 20; h++) {
      const f = h * f0 * Math.sqrt(1 + 1e-4 * h * h);
      if (f > sampleRate / 2) break;
      const amp = (gain * (0.5 + rand())) / h ** tilt;
      const phase = rand() * 2 * Math.PI;
      const hTau = tau / (1 + 0.15 * h);
      // amp·e^(−t/τ)·sin(2πft + φ), generated with the damped-sine recurrence
      // y[n+1] = 2r·cos(w)·y[n] − r²·y[n−1] (no sin/exp per sample: tests stay fast).
      const first = Math.ceil(start * sampleRate);
      const t0 = first / sampleRate - start;
      const w = (2 * Math.PI * f) / sampleRate;
      const r = Math.exp(-1 / (hTau * sampleRate));
      const c = 2 * r * Math.cos(w);
      const r2 = r * r;
      let y = amp * Math.exp(-t0 / hTau) * Math.sin(2 * Math.PI * f * t0 + phase);
      let prev = amp * Math.exp(-(t0 - 1 / sampleRate) / hTau) * Math.sin(2 * Math.PI * f * (t0 - 1 / sampleRate) + phase);
      // Stop once the partial has decayed below ~-120 dB of its start.
      const end = Math.min(out.length, first + Math.ceil(hTau * Math.log(1e6) * sampleRate));
      for (let i = first; i < end; i++) {
        out[i] += y;
        const next = c * y - r2 * prev;
        prev = y;
        y = next;
      }
    }
  });
  for (let i = 0; i < out.length; i++) out[i] = out[i] * 0.1 + (rand() * 2 - 1) * noiseLevel;
  return out;
}

export function synthSine(freq: number, opts: { sampleRate?: number; duration?: number; amp?: number } = {}): Float32Array {
  const { sampleRate = 48000, duration = 0.2, amp = 0.3 } = opts;
  const out = new Float32Array(Math.round(duration * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}
