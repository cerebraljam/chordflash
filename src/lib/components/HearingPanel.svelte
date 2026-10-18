<script lang="ts">
  import { onMount } from 'svelte';
  import { analyze } from '../audio/chroma';
  import { engine } from '../audio/engine';
  import { pitchClassName } from '../music/notes';
  import { settings } from '../settings.svelte';

  /** Pitch classes to highlight (the chord's tones, or the note asked for). */
  let { tones }: { tones: number[] } = $props();

  let chroma = $state<number[]>(Array(12).fill(0));
  let level = $state(0);
  let peak = $derived(Math.max(0.01, ...chroma));

  onMount(() => {
    let blocks = 0;
    // ~11 updates per second from the last 0.15 s: cheap enough to keep play snappy.
    return engine.onBlock((_, db) => {
      if (++blocks % 8) return;
      level = Math.max(0, Math.min(1, (db + 70) / 70));
      chroma =
        db > settings.gateDb - 6
          ? Array.from(analyze(engine.read(Math.round(0.15 * engine.sampleRate)), engine.sampleRate).chroma)
          : chroma.map((v) => v * 0.6);
    });
  });
</script>

<div class="hearing" aria-hidden="true">
  <span class="eyebrow mono">HEARING</span>
  <div class="bars">
    {#each chroma as v, pc (pc)}
      <span class="bar" class:tone={tones.includes(pc)} style:height="{Math.max(4, (v / peak) * 100)}%"></span>
    {/each}
  </div>
  <div class="names mono">
    {#each chroma as _, pc (pc)}
      <span class:tone={tones.includes(pc)}>{pitchClassName(pc, settings.lang).replace('#', '♯')}</span>
    {/each}
  </div>
  <div class="level">
    <span class="muted">Level</span>
    <span class="track"><span class="fill" style:width="{level * 100}%"></span></span>
  </div>
</div>

<style>
  .hearing {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 16px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 1.5px;
    color: var(--muted);
  }
  .bars {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 3px;
    height: 84px;
    align-items: end;
  }
  .bar {
    background: var(--border-strong);
    border-radius: 2px;
  }
  .bar.tone {
    background: var(--good);
  }
  .names {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 3px;
    font-size: 8px;
    text-align: center;
    color: var(--dim);
    overflow: hidden;
  }
  .names .tone {
    color: var(--text);
    font-weight: 700;
  }
  .level {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .track {
    flex: 1;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .track .fill {
    display: block;
    height: 100%;
    background: var(--good);
  }
</style>
