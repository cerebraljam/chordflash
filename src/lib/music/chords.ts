import { pitchClass, pitchClassName, type Lang } from './notes';

/** Standard tuning, low E to high E, as MIDI notes (E2 A2 D3 G3 B3 E4). */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];

export type Quality =
  | 'maj' | 'min' | '5' | '7' | 'm7' | 'maj7' | 'sus2' | 'sus4' | 'add9' | '6' | 'm6' | 'dim' | 'dim7' | 'aug'
  | '9' | '7sus4' | '7sus2' | 'mmaj7' | 'm9' | 'maj9' | 'madd9' | '11' | 'm11' | '13';

const INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], '5': [0, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 2], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], dim: [0, 3, 6],
  dim7: [0, 3, 6, 9], aug: [0, 4, 8], '9': [0, 4, 7, 10, 2], '7sus4': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10],
  mmaj7: [0, 3, 7, 11], m9: [0, 3, 7, 10, 2], maj9: [0, 4, 7, 11, 2], madd9: [0, 3, 7, 2], '11': [0, 4, 7, 10, 5],
  m11: [0, 3, 7, 10, 5], '13': [0, 4, 7, 10, 9],
};

/** How each quality is written after the root. */
const SUFFIX: Record<Quality, string> = {
  maj: '', min: 'm', '5': '5', '7': '7', m7: 'm7', maj7: 'maj7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', '6': '6',
  m6: 'm6', dim: 'dim', dim7: 'dim7', aug: 'aug', '9': '9', '7sus4': '7sus4', '7sus2': '7sus2', mmaj7: 'm(maj7)',
  m9: 'm9', maj9: 'maj9', madd9: 'madd9', '11': '11', m11: 'm11', '13': '13',
};

/** Suffixes as found in chord sheets and in Chordonomicon ("min", "no3d", "add13", …). */
const QUALITY_ALIASES: Record<string, Quality> = {
  '': 'maj', maj: 'maj', M: 'maj', m: 'min', min: 'min', '-': 'min', '5': '5', no3d: '5', '7': '7', m7: 'm7', min7: 'm7',
  maj7: 'maj7', M7: 'maj7', sus2: 'sus2', sus4: 'sus4', sus: 'sus4', add9: 'add9', add2: 'add9', '6': '6', add13: '6',
  m6: 'm6', min6: 'm6', minadd13: 'm6', dim: 'dim', o: 'dim', dim7: 'dim7', o7: 'dim7', aug: 'aug', '+': 'aug', '9': '9',
  '7sus4': '7sus4', '7sus': '7sus4', '7sus2': '7sus2', mmaj7: 'mmaj7', minmaj7: 'mmaj7', 'm(maj7)': 'mmaj7', m9: 'm9',
  min9: 'm9', maj9: 'maj9', madd9: 'madd9', minadd9: 'madd9', '11': '11', add11: 'maj', m11: 'm11', min11: 'm11', '13': '13',
};

