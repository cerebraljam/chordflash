import { BUILTIN_SONGS, loadCollections, mergeCollections, parseProgression, songDifficulty, songId, type Song } from './songs';

interface UserSong {
  title: string;
  artist: string;
  text: string;
}

interface Stored {
  /** Edited progressions of built-in songs, by song id (one section per line). */
  edits: Record<string, string>;
  added: UserSong[];
}

const KEY = 'chordflash.songs';

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { edits: {}, added: [], ...JSON.parse(raw) } : { edits: {}, added: [] };
  } catch {
    return { edits: {}, added: [] };
  }
}

/** The player's own songs and corrections, kept in this browser. */
export const songStore = $state<Stored>(load());

$effect.root(() => {
  $effect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify($state.snapshot(songStore)));
    } catch {
      // Storage unavailable: edits last until reload.
    }
  });
});

/** Game songs, then the collections once loaded (raw: thousands of songs, never changed in place). */
let builtins = $state.raw<Song[]>(BUILTIN_SONGS);
let loading: Promise<void> | null = null;

/** Loads the collections in the background; the setlist shows them when they arrive. */
export function loadSongCollections(): Promise<void> {
  loading ??= loadCollections().then((songs) => {
    builtins = mergeCollections(BUILTIN_SONGS, songs);
    // Work out every song's chords and difficulty while the app is idle, so the setlist opens fast.
    const warm = () => builtins.forEach((s) => songDifficulty(s.sections, true) + songDifficulty(s.sections, false));
    if ('requestIdleCallback' in window) requestIdleCallback(warm);
    else setTimeout(warm, 500);
  });
  return loading;
}

/** Built-in songs with the player's corrections applied, followed by their own songs. */
export function allSongs(): Song[] {
  const edited = builtins.map((s) =>
    songStore.edits[s.id] ? { ...s, sections: parseProgression(songStore.edits[s.id]), edited: true } : s,
  );
  const own: Song[] = songStore.added.map((u) => ({
    id: songId(u.artist, u.title),
    title: u.title,
    artist: u.artist,
    year: null,
    games: [],
    sections: parseProgression(u.text),
    source: 'user',
  }));
  return [...edited, ...own];
}

export function saveSongText(song: Song, text: string): void {
  if (song.source === 'user') {
    const u = songStore.added.find((a) => songId(a.artist, a.title) === song.id);
    if (u) u.text = text;
  } else songStore.edits[song.id] = text;
}

export function resetSong(song: Song): void {
  delete songStore.edits[song.id];
}

export function addSong(title: string, artist: string, text: string): string {
  songStore.added.push({ title, artist, text });
  return songId(artist, title);
}

export function deleteSong(song: Song): void {
  songStore.added = songStore.added.filter((a) => songId(a.artist, a.title) !== song.id);
}
