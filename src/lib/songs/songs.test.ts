import { describe, expect, it } from 'vitest';
import { fromRaw, parseProgression, progressionText, songChords, songDifficulty, songSequence } from './songs';

describe('songs', () => {
  const raw = '<intro_1> C <verse_1> F C E7 Amin C F C G7 C <chorus_1> F C F C G C <prechorus_1> Fsmin A/Cs';

  it('parses Chordonomicon progressions into named sections', () => {
    const s = parseProgression(raw);
    expect(s.map((x) => x.name)).toEqual(['Intro 1', 'Verse 1', 'Chorus 1', 'Pre-chorus 1']);
    expect(s[1].chords).toEqual(['F', 'C', 'E7', 'Am', 'C', 'F', 'C', 'G7', 'C']);
    expect(s[3].chords).toEqual(['F#m', 'A/C#']);
  });

  it('round-trips the editable one-line-per-section text', () => {
    const s = parseProgression(raw);
    expect(parseProgression(progressionText(s))).toEqual(s);
    expect(parseProgression('G D Em C\nChorus: C | G | D')).toEqual([
      { name: 'Part 1', chords: ['G', 'D', 'Em', 'C'] },
      { name: 'Chorus', chords: ['C', 'G', 'D'] },
    ]);
  });

  it('builds the play order without repeating a held chord, and simplifies', () => {
    const s = parseProgression('<verse_1> G G D Dsus4 D <chorus_1> D Em7 C');
    expect(songSequence(s, false)).toEqual(['G', 'D', 'Dsus4', 'D', 'Em7', 'C']);
    expect(songSequence(s, true)).toEqual(['G', 'D', 'Em', 'C']);
    expect(songChords(s, true)).toEqual(['G', 'D', 'Em', 'C']);
  });

  it('rates barre-heavy songs harder than open-chord songs', () => {
    const easy = songDifficulty(parseProgression('G C D Em'), true);
    const barre = songDifficulty(parseProgression('Bm F#m A E D G'), true);
    expect(easy).toBeGreaterThan(1);
    expect(easy).toBeLessThan(3.5);
    expect(barre).toBeGreaterThan(easy + 2);
  });

  it('keeps unusual tunings only', () => {
    const base = { title: 'X', artist: 'Y', year: 2000, games: ['Rocksmith 2014'], chordonomiconId: 1, chords: 'G C' };
    expect(fromRaw({ ...base, tuning: 'E standard' }).tuning).toBeUndefined();
    expect(fromRaw({ ...base, tuning: 'Drop D' }).tuning).toBe('Drop D');
    expect(fromRaw(base).id).toBe('y--x');
  });
});
