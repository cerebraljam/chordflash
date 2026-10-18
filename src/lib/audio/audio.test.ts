import { describe, expect, it } from 'vitest';
import { OnsetDetector } from './onset';
import { synthSine, synthStrum } from './synth';
import { Tuner } from './tuner';

describe('Tuner', () => {
  const tuner = new Tuner();

  it.each([
    [82.41, 40], // low E guitar
    [110, 45],
    [329.63, 64],
    [41.2, 28], // low E bass
  ])('detects %f Hz as MIDI %i', (freq, midi) => {
    const r = tuner.detect(synthSine(freq, { duration: 4096 / 48000 }), 48000);
    expect(r?.midi).toBe(midi);
    expect(Math.abs(r!.cents)).toBeLessThan(3);
  });

  it('reports cents off for a sharp note', () => {
    const r = tuner.detect(synthSine(110 * 2 ** (20 / 1200), { duration: 4096 / 48000 }), 48000);
    expect(r?.midi).toBe(45);
    expect(r!.cents).toBeCloseTo(20, 0);
  });

  it('returns null for silence', () => {
    expect(tuner.detect(new Float32Array(4096), 48000)).toBeNull();
  });
});

describe('OnsetDetector', () => {
  function onsetsIn(audio: Float32Array) {
    const det = new OnsetDetector(48000, { gateDb: -50 });
    const found: number[] = [];
    for (let i = 0; i + 512 <= audio.length; i += 512) {
      if (det.process(audio.subarray(i, i + 512))) found.push(i / 48000);
    }
    return found;
  }

  it('finds one onset per strum, none while it rings', () => {
    const a = synthStrum([43, 47, 50, 55, 59, 67], { lead: 0.2, duration: 1.2, seed: 1 });
    const b = synthStrum([48, 52, 55, 60, 64], { lead: 0.1, duration: 1.0, seed: 2 });
    const audio = new Float32Array(a.length + b.length);
    audio.set(a);
    // Second strum starts while the first is still ringing.
    for (let i = 0; i < b.length; i++) audio[Math.round(0.8 * 48000) + i] += b[i];
    const found = onsetsIn(audio);
    expect(found).toHaveLength(2);
    expect(found[0]).toBeCloseTo(0.2, 1);
    expect(found[1]).toBeCloseTo(0.9, 1);
  });

  it('ignores noise below the gate', () => {
    expect(onsetsIn(synthStrum([], { duration: 1, noiseLevel: 0.001 }))).toHaveLength(0);
  });
});
