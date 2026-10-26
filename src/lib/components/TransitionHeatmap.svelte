<script lang="ts">
  import type { PairStat } from '../practice/stats';
  import { pairKey } from '../practice/weighting';

  let {
    items,
    pairs,
    name,
    short = name,
  }: {
    items: string[];
    pairs: Map<string, PairStat>;
    /** Full name, used in tooltips. */
    name: (id: string) => string;
    /** Compact name for the row and column headers. */
    short?: (id: string) => string;
  } = $props();

  /** Upper bounds (ms) of the first four colour bins; slower goes in the last one. */
  const BINS = [2000, 4000, 6000, 9000];
  const BIN_LABELS = ['< 2 s', '2–4 s', '4–6 s', '6–9 s', '≥ 9 s'];
  const bin = (ms: number) => BINS.filter((b) => ms >= b).length;

  let hovered = $state<{ stat: PairStat; left: number; top: number } | null>(null);

  /**
   * Cells shrink to fit the card as chords are added: times are printed while
   * cells are wide enough, then the grid shows colours only (hover or tap a
   * cell for its time). Headers turn vertical when columns get narrow.
   */
  let width = $state(700);
  const LABELS = 64;
  let cell = $derived(Math.max(12, Math.min(67, Math.floor((width - LABELS) / items.length) - 2)));
  let numbers = $derived(cell >= 30);
  let vertical = $derived(cell < 40);

  function show(e: Event, stat: PairStat) {
    const cell = e.currentTarget as HTMLElement;
    hovered = { stat, left: cell.offsetLeft + cell.offsetWidth / 2, top: cell.offsetTop };
  }
</script>

<div
  class="heatmap"
  bind:clientWidth={width}
  style:--cols={items.length}
  style:--cell="{cell}px"
  style:--cell-h="{Math.max(14, Math.min(42, cell))}px"
  style:--font={cell >= 42 ? '0.85rem' : '0.7rem'}
>
  {#if !numbers}<p class="muted note">Hover or tap a cell for its time.</p>{/if}
  <div class="grid" class:vertical>
    <div class="corner"><span>from ↓ to →</span></div>
    {#each items as to (to)}
      <div class="head">{short(to)}</div>
    {/each}
    {#each items as from (from)}
      <div class="head row">{short(from)}</div>
      {#each items as to (to)}
        {@const stat = pairs.get(pairKey(from, to))}
        {#if from === to}
          <div class="cell self"></div>
        {:else if !stat || Number.isNaN(stat.recentAvgMs)}
          <div class="cell empty" title="{name(from)} → {name(to)}: not played yet">{numbers ? '–' : ''}</div>
        {:else}
          {@const b = bin(stat.recentAvgMs)}
          <button
            class="cell"
            style:background="var(--heat-{b})"
            style:color="var(--heat-text-{b})"
            aria-label="{name(from)} to {name(to)}: {(stat.recentAvgMs / 1000).toFixed(1)} seconds"
            onpointerenter={(e) => show(e, stat)}
            onpointerleave={() => (hovered = null)}
            onfocus={(e) => show(e, stat)}
            onblur={() => (hovered = null)}
          >
            {#if numbers}{(stat.recentAvgMs / 1000).toFixed(1)}{/if}
          </button>
        {/if}
      {/each}
    {/each}
  </div>

  {#if hovered}
    {@const s = hovered.stat}
    <div class="tip" style:left="{hovered.left}px" style:top="{hovered.top}px">
      <strong>{(s.recentAvgMs / 1000).toFixed(1)} s</strong>
      <span>{name(s.from)} → {name(s.to)} · {s.count}× · {Math.round(s.firstTryRate * 100)}% first try · {s.misses} misses</span>
    </div>
  {/if}

  <div class="legend" aria-label="Colour scale">
    <span class="muted">Average change time (last 5):</span>
    {#each BIN_LABELS as l, i (l)}
      <span class="key"><span class="swatch" style:background="var(--heat-{i})"></span>{l}</span>
    {/each}
    <span class="key"><span class="swatch empty"></span>not played yet</span>
  </div>
</div>

<style>
  .heatmap {
    position: relative;
  }
  .grid {
    display: grid;
    grid-template-columns: max-content repeat(var(--cols), var(--cell));
    justify-content: start;
    gap: 2px;
    overflow-x: auto;
  }
  .corner {
    font-size: 0.7rem;
    color: var(--muted);
    display: flex;
    align-items: flex-end;
  }
  .head {
    font-size: var(--font);
    min-width: 0;
    font-weight: 600;
    text-align: center;
    align-self: end;
    padding-bottom: 0.2rem;
  }
  /* Narrow columns: names written upwards, as on a printed chart. */
  .vertical .head:not(.row) {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    justify-self: center;
    text-align: left;
    padding: 0 0 0.3rem;
  }
  .note {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
  }
  .head.row {
    text-align: right;
    align-self: center;
    padding: 0 0.5rem 0 0;
  }
  .cell {
    height: var(--cell-h);
    /* Cells are buttons: undo the app's 40 px minimum so small cells stay square. */
    min-height: 0;
    border: none;
    border-radius: 4px;
    display: grid;
    place-items: center;
    font: inherit;
    font-size: var(--font);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 0;
  }
  button.cell {
    cursor: default;
  }
  button.cell:hover,
  button.cell:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 1px;
  }
  .cell.empty {
    background: var(--surface-2);
    color: var(--muted);
    font-weight: 400;
  }
  .cell.self {
    background: transparent;
  }
  .tip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 6px));
    pointer-events: none;
    display: grid;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
    z-index: 1;
  }
  .tip strong {
    font-size: 0.95rem;
  }
  .tip span {
    color: var(--muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.9rem;
    margin-top: 0.9rem;
    font-size: 0.8rem;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }
  .swatch.empty {
    background: var(--surface-2);
  }
</style>