export interface ChordSymbol {
  root: number;
  /** Root as written: "F#", "Bb". */
  rootName: string;
  quality: Quality;
  bass: number | null;
  bassName: string | null;
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "F", "F#"/"Fs", "Bb" → [pitch class, normalised name]. */
function parseNote(letter: string, accidental: string | undefined): [number, string] {
  const shift = accidental === 'b' ? -1 : accidental ? 1 : 0;
  return [(LETTERS[letter] + shift + 12) % 12, letter + (shift < 0 ? 'b' : shift > 0 ? '#' : '')];
}

/**
 * Parses a chord symbol: "Am", "F#m7", "Bb", "G/B", "Dsus4", "E5", and
 * Chordonomicon's spelling ("Fsmin7", "Dno3d", "A/Cs"). Unknown suffixes fall
 * back to a major or minor triad. Returns null for anything that isn't a chord.
 */
export function parseChord(text: string): ChordSymbol | null {
  // A dangling slash ("Cs/") appears in some sheets: read it as the plain chord.
  const m = text.trim().replace(/\/$/, '').match(/^([A-G])(#|b|s(?!us))?([^/]*)(?:\/([A-G])(#|b|s)?)?$/);
  if (!m) return null;
  const [root, rootName] = parseNote(m[1], m[2]);
  const raw = m[3].replace(/[()]/g, '');
  const quality = QUALITY_ALIASES[raw] ?? QUALITY_ALIASES[m[3]] ?? (/^(m|min)(?!aj)/.test(raw) ? 'min' : 'maj');
  const [bass, bassName] = m[4] ? parseNote(m[4], m[5]) : [null, null];
  return { root, rootName, quality, bass: bass === root ? null : bass, bassName: bass === root ? null : bassName };
}

/** Canonical id / display name: "F#m7", "G/B". In French: "Fa#m7", "Sol/Si". */
export function formatChord(c: ChordSymbol, lang: Lang = 'en'): string {
  // Spell from the written letter so Bb stays "Sib" (not "La#").
  const note = (name: string) => (lang === 'en' ? name : pitchClassName(LETTERS[name[0]], 'fr') + name.slice(1));
  const bass = c.bassName ? `/${note(c.bassName)}` : '';
  return note(c.rootName) + SUFFIX[c.quality] + bass;
}

const MINORISH = new Set<Quality>(['min', 'm7', 'm6', 'm9', 'm11', 'madd9', 'mmaj7', 'dim', 'dim7']);

/** Beginner version of a chord: plain major or minor triad, no bass note. */
export function simplifyChord(c: ChordSymbol): ChordSymbol {
  return { ...c, quality: MINORISH.has(c.quality) ? 'min' : 'maj', bass: null, bassName: null };
}

/** Normalises any accepted spelling to the canonical id ("Fsmin7" → "F#m7"), or null. */
export function chordId(text: string, simplify = false): string | null {
  const c = parseChord(text);
  return c ? formatChord(simplify ? simplifyChord(c) : c) : null;
}

export interface Voicing {
  /** Canonical chord id, e.g. "F#m". */
  id: string;
  /** Pitch class of the root (C = 0). */
  root: number;
  quality: Quality;
  /** One entry per string, low E first. null = muted / not played. */
  frets: (number | null)[];
  /** Finger per string (1 = index … 4 = pinky), 0 = open, null = muted. */
  fingers: (number | null)[];
  /** Set when this shape is a simpler chord standing in for the real one (e.g. G for G/B or C for Cdim). */
  playedAs?: string;
}

type Shape = { frets: (number | null)[]; fingers: (number | null)[] };
const x = null;

/** Open-position shapes, by canonical id. */
const OPEN_SHAPES: Record<string, Shape> = {
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  C: { frets: [x, 3, 2, 0, 1, 0], fingers: [x, 3, 2, 0, 1, 0] },
  D: { frets: [x, x, 0, 2, 3, 2], fingers: [x, x, 0, 1, 3, 2] },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  Am: { frets: [x, 0, 2, 2, 1, 0], fingers: [x, 0, 2, 3, 1, 0] },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  A: { frets: [x, 0, 2, 2, 2, 0], fingers: [x, 0, 1, 2, 3, 0] },
  Dm: { frets: [x, x, 0, 2, 3, 1], fingers: [x, x, 0, 2, 3, 1] },
  // Small F: much easier than the full barre for a beginner.
  F: { frets: [x, x, 3, 2, 1, 1], fingers: [x, x, 3, 2, 1, 1] },
  Fmaj7: { frets: [x, x, 3, 2, 1, 0], fingers: [x, x, 3, 2, 1, 0] },
  G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  C7: { frets: [x, 3, 2, 3, 1, 0], fingers: [x, 3, 2, 4, 1, 0] },
  D7: { frets: [x, x, 0, 2, 1, 2], fingers: [x, x, 0, 2, 1, 3] },
  A7: { frets: [x, 0, 2, 0, 2, 0], fingers: [x, 0, 2, 0, 3, 0] },
  E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  B7: { frets: [x, 2, 1, 2, 0, 2], fingers: [x, 2, 1, 3, 0, 4] },
  Am7: { frets: [x, 0, 2, 0, 1, 0], fingers: [x, 0, 2, 0, 1, 0] },
  Em7: { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  Dm7: { frets: [x, x, 0, 2, 1, 1], fingers: [x, x, 0, 2, 1, 1] },
  Cmaj7: { frets: [x, 3, 2, 0, 0, 0], fingers: [x, 3, 2, 0, 0, 0] },
  Amaj7: { frets: [x, 0, 2, 1, 2, 0], fingers: [x, 0, 2, 1, 3, 0] },
  Gmaj7: { frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
  Dmaj7: { frets: [x, x, 0, 2, 2, 2], fingers: [x, x, 0, 1, 1, 1] },
  Asus2: { frets: [x, 0, 2, 2, 0, 0], fingers: [x, 0, 1, 2, 0, 0] },
  Asus4: { frets: [x, 0, 2, 2, 3, 0], fingers: [x, 0, 1, 2, 3, 0] },
  Dsus2: { frets: [x, x, 0, 2, 3, 0], fingers: [x, x, 0, 1, 3, 0] },
  Dsus4: { frets: [x, x, 0, 2, 3, 3], fingers: [x, x, 0, 1, 3, 4] },
  Esus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0] },
  Cadd9: { frets: [x, 3, 2, 0, 3, 0], fingers: [x, 2, 1, 0, 3, 0] },
  G6: { frets: [3, 2, 0, 0, 0, 0], fingers: [2, 1, 0, 0, 0, 0] },
  E5: { frets: [0, 2, x, x, x, x], fingers: [0, 1, x, x, x, x] },
  A5: { frets: [x, 0, 2, x, x, x], fingers: [x, 0, 1, x, x, x] },
  D5: { frets: [x, x, 0, 2, 3, x], fingers: [x, x, 0, 1, 2, x] },
  'G/B': { frets: [x, 2, 0, 0, 0, 3], fingers: [x, 1, 0, 0, 0, 3] },
  'C/G': { frets: [3, 3, 2, 0, 1, 0], fingers: [4, 3, 2, 0, 1, 0] },
  'C/E': { frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  'D/F#': { frets: [2, x, 0, 2, 3, 2], fingers: [1, x, 0, 2, 4, 3] },
};

/** Movable barre / power-chord shapes, as fret offsets from the root fret (null = muted). */
const MOVABLE: { rootString: 0 | 1; quality: Quality; offsets: (number | null)[]; fingers: (number | null)[] }[] = [
  { rootString: 0, quality: 'maj', offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  { rootString: 0, quality: 'min', offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  { rootString: 0, quality: '7', offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  { rootString: 0, quality: 'm7', offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  { rootString: 0, quality: 'sus4', offsets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  { rootString: 0, quality: '7sus4', offsets: [0, 2, 0, 2, 0, 0], fingers: [1, 3, 1, 4, 1, 1] },
  { rootString: 0, quality: '5', offsets: [0, 2, 2, x, x, x], fingers: [1, 3, 4, x, x, x] },
  { rootString: 1, quality: 'maj', offsets: [x, 0, 2, 2, 2, 0], fingers: [x, 1, 3, 3, 3, 1] },
  { rootString: 1, quality: 'min', offsets: [x, 0, 2, 2, 1, 0], fingers: [x, 1, 3, 4, 2, 1] },
  { rootString: 1, quality: '7', offsets: [x, 0, 2, 0, 2, 0], fingers: [x, 1, 3, 1, 4, 1] },
  { rootString: 1, quality: 'm7', offsets: [x, 0, 2, 0, 1, 0], fingers: [x, 1, 3, 1, 2, 1] },
  { rootString: 1, quality: 'maj7', offsets: [x, 0, 2, 1, 2, 0], fingers: [x, 1, 3, 2, 4, 1] },
  { rootString: 1, quality: 'sus2', offsets: [x, 0, 2, 2, 0, 0], fingers: [x, 1, 3, 4, 1, 1] },
  { rootString: 1, quality: 'sus4', offsets: [x, 0, 2, 2, 3, 0], fingers: [x, 1, 2, 3, 4, 1] },
  { rootString: 1, quality: '5', offsets: [x, 0, 2, 2, x, x], fingers: [x, 1, 3, 4, x, x] },
];

/** Closest quality that has a shape, for chords played as something simpler. */
const STAND_IN: Partial<Record<Quality, Quality>> = {
  add9: 'maj', '6': 'maj', m6: 'min', dim: 'min', dim7: 'min', aug: 'maj', '9': '7', '7sus2': 'sus2', mmaj7: 'min',
  m9: 'm7', maj9: 'maj7', madd9: 'min', '11': '7', m11: 'm7', '13': '7',
};

function movable(c: ChordSymbol): Shape | null {
  let best: Shape | null = null;
  let bestFret = Infinity;
  for (const m of MOVABLE) {
    if (m.quality !== c.quality) continue;
    const fret = (c.root - pitchClass(GUITAR_TUNING[m.rootString]) + 12) % 12;
    if (fret >= bestFret) continue;
    bestFret = fret;
    best = {
      frets: m.offsets.map((o) => (o === null ? null : o + fret)),
      // At fret 0 the "barre" is just open strings.
      fingers: m.fingers.map((f, s) => (f === null ? null : m.offsets[s]! + fret === 0 ? 0 : f)),
    };
  }
  return best;
}

/** A playable voicing for any chord id: an open shape, else a barre shape, else a simpler stand-in. */
export function chordById(id: string): Voicing {
  const c = parseChord(id);
  if (!c) throw new Error(`Unknown chord ${id}`);
  const canonical = formatChord(c);
  const exact = OPEN_SHAPES[canonical] ?? (c.bass === null ? movable(c) : null);
  if (exact) return { id: canonical, root: c.root, quality: c.quality, ...exact };

  // Slash chord without its own shape → main chord; unusual quality → closest simpler one.
  const stand: ChordSymbol = { ...c, bass: null, bassName: null, quality: c.bass === null ? STAND_IN[c.quality] ?? 'maj' : c.quality };
  const inner = chordById(formatChord(stand));
  return { ...inner, id: canonical, playedAs: inner.playedAs ?? inner.id };
}

/** The beginner chords offered in the chord picker and chord check. */
export const OPEN_CHORDS: Voicing[] = ['G', 'C', 'D', 'Em', 'Am', 'E', 'A', 'Dm'].map(chordById);

export function chordName(v: Voicing, lang: Lang): string {
  const c = parseChord(v.id);
  return c ? formatChord(c, lang) : v.id;
}

/** Pitch classes of the chord in theory (root first), e.g. C7 → C E G Bb. */
export function chordPitchClasses(v: Voicing): number[] {
  return INTERVALS[v.quality].map((i) => (v.root + i) % 12);
}

/** MIDI notes actually sounding in this voicing, low to high. */
export function voicingNotes(v: Voicing, tuning = GUITAR_TUNING): number[] {
  return v.frets.flatMap((f, s) => (f === null ? [] : [tuning[s] + f]));
}

/** Pitch classes the voicing really plays (C7's usual open shape has no G). */
export function voicingPitchClasses(v: Voicing): number[] {
  return [...new Set(voicingNotes(v).map(pitchClass))];
}

export function bassPitchClass(v: Voicing): number {
  return pitchClass(voicingNotes(v)[0]);
}

/** Strings covered by each finger that holds more than one string at the same fret (barres). */
export function barres(v: Voicing): { finger: number; fret: number; from: number; to: number }[] {
  const out: { finger: number; fret: number; from: number; to: number }[] = [];
  for (let f = 1; f <= 4; f++) {
    const strings = v.fingers.flatMap((g, s) => (g === f && v.frets[s] ? [s] : []));
    if (strings.length > 1 && strings.every((s) => v.frets[s] === v.frets[strings[0]])) {
      out.push({ finger: f, fret: v.frets[strings[0]]!, from: strings[0], to: strings[strings.length - 1] });
    }
  }
  return out;
}

/**
 * Rough difficulty of a voicing for a beginner, about 1 (two-finger open
 * chord) to 5: full barres are hard, small barres and stretches less so, and
 * a stand-in shape counts extra since the song asks for something else.
 */
export function chordDifficulty(v: Voicing): number {
  const fingers = new Set(v.fingers.filter((f): f is number => !!f)).size;
  const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  const bars = barres(v);
  let d: number;
  if (bars.some((b) => b.to - b.from >= 3)) d = 3.5;
  else if (v.quality === '5') d = 1.5;
  else if (bars.length) d = 2.5;
  else d = 1 + 0.15 * Math.max(0, fingers - 2);
  if (span >= 3) d += 0.5;
  if (v.playedAs) d += 1;
  return Math.round(d * 100) / 100;
}
