<script lang="ts">
  import { onMount } from 'svelte';
  import { parsePositionId, positionName, stringName } from '../../music/instruments';
  import { deleteTab, loadTabs, saveTab } from '../../practice/db';
  import type { HintLevel } from '../../practice/hints';
  import { settings } from '../../settings.svelte';
  import { addSong } from '../../songs/library.svelte';
  import { progressionText } from '../../songs/songs';
  import { TAB_FILE_TYPES, importTab } from '../../tabs/importTab';
  import { chordSections, isBassTrack, sectionStarts, selectNotes, standardShift, tuningName, type NoteSelection, type Tab } from '../../tabs/tab';

  let {
    levels,
    onstart,
  }: {
    levels: Map<string, HintLevel>;
    /** Practise the selected notes in order: once through, or looped for the session length. */
    onstart: (selection: NoteSelection, title: string, loop: boolean) => void;
  } = $props();

  /** Places to get Guitar Pro / MusicXML files. Most tabs there are written by other players. */
  const FILE_SOURCES = [
    { name: 'Ultimate Guitar', url: 'https://www.ultimate-guitar.com/', note: 'huge library: search a song and pick a "Guitar Pro" tab (may ask you to sign in)' },
    { name: 'GProTab.net', url: 'https://gprotab.net/', note: 'free Guitar Pro file sharing' },
    { name: '911tabs', url: 'https://www.911tabs.com/', note: 'search engine across many tab sites' },
    { name: 'Songsterr', url: 'https://www.songsterr.com/', note: 'very good tabs; downloading the file needs a paid plan' },
  ];
  const TOOLS = [
    { name: 'TuxGuitar', url: 'https://www.tuxguitar.app/', note: 'free, open-source tab editor; opens and saves Guitar Pro 3–5 files' },
    { name: 'MuseScore Studio', url: 'https://musescore.org/', note: 'free notation app; opens Guitar Pro files and exports MusicXML' },
    { name: 'Guitar Pro', url: 'https://www.guitar-pro.com/', note: 'the original editor (paid)' },
  ];

  let tabs = $state.raw<Tab[]>([]);
  let tabId = $state<string | null>(null);
  let trackIndex = $state(0);
  let from = $state(0);
  let to = $state(0);
  let busy = $state(false);
  let error = $state('');
  let songAdded = $state(false);

  let tab = $derived(tabs.find((t) => t.id === tabId) ?? null);
  let track = $derived(tab?.tracks[trackIndex] ?? null);
  let sections = $derived(track ? sectionStarts(track) : []);
  let shift = $derived(track ? standardShift(track.tuning) : null);
  let selection = $derived(track ? selectNotes(track, from, to, settings.tabAsStandard) : null);
  let chords = $derived(track ? chordSections(track) : []);

  onMount(async () => {
    try {
      tabs = await loadTabs();
      if (tabs.length) choose(tabs[0].id);
    } catch {
      error = 'Imported tabs could not be loaded in this browser.';
    }
  });

  function choose(id: string) {
    tabId = id;
    const t = tabs.find((x) => x.id === id)!;
    // Start on the first non-bass track that has notes, and its first section.
    trackIndex = Math.max(0, t.tracks.findIndex((tr) => !isBassTrack(tr)));
    pickTrack(trackIndex);
    songAdded = false;
  }

  function pickTrack(i: number) {
    trackIndex = i;
    const tr = tab?.tracks[i];
    if (!tr) return;
    const s = sectionStarts(tr);
    from = 0;
    to = s.length > 1 ? s[1].bar - 1 : tr.bars.length - 1;
  }

  function pickSection(i: number) {
    from = sections[i].bar;
    to = (sections[i + 1]?.bar ?? track!.bars.length) - 1;
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busy = true;
    error = '';
    try {
      const t = await importTab(new Uint8Array(await file.arrayBuffer()), file.name);
      await saveTab(t);
      tabs = [t, ...tabs];
      choose(t.id);
    } catch (err) {
      error = `Couldn't read ${file.name}: ${(err as Error).message}`;
    } finally {
      busy = false;
    }
  }

  async function remove(t: Tab) {
    if (!confirm(`Remove "${t.title}" from your tabs?`)) return;
    await deleteTab(t.id);
    tabs = tabs.filter((x) => x.id !== t.id);
    tabId = tabs[0]?.id ?? null;
    if (tabId) choose(tabId);
  }

  function addChordsAsSong() {
    if (!tab) return;
    addSong(tab.title, tab.artist || 'Unknown', progressionText(chords));
    songAdded = true;
  }

  const barLabel = (i: number) => {
    const s = track?.bars[i]?.section;
    return `Bar ${i + 1}${s ? ` · ${s}` : ''}`;
  };
  const noteLabel = (id: string) => {
    const p = parsePositionId(id)!;
    return { name: positionName(p, settings.lang), where: `${stringName(p.instrument, p.string, settings.lang)}·${p.fret}` };
  };
