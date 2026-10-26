<script lang="ts">
  import type { StaffBar } from '../tabs/tab';

  let {
    staff,
    strings,
    at,
    grades,
  }: {
    staff: StaffBar[];
    /** String names, lowest string first ("E A D G B e"). */
    strings: string[];
    /** Step (note of the sequence) being played. */
    at: number;
    /** How each step played so far in this pass went. */
    grades: Map<number, 'good' | 'warn' | 'bad'>;
  } = $props();

  /** Top line = highest string, as tabs are written. */
  let rows = $derived(strings.map((_, i) => strings.length - 1 - i));

  let width = $state(800);
  /** Columns (beats) per line: as many as fit, whole bars only. */
  const COL = 40;
  let lines = $derived.by(() => {
    const budget = Math.max(4, Math.floor((width - 56) / COL));
    const out: StaffBar[][] = [];
    let used = 0;
    for (const bar of staff) {
      const cols = Math.max(1, bar.events.length);
      if (out.length && used + cols <= budget) {
        out[out.length - 1].push(bar);
        used += cols;
      } else {
        out.push([bar]);
        used = cols;
      }
    }
    return out;
  });

  let box = $state<HTMLElement | null>(null);

  // Keep the line being played in the upper third.
  $effect(() => {
    void at;
    void lines;
    const el = box?.querySelector<HTMLElement>('.col.current');
    if (!box || !el) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: smooth ? 'smooth' : 'auto' });
  });
</script>

<section class="staff" bind:this={box} bind:clientWidth={width} aria-label="Tab">
  {#each lines as line, l (l)}
    <div class="line" style:--col="{COL}px">
      <div class="labels" aria-hidden="true">
        <span class="section"></span>
        {#each rows as r (r)}<span class="cell">{strings[r]}</span>{/each}
      </div>
      {#each line as bar, b (b)}
        <div class="bar">
          <span class="section mono">{bar.section ?? ''}</span>
          <div class="cols">
            {#if !bar.events.length}
              <div class="col rest">{#each rows as r (r)}<span class="cell"></span>{/each}</div>
            {/if}
            {#each bar.events as e, i (i)}
              {@const grade = e.step !== null && e.step < at ? grades.get(e.step) : undefined}
              <div
                class="col {grade ?? ''}"
                class:current={e.step === at}
                class:chord={e.step === null}
                class:past={e.step !== null && e.step < at && !grade}
                aria-current={e.step === at ? 'step' : undefined}
              >
                {#each rows as r (r)}
                  {@const note = e.notes.find((n) => n.string === r)}
                  <span class="cell">{#if note}<b class="mono">{note.fret}</b>{/if}</span>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/each}
</section>

<style>
  .staff {
    /* Positioned, so a column's offsetTop is measured from the staff. */
    position: relative;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 14px 16px 40vh;
    max-height: calc(100vh - 200px);
    min-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .line {
    display: flex;
    align-items: flex-end;
  }
  .labels,
  .bar {
    display: flex;
    flex-direction: column;
  }
  .labels {
    width: 24px;
    flex: none;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }
  .section {
    height: 18px;
    font-size: 11px;
    letter-spacing: 1px;
    font-weight: 700;
    color: var(--muted);
    white-space: nowrap;
    padding-left: 4px;
  }
  .cols {
    display: flex;
    /* Bar line on the left of each bar, and closing the line. */
    border-left: 2px solid var(--border-strong);
  }
  .bar:last-child .cols {
    border-right: 2px solid var(--border-strong);
  }
  .col {
    width: var(--col);
    display: flex;
    flex-direction: column;
    border-radius: 8px;
  }
  .rest {
    width: calc(var(--col) * 1.5);
  }
  .cell {
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    /* The string line. */
    background: linear-gradient(transparent 11px, var(--border-strong) 11px, var(--border-strong) 13px, transparent 13px);
  }
  .labels .cell {
    background: none;
  }
  b {
    min-width: 20px;
    padding: 0 4px;
    border-radius: 6px;
    text-align: center;
    font-size: 15px;
    line-height: 20px;
    /* Cuts the string line under the number, like a text tab. */
    background: var(--surface-3);
    color: var(--text);
  }
  .col.current {
    background: var(--accent-soft);
  }
  .col.current b {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .col.good b {
    color: var(--good);
  }
  .col.warn b {
    color: var(--warn);
  }
  .col.bad b {
    color: var(--bad);
  }
  .col.past b,
  .col.chord b {
    color: var(--dim);
  }
  @media (max-width: 860px) {
    .staff {
      max-height: 55vh;
      min-height: 220px;
      padding: 12px 10px 40vh;
    }
  }
</style>
