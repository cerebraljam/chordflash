<script lang="ts">
  import { INSTRUMENTS, parsePositionId, positionName, stringName, type InstrumentId } from '../../music/instruments';
  import type { HintLevel } from '../../practice/hints';
  import { itemName, noteItems } from '../../practice/items';
  import { settings } from '../../settings.svelte';
  import SessionSettings from './SessionSettings.svelte';

  let {
    levels,
    difficulty,
    onstart,
  }: { levels: Map<string, HintLevel>; difficulty: Map<string, number>; onstart: () => void } = $props();

  const FRET_RANGES = [4, 5, 7, 12];

  let instrument = $derived(INSTRUMENTS[settings.noteInstrument]);
  let strings = $derived(settings.noteStrings[settings.noteInstrument] ?? []);
  let items = $derived(noteItems(settings));

  function setInstrument(id: InstrumentId) {
    settings.noteInstrument = id;
  }

  function toggleString(s: number) {
    const next = strings.includes(s) ? strings.filter((x) => x !== s) : [...strings, s];
    settings.noteStrings = { ...settings.noteStrings, [settings.noteInstrument]: next };
  }

  const name = (id: string) => itemName('note', id, settings.lang);
</script>

<section class="card stack">
  <h2>Notes to practice</h2>
  <div class="row">
    <span class="label">Instrument</span>
    {#each Object.values(INSTRUMENTS) as ins (ins.id)}
      <button class:selected={settings.noteInstrument === ins.id} onclick={() => setInstrument(ins.id)}>{ins.label}</button>
    {/each}
  </div>
  <div class="row">
    <span class="label">Strings</span>
    {#each instrument.tuning as _, s (s)}
      <button class="string" class:selected={strings.includes(s)} onclick={() => toggleString(s)}>
        {stringName(instrument.id, s, settings.lang)}
      </button>
    {/each}
  </div>
  <div class="row">
    <span class="label">Frets</span>
    {#each FRET_RANGES as f (f)}
      <button class:selected={settings.noteMaxFret === f} onclick={() => (settings.noteMaxFret = f)}>0–{f}</button>
    {/each}
  </div>
  <label class="row">
    <input type="checkbox" bind:checked={settings.noteNaturalsOnly} />
    Natural notes only (no sharps)
  </label>
  <div class="notes">
    {#each items as id (id)}
      {@const p = parsePositionId(id)!}
      <span class="chip" title={name(id)}>
        {positionName(p, settings.lang)}<sub>{stringName(p.instrument, p.string, settings.lang)}·{p.fret}</sub>
        {#if levels.get(id) === 'name'}<span class="known">★</span>{/if}
      </span>
    {/each}
  </div>
  <p class="muted small">
    {items.length} positions. The app checks the exact note (octave included) but can't tell which string you used, so the
    same note elsewhere on the neck also counts.
  </p>
</section>

<SessionSettings {items} {difficulty} {name} showThreshold={false} {onstart} />

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
  .label {
    min-width: 5.5rem;
  }
  .string {
    min-width: 2.75rem;
  }
  .notes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    background: var(--surface-2);
    border-radius: 999px;
    padding: 0.15em 0.6em;
    font-size: 0.9rem;
  }
  .chip sub {
    color: var(--muted);
    font-size: 0.7em;
    margin-left: 0.15em;
  }
  .known {
    color: var(--warn);
    margin-left: 0.2em;
  }
  .small {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
