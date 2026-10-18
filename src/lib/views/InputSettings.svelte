<script lang="ts">
  import { onMount } from 'svelte';
  import { engine, type InputDevice } from '../audio/engine';
  import { audio, startAudio } from '../audioState.svelte';
  import { settings } from '../settings.svelte';
  import LevelMeter from '../components/LevelMeter.svelte';

  let devices = $state<InputDevice[]>([]);
  let listError = $state('');

  async function refresh() {
    try {
      devices = await engine.listDevices();
      listError = '';
    } catch (e) {
      listError = (e as Error).message;
    }
  }

  async function choose(id: string) {
    settings.deviceId = id;
    await startAudio(id);
  }

  onMount(refresh);

  let processingOn = $derived(
    audio.info !== null && [audio.info.echoCancellation, audio.info.noiseSuppression, audio.info.autoGainControl].some(Boolean),
  );
</script>

<section class="card stack">
  <h2>Input</h2>
  <div class="row">
    <select value={settings.deviceId ?? ''} onchange={(e) => choose(e.currentTarget.value)} aria-label="Audio input">
      <option value="" disabled>Choose an input…</option>
      {#each devices as d (d.id)}
        <option value={d.id}>{d.label}</option>
      {/each}
    </select>
    <button onclick={refresh}>Refresh list</button>
  </div>
  {#if listError}<p class="error">{listError}</p>{/if}
  <p class="muted small">
    The Rocksmith Real Tone Cable usually shows up as “Rocksmith Guitar Adapter”. Plug it in before opening this page,
    or press Refresh.
  </p>

  {#if audio.info}
    <dl>
      <dt>Active</dt>
      <dd>{audio.info.label}</dd>
      <dt>Sample rate</dt>
      <dd>{audio.info.sampleRate} Hz</dd>
      <dt>Browser processing</dt>
      <dd class:error={processingOn}>
        {processingOn ? 'ON — echo cancellation / noise suppression / auto gain is altering the signal' : 'off (good)'}
      </dd>
    </dl>
  {/if}
</section>

<section class="card stack">
  <h2>Hear my instrument</h2>
  <label class="row">
    <input type="checkbox" bind:checked={settings.monitor} />
    Play the input through the computer's speakers or headphones
  </label>
  <label class="row">
    Volume
    <input type="range" min="0" max="1.5" step="0.05" bind:value={settings.monitorVolume} disabled={!settings.monitor} />
    <span>{Math.round(settings.monitorVolume * 100)}%</span>
  </label>
  <p class="muted small">
    Handy with an octave pedal for bass practice. Expect a small delay (browser audio isn't as fast as an amp).
    Only with the cable or with headphones: a microphone next to the speakers would howl.
  </p>
</section>

<section class="card stack">
  <h2>Level & sensitivity</h2>
  <p class="muted small">
    Strum a chord: the bar should reach well past the black line. Let the strings go quiet: it should fall below it.
    Turn up the guitar volume if it barely moves; if the bar turns red, it's too loud.
  </p>
  <LevelMeter db={audio.levelDb} gateDb={settings.gateDb} />
  <label class="row">
    Gate
    <input type="range" min="-70" max="-15" step="1" bind:value={settings.gateDb} />
    <span>{settings.gateDb} dB</span>
    <span class="muted">· now {Number.isFinite(audio.levelDb) ? audio.levelDb.toFixed(0) : '−∞'} dB</span>
  </label>
</section>

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
  .small {
    font-size: 0.9rem;
    margin: 0;
  }
  .error {
    color: var(--bad);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  input[type='range'] {
    flex: 1;
    min-width: 120px;
  }
</style>
