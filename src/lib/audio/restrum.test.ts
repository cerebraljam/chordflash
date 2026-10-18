import { describe, expect, it } from 'vitest';
import { OnsetDetector } from './onset';
import { synthStrum } from './synth';

const G = [43, 47, 50, 55, 59, 67];

function countOnsets(audio: Float32Array): number[] {
  const det = new OnsetDetector(48000, { gateDb: -50 });
  const found: number[] = [];
  for (let i = 0; i + 512 <= audio.length; i += 512) if (det.process(audio.subarray(i, i + 512))) found.push(i / 48000);
  return found;
}

// After a miss, fixing the fingers takes a moment: re-strums come >= 0.4 s later, at a similar strength.
describe('re-strum while the previous strum still rings', () => {
  it.each([
    [0.4, 0.7],
    [0.4, 1],
    [0.6, 0.7],
    [1.0, 0.7],
    [1.0, 1],
  ])('gap %f s, strength %f', (gap, gain) => {
    for (let seed = 1; seed <= 8; seed++) {
      const a = synthStrum(G, { lead: 0.2, duration: 2.5, seed });
      const b = synthStrum(G, { lead: 0.2 + gap, duration: 2.5, seed: seed + 100 });
      const found = countOnsets(a.map((x, i) => x + b[i] * gain));
      expect(found, `seed ${seed}`).toHaveLength(2);
      // Spread strums are detected a little late; harmless since the analysis skips the attack anyway.
      expect(Math.abs(found[1] - (0.2 + gap)), `seed ${seed}`).toBeLessThan(0.08);
    }
  });

  it('never triggers on a single strum ringing out', () => {
    for (let seed = 1; seed <= 16; seed++) {
      expect(countOnsets(synthStrum(G, { lead: 0.2, duration: 3, seed })), `seed ${seed}`).toHaveLength(1);
    }
  });
});
