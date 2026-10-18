<script lang="ts">
  import { hardestPairs } from '../../practice/weighting';
  import { settings } from '../../settings.svelte';

  let {
    items,
    difficulty,
    name,
    showThreshold,
    onstart,
    onmetronome,
  }: {
    items: string[];
    difficulty: Map<string, number>;
    name: (id: string) => string;
    /** Chords have a quality threshold; notes are simply right or wrong. */
    showThreshold: boolean;
    onstart: () => void;
    /** Offered for chords: the same chords, changing on the beat. */
    onmetronome?: () => void;
  } = $props();

  const COUNTS = [10, 25, 50, 100];
  const MINUTES = [2, 5, 10, 15];

  let hardest = $derived(hardestPairs(difficulty, items));
</script>

<section class="card stack">
  <h2>Session length</h2>
  <div class="row">
    <button class:selected={settings.goalKind === 'count'} onclick={() => (settings.goalKind = 'count')}>Transitions</button>
    <button class:selected={settings.goalKind === 'time'} onclick={() => (settings.goalKind = 'time')}>Minutes</button>
    <span class="sep"></span>
    {#if settings.goalKind === 'count'}
      {#each COUNTS as n (n)}
        <button class:selected={settings.goalCount === n} onclick={() => (settings.goalCount = n)}>{n}</button>
      {/each}
    {:else}
      {#each MINUTES as m (m)}
        <button class:selected={settings.goalMinutes === m} onclick={() => (settings.goalMinutes = m)}>{m} min</button>
      {/each}
    {/if}
  </div>
  <div class="row">
    <span>Order</span>
    <button class:selected={settings.order === 'focus'} onclick={() => (settings.order = 'focus')}>Focus on hard changes</button>
    <button class:selected={settings.order === 'random'} onclick={() => (settings.order = 'random')}>Random</button>
  </div>
  {#if settings.order === 'focus'}
    <p class="muted small">
      {#if hardest.length}
        Comes up more often: {hardest.map((p) => `${name(p.from)} → ${name(p.to)}`).join(', ')}. Changes you haven't played yet
        are tried early too.
      {:else}
        Changes that are slow or missed will come up more often.
      {/if}
    </p>
  {/if}
  {#if showThreshold}
    <label class="row">
      Pass threshold
      <input type="range" min="10" max="100" step="5" bind:value={settings.threshold} />
      <span>{settings.threshold}%</span>
    </label>
  {/if}
</section>

<div class="start">
  <button class="primary big" disabled={items.length < 2} onclick={onstart}>Start practice</button>
  {#if onmetronome}
    <button class="big" disabled={items.length < 2} onclick={onmetronome}>With metronome</button>
  {/if}
</div>

<style>
  .stack {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--border);
  }
  .small {
    margin: 0;
    font-size: 0.9rem;
  }
  input[type='range'] {
    flex: 1;
    min-width: 120px;
  }
  .start {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }
  .big {
    font-size: 1.2rem;
    padding: 0.6em 2em;
  }
</style>
