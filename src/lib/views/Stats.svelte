<script lang="ts">
  import { onMount } from 'svelte';
  import LineChart from '../components/LineChart.svelte';
  import TransitionHeatmap from '../components/TransitionHeatmap.svelte';
  import { OPEN_CHORDS } from '../music/chords';
  import { parsePositionId, positionMidi } from '../music/instruments';
  import { noteName } from '../music/notes';
  import { loadAttempts } from '../practice/db';
  import { history as historyStore } from '../practice/history.svelte';
  import { hintLevels } from '../practice/hints';
  import { itemName, sortItems } from '../practice/items';
  import { chordStats, pairStats, periodStat, sessionStats, type PeriodStat } from '../practice/stats';
  import { kindOf, type Attempt, type PracticeKind } from '../practice/types';
  import { settings } from '../settings.svelte';
  import { viewMemory } from '../viewMemory.svelte';

  /** Sessions in the "recent" period compared against the ones just before. */
  const PERIOD = 5;
  /** Above this many items even a colours-only from × to grid gets too small; the table is shown instead. */
  const MAX_GRID = 40;

  let all = $state.raw<Attempt[] | null>(null);
  /** The tab you picked last; until then, the one matching the practice mode. */
  let kind = $state<PracticeKind>(viewMemory.stats ?? (settings.practiceMode === 'note' ? 'note' : 'chord'));
  let history = $derived(all?.filter((a) => kindOf(a) === kind) ?? null);
  let showSessionTable = $state(false);
  let showPairTable = $state(false);

  onMount(async () => {
    all = await loadAttempts();
  });

  let sessions = $derived(sessionStats(history ?? []));
  let recent = $derived(periodStat(sessions.slice(-PERIOD)));
  let previous = $derived<PeriodStat | null>(
    sessions.length > PERIOD ? periodStat(sessions.slice(-2 * PERIOD, -PERIOD)) : null,
  );
  let chords = $derived(chordStats(history ?? [], hintLevels(history ?? [])));
  let pairs = $derived(pairStats(history ?? []));
  /** Items that appear in the history: chords in library order, notes low to high. */
  let played = $derived(
    sortItems(
      kind,
      chords.map((c) => c.chord),
      OPEN_CHORDS.map((c) => c.id),
    ),
  );
  let gridFits = $derived(played.length <= MAX_GRID);
  let pairRows = $derived([...pairs.values()].sort((a, b) => (b.recentAvgMs || 0) - (a.recentAvgMs || 0)));

  const name = (id: string) => itemName(kind, id, settings.lang);
  const sessionsText = (n: number) => (n === 1 ? 'session' : `${n} sessions`);
  /** Grid headers: "G1" rather than "G1 (E·3)" for notes. */
  const short = (id: string) => {
    const p = parsePositionId(id);
    return p ? noteName(positionMidi(p), settings.lang) : name(id);
  };
  const secs = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');
  const pct = (r: number) => (Number.isFinite(r) ? `${Math.round(r * 100)}%` : '—');
  const when = (t: number) =>
    new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function reset() {
    if (!confirm('Delete all practice history, chords and notes? Stats, hidden diagrams and the hard-changes focus all start over.')) return;
    await historyStore.clear();
    all = [];
  }
</script>

<div class="row kinds" role="tablist">
  <button role="tab" aria-selected={kind === 'chord'} class:selected={kind === 'chord'} onclick={() => (kind = viewMemory.stats = 'chord')}>Chords</button>
  <button role="tab" aria-selected={kind === 'note'} class:selected={kind === 'note'} onclick={() => (kind = viewMemory.stats = 'note')}>Single notes</button>
</div>

