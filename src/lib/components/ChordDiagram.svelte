<script lang="ts">
  import { GUITAR_TUNING, barres, type Voicing } from '../music/chords';
  import { noteName, type Lang } from '../music/notes';

  let { voicing, lang = 'en', width = 180 }: { voicing: Voicing; lang?: Lang; width?: number } = $props();

  const FRETS = 4;
  const padX = 26;
  const top = 34;
  const fretGap = 34;
  /** Drawn at this size and scaled to `width`, so small diagrams stay legible. */
  const W = 180;
  const stringGap = (W - 2 * padX) / 5;
  const H = top + FRETS * fretGap + 30;
  const height = H;
  /** First fret drawn: 1 near the nut, otherwise the lowest fretted note (shown as "5fr"). */
  let baseFret = $derived.by(() => {
    const fretted = voicing.frets.filter((f): f is number => f !== null && f > 0);
    return fretted.length && Math.max(...fretted) > FRETS ? Math.min(...fretted) : 1;
  });
  let bars = $derived(barres(voicing));
  const x = (s: number) => padX + s * stringGap;
  const y = (fret: number) => top + (fret - baseFret + 0.5) * fretGap;
  const dotR = Math.min(12, stringGap * 0.42);
</script>

<svg viewBox="0 0 {W} {H}" {width} height={(width * H) / W} role="img" aria-label="Chord diagram">
  <!-- nut (or position marker) and frets -->
  {#if baseFret === 1}
    <rect x={padX - 1} y={top - 5} width={5 * stringGap + 2} height="5" fill="var(--text)" />
  {:else}
    <line x1={padX} x2={padX + 5 * stringGap} y1={top} y2={top} stroke="var(--border)" stroke-width="2" />
    <text x={padX - 8} y={top + fretGap / 2 + 5} class="pos">{baseFret}fr</text>
  {/if}
  {#each Array(FRETS) as _, f}
    <line x1={padX} x2={padX + 5 * stringGap} y1={top + (f + 1) * fretGap} y2={top + (f + 1) * fretGap} stroke="var(--border)" stroke-width="2" />
  {/each}
  {#each voicing.frets as fret, s}
    <line x1={x(s)} x2={x(s)} y1={top} y2={top + FRETS * fretGap} stroke="var(--muted)" stroke-width={1 + (5 - s) * 0.3} />
  {/each}
  {#each bars as b (b.finger)}
    <rect x={x(b.from) - dotR} y={y(b.fret) - dotR} width={x(b.to) - x(b.from) + 2 * dotR} height={2 * dotR} rx={dotR} fill="var(--dot)" />
  {/each}
  {#each voicing.frets as fret, s}
    {#if fret === null}
      <text x={x(s)} y={top - 13} class="mark">×</text>
    {:else if fret === 0}
      <circle cx={x(s)} cy={top - 18} r="6" fill="none" stroke="var(--text)" stroke-width="1.5" />
    {:else}
      <circle cx={x(s)} cy={y(fret)} r={dotR} fill="var(--dot)" />
      <text x={x(s)} y={y(fret) + 5} class="finger">{voicing.fingers[s]}</text>
    {/if}
    <text x={x(s)} y={height - 8} class="string">{noteName(GUITAR_TUNING[s], lang).replace(/\d/, '')}</text>
  {/each}
</svg>

<style>
  text {
    text-anchor: middle;
    fill: var(--text);
    font-size: 14px;
  }
  .mark {
    font-size: 18px;
    fill: var(--muted);
  }
  .finger {
    fill: var(--dot-text);
    font-weight: 600;
  }
  .string {
    fill: var(--muted);
    font-size: 12px;
  }
  .pos {
    text-anchor: end;
    font-size: 12px;
    fill: var(--muted);
  }
</style>
