<script lang="ts">
  import ChordDiagram from '../../components/ChordDiagram.svelte';
  import { chordById, chordId, chordName } from '../../music/chords';
  import type { HintLevel } from '../../practice/hints';
  import { addSong, allSongs, deleteSong, resetSong, saveSongText, songStore } from '../../songs/library.svelte';
  import { parseProgression, progressionText, songChords, songDifficulty, type Song } from '../../songs/songs';
  import { settings } from '../../settings.svelte';

  let {
    levels,
    onstart,
    onmetronome,
  }: {
    levels: Map<string, HintLevel>;
    /** Practise the song's chords in order: once through, or looped for the session length. */
    onstart: (song: Song, loop: boolean) => void;
    /** Play the song's chords in order, changing on the beat. */
    onmetronome: (song: Song) => void;
  } = $props();

  let query = $state('');
  let game = $state('All');
  let openId = $state<string | null>(null);
  let editing = $state<string | null>(null);
  let draft = $state('');
  let adding = $state(false);
  let newSong = $state({ title: '', artist: '', text: '' });

  const name = (id: string) => chordName(chordById(id), settings.lang);

  let songs = $derived.by(() => {
    songStore.edits; // re-run when the player edits or adds songs
    songStore.added;
    return allSongs().map((song) => ({
      song,
      chords: songChords(song.sections, settings.simplifyChords),
      difficulty: songDifficulty(song.sections, settings.simplifyChords),
    }));
  });
  let games = $derived([
    'All',
    ...[...new Set(songs.flatMap((s) => s.song.games))].sort(),
    ...(songStore.added.length ? ['My songs'] : []),
  ]);
  let shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = songs.filter(
      ({ song }) =>
        (game === 'All' || song.games.includes(game) || (game === 'My songs' && song.source === 'user')) &&
        (!q || song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q)),
    );
    const by = {
      easy: (a: (typeof list)[0], b: (typeof list)[0]) => a.difficulty - b.difficulty,
      hard: (a: (typeof list)[0], b: (typeof list)[0]) => b.difficulty - a.difficulty,
      title: (a: (typeof list)[0], b: (typeof list)[0]) => a.song.title.localeCompare(b.song.title),
      artist: (a: (typeof list)[0], b: (typeof list)[0]) => a.song.artist.localeCompare(b.song.artist) || a.song.title.localeCompare(b.song.title),
    }[settings.songSort];
    return [...list].sort(by);
  });

  const known = (chords: string[]) => chords.filter((c) => levels.get(c) === 'name').length;

  function toggle(id: string) {
    openId = openId === id ? null : id;
    editing = null;
  }

  function startEdit(song: Song) {
    editing = song.id;
    draft = progressionText(song.sections);
  }

  function saveEdit(song: Song) {
    saveSongText(song, draft);
    editing = null;
  }

  function practiseChords(chords: string[]) {
    settings.practiceChords = chords;
    settings.practiceMode = 'chord';
  }

  function saveNew() {
    if (!newSong.title.trim() || !parseProgression(newSong.text).length) return;
    openId = addSong(newSong.title.trim(), newSong.artist.trim() || 'Unknown', newSong.text);
    game = 'My songs';
    adding = false;
    newSong = { title: '', artist: '', text: '' };
  }
</script>

