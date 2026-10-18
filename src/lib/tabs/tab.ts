import { chordId } from '../music/chords';
import { INSTRUMENTS, instrumentFor, positionId, type InstrumentId, type InstrumentKey } from '../music/instruments';
import { pitchClassName } from '../music/notes';
import type { SongSection } from '../songs/songs';

/** A note to play: string 0 = lowest, fret counted from the nut (a capo's fret already added). */
export interface TabNote {
  string: number;
  fret: number;
}

/** One beat: a single note, several (a chord or double stop), or just a chord name. */
export interface TabEvent {
  notes: TabNote[];
  chord?: string;
}

export interface TabBar {
  /** Section starting at this bar ("Intro", "Verse"…). */
  section?: string;
  events: TabEvent[];
}

export interface TabTrack {
  name: string;
  /** Open strings, MIDI, lowest first (without capo). */
  tuning: number[];
  capo: number;
  bars: TabBar[];
}

export interface Tab {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  importedAt: number;
  tracks: TabTrack[];
}

const STANDARD: Record<InstrumentId, number[]> = { guitar: INSTRUMENTS.guitar.tuning, bass: INSTRUMENTS.bass.tuning };

/** Standard tuning moved by the same number of semitones on every string (Eb standard = −1), or null. */
export function standardShift(tuning: number[]): { base: InstrumentId; shift: number } | null {
  for (const base of Object.keys(STANDARD) as InstrumentId[]) {
    const std = STANDARD[base];
    if (std.length !== tuning.length) continue;
    const shift = tuning[0] - std[0];
    if (tuning.every((m, i) => m - std[i] === shift)) return { base, shift };
  }
  return null;
}

/** How guitarists spell the low string of shifted tunings ("E♭ standard", "C♯ standard"). */
const TUNING_NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** "Standard", "E♭ standard", "Drop D", or the open strings ("D A D G B E"). */
export function tuningName(tuning: number[]): string {
  const s = standardShift(tuning);
  if (s && s.shift === 0) return 'Standard';
  if (s) return `${TUNING_NOTE[(((STANDARD[s.base][0] + s.shift) % 12) + 12) % 12]} standard`;
  const drop = [...STANDARD.guitar];
  drop[0] -= 2;
  if (tuning.length === 6 && tuning.every((m, i) => m === drop[i])) return 'Drop D';
  return tuning.map((m) => pitchClassName(m, 'en')).join(' ');
}

/** Bass if it has 4–5 strings and goes below E2. */
export const isBassTrack = (t: TabTrack) => t.tuning.length <= 5 && Math.min(...t.tuning) < 40;

export interface NoteSelection {
  instrument: InstrumentKey;
  /** Position ids in playing order (a note repeated right away is played once). */
  sequence: string[];
  /** Distinct positions. */
  items: string[];
  /** Beats with several notes (chords, double stops), left out. */
  skippedChords: number;
  maxFret: number;
}

/**
 * The single notes of bars `from`..`to` (inclusive, 0-based), as note
 * positions. With `asStandard`, a tab in a shifted standard tuning (Eb, D
 * standard…) is played with the same frets on a standard-tuned instrument.
 */
export function selectNotes(track: TabTrack, from: number, to: number, asStandard: boolean): NoteSelection {
  const shifted = standardShift(track.tuning);
  const instrument = asStandard && shifted ? shifted.base : instrumentFor(track.tuning);
  const sequence: string[] = [];
  let skippedChords = 0;
  let maxFret = 0;
  for (const bar of track.bars.slice(from, to + 1)) {
    for (const e of bar.events) {
      if (e.notes.length > 1) skippedChords++;
      if (e.notes.length !== 1) continue;
      const id = positionId({ instrument, ...e.notes[0] });
      maxFret = Math.max(maxFret, e.notes[0].fret);
      if (sequence[sequence.length - 1] !== id) sequence.push(id);
    }
  }
  return { instrument, sequence, items: [...new Set(sequence)], skippedChords, maxFret };
}

/** Bars where sections start, for choosing a range: [{ bar, name }]. */
export function sectionStarts(track: TabTrack): { bar: number; name: string }[] {
  return track.bars.flatMap((b, i) => (b.section ? [{ bar: i, name: b.section }] : []));
}

/** The track's chord names grouped by section, for turning a tab into a song (empty if it has none). */
export function chordSections(track: TabTrack): SongSection[] {
  const sections: SongSection[] = [];
  for (const bar of track.bars) {
    if (bar.section || !sections.length) sections.push({ name: bar.section ?? 'Intro', chords: [] });
    for (const e of bar.events) {
      const id = e.chord ? chordId(e.chord) : null;
      const chords = sections[sections.length - 1].chords;
      if (id && chords[chords.length - 1] !== id) chords.push(id);
    }
  }
  const out = sections.filter((s) => s.chords.length);
  return new Set(out.flatMap((s) => s.chords)).size >= 2 ? out : [];
}
