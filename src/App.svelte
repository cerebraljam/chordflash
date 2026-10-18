<script lang="ts">
  import { audio, startAudio } from './lib/audioState.svelte';
  import LevelMeter from './lib/components/LevelMeter.svelte';
  import { settings } from './lib/settings.svelte';
  import ChordCheck from './lib/views/ChordCheck.svelte';
  import InputSettings from './lib/views/InputSettings.svelte';
  import Practice from './lib/views/Practice.svelte';
  import Stats from './lib/views/Stats.svelte';
  import Tuner from './lib/views/Tuner.svelte';

  const TABS = [
    { id: 'practice', label: 'Practice' },
    { id: 'stats', label: 'Stats' },
    { id: 'input', label: 'Input' },
    { id: 'tuner', label: 'Tuner' },
    { id: 'chords', label: 'Chord check' },
  ] as const;
  type Tab = (typeof TABS)[number]['id'];

  let tab = $state<Tab>('practice');
</script>

<header>
  <h1>Chord Flash</h1>
  <nav class="row">
    {#each TABS as t (t.id)}
      <button class:selected={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
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
  {#if tab === 'stats'}
    <Stats />
  {:else if !audio.running}
    <section class="card start">
      <p>Chord Flash listens to your guitar through the Rocksmith cable (or a microphone).</p>
      <button class="primary" disabled={audio.starting} onclick={() => startAudio()}>
        {audio.starting ? 'Starting…' : 'Start listening'}
      </button>
      {#if audio.error}<p class="error">Could not open the input: {audio.error}</p>{/if}
    </section>
  {:else if tab === 'practice'}
    <Practice />
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
    padding: 1rem 16px;
    max-width: 960px;
    margin: 0 auto;
  }
  h1 {
    font-size: 1.3rem;
    margin: 0;
  }
  .right {
    margin-left: auto;
  }
  main {
    max-width: 960px;
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
  }
  .error {
    color: var(--bad);
  }
</style>
