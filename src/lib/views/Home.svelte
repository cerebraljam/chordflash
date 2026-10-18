<script lang="ts">
  import { onMount } from 'svelte';
  import { OPEN_CHORDS, chordById, chordName } from '../music/chords';
  import { INSTRUMENTS } from '../music/instruments';
  import { loadTabs } from '../practice/db';
  import { history } from '../practice/history.svelte';
  import { dayStreak, levelFor, xpLedger } from '../practice/game';
  import { chordCollection, masteredCount, tonightsFocus, weekStats, MASTER_STREAK } from '../practice/home';
  import { noteItems } from '../practice/items';
  import { settings } from '../settings.svelte';
  import { allSongs } from '../songs/library.svelte';
  import type { PracticeEntry } from './Practice.svelte';

  let { onopen }: { onopen: (entry: PracticeEntry) => void } = $props();

  /** Chord cards shown before "+N more". */
  const COLLECTION_MAX = 16;

  let tabCount = $state<number | null>(null);

  let player = $derived(levelFor(xpLedger(history.attempts).total));
  let streak = $derived(dayStreak(history.attempts, Date.now()));

  let chordAttempts = $derived(history.of('chord'));
  let setChords = $derived(settings.practiceChords);
  let focus = $derived(tonightsFocus(chordAttempts, setChords));
  let slowest = $derived(Math.max(1, ...focus.map((f) => f.avgMs || 0)));
  let allChords = $derived([
    ...new Set([...OPEN_CHORDS.map((c) => c.id), ...settings.chordLibrary, ...settings.practiceChords]),
  ]);
  let collection = $derived(chordCollection(chordAttempts, allChords, OPEN_CHORDS.map((c) => c.id)));
  let mastered = $derived(collection.filter((c) => c.state === 'mastered').length);
  let notes = $derived(noteItems(settings));
  let notesFound = $derived(masteredCount(history.of('note'), notes));
  let bestBpm = $derived(Math.max(0, ...Object.values(settings.metroTempos).map((t) => t.best || 0)));
  let week = $derived(weekStats(chordAttempts, Date.now()));
  let minutes = $derived.by(() => {
    if (settings.goalKind === 'time') return settings.goalMinutes;
    const avg = week.week.avgMs || 4000;
    return Math.max(1, Math.round((settings.goalCount * (avg + 1000)) / 60_000));
  });

  const name = (id: string) => chordName(chordById(id), settings.lang);
  const secs = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');
  const list = (ids: string[]) =>
    ids.length < 2 ? ids.map(name).join('') : `${ids.slice(0, -1).map(name).join(', ')} and ${name(ids[ids.length - 1])}`;
  /** Red over 6 s, amber over 3 s (the "clean" limit), mint below. */
  const tone = (ms: number) => (!Number.isFinite(ms) || ms > 6000 ? 'bad' : ms > 3000 ? 'warn' : 'good');

  const canStart = $derived(setChords.length >= 2);
  const startSet = () => canStart && onopen({ action: 'set' });

  onMount(() => {
    loadTabs()
      .then((t) => (tabCount = t.length))
      .catch(() => (tabCount = 0));
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
      if (e.code === 'Space' && !e.repeat && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        startSet();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function delta(now: number, before: number, unit: 'pts' | 's') {
    if (!Number.isFinite(now) || !Number.isFinite(before)) return null;
    const d = unit === 'pts' ? Math.round((now - before) * 100) : (now - before) / 1000;
    if (Math.abs(d) < (unit === 'pts' ? 1 : 0.1)) return null;
    const better = unit === 'pts' ? d > 0 : d < 0;
    return { text: `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(unit === 'pts' ? 0 : 1)} ${unit}`, better };
  }
</script>

<div class="player">
  <div class="level">
    <span class="lv mono">LV {player.level}</span>
    <div class="xp">
      <div class="xp-top"><strong>{player.title}</strong><span class="mono muted">{player.into.toLocaleString('en')} / {player.need.toLocaleString('en')} XP</span></div>
      <div class="bar"><div class="fill accent" style:width="{(player.into / player.need) * 100}%"></div></div>
    </div>
  </div>
  <div class="streak" class:cold={!streak.days}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-6 6-6 9-1-1-2-2-2-4-2 2-1 5-1 7 0 4 3 7 7 7z"></path></svg>
    {#if streak.days}
      <span><strong>{streak.days}-day streak</strong>{#if !streak.playedToday}<span class="muted"> · play today to keep it</span>{/if}</span>
    {:else}
      <span class="muted">Play today to start a streak</span>
    {/if}
  </div>
</div>

<div class="home">
  <div class="main">
    <section class="card hero">
      <span class="eyebrow mono">TONIGHT'S SET</span>
      <h1>{focus.length ? 'Fix your slowest changes' : 'Your first set'}</h1>
      <p class="muted lead">
        {#if canStart}
          {settings.goalKind === 'count' ? `${settings.goalCount} changes` : `${settings.goalMinutes} minutes`} on {list(setChords)},
          about {minutes} minute{minutes === 1 ? '' : 's'}.
          {settings.order === 'focus' ? 'The hard ones come up more often.' : 'In random order.'}
        {:else}
          Pick at least two chords to practise.
        {/if}
      </p>
      {#if focus.length}
        <div class="focus">
          {#each focus as f (`${f.from}-${f.to}`)}
            <div class="change">
              <div class="change-top">
                <strong>{name(f.from)} → {name(f.to)}</strong>
                <span class="mono {tone(f.avgMs)}">{secs(f.avgMs)}</span>
              </div>
              <div class="bar"><div class="fill {tone(f.avgMs)}" style:width="{Math.round(((f.avgMs || slowest) / slowest) * 100)}%"></div></div>
            </div>
          {/each}
        </div>
      {/if}
      <div class="actions">
        <button class="primary start" onclick={startSet} disabled={!canStart}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"></path></svg>
          Start set
          <kbd>SPACE</kbd>
        </button>
        <button onclick={() => onopen({ action: 'setup', mode: 'chord' })}>Change chords</button>
      </div>
    </section>

    <nav class="modes" aria-label="Practice modes">
      <button class="tile" onclick={() => onopen({ action: 'setup', mode: 'chord' })}>
        <span class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M9 3v18M15 3v18M5 9h14M5 15h14"></path></svg></span>
        <span class="tile-title">Chord drills</span>
        <span class="muted small">{mastered} of {allChords.length} chords mastered</span>
        <span class="bar"><span class="fill good" style:width="{(mastered / Math.max(1, allChords.length)) * 100}%"></span></span>
      </button>
      <button class="tile" onclick={() => onopen({ action: 'setup', mode: 'song' })}>
        <span class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle></svg></span>
        <span class="tile-title">Setlist</span>
        <span class="muted small">{allSongs().length} songs to play along</span>
      </button>
      <button class="tile" onclick={() => onopen({ action: 'metronome' })} disabled={!canStart}>
        <span class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21l3-18h2l3 18z"></path><path d="M12 13l5-7"></path></svg></span>
        <span class="tile-title">Rhythm</span>
        <span class="muted small">{bestBpm ? `Best ${bestBpm} BPM` : 'Change chords on the beat'}</span>
      </button>
      <button class="tile" onclick={() => onopen({ action: 'setup', mode: 'note' })}>
        <span class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18"></path><circle cx="14" cy="12" r="2.5" fill="currentColor"></circle></svg></span>
        <span class="tile-title">Note hunt</span>
        <span class="muted small">{INSTRUMENTS[settings.noteInstrument].label} · {notesFound} of {notes.length} positions found</span>
        <span class="bar"><span class="fill good" style:width="{(notesFound / Math.max(1, notes.length)) * 100}%"></span></span>
      </button>
      <button class="tile" onclick={() => onopen({ action: 'setup', mode: 'tab' })}>
        <span class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"></path><path d="M8 4v16"></path></svg></span>
        <span class="tile-title">Riffs</span>
        <span class="muted small">
          {tabCount === null ? 'From Guitar Pro tabs' : tabCount ? `${tabCount} tab${tabCount === 1 ? '' : 's'} imported` : 'Import a Guitar Pro tab'}
        </span>
      </button>
    </nav>
  </div>

  <aside class="side">
    <section class="card">
      <div class="side-head">
        <h2>Chord collection</h2>
        <span class="mono muted small">{mastered} / {collection.length}</span>
      </div>
      <div class="collection">
        {#each collection.slice(0, COLLECTION_MAX) as c (c.chord)}
          <div class="chord-card {c.state}" title={c.state === 'mastered' ? `${name(c.chord)}: mastered` : c.state === 'new' ? `${name(c.chord)}: new` : `${name(c.chord)}: ${c.streak} of ${MASTER_STREAK} clean in a row`}>
            <span class="display chord-name">{name(c.chord)}</span>
            {#if c.state === 'mastered'}
              <svg width="14" height="14" viewBox="0 0 24 24" role="img" aria-label="mastered"><path d="M12 2l3 7 7 .6-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6 9 9z" fill="var(--accent)"></path></svg>
            {:else if c.state === 'new'}
              <span class="new-tag mono">NEW</span>
            {:else}
              <span class="dots" aria-label="{c.streak} of {MASTER_STREAK} clean in a row">
                {#each Array(MASTER_STREAK) as _, i (i)}<span class:on={i < c.streak}></span>{/each}
              </span>
            {/if}
          </div>
        {/each}
      </div>
      {#if collection.length > COLLECTION_MAX}<p class="muted small">+{collection.length - COLLECTION_MAX} more in Chord drills</p>{/if}
      <p class="muted small">Gold: you play it without the diagram (five clean changes in a row). New chords join as you play songs.</p>
    </section>

    <section class="card">
      <h2>This week</h2>
      {#if week.week.changes}
        {@const ft = delta(week.week.firstTry, week.previous.firstTry, 'pts')}
        {@const avg = delta(week.week.avgMs, week.previous.avgMs, 's')}
        <div class="week">
          <div class="stat"><span class="muted small">First try</span><span class="display num">{Math.round(week.week.firstTry * 100)}%</span>{#if ft}<span class="small" class:good={ft.better} class:bad={!ft.better}>{ft.text}</span>{/if}</div>
          <div class="stat"><span class="muted small">Avg change</span><span class="display num">{secs(week.week.avgMs)}</span>{#if avg}<span class="small" class:good={avg.better} class:bad={!avg.better}>{avg.text}</span>{/if}</div>
          <div class="stat"><span class="muted small">Changes played</span><span class="display num">{week.week.changes}</span></div>
          <div class="stat"><span class="muted small">Sessions</span><span class="display num">{week.week.sessions}</span></div>
        </div>
      {:else}
        <p class="muted small">No chord practice in the last 7 days yet. Your first set will show up here.</p>
      {/if}
    </section>
  </aside>
</div>

<style>
  .player {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
  }
  .level,
  .streak {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 18px 6px 6px;
  }
  .level {
    flex: 0 1 380px;
  }
  .streak {
    padding: 8px 16px;
    color: var(--accent);
  }
  .streak span {
    color: var(--text);
  }
  .streak.cold {
    color: var(--dim);
  }
  .lv {
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: 999px;
    padding: 6px 10px;
    font-weight: 700;
    font-size: 13px;
    white-space: nowrap;
  }
  .xp {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .xp-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.85rem;
  }
  .fill.accent {
    background: var(--accent);
  }
  .home {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: flex-start;
  }
  .main {
    flex: 999 1 600px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .side {
    flex: 1 1 300px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .hero {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 1.8rem 2rem;
  }
  .eyebrow {
    font-size: 12px;
    letter-spacing: 2px;
    color: var(--accent);
    font-weight: 700;
  }
  h1 {
    margin: 0;
    font-size: clamp(2.2rem, 5vw, 2.9rem);
    line-height: 1.02;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.35rem;
  }
  .lead {
    margin: 0;
    font-size: 1.05rem;
    max-width: 36rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .focus {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .change {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 150px;
  }
  .change-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .bar {
    display: block;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .fill.good {
    background: var(--good);
  }
  .fill.warn {
    background: var(--warn);
  }
  .fill.bad {
    background: var(--bad);
  }
  .mono.good,
  .good {
    color: var(--good);
  }
  .mono.warn {
    color: var(--warn);
  }
  .mono.bad,
  .bad {
    color: var(--bad);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding-top: 4px;
  }
  .start {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-size: 1.25rem;
    padding: 0.75em 1.6em;
    border-radius: 16px;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    border: 1.5px solid currentColor;
    border-radius: 6px;
    padding: 2px 6px;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 16px;
  }
  .tile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    text-align: left;
    font-weight: 400;
  }
  .tile .icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tile-title {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.3rem;
  }
  .side-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .collection {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .chord-card {
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    background: var(--surface-2);
    border: 2px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
  }
  .chord-card.mastered {
    border-color: var(--accent);
  }
  .chord-card.new {
    border-style: dashed;
    border-color: var(--border-strong);
  }
  .chord-name {
    font-size: clamp(1.1rem, 2.4vw, 1.6rem);
    white-space: nowrap;
  }
  .new-tag {
    font-size: 10px;
    font-weight: 700;
    color: var(--good-ink);
    background: var(--good);
    border-radius: 4px;
    padding: 1px 4px;
  }
  .dots {
    display: flex;
    gap: 3px;
  }
  .dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--border-strong);
  }
  .dots span.on {
    background: var(--good);
  }
  .week {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .stat {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .num {
    font-size: 1.8rem;
  }
  p.small {
    margin: 0.75rem 0 0;
  }
</style>
