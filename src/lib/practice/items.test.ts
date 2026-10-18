import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../settings.svelte';
import { describeWrongNote, itemName, noteItems, sortItems } from './items';

describe('items', () => {
  it('names chords and note positions', () => {
    expect(itemName('chord', 'Am', 'fr')).toBe('Lam');
    expect(itemName('note', 'bass:0:3', 'en')).toBe('G1 (E·3)');
  });

  it('builds note items from the settings', () => {
    const ids = noteItems({ ...DEFAULTS, noteInstrument: 'bass', noteStrings: { bass: [3], guitar: [] }, noteMaxFret: 4 });
    expect(ids).toEqual(['bass:3:0', 'bass:3:2', 'bass:3:4']); // G A B
  });

  it('sorts notes by pitch and chords by library order', () => {
    expect(sortItems('note', ['bass:1:0', 'bass:0:3', 'bass:0:0'], [])).toEqual(['bass:0:0', 'bass:0:3', 'bass:1:0']);
    expect(sortItems('chord', ['Em', 'G'], ['G', 'C', 'Em'])).toEqual(['G', 'Em']);
    expect(sortItems('chord', ['F#m', 'Em', 'Bm'], ['G', 'Em'])).toEqual(['Em', 'Bm', 'F#m']);
  });

  it('explains a wrong note', () => {
    expect(describeWrongNote(32, 31, 'en')).toBe('heard G#1: 1 fret too high');
    expect(describeWrongNote(29, 31, 'en')).toBe('heard F1: 2 frets too low');
    expect(describeWrongNote(43, 31, 'en')).toBe('heard G2: right note, wrong octave');
    expect(describeWrongNote(38, 31, 'en')).toBe('heard D2');
  });
});
