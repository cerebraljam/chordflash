<script lang="ts">
  import { tick } from 'svelte';
  import ChordDiagram from '../../components/ChordDiagram.svelte';
  import { OPEN_CHORDS, chordById, chordName } from '../../music/chords';
  import { history } from '../../practice/history.svelte';
  import { hintLevels } from '../../practice/hints';
  import { addSong, allSongs, deleteSong, resetSong, saveSongText, songStore } from '../../songs/library.svelte';
  import {
    groupSections,
    mostAdjacent,
    parseProgression,
    progressionText,
    seriesOf,
    songChords,
    songDifficulty,
    type Song,
  } from '../../songs/songs';
  import { settings } from '../../settings.svelte';

  let {
    onstart,
    onmetronome,
    ondrill,
  }: {
    /** Practise the song's chords in order: once through, or looped for the session length. */
    onstart: (song: Song, loop: boolean) => void;
    /** Play the song's chords in order, changing on the beat. */
    onmetronome: (song: Song) => void;
    /** Two chords back and forth, to learn a new one. */
    ondrill: (from: string, to: string) => void;
  } = $props();

  const SORTS = [
    { id: 'easy', label: 'Easiest' },
    { id: 'hard', label: 'Hardest' },
    { id: 'fits', label: 'Fits me' },
    { id: 'title', label: 'A–Z' },
    { id: 'artist', label: 'Artist' },
  ] as const;
  const STAR = 'M12 2l3 7 7 .6-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6 9 9z';
  const STARTERS = OPEN_CHORDS.map((c) => c.id);
  /** Chords shown per section line before "+N more". */
  const SECTION_MAX = 16;

  let query = $state('');
  let game = $state('All');
  let selectedId = $state<string | null>(null);
  let editing = $state(false);
  let draft = $state('');
  let adding = $state(false);
  let newSong = $state({ title: '', artist: '', text: '' });
  let panel = $state<HTMLElement | null>(null);

  const name = (id: string) => chordName(chordById(id), settings.lang);

  let chordAttempts = $derived(history.of('chord'));
  let levels = $derived(hintLevels(chordAttempts));
  let played = $derived(new Set(chordAttempts.map((a) => a.to)));
  /** mastered (gold), learning (played or a starter chord), new (never played). */
  const chordState = (id: string) => (levels.get(id) === 'name' ? 'mastered' : played.has(id) || STARTERS.includes(id) ? 'learning' : 'new');

  let songs = $derived.by(() => {
    songStore.edits; // re-run when the player edits or adds songs
    songStore.added;
    return allSongs().map((song) => {
      const chords = songChords(song.sections, settings.simplifyChords);
      return {
        song,
        chords,
        difficulty: songDifficulty(song.sections, settings.simplifyChords),
        /** Chords not mastered yet: fewer = fits you better. */
        toLearn: chords.filter((c) => levels.get(c) !== 'name').length,
        stars: settings.songStars[song.id] ?? 0,
      };
    });
  });
  let games = $derived([
    'All',
    ...[...new Set(songs.flatMap((s) => s.song.games.map(seriesOf)))].sort(),
    ...(songStore.added.length ? ['My songs'] : []),
  ]);
  let shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = songs.filter(
      ({ song }) =>
        (game === 'All' || song.games.some((g) => seriesOf(g) === game) || (game === 'My songs' && song.source === 'user')) &&
        (!q || song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q)),
    );
    type Row = (typeof list)[0];
    const by: Record<(typeof SORTS)[number]['id'], (a: Row, b: Row) => number> = {
      easy: (a, b) => a.difficulty - b.difficulty,
      hard: (a, b) => b.difficulty - a.difficulty,
      fits: (a, b) => a.toLearn - b.toLearn || a.difficulty - b.difficulty,
      title: (a, b) => a.song.title.localeCompare(b.song.title),
      artist: (a, b) => a.song.artist.localeCompare(b.song.artist) || a.song.title.localeCompare(b.song.title),
    };
    return [...list].sort(by[settings.songSort]);
  });
  let selected = $derived(songs.find((s) => s.song.id === selectedId) ?? shown[0] ?? null);
  /** A never-played chord in the song, and the one it sits next to most: a good first drill. */
  let learn = $derived.by(() => {
    if (!selected) return null;
    const fresh = selected.chords.find((c) => chordState(c) === 'new');
    const partner = fresh ? mostAdjacent(selected.song.sections, fresh, settings.simplifyChords) : null;
    return fresh && partner ? { fresh, partner } : null;
  });

  async function select(id: string) {
    selectedId = id;
    editing = false;
    // On a phone the panel sits above the list: bring it into view.
    if (window.innerWidth < 960) {
      await tick();
      panel?.scrollIntoView({ block: 'start' });
    }
  }

  /**
   * Simplifying changes difficulties, so songs move in the list: keep the song
   * in the panel selected (it may have been shown only as the first of the
   * list) and scroll the list to where it went.
   */
  async function setSimplify(on: boolean) {
    if (selected) selectedId = selected.song.id;
    settings.simplifyChords = on;
    await tick();
    document.querySelector('.song.current')?.scrollIntoView({ block: 'nearest' });
  }

  function startEdit(song: Song) {
    editing = true;
    draft = progressionText(song.sections);
  }

  function saveEdit(song: Song) {
    saveSongText(song, draft);
    editing = false;
  }

  function practiseChords(chords: string[]) {
    settings.practiceChords = chords;
    settings.practiceMode = 'chord';
  }

  function saveNew() {
    if (!newSong.title.trim() || !parseProgression(newSong.text).length) return;
    selectedId = addSong(newSong.title.trim(), newSong.artist.trim() || 'Unknown', newSong.text);
    game = 'My songs';
    adding = false;
    newSong = { title: '', artist: '', text: '' };
  }

  /** 0–10 difficulty as 5 pips. */
  const pips = (d: number) => Math.max(1, Math.round(d / 2));
  const pipTone = (d: number) => (d >= 6 ? 'bad' : d >= 4 ? 'warn' : 'good');
