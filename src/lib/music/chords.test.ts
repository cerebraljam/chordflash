import { describe, expect, it } from 'vitest';
import {
  OPEN_CHORDS,
  barres,
  bassPitchClass,
  chordById,
  chordDifficulty,
  chordId,
  chordName,
  chordPitchClasses,
  parseChord,
  voicingNotes,
  voicingPitchClasses,
} from './chords';
import { pitchClass } from './notes';

describe('chord symbols', () => {
  it.each([
    ['Am', 'Am'],
    ['F#m7', 'F#m7'],
    ['Fsmin7', 'F#m7'],
    ['Bbmaj7', 'Bbmaj7'],
    ['Asus4', 'Asus4'],
    ['Dno3d', 'D5'],
    ['A/Cs', 'A/C#'],
    ['Cadd13', 'C6'],
    ['Gmin/D', 'Gm/D'],
    ['E/E', 'E'],
    ['Cweird', 'C'],
    ['Csmin/', 'C#m'],
  ])('reads %s as %s', (text, id) => {
    expect(chordId(text)).toBe(id);
  });

  it('rejects non-chords and simplifies to triads', () => {
    expect(parseChord('<verse_1>')).toBeNull();
    expect(parseChord('H7')).toBeNull();
    expect(chordId('F#m7/E', true)).toBe('F#m');
    expect(chordId('Cmaj7', true)).toBe('C');
    expect(chordId('Bdim', true)).toBe('Bm');
  });

  it('names chords in French', () => {
    expect(chordName(chordById('Am'), 'fr')).toBe('Lam');
    expect(chordName(chordById('F#m7'), 'fr')).toBe('Fa#m7');
    expect(chordName(chordById('Bb/D'), 'fr')).toBe('Sib/Ré');
  });
});

describe('voicings', () => {
  it('computes the sounding notes of a voicing', () => {
    const g = chordById('G');
    expect(voicingNotes(g)).toEqual([43, 47, 50, 55, 59, 67]);
    expect(bassPitchClass(g)).toBe(7);
  });

  it('only plays chord tones, for every open shape and many barre chords', () => {
    const ids = [...OPEN_CHORDS.map((c) => c.id), 'F', 'Bm', 'F#m', 'C#m', 'Bb', 'Ab', 'G#m', 'B7', 'C7', 'Fmaj7', 'E5', 'G5', 'Cadd9', 'G/B', 'D/F#'];
    for (const id of ids) {
      const v = chordById(id);
      const tones = new Set(chordPitchClasses(v));
      if (id.includes('/')) tones.add(bassPitchClass(v));
      expect(voicingPitchClasses(v).every((pc) => tones.has(pc)), id).toBe(true);
      expect(v.playedAs, id).toBeUndefined();
    }
  });

  it('uses the lowest barre position and marks barres', () => {
    const bm = chordById('Bm');
    expect(bm.frets).toEqual([null, 2, 4, 4, 3, 2]); // A-shape at fret 2
    expect(barres(bm)).toEqual([{ finger: 1, fret: 2, from: 1, to: 5 }]);
    expect(chordById('F#m').frets).toEqual([2, 4, 4, 2, 2, 2]); // E-shape at fret 2
  });

  it('plays unusual chords as a simpler stand-in', () => {
    expect(chordById('Cdim').playedAs).toBe('Cm');
    expect(chordById('A/C#').playedAs).toBe('A');
    expect(chordById('A/C#').id).toBe('A/C#');
  });

  it('rates open chords easier than barres', () => {
    const d = (id: string) => chordDifficulty(chordById(id));
    expect(d('Em')).toBeLessThan(d('G'));
    expect(d('G')).toBeLessThan(d('F'));
    expect(d('F')).toBeLessThan(d('Bm'));
    expect(d('E5')).toBeLessThan(d('F'));
    expect(d('Cdim')).toBeGreaterThan(d('Cm'));
  });

  it('keeps every open chord inside the first four frets', () => {
    for (const v of OPEN_CHORDS) expect(Math.max(...v.frets.map((f) => f ?? 0)), v.id).toBeLessThanOrEqual(4);
    expect(pitchClass(voicingNotes(chordById('E'))[0])).toBe(4);
  });
});
