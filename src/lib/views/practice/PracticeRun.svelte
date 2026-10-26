<script lang="ts">
  import { onMount } from 'svelte';
  import { scoreChord } from '../../audio/chordScore';
  import { engine } from '../../audio/engine';
  import { StrumListener } from '../../audio/strumListener';
  import ChordDiagram from '../../components/ChordDiagram.svelte';
  import HearingPanel from '../../components/HearingPanel.svelte';
  import ResultPill from '../../components/ResultPill.svelte';
  import SessionProgress from '../../components/SessionProgress.svelte';
  import SongSheet from '../../components/SongSheet.svelte';
  import { shortcuts } from '../../keys';
  import { CLEAN_TIME_MS } from '../../practice/hints';
  import { chordById, chordName, voicingPitchClasses } from '../../music/chords';
  import { pitchClassName, type Lang } from '../../music/notes';
  import { saveAttempt } from '../../practice/db';
  import GameChips from '../../components/GameChips.svelte';
  import { attemptGrade, xpLedger, type SessionGame } from '../../practice/game';
  import { hintLevels, RESCUE_AFTER_MS } from '../../practice/hints';
  import type { Goal, PracticeSession } from '../../practice/session';
  import type { Attempt } from '../../practice/types';
  import { references, settings } from '../../settings.svelte';
  import type { ChartChord } from '../../songs/songs';

  let {
    session,
    goal,
    title,
    history,
    sheet,
    onfinish,
    onquit,
  }: {
    session: PracticeSession;
    goal: Goal;
    /** Shown above the session, e.g. the song being played. */
    title?: string;
    history: Attempt[];
    /**
     * A song shown as a whole chart instead of one card at a time: its bars, each
     * bar's step (chartSteps) and the step of each item picked (sequenceCursor).
     */
    sheet?: { chart: ChartChord[]; steps: number[]; positions: number[] };
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
  /** Sheet: the step on screen, and how this pass's steps went (a looped song starts a new pass). */
  let sheetAt = $derived.by(() => {
    version;
    return sheet ? sheet.positions[session.attempts.length] : 0;
  });
  let sheetGrades = $derived.by(() => {
    version;
    const grades = new Map<number, 'good' | 'warn' | 'bad'>();
    if (!sheet) return grades;
    const n = session.attempts.length;
    let start = n;
    while (start > 0 && sheet.positions[start - 1] < sheet.positions[start]) start--;
    for (let k = start; k < n; k++) grades.set(sheet.positions[k], attemptGrade(session.attempts[k]));
    return grades;
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
  let attempts = $derived.by(() => {
    version;
    return [...session.attempts];
  });
  let tones = $derived(voicingPitchClasses(current));
  let otherLang = $derived<Lang>(settings.lang === 'en' ? 'fr' : 'en');
  /** Feedback pill: what just happened. */
  let pill = $derived.by(() => {
    if (!feedback) return null;
    if (feedback.kind === 'miss') {
      const parts = [`${feedback.score}%`];
      if (feedback.missing.length) parts.push(`missing ${names(feedback.missing)}`);
      if (feedback.extra.length) parts.push(`wrong ${names(feedback.extra)}`);
      return { tone: 'bad' as const, text: parts.join(' · '), xp: 0 };
    }
    const n = chordName(chordById(feedback.chord), settings.lang);
    return feedback.mastered
      ? { tone: 'gold' as const, text: `${n} mastered: you know it by heart`, xp: feedback.xp }
      : {
          tone: 'good' as const,
          text: `${n} — ${feedback.timeMs <= CLEAN_TIME_MS ? 'clean in' : 'in'} ${(feedback.timeMs / 1000).toFixed(1)} s`,
          xp: feedback.xp,
        };
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

    const keys = shortcuts({
      KeyH: () => !showDiagram && reveal(),
      KeyS: skip,
      Escape: onquit,
    });

    return () => {
      listener.stop();
      clearInterval(timer);
      keys();
    };
  });
</script>

<div class="hud">
  <button class="icon-btn" onclick={onquit} aria-label="Stop (Esc)">
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"></rect></svg>
  </button>
  <div class="grow"><SessionProgress {attempts} {goal} elapsedMs={session.elapsed(now)} label={title ?? 'Chord drill'} /></div>
  <GameChips combo={game.combo} xp={game.xp} />
</div>

{#if sheet}
  <div class="sheet-stage">
    <SongSheet chart={sheet.chart} steps={sheet.steps} at={sheetAt} grades={sheetGrades} name={(id) => chordName(chordById(id), settings.lang)} />
    <aside class="sheet-side">
      <section class="card now" aria-label="Chord to play">
        <span class="eyebrow mono">PLAY</span>
        <span class="display now-name">{chordName(current, settings.lang)}</span>
        <span class="muted small">{chordName(current, otherLang)} · {names(tones)}</span>
        {#if showDiagram}
          <ChordDiagram voicing={current} lang={settings.lang} width={150} />
        {:else}
          <button onclick={reveal}>Show diagram <kbd>H</kbd></button>
        {/if}
        <div class="target">
          <div class="target-bar">
            <div class="target-fill" class:slow={onChord > CLEAN_TIME_MS} style:width="{Math.min(1, onChord / CLEAN_TIME_MS) * 100}%"></div>
          </div>
          <div class="target-text mono">
            <span class:slow={onChord > CLEAN_TIME_MS}>{(onChord / 1000).toFixed(1)} s{misses ? ` · ${misses} miss${misses > 1 ? 'es' : ''}` : ''}</span>
          </div>
        </div>
      </section>
      <div class="next-row">
        <div class="next row-next">
          <span class="eyebrow mono">{isLast ? 'LAST ONE' : 'NEXT'}</span>
          <span class="display small-next">{isLast ? '★' : chordName(upcoming, settings.lang)}</span>
        </div>
        <button class="skip" onclick={skip}>Skip <kbd>S</kbd></button>
      </div>
      <div class="sheet-pill">{#if pill}<ResultPill tone={pill.tone} text={pill.text} xp={pill.xp} />{/if}</div>
      <span class="muted small key-hints"><kbd>H</kbd> diagram · <kbd>Esc</kbd> stop</span>
    </aside>
  </div>
{:else}
<div class="stage">
  <div class="hear"><HearingPanel {tones} /></div>

  <section class="card play" aria-label="Chord to play">
    <span class="eyebrow mono">PLAY</span>
    <span class="display name">{chordName(current, settings.lang)}</span>
    <span class="muted">{chordName(current, otherLang)} · {names(tones)}</span>
    <div class="diagram">
      {#if showDiagram}
        <ChordDiagram voicing={current} lang={settings.lang} width={190} />
      {:else}
        <div class="hidden-diagram">
          <span class="muted">You know this one</span>
          <button onclick={reveal}>Show diagram <kbd>H</kbd></button>
        </div>
      {/if}
    </div>
    <div class="target">
      <div class="target-bar">
        <div class="target-fill" class:slow={onChord > CLEAN_TIME_MS} style:width="{Math.min(1, onChord / CLEAN_TIME_MS) * 100}%"></div>
      </div>
      <div class="target-text mono">
        <span class:slow={onChord > CLEAN_TIME_MS}>{(onChord / 1000).toFixed(1)} s{misses ? ` · ${misses} miss${misses > 1 ? 'es' : ''}` : ''}</span>
        <span class="muted">clean under {CLEAN_TIME_MS / 1000} s</span>
      </div>
    </div>
  </section>

  <aside class="side">
    <div class="next">
      <span class="eyebrow mono">{isLast ? 'LAST ONE' : 'NEXT'}</span>
      <span class="display next-name">{isLast ? '★' : chordName(upcoming, settings.lang)}</span>
    </div>
    <div class="keys muted">
      <span><kbd>H</kbd> show diagram</span>
      <span><kbd>S</kbd> skip</span>
      <span><kbd>Esc</kbd> stop</span>
    </div>
    <button class="skip" onclick={skip}>Skip</button>
  </aside>
</div>

<div class="feedback">
  {#if pill}<ResultPill tone={pill.tone} text={pill.text} xp={pill.xp} />{/if}
</div>
{/if}

<style>
  .hud {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1 1 280px;
    min-width: 0;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 220px) minmax(0, 460px) minmax(0, 220px);
    grid-template-areas: 'hear play side';
    justify-content: center;
    align-items: center;
    gap: 28px;
  }
  .hear {
    grid-area: hear;
  }
  .play {
    grid-area: play;
  }
  .side {
    grid-area: side;
  }
  @media (max-width: 900px) {
    .stage {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: 'play play' 'side hear';
    }
  }
  .play {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    border: 2px solid var(--accent);
    border-radius: 28px;
    padding: 24px 28px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--accent);
    font-weight: 700;
  }
  .name {
    font-size: clamp(5rem, 16vw, 9.5rem);
    line-height: 0.9;
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
  .target {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .target-bar {
    height: 12px;
    border-radius: 6px;
    background: var(--border);
    overflow: hidden;
  }
  .target-fill {
    height: 100%;
    background: var(--good);
    border-radius: 6px;
  }
  .target-fill.slow {
    background: var(--warn);
  }
  .target-text {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
  }
  .target-text .slow {
    color: var(--warn);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .next {
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
  }
  .next .eyebrow {
    color: var(--muted);
  }
  .next-name {
    font-size: 4rem;
    line-height: 1.05;
    color: #c9ccd6;
  }
  .keys {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    padding: 0 4px;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    padding: 1px 6px;
  }
  .skip {
    align-self: flex-start;
  }
  /* Sheet: the chart, with the chord to play beside it (above it on a phone). */
  .sheet-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 20px;
    align-items: start;
  }
  .sheet-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: sticky;
    top: 16px;
  }
  .now {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    border: 2px solid var(--accent);
    padding: 16px;
  }
  .now-name {
    font-size: 4.5rem;
    line-height: 0.95;
  }
  .small {
    font-size: 0.85rem;
  }
  .row-next {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    padding: 10px 16px;
  }
  .small-next {
    font-size: 2rem;
    color: #c9ccd6;
  }
  .sheet-pill {
    min-height: 44px;
    display: flex;
    justify-content: center;
  }
  .next-row {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }
  .next-row .next {
    flex: 1;
  }
  /* Narrow screens: the chord to play in one compact card above the chart, so the chart stays in view. */
  @media (max-width: 860px) {
    .sheet-stage {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
    .sheet-side {
      order: -1;
      position: static;
      gap: 8px;
    }
    .now {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      padding: 10px 12px;
      gap: 4px 14px;
    }
    .now .eyebrow {
      display: none;
    }
    .now-name {
      font-size: 3rem;
    }
    .now :global(svg) {
      width: 96px;
      height: auto;
    }
    .now .target {
      flex-basis: 100%;
    }
    .row-next {
      padding: 6px 14px;
    }
    .small-next {
      font-size: 1.5rem;
    }
    .sheet-pill {
      min-height: 0;
    }
    /* No keyboard on a phone. */
    .key-hints {
      display: none;
    }
  }
  .feedback {
    display: flex;
    justify-content: center;
    min-height: 48px;
    margin-top: 24px;
  }
</style>
