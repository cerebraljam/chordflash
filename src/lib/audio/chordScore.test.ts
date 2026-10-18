import { describe, expect, it } from 'vitest';
import { OPEN_CHORDS, chordById, voicingNotes, type Voicing } from '../music/chords';
import { analyze } from './chroma';
import { scoreChord } from './chordScore';
import { synthStrum } from './synth';

const byId = (id: string) => OPEN_CHORDS.find((c) => c.id === id)!;

/** Analyse a synthetic strum the same way the app does: skip the attack, take ~0.3 s. */
function strum(v: Voicing | number[], seed: number, sampleRate = 48000) {
  const notes = Array.isArray(v) ? v : voicingNotes(v);
  const audio = synthStrum(notes, { seed, sampleRate, duration: 0.42 });
  return analyze(audio.subarray(Math.round(0.06 * sampleRate)), sampleRate);
}

describe('scoreChord', () => {
  it('scores the played chord high and every other open chord low', () => {
    for (const played of OPEN_CHORDS) {
      for (let seed = 1; seed <= 4; seed++) {
        const a = strum(played, seed);
        for (const expected of OPEN_CHORDS) {
          const { score } = scoreChord(a, expected);
          if (played === expected) expect(score, `${played.id} seed ${seed}`).toBeGreaterThanOrEqual(90);
          else expect(score, `${played.id} heard as ${expected.id}`).toBeLessThanOrEqual(50);
        }
      }
    }
  });

  it('accepts barre chords, sevenths and power chords played right', () => {
    for (const id of ['F', 'Bm', 'F#m', 'Bb', 'C#m', 'C7', 'G7', 'B7', 'Am7', 'Fmaj7', 'E5', 'G5', 'Dsus4', 'Cadd9']) {
      for (let seed = 1; seed <= 3; seed++) {
        expect(scoreChord(strum(chordById(id), seed), chordById(id)).score, `${id} seed ${seed}`).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it('tells close chords apart', () => {
    const pairs = [['C', 'C7'], ['C7', 'C'], ['B7', 'Bm'], ['Bm', 'B7'], ['F#m', 'F#'], ['Am', 'Am7'], ['D', 'Dsus4']];
    for (const [played, expected] of pairs) {
      for (let seed = 1; seed <= 3; seed++) {
        expect(scoreChord(strum(chordById(played), seed), chordById(expected)).score, `${played} as ${expected}`).toBeLessThan(70);
      }
    }
  });

  it('works at 44.1 kHz too', () => {
    expect(scoreChord(strum(byId('G'), 3, 44100), byId('G')).score).toBeGreaterThanOrEqual(90);
  });

  it('names the wrong and missing notes when major is played instead of minor', () => {
    const r = scoreChord(strum(byId('Em'), 1), byId('E'));
    expect(r.missing).toEqual([8]); // G#
    expect(r.extra).toEqual([7]); // G
  });

  it('reports a wrong bass note', () => {
    // C chord with the low E string also strummed open: E becomes the bass.
    const r = scoreChord(strum([40, ...voicingNotes(byId('C'))], 2), byId('C'));
    expect(r.heardBass).toBe(4);
    expect(r.expectedBass).toBe(0);
    expect(r.score).toBeLessThan(100);
  });
});
