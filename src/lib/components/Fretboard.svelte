<script lang="ts">
  import { stringName, tuningOf, type NotePosition } from '../music/instruments';
  import type { Lang } from '../music/notes';

  let { position, maxFret, lang = 'en' }: { position: NotePosition; maxFret: number; lang?: Lang } = $props();

  const fretW = 46;
  const stringGap = 26;
  const left = 46;
  const top = 16;
  const MARKERS = [3, 5, 7, 9, 15, 17];

  let tuning = $derived(tuningOf(position.instrument)!);
  let n = $derived(tuning.length);
  let frets = $derived(Math.max(4, maxFret, position.fret));
  let width = $derived(left + frets * fretW + 12);
  let height = $derived(top + (n - 1) * stringGap + 34);
  /** Lowest string at the bottom, as in tabs. */
  const y = (s: number) => top + (n - 1 - s) * stringGap;
  const fretX = (f: number) => left + f * fretW;
  const dotX = (f: number) => (f === 0 ? left - 14 : left + (f - 0.5) * fretW);
  let midY = $derived((y(0) + y(n - 1)) / 2);
</script>

<svg viewBox="0 0 {width} {height}" style:max-width="{width * 1.8}px" role="img" aria-label="Fretboard position">
  {#each Array(frets) as _, i (i)}
    {@const f = i + 1}
    {#if MARKERS.includes(f)}
      <circle cx={dotX(f)} cy={midY} r="5" class="marker" />
    {:else if f === 12}
      <circle cx={dotX(f)} cy={midY - stringGap} r="5" class="marker" />
      <circle cx={dotX(f)} cy={midY + stringGap} r="5" class="marker" />
    {/if}
    <line x1={fretX(f)} x2={fretX(f)} y1={y(n - 1) - 4} y2={y(0) + 4} class="fret" />
    <text x={dotX(f)} y={height - 4} class="num">{f}</text>
  {/each}
  <rect x={left - 3} y={y(n - 1) - 4} width="5" height={y(0) - y(n - 1) + 8} class="nut" />
  {#each tuning as _, s (s)}
    <line x1={left} x2={fretX(frets)} y1={y(s)} y2={y(s)} class="string" style:stroke-width={1 + (n - 1 - s) * 0.4} />
    <text x="12" y={y(s) + 5} class="name" class:active={s === position.string}>{stringName(position.instrument, s, lang)}</text>
  {/each}
  {#if position.fret === 0}
    <circle cx={dotX(0)} cy={y(position.string)} r="9" class="open" />
  {:else}
    <circle cx={dotX(position.fret)} cy={y(position.string)} r="10" class="dot" />
  {/if}
</svg>

<style>
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .fret {
    stroke: var(--border);
    stroke-width: 2;
  }
  .nut {
    fill: var(--text);
  }
  .string {
    stroke: var(--muted);
  }
  .marker {
    fill: var(--surface-2);
  }
  .num {
    fill: var(--muted);
    font-size: 11px;
    text-anchor: middle;
  }
  .name {
    fill: var(--muted);
    font-size: 14px;
    text-anchor: middle;
  }
  .name.active {
    fill: var(--text);
    font-weight: 700;
  }
  .dot {
    fill: var(--dot);
  }
  .open {
    fill: none;
    stroke: var(--text);
    stroke-width: 2.5;
  }
</style>