</script>

<section class="card stack">
  <div class="row">
    <label class="file">
      <input type="file" accept={TAB_FILE_TYPES} onchange={onFile} disabled={busy} />
      <span class="button primary">{busy ? 'Reading…' : 'Import a Guitar Pro file'}</span>
    </label>
    <span class="muted small">
      <a href="https://www.guitar-pro.com/" target="_blank" rel="noopener noreferrer">Guitar Pro</a> 3–7 (.gp, .gp5, .gpx…) or
      MusicXML. Files stay in this browser.
    </span>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <details class="sources" open={!tabs.length}>
    <summary>Where to find tabs</summary>
    <div class="cols">
      <div>
        <h3>Tab files to download</h3>
        <ul>
          {#each FILE_SOURCES as src (src.url)}
            <li><a href={src.url} target="_blank" rel="noopener noreferrer">{src.name}</a> <span class="muted">— {src.note}</span></li>
          {/each}
        </ul>
      </div>
      <div>
        <h3>Write or convert tabs yourself</h3>
        <ul>
          {#each TOOLS as src (src.url)}
            <li><a href={src.url} target="_blank" rel="noopener noreferrer">{src.name}</a> <span class="muted">— {src.note}</span></li>
          {/each}
        </ul>
      </div>
    </div>
  </details>
  {#if tabs.length}
    <div class="row">
      {#each tabs as t (t.id)}
        <span class="tab-chip">
          <button class:selected={t.id === tabId} onclick={() => choose(t.id)}>{t.title}{t.artist ? ` — ${t.artist}` : ''}</button>
          <button class="remove" onclick={() => remove(t)} aria-label="Remove {t.title}">×</button>
        </span>
      {/each}
    </div>
  {/if}
</section>

{#if tab && track && selection}
  <section class="card stack">
    <label class="row">
      Track
      <select value={trackIndex} onchange={(e) => pickTrack(Number(e.currentTarget.value))}>
        {#each tab.tracks as tr, i (i)}
          <option value={i}>{tr.name} · {isBassTrack(tr) ? 'bass' : 'guitar'} · {tuningName(tr.tuning)}{tr.capo ? ` · capo ${tr.capo}` : ''}</option>
        {/each}
      </select>
    </label>

    {#if sections.length}
      <div class="row">
        <span>Sections</span>
        {#each sections as s, i (s.bar)}
          <button class="small-btn" class:selected={from === s.bar && to === (sections[i + 1]?.bar ?? track.bars.length) - 1} onclick={() => pickSection(i)}>{s.name}</button>
        {/each}
      </div>
    {/if}
    <div class="row">
      <label class="row tight">
        From
        <select bind:value={from} onchange={() => (to = Math.max(to, from))}>
          {#each track.bars as _, i (i)}<option value={i}>{barLabel(i)}</option>{/each}
        </select>
      </label>
      <label class="row tight">
        to
        <select bind:value={to} onchange={() => (from = Math.min(from, to))}>
          {#each track.bars as _, i (i)}<option value={i}>{barLabel(i)}</option>{/each}
        </select>
      </label>
    </div>

    {#if shift && shift.shift !== 0}
      <label class="row tight">
        <input type="checkbox" bind:checked={settings.tabAsStandard} />
        Play these frets in standard tuning (this track is in {tuningName(track.tuning)}; it will sound {Math.abs(shift.shift)} semitone{Math.abs(shift.shift) > 1 ? 's' : ''}
        {shift.shift < 0 ? 'higher' : 'lower'} than the record)
      </label>
    {:else if !shift}
      <p class="notice">This track is in <strong>{tuningName(track.tuning)}</strong>: tune your {isBassTrack(track) ? 'bass' : 'guitar'} like this to play it.</p>
    {/if}
    {#if track.capo}
      <p class="muted small">Written with a capo on fret {track.capo}; positions are shown without a capo (capo fret added).</p>
    {/if}

    <div class="notes">
      {#each selection.sequence.slice(0, 64) as id, i (i)}
        {@const n = noteLabel(id)}
        <span class="chip" class:known={levels.get(id) === 'name'}>{n.name}<sub>{n.where}</sub></span>
      {/each}
      {#if selection.sequence.length > 64}<span class="muted">+{selection.sequence.length - 64} more</span>{/if}
    </div>
    <p class="muted small">
      {selection.sequence.length} notes, {selection.items.length} different positions{selection.skippedChords
        ? `; ${selection.skippedChords} chords / double stops left out`
        : ''}. Notes repeated right away are played once.
    </p>

    <div class="row">
      <button class="primary" disabled={selection.sequence.length < 2 || selection.items.length < 2} onclick={() => onstart(selection, `${tab.title} — ${track.name}`, false)}>
        Play through once
      </button>
      <button disabled={selection.sequence.length < 2 || selection.items.length < 2} onclick={() => onstart(selection, `${tab.title} — ${track.name}`, true)}>
        Loop for {settings.goalMinutes} min
      </button>
      {#if chords.length}
        <span class="spacer"></span>
        <button onclick={addChordsAsSong} disabled={songAdded}>{songAdded ? 'Added to Songs' : 'Add its chords to Songs'}</button>
      {/if}
    </div>
  </section>
{:else if !tabs.length}
  <p class="muted">
    No tabs yet. Import a Guitar Pro file to practise a riff, solo or bass line note by note: pick a track and a few bars,
    and the app walks you through them in order.
  </p>
{/if}

<style>
  .stack {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .tight {
    gap: 0.4rem;
  }
  .spacer {
    flex: 1;
  }
  .small {
    margin: 0;
    font-size: 0.9rem;
  }
  .error {
    color: var(--bad);
    margin: 0;
  }
  .sources summary {
    cursor: pointer;
    font-weight: 600;
  }
  .sources .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.5rem 1.5rem;
    margin-top: 0.5rem;
  }
  .sources h3 {
    font-size: 0.9rem;
    margin: 0.25rem 0;
  }
  .sources ul {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.3rem;
    font-size: 0.9rem;
  }
  .notice {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .file input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .file .button {
    display: inline-block;
    padding: 0.45em 1em;
    border-radius: 8px;
    cursor: pointer;
  }
  .file .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-family: var(--font-display);
    font-weight: 800;
  }
  .file:focus-within .button {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .tab-chip {
    display: inline-flex;
  }
  .tab-chip button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .remove {
    border-left: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    color: var(--muted);
  }
  .small-btn {
    padding: 0.25em 0.75em;
    font-size: 0.9rem;
  }
  select {
    max-width: 100%;
  }
  .notes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .chip {
    background: var(--surface-2);
    border-radius: 999px;
    padding: 0.15em 0.6em;
    font-size: 0.9rem;
  }
  .chip.known {
    outline: 1px solid var(--warn);
  }
  .chip sub {
    color: var(--muted);
    font-size: 0.7em;
    margin-left: 0.15em;
  }
</style>