</script>

<div class="filters">
  <div class="row">
    <label class="search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>
      <span class="sr">Search songs</span>
      <input type="search" placeholder="Title or artist" bind:value={query} />
    </label>
    <span class="muted count">{shown.length} song{shown.length === 1 ? '' : 's'}</span>
    <span class="spacer"></span>
    <button onclick={() => (adding = !adding)}>{adding ? 'Cancel' : 'Add a song'}</button>
  </div>
  <div class="row">
    {#each games as g (g)}
      <button class="chip" aria-pressed={game === g} class:selected={game === g} onclick={() => (game = g)}>{g}</button>
    {/each}
  </div>
  <div class="row">
    <div class="segmented" role="group" aria-label="Sort">
      {#each SORTS as s (s.id)}
        <button aria-pressed={settings.songSort === s.id} class:on={settings.songSort === s.id} onclick={() => (settings.songSort = s.id)}>{s.label}</button>
      {/each}
    </div>
    <label class="row tight simplify">
      <input type="checkbox" checked={settings.simplifyChords} onchange={(e) => setSimplify(e.currentTarget.checked)} />
      Simplify chords (Cmaj7 → C, G/B → G)
    </label>
  </div>
  {#if adding}
    <div class="card add">
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
</div>

<div class="body">
  <ul class="list">
    {#each shown as { song, chords, difficulty, stars } (song.id)}
      <li>
        <button class="song" class:current={selected?.song.id === song.id} aria-current={selected?.song.id === song.id} onclick={() => select(song.id)}>
          <span class="diff">
            <span class="mono">{difficulty.toFixed(1)}</span>
            <span class="pips" aria-label="difficulty {difficulty.toFixed(1)} of 10">
              {#each [1, 2, 3, 4, 5] as p (p)}<span class:on={p <= pips(difficulty)} class={pipTone(difficulty)}></span>{/each}
            </span>
          </span>
          <span class="who">
            <strong>{song.title}</strong>
            <span class="muted">{song.artist}{song.year ? ` · ${song.year}` : ''}</span>
          </span>
          <span class="chords">
            {#each chords.slice(0, 6) as c (c)}
              <span class="tag {chordState(c)}">{name(c)}</span>
            {/each}
            {#if chords.length > 6}<span class="muted">+{chords.length - 6}</span>{/if}
          </span>
          <span class="stars" aria-label={stars ? `${stars} of 3 stars` : 'not cleared yet'}>
            {#if stars}
              {#each [1, 2, 3] as n (n)}
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  {#if n <= stars}<path d={STAR} fill="var(--accent)"></path>{:else}<path d={STAR} fill="none" stroke="var(--border-strong)" stroke-width="1.6"></path>{/if}
                </svg>
              {/each}
            {/if}
          </span>
        </button>
      </li>
    {/each}
    {#if !shown.length}<li class="muted empty">No song matches.</li>{/if}
  </ul>

  {#if selected}
    {@const song = selected.song}
    <aside class="card panel" bind:this={panel} aria-label="Selected song">
      <div class="head">
        <span class="mono eyebrow">{(song.games.join(' · ') || 'YOUR SONG').toUpperCase()}{song.year ? ` · ${song.year}` : ''}</span>
        <h2>{song.title}</h2>
        <span class="muted">{song.artist}</span>
        {#if song.tuning}<span class="muted small">Tuned {song.tuning} in Rocksmith; chords shown for standard tuning.</span>{/if}
      </div>

      <div class="actions">
        <button class="primary play" onclick={() => onstart(song, false)} disabled={selected.chords.length < 2}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"></path></svg>
          Play through
        </button>
        <button class="rhythm play" onclick={() => onmetronome(song)} disabled={!selected.chords.length}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21l3-18h2l3 18z"></path><path d="M12 13l5-7"></path></svg>
          With rhythm
        </button>
        {#if learn}
          <button onclick={() => ondrill(learn.fresh, learn.partner)}>Drill {name(learn.fresh)} ↔ {name(learn.partner)}</button>
        {/if}
        <button onclick={() => onstart(song, true)} disabled={selected.chords.length < 2}>Loop {settings.goalMinutes} min</button>
        <button onclick={() => practiseChords(selected.chords)} disabled={selected.chords.length < 2}>Practise these chords</button>
      </div>

      {#if learn}
        <p class="learn">
          <strong>{name(learn.fresh)}</strong> is new: learn it with a two-chord drill first ({name(learn.fresh)} ↔ {name(learn.partner)}).
        </p>
      {/if}

      {#if selected.chords.length < 2}
        {@const full = songChords(song.sections, false)}
        <p class="learn">
          {#if settings.simplifyChords && full.length > 1}
            Simplified, this song is just <strong>{name(selected.chords[0])}</strong>, so there's no chord change to practise.
            Keep its bass moves ({full.map(name).join(', ')}) or play it with rhythm.
          {:else}
            This song is just one chord: no change to practise. Play it with rhythm to keep it going on the beat.
          {/if}
        </p>
        {#if settings.simplifyChords && full.length > 1}
          <div><button onclick={() => setSimplify(false)}>Keep the bass moves</button></div>
        {/if}
      {/if}

      <div class="cards">
        {#each selected.chords as c (c)}
          {@const st = chordState(c)}
          {@const v = chordById(c)}
          <figure class="chord-card {st}" title={st === 'mastered' ? 'mastered' : st === 'new' ? 'never played' : 'learning'}>
            <figcaption>
              <span class="display">{name(c)}</span>
              {#if st === 'mastered'}<svg width="12" height="12" viewBox="0 0 24 24" aria-label="mastered" role="img"><path d={STAR} fill="var(--accent)"></path></svg>{/if}
              {#if st === 'new'}<span class="new-tag mono">NEW</span>{/if}
            </figcaption>
            <ChordDiagram voicing={v} lang={settings.lang} width={84} />
            {#if v.playedAs}<span class="muted tiny">as {name(v.playedAs)}</span>{/if}
          </figure>
        {/each}
      </div>

      {#if editing}
        <textarea rows={Math.min(14, song.sections.length + 2)} bind:value={draft}></textarea>
        <div class="row">
          <button class="primary" onclick={() => saveEdit(song)} disabled={!parseProgression(draft).length}>Save chords</button>
          <button onclick={() => (editing = false)}>Cancel</button>
          {#if song.edited}<button onclick={() => { resetSong(song); editing = false; }}>Restore original</button>{/if}
        </div>
      {:else}
        <ol class="sections">
          {#each groupSections(song.sections, settings.simplifyChords) as g, i (i)}
            <li>
              <span class="sec muted">{g.name}{g.count > 1 ? ` ×${g.count}` : ''}</span>
              <span>{g.chords.slice(0, SECTION_MAX).map(name).join(' ')}{#if g.chords.length > SECTION_MAX}<span class="muted"> … +{g.chords.length - SECTION_MAX} more</span>{/if}</span>
            </li>
          {/each}
        </ol>
      {/if}


      <div class="row">
        {#if !editing}<button class="small-btn" onclick={() => startEdit(song)}>Edit chords</button>{/if}
        {#if song.source === 'user'}<button class="small-btn" onclick={() => deleteSong(song)}>Delete song</button>{/if}
      </div>

      {#if song.source === 'chordonomicon'}
        <p class="muted tiny">
          Chords{song.edited ? ' (edited by you)' : ''} from the
          <a href="https://huggingface.co/datasets/ailsntua/Chordonomicon" target="_blank" rel="noreferrer">Chordonomicon</a>
          dataset (CC BY-NC 4.0), written by the community: they may contain mistakes.
        </p>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .filters {
    display: grid;
    gap: 12px;
    margin-bottom: 20px;
  }
  .tight {
    gap: 0.4rem;
  }
  .spacer {
    flex: 1;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 1 360px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0 14px;
    min-height: 44px;
    color: var(--muted);
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--text);
    outline: none;
  }
  .count {
    font-size: 0.9rem;
  }
  .chip {
    border-radius: 999px;
    min-height: 36px;
    padding: 0 14px;
    font-weight: 500;
  }
  .chip.selected {
    font-weight: 700;
  }
  .segmented {
    display: flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 3px;
  }
  .segmented button {
    min-height: 34px;
    border: none;
    background: transparent;
    color: var(--muted);
    border-radius: 9px;
    padding: 0 12px;
  }
  .segmented button.on {
    background: var(--border);
    color: var(--text);
  }
  .simplify {
    font-size: 0.9rem;
  }
  .add {
    display: grid;
    gap: 10px;
  }
  .add input:not([type]) {
    flex: 1;
    min-width: 8rem;
  }
  textarea {
    width: 100%;
    font-family: var(--font-mono);
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
  .body {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
  }
  .list {
    flex: 999 1 560px;
    min-width: 0;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel {
    flex: 1 1 420px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
  }
  @media (max-width: 960px) {
    .panel {
      order: -1;
      position: static;
      max-height: none;
    }
  }
  .song {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 12px 16px;
    font-weight: 400;
  }
  .song.current {
    background: var(--accent-soft);
    border: 2px solid var(--accent);
    padding: 11px 15px;
  }
  .diff {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 52px;
    font-weight: 700;
  }
  .pips {
    display: flex;
    gap: 2px;
  }
  .pips span {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--border);
  }
  .pips span.on.good {
    background: var(--good);
  }
  .pips span.on.warn {
    background: var(--warn);
  }
  .pips span.on.bad {
    background: var(--bad);
  }
  .who {
    flex: 1 1 200px;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .who strong {
    font-size: 1.05rem;
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
    gap: 5px;
  }
  .tag {
    padding: 2px 9px;
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    font-weight: 700;
    font-size: 0.85rem;
  }
  .tag.mastered {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .tag.new {
    border-style: dashed;
    border-color: #5a6178;
  }
  .stars {
    display: flex;
    gap: 2px;
    width: 52px;
    justify-content: flex-end;
  }
  .empty {
    padding: 1rem;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 1.5px;
    color: var(--muted);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .head h2 {
    margin: 0;
    font-size: 1.9rem;
    line-height: 1.05;
  }
  .small-btn {
    min-height: 34px;
    font-size: 0.9rem;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 8px;
  }
  .chord-card {
    margin: 0;
    padding: 6px 4px 4px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 2px solid var(--border-strong);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .chord-card.mastered {
    border-color: var(--accent);
  }
  .chord-card.new {
    border-style: dashed;
    border-color: #5a6178;
  }
  .chord-card figcaption {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 1.15rem;
  }
  .new-tag {
    font-size: 9px;
    font-weight: 700;
    color: var(--good-ink);
    background: var(--good);
    border-radius: 3px;
    padding: 0 3px;
  }
  .sections {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    font-size: 0.95rem;
  }
  .sections li {
    display: flex;
    gap: 12px;
  }
  .sec {
    flex: none;
    width: 6.5rem;
  }
  .learn {
    margin: 0;
    background: var(--surface-2);
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .play {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 1.1rem;
  }
</style>
