import { chordById, chordName } from '../music/chords';
import { notePositions, parsePositionId, positionId, positionLabel, positionMidi } from '../music/instruments';
import { noteName, type Lang } from '../music/notes';
import type { Settings } from '../settings.svelte';
import type { PracticeKind } from './types';

/** Display name of a practice item: "Em" for a chord, "G1 (E·3)" for a note position. */
export function itemName(kind: PracticeKind, id: string, lang: Lang): string {
  if (kind === 'chord') return chordName(chordById(id), lang);
  const p = parsePositionId(id);
  return p ? positionLabel(p, lang) : id;
}

/** Note position ids selected in the settings, low to high. */
export function noteItems(s: Settings): string[] {
  const strings = s.noteStrings[s.noteInstrument] ?? [];
  return notePositions(s.noteInstrument, strings, s.noteMaxFret, s.noteNaturalsOnly).map(positionId);
}

/** Orders note ids by pitch (then string); chord ids by the given library order, others alphabetically after. */
export function sortItems(kind: PracticeKind, ids: string[], chordOrder: string[]): string[] {
  if (kind === 'chord') {
    const extra = ids.filter((id) => !chordOrder.includes(id)).sort();
    return [...chordOrder.filter((id) => ids.includes(id)), ...extra];
  }
  const key = (id: string) => {
    const p = parsePositionId(id);
    return p ? positionMidi(p) * 10 + p.string : 0;
  };
  return [...ids].sort((a, b) => key(a) - key(b));
}

/** What to tell the player when they played `heard` instead of `target` (MIDI notes). */
export function describeWrongNote(heard: number, target: number, lang: Lang): string {
  const diff = heard - target;
  const heardName = noteName(heard, lang);
  if (diff % 12 === 0) return `heard ${heardName}: right note, wrong octave`;
  if (Math.abs(diff) <= 4) {
    const frets = Math.abs(diff);
    return `heard ${heardName}: ${frets} fret${frets > 1 ? 's' : ''} too ${diff > 0 ? 'high' : 'low'}`;
  }
  return `heard ${heardName}`;
}
