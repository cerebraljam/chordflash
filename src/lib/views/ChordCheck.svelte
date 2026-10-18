<script lang="ts">
  import { onMount } from 'svelte';
  import { analyze } from '../audio/chroma';
  import { scoreChord, type ChordScore } from '../audio/chordScore';
  import { engine } from '../audio/engine';
  import { StrumListener } from '../audio/strumListener';
  import ChordDiagram from '../components/ChordDiagram.svelte';
  import { OPEN_CHORDS, chordById, chordId, chordName, voicingPitchClasses } from '../music/chords';
  import { pitchClass, pitchClassName, type Lang } from '../music/notes';
  import { references, settings } from '../settings.svelte';

  interface Attempt {
    chord: string;
    result: ChordScore;
    /** Pitch classes of the notes that seem played, lowest first. */
    heard: number[];
  }

  let currentId = $state(OPEN_CHORDS[0].id);
  let chord = $derived(chordById(currentId));
  let tones = $derived(voicingPitchClasses(chord));
  let typed = $state('');
  let typedId = $derived(chordId(typed));
  let otherLang = $derived<Lang>(settings.lang === 'en' ? 'fr' : 'en');

  let last = $state<Attempt | null>(null);
  let history = $state<Attempt[]>([]);
  let live = $state<Float64Array>(new Float64Array(12));

  let passed = $derived(last !== null && last.result.score >= settings.threshold);
  let liveMax = $derived(Math.max(0.01, ...live));

  function select(id: string) {
    currentId = id;
    last = null;
  }

  function saveReference() {
    if (last && last.chord === currentId) references[currentId] = Array.from(last.result.chroma);
  }

  const names = (pcs: number[]) => pcs.map((pc) => pitchClassName(pc, settings.lang)).join(', ');

  onMount(() => {
    const listener = new StrumListener(engine, settings.gateDb, (a) => {
      const ref = references[currentId];
      const result = scoreChord(a, chord, ref ? Float64Array.from(ref) : undefined);
      // Octave doublings hide behind the lower string's overtones, so report note names, not exact notes.
      const heard = [...new Set(a.fundamentals.map((p) => pitchClass(p.midi)))].filter((pc) => a.noteChroma[pc] > 0.04);
      last = { chord: currentId, result, heard };
      history = [last, ...history].slice(0, 12);
    });
    listener.start();

    // Live chroma bars, ~15 times per second.
    let blocks = 0;
    const off = engine.onBlock((_, db) => {
      listener.gateDb = settings.gateDb;
      if (++blocks % 6) return;
      live = db > settings.gateDb ? analyze(engine.read(Math.round(0.2 * engine.sampleRate)), engine.sampleRate).chroma : live.map((v) => v * 0.7);
    });

    return () => {
      listener.stop();
      off();
    };
  });
</script>

