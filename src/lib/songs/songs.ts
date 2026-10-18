import { chordById, chordDifficulty, chordId } from '../music/chords';
import data from './songs.json';

export interface SongSection {
  /** "Verse 1", "Chorus 2", … */
  name: string;
  /** Canonical chord ids, in playing order. */
  chords: string[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  /** Games whose on-disc setlist has this song. */
  games: string[];
  /** Tuning listed by Rocksmith 2014, when not standard. */
  tuning?: string;
  sections: SongSection[];
  source: 'chordonomicon' | 'user';
  /** Row id in the Chordonomicon dataset. */
  sourceId?: number;
  /** The player changed the chords. */
  edited?: boolean;
}

interface RawSong {
  title: string;
  artist: string;
  year: number | null;
  games: string[];
  tuning?: string;
  chordonomiconId: number;
  chords: string;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const songId = (artist: string, title: string) => `${slug(artist)}--${slug(title)}`;

/** "<verse_1>" → "Verse 1", "<prechorus_2>" → "Pre-chorus 2". */
function sectionName(tag: string): string {
  const [kind, n] = tag.replace(/[<>]/g, '').split('_');
  const word = kind === 'prechorus' ? 'pre-chorus' : kind;
  return `${word[0].toUpperCase()}${word.slice(1)}${n ? ` ${n}` : ''}`;
}

/**
 * Reads a progression, either Chordonomicon style ("<verse_1> C G Am F
 * <chorus_1> …") or one section per line ("Verse 1: C G Am F"). Unknown
 * tokens are skipped.
 */
export function parseProgression(text: string): SongSection[] {
  const sections: SongSection[] = [];
  const open = (name: string) => sections.push({ name, chords: [] });
  if (text.includes('<')) {
    for (const token of text.split(/\s+/).filter(Boolean)) {
      if (token.startsWith('<')) open(sectionName(token));
      else {
        const id = chordId(token);
        if (!id) continue;
        if (!sections.length) open('Intro');
        sections[sections.length - 1].chords.push(id);
      }
    }
  } else {
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([^:]*?)\s*:\s*(.*)$/);
      const chords = (m ? m[2] : line).split(/[\s|,]+/).map((t) => chordId(t)).filter((c): c is string => !!c);
      if (!chords.length) continue;
      sections.push({ name: m?.[1] || `Part ${sections.length + 1}`, chords });
    }
  }
  return sections.filter((s) => s.chords.length);
}

/** One line per section, the format used for editing. */
export const progressionText = (sections: SongSection[]) => sections.map((s) => `${s.name}: ${s.chords.join(' ')}`).join('\n');

const simple = (id: string, simplify: boolean) => (simplify ? chordId(id, true) ?? id : id);

/** Every chord to play, in order, with repeats of the same chord merged (it's one chord held longer). */
export function songSequence(sections: SongSection[], simplify: boolean): string[] {
  const out: string[] = [];
  for (const s of sections) for (const c of s.chords) {
    const id = simple(c, simplify);
    if (out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

/** Distinct chords, in order of first appearance. */
export const songChords = (sections: SongSection[], simplify: boolean) => [...new Set(songSequence(sections, simplify))];

/**
 * 0–10 difficulty for a beginner: dominated by the hardest chord (barres!),
 * then the average chord, then how many different chords there are.
 * G C D Em ≈ 2.5; a song full of barre chords ≈ 7.
 */
export function songDifficulty(sections: SongSection[], simplify: boolean): number {
  const chords = songChords(sections, simplify);
  if (!chords.length) return 0;
  const d = chords.map((id) => chordDifficulty(chordById(id)));
  const hardest = Math.max(...d);
  const avg = d.reduce((s, x) => s + x, 0) / d.length;
  const score = hardest + 0.8 * avg + 0.5 * Math.max(0, chords.length - 3);
  return Math.round(Math.min(10, score) * 10) / 10;
}

export function fromRaw(r: RawSong): Song {
  return {
    id: songId(r.artist, r.title),
    title: r.title,
    artist: r.artist,
    year: r.year,
    games: r.games,
    ...(r.tuning && !/^e standard$/i.test(r.tuning) ? { tuning: r.tuning } : {}),
    sections: parseProgression(r.chords),
    source: 'chordonomicon',
    sourceId: r.chordonomiconId,
  };
}

/** Songs shipped with the app (from the game setlists matched to Chordonomicon). */
export const BUILTIN_SONGS: Song[] = (data as RawSong[]).map(fromRaw).filter((s) => s.sections.length);

export interface SectionGroup {
  /** "Verse" for a run of identical sections, the full name ("Chorus 2") for a single one. */
  name: string;
  /** How many identical sections in a row. */
  count: number;
  chords: string[];
}

/**
 * Merges runs of identical sections ("Verse 1" … "Verse 9" with the same chords)
 * into one line ("Verse ×9"), to keep the song panel short.
 */
export function groupSections(sections: SongSection[], simplify: boolean): SectionGroup[] {
  const runs: { first: string; base: string; count: number; chords: string[] }[] = [];
  for (const s of sections) {
    const chords = s.chords.map((c) => simple(c, simplify));
    const base = s.name.replace(/\s+\d+$/, '');
    const prev = runs[runs.length - 1];
    if (prev && prev.base === base && prev.chords.join(' ') === chords.join(' ')) prev.count++;
    else runs.push({ first: s.name, base, count: 1, chords });
  }
  return runs.map((r) => ({ name: r.count > 1 ? r.base : r.first, count: r.count, chords: r.chords }));
}

/** The chord a given one sits next to most often in the song (for a two-chord drill), or null. */
export function mostAdjacent(sections: SongSection[], chord: string, simplify: boolean): string | null {
  const seq = songSequence(sections, simplify);
  const counts = new Map<string, number>();
  seq.forEach((c, i) => {
    if (c !== chord) return;
    for (const n of [seq[i - 1], seq[i + 1]]) if (n && n !== chord) counts.set(n, (counts.get(n) ?? 0) + 1);
  });
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
