import { describe, expect, it } from 'vitest';
import { instrumentFor, notePositions, parsePositionId, positionId, positionLabel, positionMidi, stringName, tuningOf } from './instruments';

describe('instruments', () => {
  it('lists the natural notes of first position on bass', () => {
    const ps = notePositions('bass', [0, 1, 2, 3], 4, true);
    expect(ps.map((p) => positionLabel(p, 'en'))).toEqual([
      'E1 (E·0)', 'F1 (E·1)', 'G1 (E·3)',
      'A1 (A·0)', 'B1 (A·2)', 'C2 (A·3)',
      'D2 (D·0)', 'E2 (D·2)', 'F2 (D·3)',
      'G2 (G·0)', 'A2 (G·2)', 'B2 (G·4)',
    ]);
  });

  it('includes sharps when asked', () => {
    expect(notePositions('bass', [0], 4, false)).toHaveLength(5);
  });

  it('round-trips position ids and rejects chord ids', () => {
    const p = { instrument: 'guitar' as const, string: 5, fret: 3 };
    expect(parsePositionId(positionId(p))).toEqual(p);
    expect(positionMidi(p)).toBe(67); // G4
    expect(parsePositionId('Em')).toBeNull();
  });

  it('writes the high E guitar string in lower case', () => {
    expect(stringName('guitar', 0, 'en')).toBe('E');
    expect(stringName('guitar', 5, 'en')).toBe('e');
    expect(stringName('guitar', 5, 'fr')).toBe('mi');
    expect(stringName('bass', 3, 'fr')).toBe('Sol');
  });
});

describe('custom tunings', () => {
  it('uses the standard key when the tuning is standard, a t- key otherwise', () => {
    expect(instrumentFor([40, 45, 50, 55, 59, 64])).toBe('guitar');
    expect(instrumentFor([28, 33, 38, 43])).toBe('bass');
    const dropD = instrumentFor([38, 45, 50, 55, 59, 64]);
    expect(dropD).toBe('t-38-45-50-55-59-64');
    expect(tuningOf(dropD)).toEqual([38, 45, 50, 55, 59, 64]);
    expect(tuningOf('t-oops')).toBeNull();
  });

  it('handles positions on a custom tuning', () => {
    const id = 't-38-45-50-55-59-64:0:0';
    const p = parsePositionId(id)!;
    expect(positionMidi(p)).toBe(38);
    expect(positionLabel(p, 'en')).toBe('D2 (D·0)');
    expect(stringName(p.instrument, 2, 'en')).toBe('d'); // second D string, written lower case
  });
});
