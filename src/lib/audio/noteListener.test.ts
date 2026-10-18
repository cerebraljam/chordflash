import { describe, expect, it } from 'vitest';
import { midiToFreq } from '../music/notes';
import { NoteTracker, VERIFY_WINDOW, isFreshNote, toReading, toneStrength } from './noteListener';
import { OnsetDetector } from './onset';
import { synthStrum } from './synth';
import { Tuner } from './tuner';

/** Runs audio through the same onset + pitch + tracker chain as NoteListener. */
function heardNotes(audio: Float32Array, opts: { minMidi?: number; expected?: number } = {}, sampleRate = 48000) {
  const onsets = new OnsetDetector(sampleRate, { gateDb: -50 });
  const tuner = new Tuner(4096);
  const tracker = new NoteTracker(tuner.windowSize);
  const out: { at: number; midi: number }[] = [];
  const windowEnding = (end: number) => {
    const w = new Float32Array(VERIFY_WINDOW);
    w.set(audio.subarray(Math.max(0, end - VERIFY_WINDOW), end), Math.max(0, VERIFY_WINDOW - end));
    return w;
  };
  let onsetAt = 0;
  for (let end = 512; end <= audio.length; end += 512) {
    const block = audio.subarray(end - 512, end);
    const onset = onsets.process(block);
    if (onset) onsetAt = end - 512;
    const isFresh = (m: number) => isFreshNote(windowEnding(end), windowEnding(onsetAt), sampleRate, m);
    const window = audio.subarray(Math.max(0, end - 4096), end);
    const [freq, clarity] = window.length === 4096 ? tuner.raw(window, sampleRate) : [0, 0];
    const reading = toReading(freq, clarity, { minMidi: opts.minMidi ?? 28, expected: opts.expected ?? null, isFresh });
    const note = tracker.push(onset, reading, 512);
    if (note && isFresh(note.midi)) out.push({ at: end / sampleRate, midi: note.midi });
  }
  return out;
}

/** Plucked notes one after another; each new pluck replaces the previous note on that string. */
function melody(notes: number[], gap: number, seed = 1, overlap = false): Float32Array {
  const sr = 48000;
  const total = Math.round((notes.length * gap + 1) * sr);
  const out = new Float32Array(total);
  notes.forEach((midi, i) => {
    const n = synthStrum([midi], { lead: 0.2 + i * gap, duration: total / sr, seed: seed + i });
    // Without overlap the previous note is damped when the next one starts (same string).
    const stop = overlap ? total : Math.round((0.2 + (i + 1) * gap) * sr);
    for (let k = 0; k < Math.min(total, stop); k++) out[k] += n[k] * 4;
  });
  return out;
}

describe('single-note detection', () => {
  it('hears a bass line in first position, low E included', () => {
    const line = [28, 29, 31, 33, 35, 36, 38, 43]; // E1 F1 G1 A1 B1 C2 D2 G2
    for (let seed = 1; seed <= 40; seed += 10) {
      expect(heardNotes(melody(line, 0.8, seed)).map((n) => n.midi), `seed ${seed}`).toEqual(line);
    }
  });

  it('reports a repeated note once per pluck', () => {
    expect(heardNotes(melody([33, 33, 33], 0.8)).map((n) => n.midi)).toEqual([33, 33, 33]);
  });

  it('does not report the previous note while the next one is plucked over it', () => {
    // Notes on different strings ring on: E1 keeps sounding under the A1, which is the note asked for.
    for (let seed = 3; seed <= 33; seed += 10) {
      expect(heardNotes(melody([28, 33], 1.0, seed, true), { expected: 33 }).map((n) => n.midi), `seed ${seed}`).toEqual([28, 33]);
    }
  });

  it('hears guitar single notes too', () => {
    const line = [40, 45, 52, 55, 59, 64, 67]; // E2 A2 E3 G3 B3 E4 G4
    expect(heardNotes(melody(line, 0.6), { minMidi: 40 }).map((n) => n.midi)).toEqual(line);
  });
});

/**
 * Notes with exact integer harmonics, each ringing 1.45 s and overlapping the
 * next: the pattern that once made a G3 read as C4.
 */
