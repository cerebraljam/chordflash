import { fft } from './fft';

export interface OnsetOptions {
  /** Ignore anything quieter than this (block RMS, dBFS). */
  gateDb: number;
  /** How much the recent flux must exceed the level just before it. */
  ratio?: number;
  /** Minimum time between two onsets. */
  refractorySec?: number;
}

export function rmsDb(block: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
  const rms = Math.sqrt(sum / block.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

const FRAME = 1024;
/** Log compression strength: makes the flux respond to relative, not absolute, changes. */
const GAMMA = 1;
/** Minimum summed flux for an onset, so steady noise never triggers. */
const MIN_FLUX = 0.06;
/** A strum's six strings are spread over up to ~60 ms: sum the flux of the last 3 blocks (~32 ms)… */
const SUM_BLOCKS = 3;
/** …and compare it with the average over the ~100 ms before that. */
const BASE_BLOCKS = 10;

/**
 * Detects strums from a stream of fixed-size blocks using spectral flux: the
 * sum of increases in log-magnitude per frequency bin. A new strum raises many
 * bins at once even when strings from the previous strum are still ringing and
 * the overall volume hardly changes.
 *
 * As in SuperFlux (Böck & Widmer 2013), each bin is compared to the max of its
 * neighbours two blocks earlier, which ignores the slow wobble of ringing
 * strings beating against each other but still catches a strum spread over
 * ~50 ms.
 */
export class OnsetDetector {
  private frame = new Float32Array(FRAME);
  /** Log spectra of the last two blocks, oldest first. */
  private past: Float64Array[] = [];
  private history: number[] = [];
  private samplesSinceOnset = Infinity;
  private window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  private maxBin: number;
  /** Last computed flux, for diagnostics. */
  flux = 0;

  constructor(
    private sampleRate: number,
    public opts: OnsetOptions,
  ) {
    this.maxBin = Math.min(FRAME / 2, Math.round((8000 / sampleRate) * FRAME));
  }

  /** Returns true when `block` contains the start of a new strum. */
  process(block: Float32Array): boolean {
    const { gateDb, ratio = 2.5, refractorySec = 0.25 } = this.opts;
    // Slide the analysis frame forward by this block.
    const n = Math.min(block.length, FRAME);
    this.frame.copyWithin(0, n);
    this.frame.set(block.subarray(block.length - n), FRAME - n);

    const spec = this.logSpectrum();
    let flux = 0;
    if (this.past.length === 2) {
      const ref = this.past[0];
      for (let k = 1; k < this.maxBin - 1; k++) flux += Math.max(0, spec[k] - Math.max(ref[k - 1], ref[k], ref[k + 1]));
      flux /= this.maxBin;
      this.past.shift();
    }
    this.past.push(spec);
    this.flux = flux;

    this.samplesSinceOnset += block.length;
    this.history.push(flux);
    if (this.history.length > SUM_BLOCKS + 1 + BASE_BLOCKS) this.history.shift();
    const h = this.history;
    const recent = h.slice(-SUM_BLOCKS).reduce((s, x) => s + x, 0);
    // Leave one block of gap so the first rising block of the strum doesn't count as "before".
    const before = h.slice(0, Math.max(0, h.length - SUM_BLOCKS - 1));
    const base = before.length ? (before.reduce((s, x) => s + x, 0) / before.length) * SUM_BLOCKS : 0;

    const onset =
      rmsDb(block) > gateDb &&
      recent > MIN_FLUX &&
      recent > base * ratio &&
      this.samplesSinceOnset > refractorySec * this.sampleRate;
    if (onset) this.samplesSinceOnset = 0;
    return onset;
  }

  private logSpectrum(): Float64Array {
    const re = new Float64Array(FRAME);
    const im = new Float64Array(FRAME);
    for (let i = 0; i < FRAME; i++) re[i] = this.frame[i] * this.window[i];
    fft(re, im);
    const out = new Float64Array(this.maxBin);
    for (let k = 0; k < this.maxBin; k++) out[k] = Math.log1p(GAMMA * Math.hypot(re[k], im[k]));
    return out;
  }
}
