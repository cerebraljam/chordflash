import { BUILTIN_SONGS, parseProgression, songId, type Song } from './songs';

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

/** Built-in songs with the player's corrections applied, followed by their own songs. */
export function allSongs(): Song[] {
  const builtins = BUILTIN_SONGS.map((s) =>
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
  return [...builtins, ...own];
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
