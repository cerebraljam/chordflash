<script lang="ts">
  import type { ChartChord } from '../songs/songs';

  let {
    chart,
    steps,
    at,
    grades,
    beat = null,
    name,
  }: {
    /** The song as written: one bar per chord. */
    chart: ChartChord[];
    /** Step of each bar (repeated chords share one): see chartSteps. */
    steps: number[];
    /** Step being played. */
    at: number;
    /** How each step played so far in this pass went. */
    grades: Map<number, 'good' | 'warn' | 'bad'>;
    /** Playing on the beat: which beat of the current bar we're on. */
    beat?: { at: number; of: number } | null;
    name: (id: string) => string;
  } = $props();

  /** Bars grouped by section, in order (a section name can come back later: a new block each time). */
  let blocks = $derived.by(() => {
    const out: { section: string; bars: { index: number; chord: string }[] }[] = [];
    chart.forEach((bar, index) => {
      const last = out[out.length - 1];
      if (last && last.section === bar.section) last.bars.push({ index, chord: bar.chord });
      else out.push({ section: bar.section, bars: [{ index, chord: bar.chord }] });
    });
    return out;
  });

  let box = $state<HTMLElement | null>(null);

  // Keep the bar being played in the upper third of the sheet.
  $effect(() => {
    void at;
    const el = box?.querySelector<HTMLElement>('.bar.current');
    if (!box || !el) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: smooth ? 'smooth' : 'auto' });
  });
</script>

<section class="sheet" bind:this={box} aria-label="Song sheet">
  {#each blocks as block, b (b)}
    <div class="block">
      <span class="section mono">{block.section.toUpperCase()}</span>
      <ol class="bars">
        {#each block.bars as bar (bar.index)}
          {@const step = steps[bar.index]}
          {@const grade = step < at ? grades.get(step) : undefined}
          <li class="bar {grade ?? ''}" class:current={step === at} class:past={step < at && !grade} aria-current={step === at ? 'step' : undefined}>
            <span class="display">{name(bar.chord)}</span>
            {#if beat && step === at}
              <span class="beats" aria-label="Beat {beat.at + 1} of {beat.of}">
                {#each Array(beat.of) as _, i (i)}<span class:on={i <= beat.at}></span>{/each}
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    </div>
  {/each}
</section>

<style>
  .sheet {
    /* Positioned, so a bar's offsetTop is measured from the sheet. */
    position: relative;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 18px 20px 40vh;
    max-height: calc(100vh - 200px);
    min-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section {
    font-size: 11px;
    letter-spacing: 1.5px;
    font-weight: 700;
    color: var(--muted);
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .bar {
    min-width: 0;
    height: 60px;
    display: flex;
    align-items: center;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 1.6rem;
    overflow: hidden;
    white-space: nowrap;
    transition: background-color 0.15s, border-color 0.15s;
  }
  .bar.current {
    border: 2px solid var(--accent);
    background: var(--accent-soft);
    padding: 0 13px;
  }
  .bar.good {
    border-color: var(--good);
    background: #12261e;
  }
  .bar.warn {
    border-color: var(--warn);
    background: #2a2312;
  }
  .bar.bad {
    border-color: var(--bad);
    background: #2a1218;
  }
  .beats {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }
  .beats span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-strong);
  }
  .beats span.on {
    background: var(--accent);
  }
  .bar.past {
    opacity: 0.55;
  }
  @media (max-width: 860px) {
    .sheet {
      max-height: 55vh;
      min-height: 220px;
    }
  }
  @media (max-width: 560px) {
    .sheet {
      padding: 14px 12px 40vh;
    }
    .bar {
      height: 52px;
      padding: 0 10px;
      font-size: 1.25rem;
    }
    .bar.current {
      padding: 0 9px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }
</style>
