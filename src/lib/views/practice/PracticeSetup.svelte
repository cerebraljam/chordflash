<script lang="ts">
  import { OPEN_CHORDS, chordById, chordId, chordName } from '../../music/chords';
  import type { HintLevel } from '../../practice/hints';
  import { settings } from '../../settings.svelte';
  import SessionSettings from './SessionSettings.svelte';

  let {
    levels,
    difficulty,
    onstart,
    onmetronome,
  }: { levels: Map<string, HintLevel>; difficulty: Map<string, number>; onstart: () => void; onmetronome: () => void } = $props();

  function toggle(id: string) {
    settings.practiceChords = settings.practiceChords.includes(id)
      ? settings.practiceChords.filter((c) => c !== id)
      : [...settings.practiceChords, id];
  }

  const name = (id: string) => chordName(chordById(id), settings.lang);

  const starters = OPEN_CHORDS.map((c) => c.id);
  /** Starter chords, then the library (chords from songs you played, or typed in), then anything else selected. */
  let extra = $derived([...new Set([...settings.chordLibrary, ...settings.practiceChords])].filter((id) => !starters.includes(id)));
  let typed = $state('');
  let typedId = $derived(chordId(typed));

  function addTyped() {
    if (!typedId) return;
    if (!starters.includes(typedId) && !settings.chordLibrary.includes(typedId)) settings.chordLibrary = [...settings.chordLibrary, typedId];
    if (!settings.practiceChords.includes(typedId)) settings.practiceChords = [...settings.practiceChords, typedId];
    typed = '';
  }

  function remove(id: string) {
    settings.chordLibrary = settings.chordLibrary.filter((c) => c !== id);
    settings.practiceChords = settings.practiceChords.filter((c) => c !== id);
  }
</script>

<section class="card stack">
  <h2>Chords to practice</h2>
  <div class="row">
    {#each starters as id (id)}
      <button class="chord" class:selected={settings.practiceChords.includes(id)} onclick={() => toggle(id)}>
        {name(id)}
        {#if levels.get(id) === 'name'}<span class="known" title="You know this one: diagram hidden">★</span>{/if}
      </button>
    {/each}
  </div>
  {#if extra.length}
    <div class="row">
      {#each extra as id (id)}
        <span class="extra" class:selected={settings.practiceChords.includes(id)}>
          <button class="chord" class:selected={settings.practiceChords.includes(id)} onclick={() => toggle(id)}>
            {name(id)}
            {#if levels.get(id) === 'name'}<span class="known" title="You know this one: diagram hidden">★</span>{/if}
          </button>
          <button class="remove" onclick={() => remove(id)} title="Remove {name(id)} from this list" aria-label="Remove {name(id)}">×</button>
        </span>
      {/each}
    </div>
  {/if}
  <div class="row">
    <form class="row add" onsubmit={(e) => { e.preventDefault(); addTyped(); }}>
      <input placeholder="Other chord: F#m, Bb7…" bind:value={typed} aria-label="Add a chord" />
      <button type="submit" disabled={!typedId}>Add{typedId && typedId !== typed ? ` ${typedId}` : ''}</button>
    </form>
  </div>
  <p class="muted small">
    {settings.practiceChords.length < 2 ? 'Pick at least two chords. ' : ''}Chords from the songs you play are added here
    automatically.
  </p>
</section>

<SessionSettings items={settings.practiceChords} {difficulty} {name} showThreshold {onstart} {onmetronome} />

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
  .chord {
    min-width: 3.5rem;
  }
  .add {
    gap: 0.4rem;
  }
  .extra {
    display: inline-flex;
    align-items: stretch;
  }
  .extra .chord {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .remove {
    border-left: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    padding: 0.4em 0.55em;
    color: var(--muted);
  }
  .add input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.4em 0.6em;
    width: 11rem;
  }
  .known {
    color: var(--warn);
    margin-left: 0.25em;
  }
  .small {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