function ringingNotes(notes: number[], gap: number, count: number, sampleRate = 48000): Float32Array {
  const out = new Float32Array(Math.round((count * gap + 2) * sampleRate));
  for (let i = 0; i < count; i++) {
    const f0 = midiToFreq(notes[i % notes.length]);
    const start = 0.5 + i * gap;
    for (let h = 1; h <= 16; h++) {
      const amp = 0.05 / h;
      const from = Math.ceil(start * sampleRate);
      const to = Math.min(out.length, Math.round((start + 1.45) * sampleRate));
      for (let k = from; k < to; k++) {
        const t = k / sampleRate - start;
        out[k] += amp * Math.exp(-t * (1 + 0.2 * h)) * Math.sin(2 * Math.PI * h * f0 * t);
      }
    }
  }
  return out;
}

describe('false notes', () => {
  it('does not count the expected note when it is only still ringing from earlier', () => {
    // G2 A2 B2 cycle, each ringing on under the next two, while B2 is asked for:
    // only the actual B2 plucks may be heard as B2.
    const heard = heardNotes(ringingNotes([43, 45, 47], 0.8, 12), { minMidi: 28, expected: 47 });
    const b2 = heard.filter((n) => n.midi === 47).map((n) => n.at);
    const plucks = [2, 5, 8, 11].map((i) => 0.5 + i * 0.8);
    expect(b2).toHaveLength(plucks.length);
    b2.forEach((t, i) => expect(t - plucks[i]).toBeLessThan(0.4));
  });

  it('counts re-plucking a note that is still ringing', () => {
    // Same string plucked again 0.8 s later: the old vibration is replaced by the new one.
    expect(heardNotes(melody([33, 33, 33], 0.8), { expected: 33 }).map((n) => n.midi)).toEqual([33, 33, 33]);
  });

  it('does not count an open string left ringing when a neighbouring note is plucked', () => {
    const e1 = synthStrum([28], { lead: 0.2, duration: 3, seed: 11 });
    const f1 = synthStrum([29], { lead: 1.2, duration: 3, seed: 12 });
    const heard = heardNotes(e1.map((x, i) => (x + f1[i]) * 4), { expected: 28 });
    expect(heard.filter((n) => n.at > 1.2 && n.midi === 28)).toEqual([]);
  });

  it('does not count an open E1 left ringing when another note is plucked', () => {
    const sr = 48000;
    const e1 = synthStrum([28], { lead: 0.2, duration: 3, seed: 5 });
    const d2 = synthStrum([38], { lead: 1.2, duration: 3, seed: 6 });
    const heard = heardNotes(e1.map((x, i) => (x + d2[i]) * 4), { expected: 28 });
    expect(heard.filter((n) => n.at > 1.2 && n.midi === 28)).toEqual([]);
    void sr;
  });

  it('never hears a note that is not played, even when it is the expected one', () => {
    // G3 A3 B3 over and over while C4 is asked for.
    const heard = heardNotes(ringingNotes([55, 57, 59], 0.8, 15), { minMidi: 40, expected: 60 });
    expect(heard.filter((n) => n.midi === 60)).toEqual([]);
    expect(heard.length).toBeGreaterThanOrEqual(12);
  });
});

describe('toneStrength', () => {
  it('finds A1 in an E1 + A1 mix', () => {
    const e1a1 = melody([28, 33], 1.0, 3, true).subarray(48000 * 1.5, 48000 * 1.5 + VERIFY_WINDOW);
    expect(toneStrength(e1a1, 48000, midiToFreq(33))).toBeGreaterThan(0.2);
  });

  it('does not find C4 in a G3, although 4 × (G3 / 3) = C4', () => {
    const g3 = ringingNotes([55], 1, 1).subarray(48000 * 0.7, 48000 * 0.7 + VERIFY_WINDOW);
    expect(toneStrength(g3, 48000, midiToFreq(55))).toBeGreaterThan(0.5);
    expect(toneStrength(g3, 48000, midiToFreq(60))).toBeLessThan(0.05);
  });
});

describe('toReading', () => {
  const opts = { minMidi: 28, expected: null, isFresh: () => true };

  it('keeps readings within the instrument range', () => {
    expect(toReading(55, 0.95, opts)?.midi).toBe(33);
    expect(toReading(0, 0.5, opts)).toBeNull();
  });

  it('resolves the shared period of two ringing strings to the expected note', () => {
    expect(toReading(13.75, 0.97, opts)).toBeNull();
    expect(toReading(13.75, 0.97, { ...opts, expected: 33 })?.midi).toBe(33); // A1 = 4 × 13.75
    expect(toReading(13.75, 0.97, { ...opts, expected: 31 })).toBeNull(); // G1 isn't a multiple
    expect(toReading(13.75, 0.97, { ...opts, expected: 33, isFresh: () => false })).toBeNull();
  });
});
