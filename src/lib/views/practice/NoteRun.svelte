<script lang="ts">
  import { onMount } from 'svelte';
  import { engine } from '../../audio/engine';
  import { NoteListener } from '../../audio/noteListener';
  import Fretboard from '../../components/Fretboard.svelte';
  import { parsePositionId, positionMidi, positionName, stringName, tuningOf } from '../../music/instruments';
  import { noteName, type Lang } from '../../music/notes';
  import { saveAttempt } from '../../practice/db';
  import { hintLevels, RESCUE_AFTER_MS } from '../../practice/hints';
  import { describeWrongNote } from '../../practice/items';
  import type { Goal, PracticeSession } from '../../practice/session';
  import type { Attempt } from '../../practice/types';
  import { settings } from '../../settings.svelte';

  let {
    session,
    goal,
    title,
    maxFret,
    history,
    onfinish,
    onquit,
  }: {
    session: PracticeSession;
    goal: Goal;
    /** Shown above the session, e.g. the song being played. */
    title?: string;
    /** Frets the fretboard shows (default: the note practice setting). */
    maxFret?: number;
    history: Attempt[];
    onfinish: () => void;
    onquit: () => void;
  } = $props();

  type Feedback = { kind: 'pass'; label: string; timeMs: number } | { kind: 'miss'; text: string };

  /** Bumped whenever the (non-reactive) session changes. */
  let version = $state(0);
  let now = $state(Date.now());
  let revealed = $state(false);
  let feedback = $state<Feedback | null>(null);
  let hearing = $state<number | null>(null);

  let current = $derived.by(() => {
    version;
    return parsePositionId(session.current)!;
  });
  let upcoming = $derived.by(() => {
    version;
    return parsePositionId(session.upcoming)!;
  });
  /** The item on screen is the session's last (count goal: warm-up + N transitions). */
  let isLast = $derived.by(() => {
    version;
    return goal.kind === 'count' && session.attempts.length >= goal.transitions;
  });
  let misses = $derived.by(() => {
    version;
    return session.currentMisses;
  });
  let levels = $derived.by(() => {
    version;
    return hintLevels([...history, ...session.attempts]);
  });
  let known = $derived(levels.get(session.current) === 'name');
  let showDiagram = $derived(!known || revealed);
  let onNote = $derived(session.sinceShown(now));
  let progress = $derived.by(() => {
    version;
    if (goal.kind === 'count') return `${session.transitions} / ${goal.transitions}`;
    const left = Math.max(0, goal.minutes * 60_000 - session.elapsed(now));
    return `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')} left`;
  });
  let otherLang = $derived<Lang>(settings.lang === 'en' ? 'fr' : 'en');

  function reveal() {
    revealed = true;
    session.assist();
  }

  function advanced() {
    void saveAttempt(session.attempts[session.attempts.length - 1]);
    revealed = false;
    version++;
    if (session.done) onfinish();
  }

  function skip() {
    session.skip(Date.now());
    feedback = null;
    advanced();
  }

  onMount(() => {
    // Keep a reference: the props are gone once the summary replaces this view.
    const s = session;
    const target = () => positionMidi(parsePositionId(s.current)!);
    const tuning = tuningOf(parsePositionId(s.current)!.instrument)!;
    const listener = new NoteListener(engine, settings.gateDb, Math.min(...tuning), (heard) => {
      const expected = target();
      const outcome = s.strum(heard.midi === expected ? 100 : 0, Date.now());
      if (outcome === 'pass') {
        feedback = { kind: 'pass', label: noteName(expected, settings.lang), timeMs: s.attempts[s.attempts.length - 1].timeMs };
        listener.expected = target();
        advanced();
      } else if (outcome === 'miss') {
        feedback = { kind: 'miss', text: describeWrongNote(heard.midi, expected, settings.lang) };
        version++;
      }
    });
    listener.expected = target();
    listener.start();

    const timer = setInterval(() => {
      now = Date.now();
      listener.gateDb = settings.gateDb;
      hearing = listener.current?.midi ?? null;
      if (known && !revealed && session.sinceShown(now) > RESCUE_AFTER_MS) reveal();
    }, 100);

    return () => {
      listener.stop();
      clearInterval(timer);
    };
  });
</script>

<div class="top row">
  <span class="progress">{progress}</span>
  {#if title}<span class="title">{title}</span>{/if}
  <span class="spacer"></span>
  <button onclick={skip}>Skip</button>
  <button onclick={onquit}>Stop</button>
</div>

<section class="card stage">
  <div class="names">
    <div class="name">{positionName(current, settings.lang)}</div>
    <div class="where">
      on the <strong>{stringName(current.instrument, current.string, settings.lang)}</strong> string{#if showDiagram},
        {current.fret === 0 ? 'open' : `fret ${current.fret}`}{/if}
    </div>
    <div class="muted">{noteName(positionMidi(current), settings.lang)} · {noteName(positionMidi(current), otherLang)}</div>
  </div>

  <div class="diagram">
    {#if showDiagram}
      <Fretboard position={current} maxFret={maxFret ?? settings.noteMaxFret} lang={settings.lang} />
    {:else}
      <div class="hidden-diagram">
        <span class="muted">You know where this one is</span>
        <button onclick={reveal}>Show position</button>
      </div>
    {/if}
  </div>

  <div class="status">
    <span class="clock" class:slow={onNote > 3000}>{(onNote / 1000).toFixed(1)} s</span>
    {#if misses}<span class="misses">· {misses} miss{misses > 1 ? 'es' : ''}</span>{/if}
    <span class="muted hearing">· hearing {hearing === null ? '—' : noteName(hearing, settings.lang)}</span>
  </div>

  <div class="feedback">
    {#if feedback?.kind === 'pass'}
      <span class="good">✓ {feedback.label} in {(feedback.timeMs / 1000).toFixed(1)} s</span>
    {:else if feedback?.kind === 'miss'}
      <span class="bad">✗ {feedback.text}</span>
    {/if}
  </div>
</section>

<p class="next muted">
  {#if isLast}
    Last one!
  {:else}
    Next: <strong>{positionName(upcoming, settings.lang)}</strong> on the {stringName(upcoming.instrument, upcoming.string, settings.lang)} string
  {/if}
</p>

<style>
  .top {
    margin-bottom: 1rem;
  }
  .spacer {
    flex: 1;
  }
  .progress {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .title {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .stage {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
  }
  .names {
    text-align: center;
    display: grid;
    gap: 0.25rem;
  }
  .name {
    font-size: clamp(4rem, 18vw, 7rem);
    font-weight: 700;
    line-height: 1;
  }
  .where {
    font-size: 1.2rem;
  }
  .diagram {
    width: 100%;
    max-width: 640px;
    min-height: 150px;
    display: grid;
    place-items: center;
  }
  .hidden-diagram {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }
  .status {
    font-variant-numeric: tabular-nums;
    font-size: 1.2rem;
  }
  .clock.slow {
    color: var(--warn);
  }
  .misses {
    color: var(--bad);
  }
  .hearing {
    font-size: 1rem;
  }
  .feedback {
    min-height: 1.6em;
    text-align: center;
  }
  .good {
    color: var(--good);
  }
  .bad {
    color: var(--bad);
  }
  .next {
    text-align: center;
    font-size: 1.1rem;
  }
</style>
