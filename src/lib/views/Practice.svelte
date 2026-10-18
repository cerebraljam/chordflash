<script lang="ts">
  import { onMount } from 'svelte';
  import { loadAttempts } from '../practice/db';
  import { hintLevels, type HintLevel } from '../practice/hints';
  import { itemName, noteItems } from '../practice/items';
  import { PracticeSession, pickNext, sequencePicker, type Goal, type Picker } from '../practice/session';
  import { summarize, type SessionSummary } from '../practice/summary';
  import { kindOf, type Attempt, type PracticeKind } from '../practice/types';
  import { pairDifficulties, weightedPick } from '../practice/weighting';
  import { OPEN_CHORDS } from '../music/chords';
  import { addToChordLibrary, settings, type PracticeMode } from '../settings.svelte';
  import { songChords, songSequence, type Song } from '../songs/songs';
  import NoteRun from './practice/NoteRun.svelte';
  import NoteSetup from './practice/NoteSetup.svelte';
  import PracticeRun from './practice/PracticeRun.svelte';
  import PracticeSetup from './practice/PracticeSetup.svelte';
  import PracticeSummary from './practice/PracticeSummary.svelte';
  import MetronomeRun from './practice/MetronomeRun.svelte';
  import SongSetup from './practice/SongSetup.svelte';
  import TabSetup from './practice/TabSetup.svelte';
  import type { NoteSelection } from '../tabs/tab';

  type Phase =
    | { name: 'setup' }
    | { name: 'metronome'; key: string; title: string; next: (from: string | null) => string }
    | {
        name: 'running';
        kind: PracticeKind;
        session: PracticeSession;
        goal: Goal;
        title?: string;
        /** Frets the note fretboard shows (tabs can go high up the neck). */
        maxFret?: number;
        again: () => void;
      }
    | {
        name: 'summary';
        kind: PracticeKind;
        summary: SessionSummary;
        before: Map<string, HintLevel>;
        after: Map<string, HintLevel>;
        again: () => void;
      };

  const MODES: { id: PracticeMode; label: string }[] = [
    { id: 'chord', label: 'Chords' },
    { id: 'song', label: 'Songs' },
    { id: 'note', label: 'Single notes' },
    { id: 'tab', label: 'Tabs' },
  ];

  let phase = $state.raw<Phase>({ name: 'setup' });
  /** Every attempt from previous sessions (chords and notes), oldest first. */
  let history = $state.raw<Attempt[]>([]);

  /** History of one kind only: chord and note practice never mix (songs are chord practice). */
  const historyOf = (kind: PracticeKind) => history.filter((a) => kindOf(a) === kind);
  const kindOfMode = (mode: PracticeMode): PracticeKind => (mode === 'note' || mode === 'tab' ? 'note' : 'chord');
  let modeHistory = $derived(historyOf(kindOfMode(settings.practiceMode)));

  const STARTERS = OPEN_CHORDS.map((c) => c.id);

  onMount(async () => {
    history = await loadAttempts();
    // Once: chords already practised (e.g. in songs) before the list existed join it too.
    if (!settings.chordLibraryFromHistory) {
      addToChordLibrary([...new Set(historyOf('chord').map((a) => a.to))], STARTERS);
      settings.chordLibraryFromHistory = true;
    }
  });

  function begin(kind: PracticeKind, items: string[], goal: Goal, pick: Picker, again: () => void, title?: string, maxFret?: number) {
    const session = new PracticeSession({
      kind,
      items,
      goal,
      // Notes are scored 100 (right) or 0 (wrong).
      threshold: kind === 'chord' ? settings.threshold : 50,
      pick,
    });
    session.start(Date.now());
    phase = { name: 'running', kind, session, goal, title, maxFret, again };
  }

  function start() {
    const kind = kindOfMode(settings.practiceMode);
    const goal: Goal =
      settings.goalKind === 'count'
        ? { kind: 'count', transitions: settings.goalCount }
        : { kind: 'time', minutes: settings.goalMinutes };
    const past = historyOf(kind);
    const pick: Picker =
      settings.order === 'focus'
        ? (from, items, attempts) =>
            from === null
              ? pickNext(items, null, Math.random)
              : weightedPick(from, items, pairDifficulties([...past, ...attempts]), Math.random)
        : (from, items) => pickNext(items, from, Math.random);
    begin(kind, kind === 'chord' ? [...settings.practiceChords] : noteItems(settings), goal, pick, start);
  }

  /** A song's chords in its own order: once through, or looped for the session length. */
  function startSong(song: Song, loop: boolean) {
    addToChordLibrary(songChords(song.sections, settings.simplifyChords), STARTERS);
    const sequence = songSequence(song.sections, settings.simplifyChords);
    const goal: Goal = loop ? { kind: 'time', minutes: settings.goalMinutes } : { kind: 'count', transitions: sequence.length - 1 };
    begin(
      'chord',
      songChords(song.sections, settings.simplifyChords),
      goal,
      sequencePicker(sequence),
      () => startSong(song, loop),
      `${song.title} — ${song.artist}`,
    );
  }

  /** A tab's notes in order: once through, or looped for the session length. */
  function startTab(sel: NoteSelection, title: string, loop: boolean) {
    const goal: Goal = loop ? { kind: 'time', minutes: settings.goalMinutes } : { kind: 'count', transitions: sel.sequence.length - 1 };
    begin('note', sel.items, goal, sequencePicker(sel.sequence), () => startTab(sel, title, loop), title, Math.max(4, sel.maxFret));
  }

  /** Chord set in the practice order (focus or random), changing on the beat. */
  function metronomeChords() {
    const items = [...settings.practiceChords];
    const past = historyOf('chord');
    const next = (from: string | null) =>
      settings.order === 'focus' && from !== null
        ? weightedPick(from, items, pairDifficulties(past), Math.random)
        : pickNext(items, from, Math.random);
    phase = { name: 'metronome', key: `chords:${[...items].sort().join(',')}`, title: items.join(' · '), next };
  }

  /** A song's chords in its own order, changing on the beat. */
  function metronomeSong(song: Song) {
    addToChordLibrary(songChords(song.sections, settings.simplifyChords), STARTERS);
    const pick = sequencePicker(songSequence(song.sections, settings.simplifyChords));
    phase = {
      name: 'metronome',
      key: `song:${song.id}${settings.simplifyChords ? ':simple' : ''}`,
      title: `${song.title} — ${song.artist}`,
      next: (from) => pick(from, [], []),
    };
  }

  function end(showSummary: boolean) {
    if (phase.name !== 'running') return;
    const { kind, session, again } = phase;
    const before = hintLevels(historyOf(kind));
    history = [...history, ...session.attempts];
    phase = showSummary
      ? { name: 'summary', kind, summary: summarize(session.attempts), before, after: hintLevels(historyOf(kind)), again }
      : { name: 'setup' };
  }
