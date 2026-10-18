import { GUITAR_TUNING } from './chords';
import { noteName, pitchClass, pitchClassName, type Lang } from './notes';

export type InstrumentId = 'bass' | 'guitar';

export interface Instrument {
  id: InstrumentId;
  label: string;
  /** Open strings as MIDI notes, lowest string first. */
  tuning: number[];
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  bass: { id: 'bass', label: 'Bass', tuning: [28, 33, 38, 43] }, // E1 A1 D2 G2
  guitar: { id: 'guitar', label: 'Guitar', tuning: GUITAR_TUNING },
};

/**
 * A standard instrument, or any other tuning written as "t-" + its open
 * strings low to high, e.g. Drop D = "t-38-45-50-55-59-64" (used for tabs).
 */
export type InstrumentKey = InstrumentId | `t-${string}`;

/** Instrument key for a tuning (open strings as MIDI, lowest first): the standard one if it matches. */
export function instrumentFor(tuning: number[]): InstrumentKey {
  const same = (a: number[]) => a.length === tuning.length && a.every((m, i) => m === tuning[i]);
  const std = Object.values(INSTRUMENTS).find((i) => same(i.tuning));
  return std ? std.id : `t-${tuning.join('-')}`;
}

/** Open strings (MIDI, lowest first) of an instrument key, or null if it isn't one. */
export function tuningOf(key: string): number[] | null {
  if (key in INSTRUMENTS) return INSTRUMENTS[key as InstrumentId].tuning;
  if (!key.startsWith('t-')) return null;
  const notes = key.slice(2).split('-').map(Number);
  return notes.length >= 3 && notes.every((n) => Number.isInteger(n) && n > 0 && n < 128) ? notes : null;
}

/** A place on the fretboard to play: what single-note practice drills. */
export interface NotePosition {
  instrument: InstrumentKey;
  /** 0 = lowest string. */
  string: number;
  fret: number;
}

const NATURALS = new Set([0, 2, 4, 5, 7, 9, 11]);

export const positionId = (p: NotePosition) => `${p.instrument}:${p.string}:${p.fret}`;

/** Inverse of positionId; null for ids that aren't note positions (e.g. chord ids). */
export function parsePositionId(id: string): NotePosition | null {
  const [instrument, s, f] = id.split(':');
  if (!tuningOf(instrument) || s === undefined || f === undefined) return null;
  return { instrument: instrument as InstrumentKey, string: Number(s), fret: Number(f) };
}

export function positionMidi(p: NotePosition): number {
  return tuningOf(p.instrument)![p.string] + p.fret;
}

/** Every position on the chosen strings from the open string up to `maxFret`. */
export function notePositions(
  instrument: InstrumentId,
  strings: number[],
  maxFret: number,
  naturalsOnly: boolean,
): NotePosition[] {
  const out: NotePosition[] = [];
  for (const string of [...strings].sort((a, b) => a - b)) {
    for (let fret = 0; fret <= maxFret; fret++) {
      const p = { instrument, string, fret };
      if (!naturalsOnly || NATURALS.has(pitchClass(positionMidi(p)))) out.push(p);
    }
  }
  return out;
}

/**
 * Open-string name, e.g. "E". On guitar the high E string is written "e"
 * (as in tabs) so the two E strings can be told apart.
 */
export function stringName(instrument: InstrumentKey, string: number, lang: Lang): string {
  const tuning = tuningOf(instrument)!;
  const name = pitchClassName(tuning[string], lang);
  const sameAsLower = tuning.slice(0, string).some((m) => pitchClass(m) === pitchClass(tuning[string]));
  return sameAsLower ? name.toLowerCase() : name;
}

/** Note name without octave, e.g. "G". */
export const positionName = (p: NotePosition, lang: Lang) => pitchClassName(positionMidi(p), lang);

/** Compact label used in stats tables, e.g. "G1 (E·3)". */
export function positionLabel(p: NotePosition, lang: Lang): string {
  return `${noteName(positionMidi(p), lang)} (${stringName(p.instrument, p.string, lang)}·${p.fret})`;
}
