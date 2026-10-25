import type { PracticeKind } from './practice/types';

/**
 * Where the player was on each screen: filter, selection, scroll. Leaving a
 * screen and coming back (a song played, a detour to the tuner, a reload)
 * picks up there. Kept in this browser, like the settings.
 */
export interface ViewMemory {
  setlist: {
    query: string;
    /** Game series or collection chip ("All", "Québec", "My songs"…). */
    game: string;
    selectedId: string | null;
    scrollY: number;
    /** Rows drawn (the list grows as you scroll): enough to get back to `scrollY`. */
    rows: number;
  };
  tabs: { tabId: string | null; track: number; from: number; to: number };
  chordCheck: string | null;
  tuner: 'guitar' | 'bass';
  /** Stats tab; null = follow the practice mode. */
  stats: PracticeKind | null;
}

const KEY = 'chordflash.view';

const DEFAULTS: ViewMemory = {
  setlist: { query: '', game: 'All', selectedId: null, scrollY: 0, rows: 0 },
  tabs: { tabId: null, track: 0, from: 0, to: 0 },
  chordCheck: null,
  tuner: 'guitar',
  stats: null,
};

function load(): ViewMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      ...DEFAULTS,
      ...raw,
      setlist: { ...DEFAULTS.setlist, ...raw.setlist },
      tabs: { ...DEFAULTS.tabs, ...raw.tabs },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const viewMemory = $state<ViewMemory>(load());

let pending = 0;
$effect.root(() => {
  $effect(() => {
    const json = JSON.stringify($state.snapshot(viewMemory));
    // Scrolling changes this every frame: write once things settle.
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, json);
      } catch {
        // Storage unavailable: remembered until reload.
      }
    }, 300);
  });
});
