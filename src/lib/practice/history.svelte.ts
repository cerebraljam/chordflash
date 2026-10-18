import { OPEN_CHORDS } from '../music/chords';
import { addToChordLibrary, settings } from '../settings.svelte';
import { clearAttempts, loadAttempts } from './db';
import { kindOf, type Attempt, type PracticeKind } from './types';

/** Every practice attempt (chords and notes), oldest first, shared by home, practice and stats. */
class HistoryStore {
  attempts = $state.raw<Attempt[]>([]);
  loaded = $state(false);
  private loading: Promise<void> | null = null;

  /** Loads once; later calls wait for the same load. */
  load(): Promise<void> {
    this.loading ??= loadAttempts().then((all) => {
      this.attempts = all;
      this.loaded = true;
      // Once: chords practised before the chord list existed (e.g. in songs) join it.
      if (!settings.chordLibraryFromHistory) {
        addToChordLibrary(
          [...new Set(this.of('chord').map((a) => a.to))],
          OPEN_CHORDS.map((c) => c.id),
        );
        settings.chordLibraryFromHistory = true;
      }
    });
    return this.loading;
  }

  /** Attempts of one kind only: chord and note practice never mix (songs are chord practice). */
  of(kind: PracticeKind): Attempt[] {
    return this.attempts.filter((a) => kindOf(a) === kind);
  }

  add(attempts: Attempt[]): void {
    if (attempts.length) this.attempts = [...this.attempts, ...attempts];
  }

  async clear(): Promise<void> {
    await clearAttempts();
    this.attempts = [];
  }
}

export const history = new HistoryStore();
