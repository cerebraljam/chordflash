<script lang="ts">
  import { onMount } from 'svelte';
  import { engine } from '../audio/engine';
  import { Tuner, readingFromFreq, type TunerReading } from '../audio/tuner';
  import { GUITAR_TUNING } from '../music/chords';
  import { midiToFreq, noteName } from '../music/notes';
  import { settings } from '../settings.svelte';

  const BASS_TUNING = [28, 33, 38, 43]; // E1 A1 D2 G2

  let mode = $state<'guitar' | 'bass'>('guitar');
  let reading = $state<TunerReading | null>(null);
  let lastHeard = 0;

  let strings = $derived(mode === 'guitar' ? GUITAR_TUNING : BASS_TUNING);
  /** Open string the current note is closest to. */
  let target = $derived(
    reading ? strings.reduce((best, m) => (Math.abs(m - reading!.midi) < Math.abs(best - reading!.midi) ? m : best)) : null,
  );
  let inTune = $derived(reading !== null && Math.abs(reading.cents) <= 5);

  onMount(() => {
    const tuner = new Tuner(4096);
    const recent: number[] = [];
    let blocks = 0;
    const off = engine.onBlock((_, db) => {
      if (++blocks % 2) return;
      let r = db > settings.gateDb - 10 ? tuner.detect(engine.read(tuner.windowSize), engine.sampleRate) : null;
      // Ignore readings well below the instrument's lowest string (sub-harmonic errors on chords).
      if (r && r.midi < strings[0] - 3) r = null;
      if (r) {
        // Median of the last few readings keeps the needle steady.
        recent.push(r.freq);
        if (recent.length > 5) recent.shift();
        const median = [...recent].sort((a, b) => a - b)[recent.length >> 1];
        reading = readingFromFreq(median, r.clarity);
        lastHeard = performance.now();
      } else if (performance.now() - lastHeard > 1500) {
        reading = null;
        recent.length = 0;
      }
    });
    return off;
  });
</script>

<section class="card tuner">
  <div class="row modes">
    <button class:selected={mode === 'guitar'} onclick={() => (mode = 'guitar')}>Guitar</button>
    <button class:selected={mode === 'bass'} onclick={() => (mode = 'bass')}>Bass</button>
  </div>

  <div class="note" class:good={inTune} class:idle={!reading}>{reading ? noteName(reading.midi, settings.lang) : '·'}</div>

  <div class="gauge" aria-label="Tuning offset">
    <div class="scale">
      <span>−50</span><span>−25</span><span>0</span><span>+25</span><span>+50</span>
    </div>
    <div class="track">
      <div class="center"></div>
      {#if reading}
        <div class="needle" class:good={inTune} style:left="{50 + reading.cents}%"></div>
      {/if}
    </div>
  </div>

  <p class="muted readout">
    {#if reading}
      {reading.freq.toFixed(1)} Hz · {reading.cents > 0 ? '+' : ''}{reading.cents.toFixed(0)} cents
      {#if target !== null && target !== reading.midi}
        · nearest string {noteName(target, settings.lang)} ({midiToFreq(target).toFixed(1)} Hz)
      {/if}
    {:else}
      Play one string at a time
    {/if}
  </p>

  <div class="row strings">
    {#each strings as m (m)}
      <span class="string" class:active={target === m}>{noteName(m, settings.lang)}</span>
    {/each}
  </div>
</section>

<style>
  .tuner {
    display: grid;
    gap: 1rem;
    justify-items: center;
    text-align: center;
  }
  .note {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: 4.5rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .good {
    color: var(--good);
  }
  .idle {
    color: var(--border-strong);
  }
  .gauge {
    width: 100%;
    max-width: 480px;
  }
  .scale {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .track {
    position: relative;
    height: 28px;
    background: var(--surface-2);
    border-radius: 6px;
  }
  .center {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--muted);
  }
  .needle {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 4px;
    margin-left: -2px;
    background: var(--warn);
    border-radius: 2px;
    transition: left 80ms linear;
  }
  .needle.good {
    background: var(--good);
  }
  .readout {
    margin: 0;
    min-height: 1.5em;
  }
  .string {
    padding: 0.3em 0.7em;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .string.active {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
