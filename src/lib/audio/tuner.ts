import { PitchDetector } from 'pitchy';
import { freqToMidi } from '../music/notes';

export interface TunerReading {
  freq: number;
  /** Nearest MIDI note. */
  midi: number;
  /** -50..+50, how far `freq` is from that note. */
  cents: number;
  clarity: number;
}

export function readingFromFreq(freq: number, clarity = 1): TunerReading {
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  return { freq, midi, cents: (exact - midi) * 100, clarity };
}

/** Single-note pitch detection (McLeod method via pitchy). */
export class Tuner {
  private detector: PitchDetector<Float32Array>;

  constructor(
    public readonly windowSize = 4096,
    private minClarity = 0.9,
  ) {
    this.detector = PitchDetector.forFloat32Array(windowSize);
    this.detector.minVolumeDecibels = -60;
  }

  detect(samples: Float32Array, sampleRate: number): TunerReading | null {
    const [freq, clarity] = this.raw(samples, sampleRate);
    if (freq < 30 || freq > 1500) return null;
    return readingFromFreq(freq, clarity);
  }

  /** [frequency, clarity] without range checks; frequency 0 when unclear or too quiet. */
  raw(samples: Float32Array, sampleRate: number): [number, number] {
    const [freq, clarity] = this.detector.findPitch(samples, sampleRate);
    return clarity < this.minClarity ? [0, clarity] : [freq, clarity];
  }
}
