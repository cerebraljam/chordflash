<script lang="ts">
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
  } = $props();

  const secs = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');
  const STAR = 'M12 2l3 7 7 .6-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6 9 9z';

  let relearn = $derived([...after].filter(([id, l]) => l === 'diagram' && before.get(id) === 'name').map(([id]) => id));
  let levelUp = $derived(game.levelAfter.level > game.levelBefore.level);
  let headline = $derived(
    game.stars === 3 ? 'Perfect set' : game.stars === 2 ? 'Set cleared' : game.stars === 1 ? 'Set done' : 'Stopped early',
  );
</script>

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
      {#if game.stars}
        {game.stars < 3 ? `Next star at ${game.stars === 1 ? '50' : '80'}% first try.` : 'Every star earned.'}
      {:else}
        Finish a set to earn stars.
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
    <div><strong>{Math.round(summary.firstTryRate * 100)}%</strong><span class="muted">first try</span></div>
    <div><strong>{secs(summary.avgMs)}</strong><span class="muted">average change</span></div>
    <div><strong>×{game.bestCombo}</strong><span class="muted">best combo</span></div>
    <div><strong>{summary.totalMisses}</strong><span class="muted">missed {kind === 'chord' ? 'strums' : 'notes'}</span></div>
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
    <p class="muted">The {kind === 'chord' ? 'diagram' : 'fretboard'} is back for {relearn.map(name).join(', ')} for a while.</p>
  {/if}
</section>

{#if summary.pairs.length}
  <section class="card">
    <h3>Transitions, slowest first</h3>
    <table>
      <thead>
        <tr><th>Change</th><th>Times</th><th>Average</th><th>Misses</th></tr>
      </thead>
      <tbody>
        {#each summary.pairs as p (`${p.from}-${p.to}`)}
          <tr>
            <td>{name(p.from)} → {name(p.to)}</td>
            <td>{p.count}</td>
            <td>{secs(p.avgMs)}</td>
            <td class:bad={p.misses > 0}>{p.misses}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<div class="row actions">
  <button class="primary" onclick={onagain}>Practice again</button>
  <button onclick={onsetup}>Change settings</button>
  <button onclick={onhome}>Backstage</button>
</div>

<style>
  section {
    margin-bottom: 1rem;
  }
  .result {
    display: grid;
    gap: 1.25rem;
  }
  h2 {
    margin: 0;
    font-size: clamp(2.2rem, 6vw, 3rem);
    line-height: 1;
  }
  h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
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
  .stats div {
    display: grid;
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
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th {
    text-align: left;
    color: var(--muted);
    font-weight: 500;
  }
  th,
  td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .bad {
    color: var(--bad);
  }
  .actions {
    justify-content: center;
  }
</style>