<section class="card stack">
  <div class="row">
    <input class="search" type="search" placeholder="Search title or artist" bind:value={query} aria-label="Search songs" />
    <label class="row tight">
      Sort
      <select bind:value={settings.songSort}>
        <option value="easy">Easiest first</option>
        <option value="hard">Hardest first</option>
        <option value="title">Title</option>
        <option value="artist">Artist</option>
      </select>
    </label>
  </div>
  <div class="row">
    {#each games as g (g)}
      <button class="chip-btn" class:selected={game === g} onclick={() => (game = g)}>{g}</button>
    {/each}
  </div>
  <div class="row">
    <label class="row tight">
      <input type="checkbox" bind:checked={settings.simplifyChords} />
      Simplify chords (Cmaj7 → C, G/B → G)
    </label>
    <span class="spacer"></span>
    <button onclick={() => (adding = !adding)}>{adding ? 'Cancel' : 'Add a song'}</button>
  </div>
  {#if adding}
    <div class="add stack">
      <div class="row">
        <input placeholder="Title" bind:value={newSong.title} />
        <input placeholder="Artist" bind:value={newSong.artist} />
      </div>
      <textarea rows="4" placeholder={'Verse: G D Em C\nChorus: C G D'} bind:value={newSong.text}></textarea>
      <div class="row">
        <button class="primary" onclick={saveNew} disabled={!newSong.title.trim() || !parseProgression(newSong.text).length}>Save song</button>
        <span class="muted small">One section per line. Chords like G, Em, F#m7, Bb, G/B.</span>
      </div>
    </div>
  {/if}
  <p class="muted small">{shown.length} song{shown.length === 1 ? '' : 's'}</p>
</section>

{#if !songs.length}
  <p class="muted">No songs yet.</p>
{/if}

<ul class="songs">
  {#each shown as { song, chords, difficulty } (song.id)}
    <li class="card song" class:open={openId === song.id}>
      <button class="summary" onclick={() => toggle(song.id)} aria-expanded={openId === song.id}>
        <span class="diff" title="Difficulty, 0–10">{difficulty.toFixed(1)}</span>
        <span class="who">
          <strong>{song.title}</strong>
          <span class="muted">{song.artist}{song.year ? ` · ${song.year}` : ''}</span>
        </span>
        <span class="chords">
          {#each chords.slice(0, 8) as c (c)}
            <span class="chord" class:known={levels.get(c) === 'name'}>{name(c)}</span>
          {/each}
          {#if chords.length > 8}<span class="muted">+{chords.length - 8}</span>{/if}
        </span>
      </button>

      {#if openId === song.id}
        <div class="detail stack">
          <p class="muted small">
            {song.games.join(' · ') || 'Your song'}
            {#if song.tuning}· <strong>tuned {song.tuning}</strong> in Rocksmith; chords shown for standard tuning{/if}
            · {known(chords)}/{chords.length} chords known
          </p>
          <div class="diagrams">
            {#each chords as c (c)}
              {@const v = chordById(c)}
              <figure>
                <figcaption>{name(c)}{#if levels.get(c) === 'name'} <span class="star">★</span>{/if}</figcaption>
                <ChordDiagram voicing={v} lang={settings.lang} width={104} />
                {#if v.playedAs}<span class="muted tiny">played as {name(v.playedAs)}</span>{/if}
              </figure>
            {/each}
          </div>

          {#if editing === song.id}
            <textarea rows={Math.min(14, song.sections.length + 2)} bind:value={draft}></textarea>
            <div class="row">
              <button class="primary" onclick={() => saveEdit(song)} disabled={!parseProgression(draft).length}>Save chords</button>
              <button onclick={() => (editing = null)}>Cancel</button>
              {#if song.edited}<button onclick={() => { resetSong(song); editing = null; }}>Restore original</button>{/if}
            </div>
          {:else}
            <ol class="sections">
              {#each song.sections as s, i (i)}
                <li><span class="sec">{s.name}</span> {s.chords.map((c) => name(chordId(c, settings.simplifyChords) ?? c)).join('  ')}</li>
              {/each}
            </ol>
          {/if}

          <div class="row">
            <button class="primary" onclick={() => onstart(song, false)} disabled={chords.length < 2}>Play through once</button>
            <button onclick={() => onstart(song, true)} disabled={chords.length < 2}>Loop for {settings.goalMinutes} min</button>
            <button onclick={() => onmetronome(song)} disabled={chords.length < 2}>Metronome</button>
            <button onclick={() => practiseChords(chords)} disabled={chords.length < 2}>Practise these chords</button>
            <span class="spacer"></span>
            {#if editing !== song.id}<button onclick={() => startEdit(song)}>Edit chords</button>{/if}
            {#if song.source === 'user'}<button onclick={() => deleteSong(song)}>Delete</button>{/if}
          </div>
          {#if song.source === 'chordonomicon'}
            <p class="muted tiny">
              Chords{song.edited ? ' (edited by you)' : ''} from the
              <a href="https://huggingface.co/datasets/ailsntua/Chordonomicon" target="_blank" rel="noreferrer">Chordonomicon</a>
              dataset (CC BY-NC 4.0), written by the community: they may contain mistakes, fix them with "Edit chords".
            </p>
          {/if}
        </div>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .stack {
    display: grid;
    gap: 0.75rem;
  }
  section.stack {
    margin-bottom: 1rem;
  }
  .tight {
    gap: 0.4rem;
  }
  .spacer {
    flex: 1;
  }
  .search {
    flex: 1;
    min-width: 12rem;
  }
  input[type='search'],
  input:not([type]),
  textarea {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.45em 0.7em;
    width: 100%;
  }
  .row input:not([type]) {
    flex: 1;
    width: auto;
    min-width: 8rem;
  }
  textarea {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.9rem;
  }
  .chip-btn {
    padding: 0.25em 0.75em;
    font-size: 0.9rem;
  }
  .small {
    margin: 0;
    font-size: 0.9rem;
  }
  .tiny {
    margin: 0;
    font-size: 0.8rem;
  }
  .songs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .song {
    padding: 0;
  }
  .summary {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.9rem;
    align-items: center;
    text-align: left;
    background: none;
    border: none;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
  }
  .diff {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    min-width: 2.4rem;
    text-align: center;
    padding: 0.2em 0.4em;
    border-radius: 6px;
    background: var(--surface-2);
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .who strong,
  .who span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chords {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    justify-content: flex-end;
    max-width: 22rem;
  }
  .chord {
    font-size: 0.8rem;
    padding: 0.1em 0.45em;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .chord.known {
    outline: 1px solid var(--warn);
  }
  .detail {
    padding: 0 1rem 1rem;
  }
  .diagrams {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  figure {
    margin: 0;
    display: grid;
    justify-items: center;
  }
  figcaption {
    font-weight: 600;
  }
  .star {
    color: var(--warn);
  }
  .sections {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
    font-size: 0.95rem;
  }
  .sec {
    display: inline-block;
    min-width: 7rem;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .summary {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .chords {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }
</style>
