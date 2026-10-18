<script lang="ts">
  import { onMount } from 'svelte';
  import { shortcuts } from '../../keys';
  import type { Level } from '../../practice/game';
  import type { HintLevel } from '../../practice/hints';
  import type { SessionSummary } from '../../practice/summary';

  export interface SummaryGame {
    xp: number;
    bestCombo: number;
    /** Items mastered in this session (chord ids / note positions). */
    mastered: string[];
    /** 0 when the session was stopped early. */
    stars: number;
    levelBefore: Level;
    levelAfter: Level;
  }

  let {
    summary,
    game,
    kind,
    before,
    after,
    name,
    onagain,
    onsetup,
    onhome,
    ondrill,
  }: {
    summary: SessionSummary;
    game: SummaryGame;
    /** "chord" or "note", for the mastered cards' wording. */
    kind: 'chord' | 'note';
    before: Map<string, HintLevel>;
    after: Map<string, HintLevel>;
    name: (id: string) => string;
    onagain: () => void;
    onsetup: () => void;
    onhome: () => void;
    /** Practise one change on its own (offered for the slowest one). */
    ondrill?: (from: string, to: string) => void;
  } = $props();

  /** Slowest changes shown as bars. */
  const BARS = 7;
  let slowest = $derived(summary.pairs.filter((p) => Number.isFinite(p.avgMs)).slice(0, BARS));
  let maxMs = $derived(Math.max(1, ...slowest.map((p) => p.avgMs)));
  let worst = $derived(slowest[0]);
  /** Red over 6 s, amber over 3 s (the clean limit), mint below. */
  const tone = (ms: number) => (ms > 6000 ? 'bad' : ms > 3000 ? 'warn' : 'good');

  onMount(() => shortcuts({ Space: onagain }));

  const secs = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');
  const STAR = 'M12 2l3 7 7 .6-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6 9 9z';

  let relearn = $derived([...after].filter(([id, l]) => l === 'diagram' && before.get(id) === 'name').map(([id]) => id));
  let levelUp = $derived(game.levelAfter.level > game.levelBefore.level);
  let headline = $derived(
    game.stars === 3 ? 'Perfect set' : game.stars === 2 ? 'Set cleared' : game.stars === 1 ? 'Set done' : 'Stopped early',
  );
</script>