<section class="card">
  <div class="row picker">
    {#each OPEN_CHORDS as c (c.id)}
      <button class:selected={c.id === currentId} onclick={() => select(c.id)}>{chordName(c, settings.lang)}</button>
    {/each}
    {#if !OPEN_CHORDS.some((c) => c.id === currentId)}
      <button class="selected">{chordName(chord, settings.lang)}</button>
    {/if}
    <form class="row other" onsubmit={(e) => { e.preventDefault(); if (typedId) { select(typedId); typed = ''; } }}>
      <input placeholder="Other chord: F#m, B7…" bind:value={typed} aria-label="Check another chord" />
      <button type="submit" disabled={!typedId}>Check</button>
    </form>
  </div>
</section>

<div class="grid">
  <section class="card target">
    <div class="name">{chordName(chord, settings.lang)}</div>
    <div class="muted">{chordName(chord, otherLang)} · {names(tones)}</div>
    <ChordDiagram voicing={chord} lang={settings.lang} />
  </section>

  <section class="card result" class:pass={passed} class:fail={last !== null && !passed}>
    {#if last}
      <div class="score">{last.result.score}<span class="pct">%</span></div>
      <div class="verdict">{passed ? 'Got it!' : 'Not yet — try again'}</div>
      <dl>
        <dt>Heard</dt>
        <dd>{names(last.heard) || '—'}</dd>
        {#if last.result.missing.length}
          <dt>Missing</dt>
          <dd class="bad">{names(last.result.missing)}</dd>
        {/if}
        {#if last.result.extra.length}
          <dt>Wrong notes</dt>
          <dd class="bad">{names(last.result.extra)}</dd>
        {/if}
        <dt>Bass</dt>
        <dd class:bad={last.result.heardBass !== null && last.result.heardBass !== last.result.expectedBass}>
          {last.result.heardBass === null ? '—' : pitchClassName(last.result.heardBass, settings.lang)}
          <span class="muted">(expected {pitchClassName(last.result.expectedBass, settings.lang)})</span>
        </dd>
        <dt>Match</dt>
        <dd>{(last.result.similarity * 100).toFixed(1)} <span class="muted">raw similarity</span></dd>
      </dl>
    {:else}
      <div class="waiting">Strum {chordName(chord, settings.lang)}…</div>
    {/if}
  </section>
</div>

<section class="card">
  <h3>What the app hears right now</h3>
  <div class="bars">
    {#each live as v, pc}
      <div class="bar" class:tone={tones.includes(pc)}>
        <div class="fill" style:height="{(v / liveMax) * 100}%"></div>
        <span>{pitchClassName(pc, settings.lang)}</span>
      </div>
    {/each}
  </div>
  <p class="muted small">Highlighted bars are the notes of {chordName(chord, settings.lang)}. Overtones make other bars move a little — that's normal.</p>
</section>

<section class="card settings">
  <label class="row">
    Pass threshold
    <input type="range" min="10" max="100" step="5" bind:value={settings.threshold} />
    <span>{settings.threshold}%</span>
  </label>
  <div class="row">
    {#if references[currentId]}
      <span>Using <strong>your recorded</strong> {chordName(chord, settings.lang)} as reference.</span>
      <button onclick={() => delete references[currentId]}>Use built-in</button>
    {:else}
      <span class="muted">Using the built-in reference.</span>
    {/if}
    <button disabled={!last || last.chord !== currentId} onclick={saveReference}>Save last strum as my reference</button>
  </div>
  {#if history.length}
    <div class="row history">
      <span class="muted">Recent:</span>
      {#each history as h, i (i)}
        <span class="chip" class:pass={h.result.score >= settings.threshold}>
          {chordName(chordById(h.chord), settings.lang)}
          {h.result.score}
        </span>
      {/each}
    </div>
  {/if}
</section>

<style>
  section {
    margin-bottom: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }
  .grid section {
    margin-bottom: 0;
  }
  .grid + section {
    margin-top: 1rem;
  }
  .target {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
  }
  .name {
    font-size: 3.5rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .result {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.5rem;
    text-align: center;
    border-width: 2px;
  }
  .result.pass {
    border-color: var(--good);
  }
  .result.fail {
    border-color: var(--bad);
  }
  .score {
    font-size: 4rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .pass .score,
  .pass .verdict {
    color: var(--good);
  }
  .fail .score,
  .fail .verdict {
    color: var(--bad);
  }
  .pct {
    font-size: 1.5rem;
  }
  .waiting {
    font-size: 1.4rem;
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.2rem 0.8rem;
    margin: 0.5rem 0 0;
    text-align: left;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .bad {
    color: var(--bad);
  }
  h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }
  .bars {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
    height: 120px;
  }
  .bar {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--muted);
    min-width: 0;
  }
  .bar .fill {
    width: 100%;
    background: var(--border);
    border-radius: 3px 3px 0 0;
    transition: height 60ms linear;
  }
  .bar.tone .fill {
    background: var(--accent);
  }
  .bar.tone {
    color: var(--text);
    font-weight: 600;
  }
  .small {
    font-size: 0.85rem;
    margin: 0.75rem 0 0;
  }
  .other {
    gap: 0.4rem;
  }
  .other input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.4em 0.6em;
    width: 11rem;
  }
  .settings {
    display: grid;
    gap: 0.75rem;
  }
  input[type='range'] {
    flex: 1;
    min-width: 120px;
  }
  .chip {
    font-size: 0.85rem;
    padding: 0.1em 0.5em;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--bad);
  }
  .chip.pass {
    color: var(--good);
  }
</style>
