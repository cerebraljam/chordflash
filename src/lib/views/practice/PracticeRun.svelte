<script lang="ts">
  import { onMount } from 'svelte';
  import { scoreChord } from '../../audio/chordScore';
  import { engine } from '../../audio/engine';
  import { StrumListener } from '../../audio/strumListener';
  import ChordDiagram from '../../components/ChordDiagram.svelte';
  import { chordById, chordName } from '../../music/chords';
  import { pitchClassName } from '../../music/notes';
  import { saveAttempt } from '../../practice/db';
  import GameChips from '../../components/GameChips.svelte';
  import { xpLedger, type SessionGame } from '../../practice/game';
  import { hintLevels, RESCUE_AFTER_MS } from '../../practice/hints';
  import type { Goal, PracticeSession } from '../../practice/session';
  import type { Attempt } from '../../practice/types';
  import { references, settings } from '../../settings.svelte';

  let {
    session,
    goal,
    title,
    history,
    onfinish,
    onquit,
  }: {
    session: PracticeSession;
    goal: Goal;
    /** Shown above the session, e.g. the song being played. */
    title?: string;
    history: Attempt[];
    onfinish: () => void;
    onquit: () => void;
  } = $props();

  type Feedback =
    | { kind: 'pass'; chord: string; timeMs: number; xp: number; mastered: boolean }
    | { kind: 'miss'; score: number; missing: number[]; extra: number[] };

  /** Bumped whenever the (non-reactive) session changes. */
  let version = $state(0);
  let now = $state(Date.now());
  let revealed = $state(false);
  let feedback = $state<Feedback | null>(null);

  let current = $derived.by(() => {
    version;
    return chordById(session.current);
  });
  let upcoming = $derived.by(() => {
    version;
    return chordById(session.upcoming);
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
  const NO_GAME: SessionGame = { xp: 0, combo: 0, bestCombo: 0, mastered: [] };
  /** This session's XP, combo and masteries, from the same replay as the summary. */
  const sessionGame = () => xpLedger([...history, ...session.attempts]).sessions.get(session.id) ?? NO_GAME;
  let game = $derived.by(() => {
    version;
    return sessionGame();
  });
  let known = $derived(levels.get(current.id) === 'name');
  let showDiagram = $derived(!known || revealed);
  let onChord = $derived(session.sinceShown(now));
  let progress = $derived.by(() => {
    version;
    if (goal.kind === 'count') return `${session.transitions} / ${goal.transitions}`;
    const left = Math.max(0, goal.minutes * 60_000 - session.elapsed(now));
    return `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')} left`;
  });

  const names = (pcs: number[]) => pcs.map((pc) => pitchClassName(pc, settings.lang)).join(', ');

  function reveal() {
    revealed = true;
    session.assist();
  }

  function advanced() {
    const last = session.attempts[session.attempts.length - 1];
    void saveAttempt(last);
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
    const listener = new StrumListener(engine, settings.gateDb, (a) => {
      const chord = chordById(session.current);
      const ref = references[chord.id];
      const result = scoreChord(a, chord, ref ? Float64Array.from(ref) : undefined);
      const t = Date.now();
      const before = game;
      const outcome = session.strum(result.score, t);
      if (outcome === 'pass') {
        const after = sessionGame();
        feedback = {
          kind: 'pass',
          chord: chord.id,
          timeMs: session.attempts[session.attempts.length - 1].timeMs,
          xp: after.xp - before.xp,
          mastered: after.mastered.length > before.mastered.length,
        };
        advanced();
      } else if (outcome === 'miss') {
        feedback = { kind: 'miss', score: result.score, missing: result.missing, extra: result.extra };
        version++;
      }
    });
    listener.start();

    const timer = setInterval(() => {
      now = Date.now();
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
  <GameChips combo={game.combo} xp={game.xp} />
  <button onclick={skip}>Skip</button>
  <button onclick={onquit}>Stop</button>
</div>

<section class="card stage">
  <div class="names">
    <div class="name">{chordName(current, settings.lang)}</div>
    <div class="muted">{chordName(current, settings.lang === 'en' ? 'fr' : 'en')}</div>
  </div>

  <div class="diagram">
    {#if showDiagram}
      <ChordDiagram voicing={current} lang={settings.lang} width={200} />
    {:else}
      <div class="hidden-diagram">
        <span class="muted">You know this one</span>
        <button onclick={reveal}>Show diagram</button>
      </div>
    {/if}
  </div>

  <div class="status">
    <span class="clock" class:slow={onChord > 3000}>{(onChord / 1000).toFixed(1)} s</span>
    {#if misses}<span class="misses">· {misses} miss{misses > 1 ? 'es' : ''}</span>{/if}
  </div>

  <div class="feedback">
    {#if feedback?.kind === 'pass' && feedback.mastered}
      <span class="mastered">★ {chordName(chordById(feedback.chord), settings.lang)} mastered: you know it by heart · +{feedback.xp} XP</span>
    {:else if feedback?.kind === 'pass'}
      <span class="good">✓ {chordName(chordById(feedback.chord), settings.lang)} in {(feedback.timeMs / 1000).toFixed(1)} s · +{feedback.xp} XP</span>
    {:else if feedback?.kind === 'miss'}
      <span class="bad">
        ✗ {feedback.score}%
        {#if feedback.missing.length}· missing {names(feedback.missing)}{/if}
        {#if feedback.extra.length}· wrong {names(feedback.extra)}{/if}
      </span>
    {/if}
  </div>
</section>

<p class="next muted">
  {#if isLast}Last one!{:else}Next: <strong>{chordName(upcoming, settings.lang)}</strong>{/if}
</p>

<style>
  .top {
    margin-bottom: 1rem;
  }
  .spacer {
    flex: 1;
  }
  .progress {
    font-family: var(--font-mono);
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
  }
  .name {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: clamp(4rem, 18vw, 7rem);
    font-weight: 700;
    line-height: 1;
  }
  .diagram {
    min-height: 210px;
    display: grid;
    place-items: center;
  }
  .hidden-diagram {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }
  .status {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 1.2rem;
  }
  .clock.slow {
    color: var(--warn);
  }
  .misses {
    color: var(--bad);
  }
  .feedback {
    min-height: 1.6em;
    text-align: center;
  }
  .good {
    color: var(--good);
  }
  .mastered {
    color: var(--accent);
    font-weight: 700;
  }
  .bad {
    color: var(--bad);
  }
  .next {
    text-align: center;
    font-size: 1.1rem;
  }
</style>