{#if history === null}
  <p class="muted">Loading…</p>
{:else if sessions.length === 0}
  <section class="card empty">
    <h2>No stats yet</h2>
    <p class="muted">Play a practice session and your progress shows up here.</p>
  </section>
{:else}
  <section class="tiles">
    <div class="card tile">
      <span class="label">Sessions</span>
      <span class="value">{sessions.length}</span>
      <span class="muted small">{periodStat(sessions).transitions} transition{periodStat(sessions).transitions === 1 ? '' : 's'} in total</span>
    </div>
    <div class="card tile">
      <span class="label">First try</span>
      <span class="value">{pct(recent.firstTryRate)}</span>
      {#if previous}
        {@const d = Math.round((recent.firstTryRate - previous.firstTryRate) * 100)}
        <span class="delta" class:good={d > 0} class:bad={d < 0}>
          {d > 0 ? '▲' : d < 0 ? '▼' : '='}
          {d > 0 ? '+' : ''}{d} pts vs previous {sessionsText(previous.sessions)}
        </span>
      {:else}
        <span class="muted small">last {sessionsText(Math.min(PERIOD, sessions.length))}</span>
      {/if}
    </div>
    <div class="card tile">
      <span class="label">Average change</span>
      <span class="value">{secs(recent.avgMs)}</span>
      {#if previous}
        {@const d = (recent.avgMs - previous.avgMs) / 1000}
        <span class="delta" class:good={d < 0} class:bad={d > 0}>
          {d < 0 ? '▼' : d > 0 ? '▲' : '='}
          {d > 0 ? '+' : ''}{d.toFixed(1)} s vs previous {sessionsText(previous.sessions)}
        </span>
      {:else}
        <span class="muted small">last {sessionsText(Math.min(PERIOD, sessions.length))}</span>
      {/if}
    </div>
  </section>

  <section class="card">
    <div class="row head">
      <h2>Progress per session</h2>
      <button class="link" onclick={() => (showSessionTable = !showSessionTable)}>
        {showSessionTable ? 'Show charts' : 'Show as table'}
      </button>
    </div>
    {#if showSessionTable}
      <table>
        <thead><tr><th>#</th><th>When</th><th>Transitions</th><th>First try</th><th>Avg change</th><th>Misses</th></tr></thead>
        <tbody>
          {#each sessions as s, i (s.id)}
            <tr>
              <td>{i + 1}</td><td>{when(s.start)}</td><td>{s.transitions}</td><td>{pct(s.firstTryRate)}</td><td>{secs(s.avgMs)}</td><td>{s.misses}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="charts">
        <figure>
          <figcaption>Average change time <span class="muted">· lower is better</span></figcaption>
          <LineChart
            label="Average change time per session"
            points={sessions.map((s) => ({ label: when(s.start), value: s.avgMs / 1000 }))}
            format={(v) => `${v % 1 ? v.toFixed(1) : v} s`}
          />
        </figure>
        <figure>
          <figcaption>First-try rate <span class="muted">· higher is better</span></figcaption>
          <LineChart
            label="First-try rate per session"
            points={sessions.map((s) => ({ label: when(s.start), value: s.firstTryRate * 100 }))}
            format={(v) => `${Math.round(v)}%`}
            yMax={100}
          />
        </figure>
      </div>
    {/if}
  </section>

  <section class="card">
    <div class="row head">
      <h2>Transitions</h2>
      {#if gridFits}
        <button class="link" onclick={() => (showPairTable = !showPairTable)}>
          {showPairTable ? 'Show grid' : 'Show as table'}
        </button>
      {/if}
    </div>
    {#if showPairTable || !gridFits}
      <table>
        <thead><tr><th>Change</th><th>Times</th><th>Recent avg</th><th>First try</th><th>Misses</th></tr></thead>
        <tbody>
          {#each pairRows as p (`${p.from}-${p.to}`)}
            <tr>
              <td>{name(p.from)} → {name(p.to)}</td><td>{p.count}</td><td>{secs(p.recentAvgMs)}</td><td>{pct(p.firstTryRate)}</td><td>{p.misses}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted small">Each cell is the change from the row's {kind} to the column's {kind}. Darker = slower.</p>
      <TransitionHeatmap items={played} {pairs} {name} {short} />
    {/if}
  </section>

  <section class="card">
    <h2>{kind === 'chord' ? 'Chords' : 'Notes'} <span class="muted small">· slowest first</span></h2>
    <table>
      <thead><tr><th>{kind === 'chord' ? 'Chord' : 'Note'}</th><th>Plays</th><th>Recent avg</th><th>First try</th><th>Diagram</th></tr></thead>
      <tbody>
        {#each chords as c (c.chord)}
          <tr>
            <td><strong>{name(c.chord)}</strong></td>
            <td>{c.plays}</td>
            <td>{secs(c.recentAvgMs)}</td>
            <td>{pct(c.firstTryRate)}</td>
            <td>{c.level === 'name' ? '★ hidden' : 'shown'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <div class="footer">
    <button onclick={reset}>Delete all practice history…</button>
  </div>
{/if}

<style>
  section {
    margin-bottom: 1rem;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }
  .head {
    justify-content: space-between;
  }
  .head h2 {
    margin: 0;
  }
  .kinds {
    margin-bottom: 1rem;
  }
  .empty {
    text-align: center;
    padding: 3rem 1rem;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 1rem;
  }
  .tile {
    display: grid;
    gap: 0.15rem;
  }
  .label {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .value {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: 2.2rem;
    font-weight: 600;
    line-height: 1.15;
  }
  .small {
    font-size: 0.85rem;
  }
  .delta {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .delta.good {
    color: var(--good);
  }
  .delta.bad {
    color: var(--bad);
  }
  .charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-top: 0.75rem;
  }
  figure {
    margin: 0;
    min-width: 0;
  }
  figcaption {
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  button.link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
    margin-top: 0.5rem;
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
  .footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
