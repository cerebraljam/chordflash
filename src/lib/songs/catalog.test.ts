import { describe, expect, it } from 'vitest';
import { chordById } from '../music/chords';
import { BUILTIN_SONGS, songChords, songDifficulty } from './songs';

describe('built-in song list', () => {
  it('has songs, each with sections and playable chords', () => {
    expect(BUILTIN_SONGS.length).toBeGreaterThan(50);
    for (const s of BUILTIN_SONGS) {
      expect(s.sections.length, s.title).toBeGreaterThan(0);
      for (const c of songChords(s.sections, false)) expect(() => chordById(c), `${s.title}: ${c}`).not.toThrow();
    }
  });

  it('spreads difficulty scores out', () => {
    const scores = BUILTIN_SONGS.map((s) => songDifficulty(s.sections, true)).sort((a, b) => a - b);
    console.log('difficulty min/median/max', scores[0], scores[scores.length >> 1], scores[scores.length - 1]);
    expect(scores[scores.length - 1] - scores[0]).toBeGreaterThan(3);
  });
});