<div class="results">
  <section class="card result">
    <div class="stars" role="img" aria-label="{game.stars} of 3 stars">
      {#each [1, 2, 3] as n (n)}
        <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
          {#if n <= game.stars}
            <path d={STAR} fill="var(--accent)"></path>
          {:else}
            <path d={STAR} fill="none" stroke="var(--border-strong)" stroke-width="1.6" stroke-linejoin="round"></path>
          {/if}
        </svg>
      {/each}
    </div>
    <div>
      <h2>{headline}</h2>
      <p class="muted sub">
        {summary.transitions} change{summary.transitions === 1 ? '' : 's'} ·
        {#if game.stars}
          {game.stars < 3 ? `next star at ${game.stars === 1 ? '50' : '80'}% first try` : 'every star earned'}
        {:else}
          finish a set to earn stars
        {/if}
      </p>
    </div>

    <div class="xp">
      <span class="display gained">+{game.xp} XP</span>
      <div class="level">
        <div class="level-top">
          <strong>{levelUp ? `Level up! LV ${game.levelAfter.level} · ${game.levelAfter.title}` : `LV ${game.levelAfter.level} · ${game.levelAfter.title}`}</strong>
          <span class="mono muted">{game.levelAfter.into.toLocaleString('en')} / {game.levelAfter.need.toLocaleString('en')} XP</span>
        </div>
        <div class="bar"><div class="fill" style:width="{(game.levelAfter.into / game.levelAfter.need) * 100}%"></div></div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><span class="muted">First try</span><strong>{Math.round(summary.firstTryRate * 100)}%</strong></div>
      <div class="stat"><span class="muted">Avg change</span><strong>{secs(summary.avgMs)}</strong></div>
      <div class="stat"><span class="muted">Best combo</span><strong>×{game.bestCombo}</strong></div>
      <div class="stat"><span class="muted">Missed {kind === 'chord' ? 'strums' : 'notes'}</span><strong>{summary.totalMisses}</strong></div>
    </div>

    {#each game.mastered as id (id)}
      <div class="mastered">
        <div class="card-chord display">{name(id)}</div>
        <div class="mastered-text">
          <span class="mono eyebrow">{kind === 'chord' ? 'CHORD' : 'POSITION'} MASTERED · +50 XP</span>
          <strong>{name(id)} goes gold: five clean changes in a row</strong>
          <span class="muted">From now on you'll see only its name. Miss it twice and the {kind === 'chord' ? 'diagram' : 'fretboard'} comes back.</span>
        </div>
      </div>
    {/each}
    {#if relearn.length}
      <p class="muted relearn">The {kind === 'chord' ? 'diagram' : 'fretboard'} is back for {relearn.map(name).join(', ')} for a while.</p>
    {/if}

    <div class="actions">
      <button class="primary again" onclick={onagain}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path></svg>
        Play again <kbd>SPACE</kbd>
      </button>
      {#if ondrill && worst && worst.avgMs > 3000}
        <button onclick={() => ondrill(worst.from, worst.to)}>Drill {name(worst.from)} ↔ {name(worst.to)}</button>
      {/if}
      <button onclick={onsetup}>Change settings</button>
      <button class="ghost" onclick={onhome}>Backstage</button>
    </div>
  </section>

  {#if slowest.length}
    <aside class="card slowest">
      <h3>Slowest changes</h3>
      {#each slowest as p (`${p.from}-${p.to}`)}
        <div class="change">
          <div class="change-top">
            <strong>{name(p.from)} → {name(p.to)}</strong>
            <span class="mono">{secs(p.avgMs)} · {p.misses} miss{p.misses === 1 ? '' : 'es'}</span>
          </div>
          <div class="bar thick"><div class="fill {tone(p.avgMs)}" style:width="{(p.avgMs / maxMs) * 100}%"></div></div>
        </div>
      {/each}
      {#if summary.pairs.length > BARS}<p class="muted small">+{summary.pairs.length - BARS} faster ones</p>{/if}
      <p class="muted small">Red: over 6 s, amber: over 3 s. Slow ones come up more often next time.</p>
    </aside>
  {/if}
</div>

<style>
  .results {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: flex-start;
  }
  .result {
    flex: 999 1 520px;
    min-width: 0;
    display: grid;
    gap: 1.25rem;
  }
  .slowest {
    flex: 1 1 320px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .change {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .change-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.9rem;
  }
  .bar.thick {
    height: 10px;
    border-radius: 5px;
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
  .small {
    margin: 0;
    font-size: 0.85rem;
  }
  .relearn {
    margin: 0;
  }
  .again {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 1.15rem;
    padding: 0.65em 1.4em;
    border-radius: 14px;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    border: 1.5px solid currentColor;
    border-radius: 6px;
    padding: 2px 6px;
  }
  .ghost {
    background: transparent;
    color: var(--muted);
  }
  h2 {
    margin: 0;
    font-size: clamp(2.2rem, 6vw, 3rem);
    line-height: 1;
  }
  h3 {
    margin: 0;
    font-size: 1.35rem;
  }
  .sub {
    margin: 0.4rem 0 0;
  }
  .stars {
    display: flex;
    gap: 6px;
  }
  .xp {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 18px;
    background: var(--surface-2);
    border-radius: 16px;
    padding: 14px 18px;
  }
  .gained {
    font-size: 1.8rem;
    color: var(--accent);
  }
  .level {
    flex: 1 1 260px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .level-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.9rem;
  }
  .bar {
    height: 8px;
    background: var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
  }
  .stat {
    display: grid;
    background: var(--surface-2);
    border-radius: 14px;
    padding: 10px 14px;
  }
  .stat span {
    font-size: 0.85rem;
  }
  .stats strong {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
  }
  .mastered {
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: 16px;
    padding: 14px 18px;
  }
  .card-chord {
    flex: none;
    min-width: 64px;
    height: 84px;
    padding: 0 10px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 2px solid var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
  }
  .mastered-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 1.5px;
    color: var(--accent);
    font-weight: 700;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
</style>
