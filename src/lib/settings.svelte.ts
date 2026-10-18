import type { InstrumentId } from './music/instruments';
import type { Lang } from './music/notes';
import type { PracticeKind } from './practice/types';

/** What the Practice tab is set to: chords, single notes, a song's chords in order, or notes from a tab. */
export type PracticeMode = PracticeKind | 'song' | 'tab';

export interface Settings {
  deviceId: string | null;
  lang: Lang;
  /** Minimum chord score (0..100) that counts as a success. */
  threshold: number;
  /** Input level (dBFS) below which strums and notes are ignored. */
  gateDb: number;
  /** Chord ids included in practice sessions. */
  practiceChords: string[];
  goalKind: 'count' | 'time';
  goalCount: number;
  goalMinutes: number;
  /** 'focus' brings hard transitions back more often; 'random' is uniform. */
  order: 'focus' | 'random';
  practiceMode: PracticeMode;
  noteInstrument: InstrumentId;
  /** Strings included in note practice, per instrument (0 = lowest). */
  noteStrings: Record<InstrumentId, number[]>;
  /** Highest fret included in note practice. */
  noteMaxFret: number;
  noteNaturalsOnly: boolean;
  /** Play song chords as plain major/minor triads (Cmaj7 → C, G/B → G). */
  simplifyChords: boolean;
  songSort: 'easy' | 'hard' | 'fits' | 'title' | 'artist';
  /** Metronome: beats each chord is held, automatic tempo, click volume (0..1). */
  metroBeats: number;
  metroAuto: boolean;
  metroVolume: number;
  /** Tempo reached per chord set / song: where the next session starts, and the best passed. */
  metroTempos: Record<string, { last: number; best: number }>;
  /** Chords beyond the starter set offered in chord practice: added from the songs you play, or by hand. */
  chordLibrary: string[];
  /** Whether chords from earlier song sessions (history) were added to the library yet. */
  chordLibraryFromHistory: boolean;
  /** Hear the instrument through the computer, and how loud (0..1). */
  monitor: boolean;
  monitorVolume: number;
  /** Tabs in a shifted standard tuning (E♭, D standard…): play the same frets in standard tuning. */
  tabAsStandard: boolean;
  /** Best stars (1–3) earned playing each song through, by song id. */
  songStars: Record<string, number>;
}

const KEY = 'chordflash.settings';
const REF_KEY = 'chordflash.references';
export const DEFAULTS: Settings = {
  deviceId: null,
  lang: 'en',
  threshold: 70,
  gateDb: -45,
  practiceChords: ['G', 'C', 'D', 'Em'],
  goalKind: 'count',
  goalCount: 25,
  goalMinutes: 5,
  order: 'focus',
  practiceMode: 'chord',
  noteInstrument: 'bass',
  noteStrings: { bass: [0, 1, 2, 3], guitar: [0, 1, 2, 3, 4, 5] },
  noteMaxFret: 4,
  noteNaturalsOnly: true,
  simplifyChords: true,
  songSort: 'easy',
  metroBeats: 4,
  metroAuto: true,
  metroVolume: 0.5,
  metroTempos: {},
  chordLibrary: [],
  chordLibraryFromHistory: false,
  monitor: false,
  monitorVolume: 0.8,
  tabAsStandard: true,
  songStars: {},
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode…): settings just won't survive a reload.
  }
}

export const settings = $state<Settings>(load(KEY, DEFAULTS));

/** The player's own recorded chroma per chord id, used instead of the built-in template. */
export const references = $state<Record<string, number[]>>(load(REF_KEY, {}));

$effect.root(() => {
  $effect(() => persist(KEY, $state.snapshot(settings)));
  $effect(() => persist(REF_KEY, $state.snapshot(references)));
});

/** Adds chords to the chord-practice list (starter chords and duplicates skipped). */
export function addToChordLibrary(ids: string[], starters: string[]): void {
  const fresh = ids.filter((id) => !starters.includes(id) && !settings.chordLibrary.includes(id));
  if (fresh.length) settings.chordLibrary = [...settings.chordLibrary, ...fresh];
}
