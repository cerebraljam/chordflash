<script lang="ts">
  import { onMount } from 'svelte';
  import { engine } from '../../audio/engine';
  import { NoteListener } from '../../audio/noteListener';
  import Fretboard from '../../components/Fretboard.svelte';
  import HearingPanel from '../../components/HearingPanel.svelte';
  import ResultPill from '../../components/ResultPill.svelte';
  import SessionProgress from '../../components/SessionProgress.svelte';
  import TabStaff from '../../components/TabStaff.svelte';
  import { shortcuts } from '../../keys';
  import { CLEAN_TIME_MS } from '../../practice/hints';
  import { parsePositionId, positionMidi, positionName, stringName, tuningOf } from '../../music/instruments';
  import { noteName, pitchClass, type Lang } from '../../music/notes';
  import { saveAttempt } from '../../practice/db';
  import GameChips from '../../components/GameChips.svelte';
  import { attemptGrade, xpLedger, type SessionGame } from '../../practice/game';
  import { hintLevels, RESCUE_AFTER_MS } from '../../practice/hints';
  import { describeWrongNote } from '../../practice/items';
  import type { Goal, PracticeSession } from '../../practice/session';
  import type { Attempt } from '../../practice/types';
  import { settings } from '../../settings.svelte';
  import type { StaffBar } from '../../tabs/tab';

  let {
    session,
    goal,
    title,
    maxFret,
    history,
    staff,
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
    /** A riff shown on a tab staff: its bars, and the step of each note picked (sequenceCursor). */
    staff?: { bars: StaffBar[]; positions: number[] };
    onfinish: () => void;
    onquit: () => void;
  } = $props();

  type Feedback = { kind: 'pass'; label: string; timeMs: number; xp: number; mastered: boolean } | { kind: 'miss'; text: string };

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
  /** Tab view: the step on screen, and how this pass's steps went (a looped riff starts a new pass). */
  let staffAt = $derived.by(() => {
    version;
    return staff ? staff.positions[session.attempts.length] : 0;
  });
  let staffGrades = $derived.by(() => {
    version;
    const grades = new Map<number, 'good' | 'warn' | 'bad'>();
    if (!staff) return grades;
    const n = session.attempts.length;
    let start = n;
    while (start > 0 && staff.positions[start - 1] < staff.positions[start]) start--;
    for (let k = start; k < n; k++) grades.set(staff.positions[k], attemptGrade(session.attempts[k]));
    return grades;
  });
  let stringNames = $derived((tuningOf(current.instrument) ?? []).map((_, i) => stringName(current.instrument, i, settings.lang)));

  /** A riff can ask for the same note twice in a row. */
  let again = $derived.by(() => {
    version;
    return session.upcoming === session.current;
  });
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
  let known = $derived(levels.get(session.current) === 'name');
  let showDiagram = $derived(!known || revealed);
  let onNote = $derived(session.sinceShown(now));
  let attempts = $derived.by(() => {
    version;
    return [...session.attempts];
  });
  let tones = $derived([pitchClass(positionMidi(current))]);
  let pill = $derived.by(() => {
    if (!feedback) return null;
    if (feedback.kind === 'miss') return { tone: 'bad' as const, text: feedback.text, xp: 0 };
    return feedback.mastered
      ? { tone: 'gold' as const, text: `${feedback.label} mastered: you know where it is`, xp: feedback.xp }
      : {
          tone: 'good' as const,
          text: `${feedback.label} — ${feedback.timeMs <= CLEAN_TIME_MS ? 'clean in' : 'in'} ${(feedback.timeMs / 1000).toFixed(1)} s`,
          xp: feedback.xp,
        };
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
      const before = game;
      const outcome = s.strum(heard.midi === expected ? 100 : 0, Date.now());
      if (outcome === 'pass') {
        const after = xpLedger([...history, ...s.attempts]).sessions.get(s.id) ?? NO_GAME;
        feedback = {
          kind: 'pass',
          label: noteName(expected, settings.lang),
          timeMs: s.attempts[s.attempts.length - 1].timeMs,
          xp: after.xp - before.xp,
          mastered: after.mastered.length > before.mastered.length,
        };
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
  <div class="grow"><SessionProgress {attempts} {goal} elapsedMs={session.elapsed(now)} label={title ?? 'Note hunt'} /></div>
  <GameChips combo={game.combo} xp={game.xp} />
</div>

{#if staff}
  <div class="tab-stage">
    <TabStaff staff={staff.bars} strings={stringNames} at={staffAt} grades={staffGrades} />
    <aside class="tab-side">
      <section class="card now" aria-label="Note to play">
        <span class="eyebrow mono">PLAY</span>
        <span class="display now-name">{positionName(current, settings.lang)}</span>
        <span class="muted small">{stringName(current.instrument, current.string, settings.lang)} string · {current.fret === 0 ? 'open' : `fret ${current.fret}`}</span>
        <div class="target">
          <div class="target-bar">
            <div class="target-fill" class:slow={onNote > CLEAN_TIME_MS} style:width="{Math.min(1, onNote / CLEAN_TIME_MS) * 100}%"></div>
          </div>
          <div class="target-text mono">
            <span class:slow={onNote > CLEAN_TIME_MS}>{(onNote / 1000).toFixed(1)} s{misses ? ` · ${misses} miss${misses > 1 ? 'es' : ''}` : ''}</span>
          </div>
        </div>
      </section>
      <div class="next-row">
        <div class="next row-next">
          <span class="eyebrow mono">{isLast ? 'LAST ONE' : again ? 'NEXT · AGAIN' : 'NEXT'}</span>
          <span class="display small-next">{isLast ? '★' : positionName(upcoming, settings.lang)}</span>
        </div>
        <button class="skip" onclick={skip}>Skip <kbd>S</kbd></button>
      </div>
      <div class="tab-pill">{#if pill}<ResultPill tone={pill.tone} text={pill.text} xp={pill.xp} />{/if}</div>
      <p class="heard muted small">Hearing <strong>{hearing === null ? '—' : noteName(hearing, settings.lang)}</strong> · <kbd>Esc</kbd> stop</p>
    </aside>
  </div>
{:else}
<div class="stage">
  <div class="hear">
    <HearingPanel {tones} />
    <p class="heard muted">Hearing <strong>{hearing === null ? '—' : noteName(hearing, settings.lang)}</strong></p>
  </div>

  <section class="card play" aria-label="Note to play">
    <span class="eyebrow mono">PLAY</span>
    <span class="display name">{positionName(current, settings.lang)}</span>
    <span class="where">
      on the <strong>{stringName(current.instrument, current.string, settings.lang)}</strong> string{#if showDiagram},
        {current.fret === 0 ? 'open' : `fret ${current.fret}`}{/if}
    </span>
    <span class="muted">{noteName(positionMidi(current), settings.lang)} · {noteName(positionMidi(current), otherLang)}</span>
    <div class="diagram">
      {#if showDiagram}
        <Fretboard position={current} maxFret={maxFret ?? settings.noteMaxFret} lang={settings.lang} />
      {:else}
        <div class="hidden-diagram">
          <span class="muted">You know where this one is</span>
          <button onclick={reveal}>Show position <kbd>H</kbd></button>
        </div>
      {/if}
    </div>
    <div class="target">
      <div class="target-bar">
        <div class="target-fill" class:slow={onNote > CLEAN_TIME_MS} style:width="{Math.min(1, onNote / CLEAN_TIME_MS) * 100}%"></div>
      </div>
      <div class="target-text mono">
        <span class:slow={onNote > CLEAN_TIME_MS}>{(onNote / 1000).toFixed(1)} s{misses ? ` · ${misses} miss${misses > 1 ? 'es' : ''}` : ''}</span>
        <span class="muted">clean under {CLEAN_TIME_MS / 1000} s</span>
      </div>
    </div>
  </section>

  <aside class="side">
    <div class="next">
      <span class="eyebrow mono">{isLast ? 'LAST ONE' : again ? 'NEXT · AGAIN' : 'NEXT'}</span>
      {#if isLast}
        <span class="display next-name">★</span>
      {:else}
        <span class="display next-name">{positionName(upcoming, settings.lang)}</span>
        <span class="muted small">on the {stringName(upcoming.instrument, upcoming.string, settings.lang)} string</span>
      {/if}
    </div>
    <div class="keys muted">
      <span><kbd>H</kbd> show position</span>
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
  /* Tab view: the staff, with the note to play beside it (above it on a phone). */
  .tab-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 20px;
    align-items: start;
  }
  .tab-side {
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
    font-size: 4rem;
    line-height: 0.95;
  }
  .small {
    font-size: 0.85rem;
  }
  .next-row {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }
  .next-row .next {
    flex: 1;
  }
  .row-next {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    padding: 10px 16px;
  }
  .small-next {
    font-size: 1.8rem;
    color: #c9ccd6;
  }
  .tab-pill {
    min-height: 44px;
    display: flex;
    justify-content: center;
  }
  @media (max-width: 860px) {
    .tab-stage {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
    .tab-side {
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
      font-size: 2.8rem;
    }
    .now .target {
      flex-basis: 100%;
    }
    .tab-pill {
      min-height: 0;
    }
  }
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
    grid-template-columns: minmax(0, 220px) minmax(0, 560px) minmax(0, 220px);
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
  @media (max-width: 960px) {
    .stage {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: 'play play' 'side hear';
    }
  }
  .heard {
    margin: 8px 4px 0;
    font-size: 0.9rem;
  }
  .heard strong {
    color: var(--text);
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
    font-size: clamp(5rem, 16vw, 9rem);
    line-height: 0.9;
  }
  .where {
    font-size: 1.2rem;
  }
  .diagram {
    width: 100%;
    min-height: 150px;
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
  .small {
    font-size: 0.85rem;
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
  .feedback {
    display: flex;
    justify-content: center;
    min-height: 48px;
    margin-top: 24px;
  }
</style>
