<script lang="ts">
  import { onMount } from 'svelte';
  import { audio, startAudio } from './lib/audioState.svelte';
  import LevelMeter from './lib/components/LevelMeter.svelte';
  import { history } from './lib/practice/history.svelte';
  import { settings } from './lib/settings.svelte';
  import ChordCheck from './lib/views/ChordCheck.svelte';
  import Home from './lib/views/Home.svelte';
  import InputSettings from './lib/views/InputSettings.svelte';
  import Practice, { type PracticeEntry } from './lib/views/Practice.svelte';
  import Stats from './lib/views/Stats.svelte';
  import Tuner from './lib/views/Tuner.svelte';

  const TABS = [
    { id: 'home', label: 'Home' },
    { id: 'stats', label: 'Stats' },
    { id: 'tuner', label: 'Tuner' },
    { id: 'chords', label: 'Chord check' },
    { id: 'input', label: 'Input' },
  ] as const;
  /** The practice area is entered from home; the header keeps "Home" lit while in it. */
  type View = (typeof TABS)[number]['id'] | 'practice';

  let tab = $state<View>('home');
  let entry = $state.raw<PracticeEntry>({ action: 'setup', mode: 'chord' });
  /** Bumped on every entry so the practice area starts fresh. */
  let entryKey = $state(0);

  onMount(() => {
    void history.load();
  });

  /** Opens practice from home; the click that does it also starts listening if needed. */
  async function open(e: PracticeEntry) {
    if (!audio.running) {
      await startAudio();
      if (!audio.running) return;
    }
    entry = e;
    entryKey++;
    tab = 'practice';
  }

  const lit = (id: View) => id === tab || (id === 'home' && tab === 'practice');
</script>

<header>
  <h1>
    <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M17 3c7 0 12 4 12 10 0 7-6 15-12 18C11 28 5 20 5 13 5 7 10 3 17 3z" fill="var(--accent)"></path>
      <path d="M12 14h10M12 19h10" stroke="var(--accent-ink)" stroke-width="2.5" stroke-linecap="round"></path>
    </svg>
    Chord Flash
  </h1>
  <nav class="row tabs">
    {#each TABS as t (t.id)}
      <button class:selected={lit(t.id)} aria-current={lit(t.id) ? 'page' : undefined} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </nav>
  <div class="row right">
    {#if audio.running}
      <LevelMeter db={audio.levelDb} gateDb={settings.gateDb} />
      <button class:selected={settings.monitor} onclick={() => (settings.monitor = !settings.monitor)} title="Hear the instrument through the computer">
        {settings.monitor ? 'Monitor on' : 'Monitor off'}
      </button>
    {/if}
    <button onclick={() => (settings.lang = settings.lang === 'en' ? 'fr' : 'en')} title="Note names">
      {settings.lang === 'en' ? 'C D E' : 'Do Ré Mi'}
    </button>
  </div>
</header>

<main>
  {#if tab === 'home'}
    {#if audio.error}<p class="error notice">Could not open the input: {audio.error}</p>{/if}
    <Home onopen={open} />
  {:else if tab === 'stats'}
    <Stats />
  {:else if !audio.running}
    <section class="card start">
      <p>Chord Flash listens to your guitar through the Rocksmith cable (or a microphone).</p>
      <button class="primary big" disabled={audio.starting} onclick={() => startAudio()}>
        {audio.starting ? 'Starting…' : 'Start listening'}
      </button>
      {#if audio.error}<p class="error">Could not open the input: {audio.error}</p>{/if}
    </section>
  {:else if tab === 'practice'}
    {#key entryKey}
      <Practice {entry} onhome={() => (tab = 'home')} />
    {/key}
  {:else if tab === 'input'}
    <InputSettings />
  {:else if tab === 'tuner'}
    <Tuner />
  {:else}
    <ChordCheck />
  {/if}
</main>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.5rem;
    padding: 1.25rem 16px 1rem;
    max-width: 1100px;
    margin: 0 auto;
  }
  h1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.6rem;
    margin: 0;
  }
  .tabs {
    gap: 0.35rem;
  }
  .tabs button:not(.selected) {
    background: transparent;
    border-color: transparent;
    color: var(--muted);
  }
  .tabs button:not(.selected):hover {
    color: var(--text);
    border-color: var(--border);
  }
  .right {
    margin-left: auto;
  }
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 16px 2rem;
  }
  .start {
    display: grid;
    justify-items: center;
    gap: 1rem;
    text-align: center;
    padding: 3rem 1rem;
  }
  .start p {
    margin: 0;
    color: var(--muted);
    font-size: 1.1rem;
  }
  .big {
    font-size: 1.3rem;
    padding: 0.7em 2.2em;
    border-radius: 16px;
  }
  .error {
    color: var(--bad);
  }
  .notice {
    margin: 0 0 1rem;
  }
</style>
