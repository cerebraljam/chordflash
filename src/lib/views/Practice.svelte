<script module lang="ts">
  import type { PracticeMode } from '../settings.svelte';

  /** What opening the practice area should do. */
  export type PracticeEntry =
    | { action: 'setup'; mode: PracticeMode }
    /** Tonight's set: chord practice with the current chord set, right away. */
    | { action: 'set' };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { history } from '../practice/history.svelte';
  import { hintLevels, type HintLevel } from '../practice/hints';
  import { itemName, noteItems } from '../practice/items';
  import { PracticeSession, pickNext, sequencePicker, type Goal, type Picker } from '../practice/session';
  import { summarize, type SessionSummary } from '../practice/summary';
  import { levelFor, stars, xpLedger } from '../practice/game';
  import type { SummaryGame } from './practice/PracticeSummary.svelte';
  import type { PracticeKind } from '../practice/types';
  import { pairDifficulties, weightedPick } from '../practice/weighting';
  import { OPEN_CHORDS } from '../music/chords';
  import { addToChordLibrary, settings } from '../settings.svelte';
  import { songChart, songChords, songSequence, type ChartChord, type Song } from '../songs/songs';
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
    | {
        name: 'metronome';
        key: string;
        title: string;
        /** Chord set: the practice order. */
        next?: (from: string | null) => string;
        /** Song: the whole song as written. */
        chart?: ChartChord[];
      }
    | {
        name: 'running';
        kind: PracticeKind;
        session: PracticeSession;
        goal: Goal;
        title?: string;
        /** Frets the note fretboard shows (tabs can go high up the neck). */
        maxFret?: number;
        /** Set when playing a song through: its best stars are remembered. */
        songId?: string;
        again: () => void;
      }
    | {
        name: 'summary';
        kind: PracticeKind;
        summary: SessionSummary;
        game: SummaryGame;
        before: Map<string, HintLevel>;
        after: Map<string, HintLevel>;
        again: () => void;
      };

  let { entry, onhome }: { entry: PracticeEntry; onhome: () => void } = $props();

  const TITLES: Record<PracticeMode, string> = {
    chord: 'Chord drills',
    song: 'Setlist',
    note: 'Note hunt',
    tab: 'Riffs',
  };

  let phase = $state.raw<Phase>({ name: 'setup' });
  // Playing, results and rhythm start at the top; a setup screen puts itself back where you were.
  $effect(() => {
    if (phase.name !== 'setup') window.scrollTo(0, 0);
  });

  const historyOf = (kind: PracticeKind) => history.of(kind);
  const kindOfMode = (mode: PracticeMode): PracticeKind => (mode === 'note' || mode === 'tab' ? 'note' : 'chord');
  let modeHistory = $derived(historyOf(kindOfMode(settings.practiceMode)));

  const STARTERS = OPEN_CHORDS.map((c) => c.id);

  onMount(async () => {
    // Read once: a new entry from home mounts a new practice area.
    const first = entry;
    settings.practiceMode = first.action === 'setup' ? first.mode : 'chord';
    await history.load();
    if (first.action === 'set') start();
  });

  function begin(
    kind: PracticeKind,
    items: string[],
    goal: Goal,
    pick: Picker,
    again: () => void,
    title?: string,
    maxFret?: number,
    songId?: string,
  ) {
    const session = new PracticeSession({
      kind,
      items,
      goal,
      // Notes are scored 100 (right) or 0 (wrong).
      threshold: kind === 'chord' ? settings.threshold : 50,
      pick,
    });
    session.start(Date.now());
    phase = { name: 'running', kind, session, goal, title, maxFret, songId, again };
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

  /** One change on its own: the two chords back and forth. */
  function drillPair(from: string, to: string) {
    const goal: Goal =
      settings.goalKind === 'count'
        ? { kind: 'count', transitions: settings.goalCount }
        : { kind: 'time', minutes: settings.goalMinutes };
    begin('chord', [from, to], goal, sequencePicker([from, to]), () => drillPair(from, to), `Drill ${from} ↔ ${to}`);
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
      undefined,
      loop ? undefined : song.id,
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
    phase = {
      name: 'metronome',
      key: `song:${song.id}${settings.simplifyChords ? ':simple' : ''}`,
      title: `${song.title} — ${song.artist}`,
      chart: songChart(song.sections, settings.simplifyChords),
    };
  }

  function end(showSummary: boolean) {
    if (phase.name !== 'running') return;
    const { kind, session, again, songId } = phase;
    const before = hintLevels(historyOf(kind));
    const xpBefore = xpLedger(history.attempts).total;
    history.add(session.attempts);
    const ledger = xpLedger(history.attempts);
    const played = ledger.sessions.get(session.id);
    const summary = summarize(session.attempts);
    const game: SummaryGame = {
      xp: played?.xp ?? 0,
      bestCombo: played?.bestCombo ?? 0,
      mastered: played?.mastered ?? [],
      stars: stars(summary, session.done),
      levelBefore: levelFor(xpBefore),
      levelAfter: levelFor(ledger.total),
    };
    if (songId && game.stars > (settings.songStars[songId] ?? 0)) {
      settings.songStars = { ...settings.songStars, [songId]: game.stars };
    }
    phase = showSummary
      ? { name: 'summary', kind, summary, game, before, after: hintLevels(historyOf(kind)), again }
      : { name: 'setup' };
  }
</script>

{#if phase.name === 'setup'}
  <div class="row bar">
    <button class="back" onclick={onhome}>← Backstage</button>
    <h2>{TITLES[settings.practiceMode]}</h2>
  </div>
  {#if settings.practiceMode === 'chord'}
    <PracticeSetup
      levels={hintLevels(modeHistory)}
      difficulty={pairDifficulties(modeHistory)}
      onstart={start}
      onmetronome={() => metronomeChords()}
    />
  {:else if settings.practiceMode === 'song'}
    <SongSetup onstart={startSong} onmetronome={metronomeSong} ondrill={drillPair} />
  {:else if settings.practiceMode === 'tab'}
    <TabSetup levels={hintLevels(modeHistory)} onstart={startTab} />
  {:else}
    <NoteSetup levels={hintLevels(modeHistory)} difficulty={pairDifficulties(modeHistory)} onstart={start} />
  {/if}
{:else if phase.name === 'metronome'}
  <MetronomeRun
    key={phase.key}
    title={phase.title}
    next={phase.next}
    chart={phase.chart}
    history={historyOf('chord')}
    backLabel={TITLES[settings.practiceMode]}
    onexit={() => (phase = { name: 'setup' })}
  />
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
    game={phase.game}
    {kind}
    before={phase.before}
    after={phase.after}
    name={(id) => itemName(kind, id, settings.lang)}
    onagain={phase.again}
    onsetup={() => (phase = { name: 'setup' })}
    setupLabel={TITLES[settings.practiceMode]}
    {onhome}
    ondrill={kind === 'chord' ? drillPair : undefined}
  />
{/if}

<style>
  .bar {
    margin-bottom: 1rem;
  }
  .bar h2 {
    margin: 0;
    font-size: 1.8rem;
  }
  .back {
    background: transparent;
    color: var(--muted);
  }
</style>