</script>

{#if phase.name === 'setup'}
  <div class="row modes" role="tablist">
    {#each MODES as m (m.id)}
      <button role="tab" aria-selected={settings.practiceMode === m.id} class:selected={settings.practiceMode === m.id} onclick={() => (settings.practiceMode = m.id)}>
        {m.label}
      </button>
    {/each}
  </div>
  {#if settings.practiceMode === 'chord'}
    <PracticeSetup
      levels={hintLevels(modeHistory)}
      difficulty={pairDifficulties(modeHistory)}
      onstart={start}
      onmetronome={metronomeChords}
    />
  {:else if settings.practiceMode === 'song'}
    <SongSetup levels={hintLevels(modeHistory)} onstart={startSong} onmetronome={metronomeSong} />
  {:else if settings.practiceMode === 'tab'}
    <TabSetup levels={hintLevels(modeHistory)} onstart={startTab} />
  {:else}
    <NoteSetup levels={hintLevels(modeHistory)} difficulty={pairDifficulties(modeHistory)} onstart={start} />
  {/if}
{:else if phase.name === 'metronome'}
  <MetronomeRun key={phase.key} title={phase.title} next={phase.next} history={historyOf('chord')} onexit={() => (phase = { name: 'setup' })} />
{:else if phase.name === 'running'}
  {#key phase.session}
    {#if phase.kind === 'chord'}
      <PracticeRun
        session={phase.session}
        goal={phase.goal}
        title={phase.title}
        history={historyOf('chord')}
        onfinish={() => end(true)}
        onquit={() => end(phase.name === 'running' && phase.session.transitions > 0)}
      />
    {:else}
      <NoteRun
        session={phase.session}
        goal={phase.goal}
        title={phase.title}
        maxFret={phase.maxFret}
        history={historyOf('note')}
        onfinish={() => end(true)}
        onquit={() => end(phase.name === 'running' && phase.session.transitions > 0)}
      />
    {/if}
  {/key}
{:else}
  {@const kind = phase.kind}
  <PracticeSummary
    summary={phase.summary}
    before={phase.before}
    after={phase.after}
    name={(id) => itemName(kind, id, settings.lang)}
    onagain={phase.again}
    onsetup={() => (phase = { name: 'setup' })}
  />
{/if}

<style>
  .modes {
    margin-bottom: 1rem;
  }
</style>
