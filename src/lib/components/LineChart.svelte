<script lang="ts">
  export interface LinePoint {
    /** Shown in the tooltip, e.g. the session date. */
    label: string;
    value: number;
  }

  let {
    points,
    format,
    label,
    yMax = null,
    height = 200,
  }: {
    points: LinePoint[];
    format: (v: number) => string;
    /** Accessible description of what is plotted. */
    label: string;
    /** Fixed top of the scale (e.g. 100 for percentages); otherwise rounded up from the data. */
    yMax?: number | null;
    height?: number;
  } = $props();

  const pad = { l: 44, r: 56, t: 14, b: 30 };

  let width = $state(480);
  let hover = $state<number | null>(null);

  /** Rounds up to 1, 2 or 5 × 10^k so the axis has clean ticks. */
  function niceCeil(v: number): number {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((c) => c >= v)!;
  }

  let top = $derived(yMax ?? niceCeil(Math.max(0, ...points.map((p) => p.value))));
  let ticks = $derived([0, top / 2, top]);
  let plotW = $derived(Math.max(10, width - pad.l - pad.r));
  let plotH = $derived(height - pad.t - pad.b);
  let n = $derived(points.length);

  const x = (i: number) => pad.l + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => pad.t + plotH * (1 - Math.min(v, top) / top);

  let line = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(''));
  let area = $derived(n > 1 ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : '');
  /** Session numbers to label on the x axis: first, last and a middle one when there is room. */
  let xTicks = $derived(n <= 1 ? [0] : n < 5 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]);

  function nearest(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    hover = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / plotW) * (n - 1))));
  }

  function keys(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const step = e.key === 'ArrowRight' ? 1 : -1;
      hover = Math.max(0, Math.min(n - 1, (hover ?? (step > 0 ? -1 : n)) + step));
      e.preventDefault();
    } else if (e.key === 'Escape') hover = null;
  }

  let tipLeft = $derived(hover === null ? 0 : Math.min(Math.max(x(hover), 70), width - 70));
</script>

<div class="wrap" bind:clientWidth={width}>
  <svg
    {width}
    {height}
    role="slider"
    aria-label="{label}. Use the arrow keys to read each session."
    aria-valuemin={1}
    aria-valuemax={n}
    aria-valuenow={(hover ?? n - 1) + 1}
    aria-valuetext={n ? `Session ${(hover ?? n - 1) + 1}: ${format(points[hover ?? n - 1].value)}` : 'No data'}
    tabindex="0"
    onpointermove={nearest}
    onpointerleave={() => (hover = null)}
    onfocus={() => (hover ??= n - 1)}
    onblur={() => (hover = null)}
    onkeydown={keys}
  >
    {#each ticks as t (t)}
      <line class="grid" x1={pad.l} x2={pad.l + plotW} y1={y(t)} y2={y(t)} />
      <text class="tick" x={pad.l - 8} y={y(t) + 4} text-anchor="end">{format(t)}</text>
    {/each}
    <line class="axis" x1={pad.l} x2={pad.l + plotW} y1={y(0)} y2={y(0)} />
    {#each xTicks as i (i)}
      <text class="tick" x={x(i)} y={height - 8} text-anchor="middle">#{i + 1}</text>
    {/each}

    {#if area}<path class="area" d={area} />{/if}
    <path class="line" d={line} />

    {#if hover !== null}
      <line class="cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} />
      <circle class="dot" cx={x(hover)} cy={y(points[hover].value)} r="5" />
    {/if}
    {#if n}
      <circle class="dot" cx={x(n - 1)} cy={y(points[n - 1].value)} r="5" />
      <text class="end" x={x(n - 1) + 9} y={y(points[n - 1].value) + 4}>{format(points[n - 1].value)}</text>
    {/if}
  </svg>

  {#if hover !== null}
    <div class="tip" style:left="{tipLeft}px" style:top="{Math.max(0, y(points[hover].value) - 58)}px">
      <strong>{format(points[hover].value)}</strong>
      <span>Session #{hover + 1} · {points[hover].label}</span>
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    outline: none;
  }
  svg:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .grid {
    stroke: var(--chart-grid);
    stroke-width: 1;
  }
  .axis {
    stroke: var(--chart-axis);
    stroke-width: 1;
  }
  .tick {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .line {
    fill: none;
    stroke: var(--chart-line);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .area {
    fill: var(--chart-line);
    opacity: 0.1;
  }
  .cross {
    stroke: var(--chart-axis);
    stroke-width: 1;
  }
  .dot {
    fill: var(--chart-line);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .end {
    fill: var(--text);
    font-size: 12px;
    font-weight: 600;
  }
  .tip {
    position: absolute;
    transform: translateX(-50%);
    pointer-events: none;
    display: grid;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
  }
  .tip strong {
    font-size: 0.95rem;
  }
  .tip span {
    color: var(--muted);
  }
</style>
