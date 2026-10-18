<script lang="ts">
  import type { HintLevel } from '../../practice/hints';
  import type { SessionSummary } from '../../practice/summary';

  let {
    summary,
    before,
    after,
    name,
    onagain,
    onsetup,
  }: {
    summary: SessionSummary;
    before: Map<string, HintLevel>;
    after: Map<string, HintLevel>;
    name: (id: string) => string;
    onagain: () => void;
    onsetup: () => void;
  } = $props();

  const secs = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');

  let learned = $derived([...after].filter(([id, l]) => l === 'name' && before.get(id) !== 'name').map(([id]) => id));
  let relearn = $derived([...after].filter(([id, l]) => l === 'diagram' && before.get(id) === 'name').map(([id]) => id));
</script>

<section class="card">
  <h2>Session done</h2>
  <div class="stats">
    <div><strong>{summary.transitions}</strong><span class="muted">transitions</span></div>
    <div><strong>{Math.round(summary.firstTryRate * 100)}%</strong><span class="muted">first try</span></div>
    <div><strong>{secs(summary.avgMs)}</strong><span class="muted">average change</span></div>
    <div><strong>{summary.totalMisses}</strong><span class="muted">missed strums</span></div>
  </div>
  {#if learned.length}
    <p class="good">★ Diagram now hidden for {learned.map(name).join(', ')} — you know them!</p>
  {/if}
  {#if relearn.length}
    <p class="muted">Diagram back for {relearn.map(name).join(', ')} for a while.</p>
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
</div>

<style>
  section {
    margin-bottom: 1rem;
  }
  h2,
  h3 {
    margin: 0 0 1rem;
  }
  h3 {
    font-size: 1rem;
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
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
  }
  .good {
    color: var(--good);
    margin: 1rem 0 0;
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
