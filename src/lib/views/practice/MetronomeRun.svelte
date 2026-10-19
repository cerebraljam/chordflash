<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { shortcuts } from '../../keys';
  import { scheduleClick } from '../../audio/click';
  import { scoreChord } from '../../audio/chordScore';
  import { engine } from '../../audio/engine';
  import { StrumListener } from '../../audio/strumListener';
  import ChordDiagram from '../../components/ChordDiagram.svelte';
  import { chordById, chordName } from '../../music/chords';
  import { hintLevels } from '../../practice/hints';
  import { MAX_BPM, MIN_BPM, grade, nextBpm, planRound, roundScore, slotAt, tapTempo, type Grade, type Round } from '../../practice/metronome';
  import type { Attempt } from '../../practice/types';
  import { references, settings } from '../../settings.svelte';
  import type { ChartChord } from '../../songs/songs';

  let {
    key,
    title,
    next,
    chart,
    history,
    backLabel,
    onexit,
  }: {
    /** Identifies the chord set or song, to remember its tempo. */
    key: string;
    title: string;
    /** Chord set: next chord to play after `from`, in the practice order. */
    next?: (from: string | null) => string;
    /** Song: the whole song as written, played once through (no rounds, no tempo changes). */
    chart?: ChartChord[];
    history: Attempt[];
    /** Where "← …" goes back to: "Backstage", "Chord drills", "Setlist". */
    backLabel: string;
    onexit: () => void;
  } = $props();

  /** Chords per round; between rounds a rest bar shows the result and the new tempo. */
  const ROUND = 8;
  const STEP = 5;

  let phase = $state<'ready' | 'playing' | 'done'>('ready');
  /** Start where the last session on this chord set / song ended (read once: a new set mounts a new view). */
  const savedTempo = () => settings.metroTempos[key]?.last ?? 60;
  let bpm = $state(savedTempo());
  let round = $state.raw<Round | null>(null);
  /** The round before, kept on the lane so the last chords stay visible during the rest bar. */
  let prevRound = $state.raw<Round | null>(null);
  /** Lane time origin (audio clock): the first round's count-in. */
  let origin = $state(0);
  let laneWidth = $state(1000);
  let rounds = $state.raw<{ bpm: number; score: number; grades: { chord: string; grade: Grade }[] }[]>([]);
  let message = $state('');
  /** Bumped when a slot gets a hit, so the view refreshes. */
  let version = $state(0);
  /** Song: played to the last chord. */
  let complete = $state(false);
  let now = $state(0);

  /** Song: where to start (index in the chart), the part being played, and tapped beats. */
  let startAt = $state(0);
  let part = $state.raw<ChartChord[]>([]);
  let taps: number[] = [];
  /** First chord of each section, to start from. */
  let sectionStarts = $derived((chart ?? []).flatMap((c, i, all) => (i === 0 || all[i - 1].section !== c.section ? [{ name: c.section, index: i }] : [])));

  let levels = $derived(hintLevels(history));
  let best = $derived(settings.metroTempos[key]?.best ?? null);

  let clicks: OscillatorNode[] = [];
  let listener: StrumListener | null = null;
  let frame = 0;
  let last: string | null = null;

  /** Where we are, in heard time (clicks reach the ears outputLatency after being scheduled). */
  let position = $derived.by(() => {
    version;
    if (!round) return null;
    const leadBeat = 60 / round.bpm;
    if (now < round.slots[0].start) {
      const beat = Math.floor((now - round.leadIn.start) / leadBeat);
      return { kind: 'lead' as const, beat: Math.max(0, beat), beats: round.leadIn.beats };
    }
    const slot = round.slots.find((s) => now >= s.start && now < s.start + s.beats * s.beat) ?? round.slots[round.slots.length - 1];
    return { kind: 'chord' as const, slot, beat: Math.min(slot.beats - 1, Math.floor((now - slot.start) / slot.beat)) };
  });
  let current = $derived(position?.kind === 'chord' ? position.slot : round?.slots[0] ?? null);
  let upcoming = $derived.by(() => {
    if (!round || !current) return null;
    return round.slots[current.index + 1]?.chord ?? null;
  });
  /** Song: the next few chords, like reading ahead on a chord sheet. */
  let ahead = $derived(round && current ? round.slots.slice(current.index + 1, current.index + 5).map((s) => s.chord) : []);
  const sectionOf = (index: number) => part[index]?.section ?? '';
  /** Song: the current section's line of up to 8 chords (the strip under the lane). */
  let line = $derived.by(() => {
    if (!chart || !round || !current) return [];
    let first = current.index;
    while (first > 0 && sectionOf(first - 1) === sectionOf(current.index)) first--;
    const from = first + Math.floor((current.index - first) / 8) * 8;
    return round.slots.slice(from, from + 8).filter((s) => sectionOf(s.index) === sectionOf(current.index));
  });
  let showDiagram = $derived(current !== null && levels.get(current.chord) !== 'name');

  const name = (id: string) => chordName(chordById(id), settings.lang);

  /** Lane scale: time, not beats, so blocks get shorter as the tempo goes up. */
  const PX_PER_SEC = 90;
  let nowX = $derived(Math.round(laneWidth * 0.22));
  /** A song can have hundreds of chords: only those near the now line are drawn. */
  let laneSlots = $derived(
    chart
      ? (round?.slots ?? []).filter((s) => s.start + s.beats * s.beat > now - 8 && s.start < now + 16)
      : [...(prevRound?.slots ?? []), ...(round?.slots ?? [])],
  );
  let shift = $derived(nowX - (now - origin) * PX_PER_SEC);
  /** This round so far: chords whose slot is over, and how many of those were on time. */
  let roundSoFar = $derived.by(() => {
    version;
    const over = round ? round.slots.filter((s) => s.start + s.beats * s.beat <= now || s.hitAt !== null) : [];
    return { over: over.length, onTime: over.filter((s) => grade(s) === 'onTime').length };
  });
  const laneGrade = (s: Round['slots'][number]) => (s.hitAt !== null ? grade(s) : s.start + s.beats * s.beat < now ? 'missed' : null);

  /** Clicks still to schedule (a song can be hundreds of bars: they're scheduled a little ahead, not all at once). */
  let beatQueue: { t: number; accent: boolean }[] = [];
  const LOOKAHEAD = 1.5;

  function scheduleRound(r: Round) {
    for (let b = 0; b < r.leadIn.beats; b++) beatQueue.push({ t: r.leadIn.start + b * (60 / r.bpm), accent: b === 0 });
    for (const s of r.slots) for (let b = 0; b < s.beats; b++) beatQueue.push({ t: s.start + b * s.beat, accent: b === 0 });
    pumpClicks();
  }

  function pumpClicks() {
    const ctx = engine.context!;
    while (beatQueue.length && beatQueue[0].t < ctx.currentTime + LOOKAHEAD) {
      const { t, accent } = beatQueue.shift()!;
      clicks.push(scheduleClick(ctx, t, accent, settings.metroVolume));
    }
    // Older clicks have played: keep only the ones that may still be pending.
    if (clicks.length > 32) clicks = clicks.slice(-32);
  }

  function makeRound(tempo: number, start: number): Round {
    if (chart) {
      part = chart.slice(startAt);
      return planRound(part.map((c) => c.chord), tempo, settings.metroBeats, start);
    }
    const chords: string[] = [];
    for (let i = 0; i < ROUND; i++) chords.push((last = next!(last)));
    return planRound(chords, tempo, settings.metroBeats, start);
  }

  /** Tap along with the record to find the song's tempo. */
  function tap() {
    const t = performance.now() / 1000;
    // A pause of more than 2 s starts a new count.
    if (taps.length && t - taps[taps.length - 1] > 2) taps = [];
    taps.push(t);
    bpm = tapTempo(taps) ?? bpm;
  }

  function start() {
    const ctx = engine.context;
    if (!ctx) return;
    rounds = [];
    message = '';
    last = null;
    beatQueue = [];
    complete = false;
    phase = 'playing';
    prevRound = null;
    round = makeRound(bpm, ctx.currentTime + 0.3);
    origin = round.leadIn.start;
    scheduleRound(round);

    listener = new StrumListener(engine, settings.gateDb, (a, at) => {
      if (!round) return;
      // Line the strum up with the clicks as heard: undo input and output latency.
      const t = at - engine.roundTripLatency;
      const slot = slotAt(round, t);
      if (!slot || slot.hitAt !== null) return;
      const chord = chordById(slot.chord);
      const ref = references[chord.id];
      if (scoreChord(a, chord, ref ? Float64Array.from(ref) : undefined).score >= settings.threshold) {
        slot.hitAt = t;
        version++;
      }
    });
    listener.start();
    tick();
  }

  function tick() {
    const ctx = engine.context;
    if (!ctx || !round) return;
    now = ctx.currentTime - (ctx.outputLatency || 0);
    pumpClicks();
    // A song is one pass: done when its last chord is over.
    if (chart) {
      if (now >= round.end) return finish();
      frame = requestAnimationFrame(tick);
      return;
    }
    // Shortly before the round ends: score it and lay out the next one, rest bar first.
    if (ctx.currentTime >= round.end - 0.1) {
      const score = roundScore(round.slots);
      const tempo = settings.metroAuto ? nextBpm(round.bpm, score, STEP) : round.bpm;
      rounds = [...rounds, { bpm: round.bpm, score, grades: round.slots.map((s) => ({ chord: s.chord, grade: grade(s) })) }];
      const onTime = round.slots.filter((s) => grade(s) === 'onTime').length;
      const late = round.slots.filter((s) => grade(s) === 'late').length;
      const change = tempo > round.bpm ? ` · tempo up → ${tempo} BPM` : tempo < round.bpm ? ` · slowing down → ${tempo} BPM` : '';
      message = `Round ${rounds.length}: ${onTime}/${round.slots.length} on time${late ? `, ${late} late` : ''}${change}`;
      bpm = tempo;
      prevRound = round;
      round = makeRound(tempo, round.end);
      scheduleRound(round);
    }
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    listener?.stop();
    listener = null;
    for (const c of clicks) {
      try {
        c.stop();
      } catch {
        // Already finished.
      }
    }
    clicks = [];
    beatQueue = [];
    round = null;
  }

  function finish() {
    // A song is a single pass: keep the chords played so far, even when stopped early.
    if (chart && round) {
      const played = round.slots.filter((s) => s.start + s.beats * s.beat <= now || s.hitAt !== null);
      if (played.length) {
        complete = played.length === round.slots.length;
        rounds = [{ bpm: round.bpm, score: roundScore(played), grades: played.map((s) => ({ chord: s.chord, grade: grade(s) })) }];
      }
    }
    stop();
    // Best = fastest tempo of a round that would have moved the tempo up (a song: played to the end).
    const passed = rounds.filter((r) => r.score >= 0.8 && (!chart || complete)).map((r) => r.bpm);
    const prev = settings.metroTempos[key];
    const lastTempo = rounds.length ? rounds[rounds.length - 1].bpm : bpm;
    settings.metroTempos = {
      ...settings.metroTempos,
      [key]: { last: lastTempo, best: Math.max(prev?.best ?? 0, ...passed) },
    };
    bpm = lastTempo;
    phase = 'done';
  }

  onDestroy(stop);

  onMount(() =>
    shortcuts({
      Space: () => (phase === 'playing' ? undefined : start()),
      KeyT: () => (chart && phase === 'ready' ? tap() : undefined),
      Escape: () => (phase === 'playing' ? finish() : onexit()),
    }),
  );

  let summary = $derived.by(() => {
    const all = rounds.flatMap((r) => r.grades);
    const byChord = new Map<string, Record<Grade, number>>();
    for (const g of all) {
      const c = byChord.get(g.chord) ?? { onTime: 0, late: 0, missed: 0 };
      c[g.grade]++;
      byChord.set(g.chord, c);
    }
    return {
      chords: all.length,
      onTime: all.filter((g) => g.grade === 'onTime').length,
      startBpm: rounds[0]?.bpm ?? bpm,
      endBpm: rounds[rounds.length - 1]?.bpm ?? bpm,
      byChord: [...byChord].sort((a, b) => b[1].missed + b[1].late - (a[1].missed + a[1].late)),
    };
  });
</script>

<div class="top row">
  {#if phase !== 'playing'}<button class="back" onclick={onexit}>← {backLabel}</button>{/if}
  <h2>{chart ? 'Rhythm' : 'Chord drills with rhythm'}</h2>
  <span class="title">{title}</span>
  <span class="spacer"></span>
  {#if phase === 'playing' && chart && round}
    <div class="meter-box">
      <div class="meter-top"><strong>{current && position?.kind === 'chord' ? sectionOf(current.index) : 'Count-in'}</strong><span class="mono muted">{roundSoFar.over} / {round.slots.length}</span></div>
      <div class="meter"><div class="meter-fill progress" style:width="{(roundSoFar.over / round.slots.length) * 100}%"></div></div>
      <span class="muted tiny">{roundSoFar.onTime} on time</span>
    </div>
    <div class="bpm-box"><span class="display bpm-num">{round.bpm}</span><span class="mono tiny muted">BPM</span></div>
    <button onclick={finish}>Stop <kbd>Esc</kbd></button>
  {:else if phase === 'playing'}
    <div class="meter-box">
      <div class="meter-top"><strong>Round {rounds.length + 1}</strong><span class="mono muted">{roundSoFar.onTime} / {roundSoFar.over} on time</span></div>
      <div class="meter"><div class="meter-fill" style:width="{roundSoFar.over ? (roundSoFar.onTime / roundSoFar.over) * 100 : 0}%"></div><span class="meter-target"></span></div>
      <span class="muted tiny">{settings.metroAuto ? '80% → tempo up' : 'fixed tempo'}</span>
    </div>
    <div class="bpm-box"><span class="display bpm-num">{round?.bpm ?? bpm}</span><span class="mono tiny muted">BPM</span></div>
    <button onclick={finish}>Stop <kbd>Esc</kbd></button>
  {/if}
</div>

{#if phase === 'ready' && chart}
  <section class="card stack">
    <p class="small intro">
      The whole song once through, in its written order. Each chord lasts {settings.metroBeats === 4 ? 'one bar' : `${settings.metroBeats} beats`};
      the same chord twice means strum it again. The chord sheets have no timing, so this is an approximation: listen to
      the record for how it's really played.
    </p>
    <label class="row">
      Tempo
      <input type="range" min={MIN_BPM} max={MAX_BPM} step="1" bind:value={bpm} />
      <strong class="num">{bpm} BPM</strong>
      <button onclick={tap} title="Tap along with the record (or press T)">Tap the beat <kbd>T</kbd></button>
    </label>
    <div class="row">
      <span>Each chord lasts</span>
      {#each [2, 4, 8] as b (b)}
        <button class:selected={settings.metroBeats === b} onclick={() => (settings.metroBeats = b)}>{b} beats</button>
      {/each}
    </div>
    {#if sectionStarts.length > 1}
      <label class="row">
        Start at
        <select bind:value={startAt}>
          {#each sectionStarts as sec (sec.index)}
            <option value={sec.index}>{sec.index === 0 ? `${sec.name} (whole song)` : sec.name}</option>
          {/each}
        </select>
        <span class="muted small">{chart.length - startAt} chords · about {Math.ceil(((chart.length - startAt) * settings.metroBeats * 60) / bpm / 60)} min</span>
      </label>
    {/if}
    <label class="row">
      Click volume
      <input type="range" min="0.05" max="1" step="0.05" bind:value={settings.metroVolume} />
    </label>
    <p class="muted small">
      {#if best}Your best here: {best} BPM. {/if}A bar of clicks counts you in. A chord is on time when you strum it right
      within its first beat. Using a microphone instead of the cable? Wear headphones, or the clicks may be heard as strums.
    </p>
    <div><button class="primary big" onclick={start} disabled={!engine.context}>Start <kbd>SPACE</kbd></button></div>
  </section>
{:else if phase === 'ready'}
  <section class="card stack">
    <p class="small intro">
      Your chord drill set ({title}), one chord every {settings.metroBeats} beats, in drill order: the changes you're
      slowest at come up more often. Change the chords in Chord drills.
    </p>
    <label class="row">
      Tempo
      <input type="range" min={MIN_BPM} max={MAX_BPM} step="5" bind:value={bpm} />
      <strong class="num">{bpm} BPM</strong>
    </label>
    <div class="row">
      <span>Chord changes every</span>
      {#each [2, 4, 8] as b (b)}
        <button class:selected={settings.metroBeats === b} onclick={() => (settings.metroBeats = b)}>{b} beats</button>
      {/each}
    </div>
    <label class="row">
      <input type="checkbox" bind:checked={settings.metroAuto} />
      Adjust the tempo after each round of {ROUND} chords (+{STEP} BPM at 80% on time, −{STEP} below 50%)
    </label>
    <label class="row">
      Click volume
      <input type="range" min="0.05" max="1" step="0.05" bind:value={settings.metroVolume} />
    </label>
    <p class="muted small">
      {#if best}Your best here: {best} BPM. {/if}A bar of clicks counts you in. A chord is on time when you strum it right
      within its first beat. Using a microphone instead of the cable? Wear headphones, or the clicks may be heard as strums.
    </p>
    <div><button class="primary big" onclick={start} disabled={!engine.context}>Start <kbd>SPACE</kbd></button></div>
  </section>
{:else if phase === 'playing' && round && position}
  <section class="lane" bind:clientWidth={laneWidth} aria-label="Chord lane: chords move left to the now line">
    <div class="track" style:transform="translateX({shift}px)">
      {#each laneSlots as s (s.start)}
        {@const g = laneGrade(s)}
        <div
          class="block"
          class:current={s === current && position.kind === 'chord'}
          class:onTime={g === 'onTime'}
          class:late={g === 'late'}
          class:missed={g === 'missed'}
          style:left="{(s.start - origin) * PX_PER_SEC}px"
          style:width="{s.beats * s.beat * PX_PER_SEC - 6}px"
          style:--beat="{s.beat * PX_PER_SEC}px"
        >
          <span class="display block-name">{name(s.chord)}</span>
          {#if g}<span class="block-grade">{g === 'onTime' ? '✓ on time' : g === 'late' ? 'late' : '✗ missed'}</span>{/if}
        </div>
        {#if chart && (s.index === 0 || sectionOf(s.index - 1) !== sectionOf(s.index))}
          <span class="section-tag mono" style:left="{(s.start - origin) * PX_PER_SEC}px">{sectionOf(s.index).toUpperCase()}</span>
        {/if}
      {/each}
    </div>
    <span class="now" style:left="{nowX}px"></span>
    <span class="now-label mono" style:left="{nowX + 10}px">NOW</span>
    {#if position.kind === 'lead'}
      <div class="count-in">
        <span class="display count">{position.beats - position.beat}</span>
        <span class="muted">{rounds.length ? message : chart ? `Get ready: ${sectionOf(0)}` : 'Get ready…'}</span>
      </div>
    {/if}
  </section>

  <div class="below">
    <div class="card now-card">
      <span class="display now-name">{current ? name(current.chord) : ''}</span>
      <div class="now-side">
        {#if position.kind === 'chord'}
          <div class="beats" aria-label="Beat {position.beat + 1} of {current?.beats}">
            {#each Array(current?.beats ?? 0) as _, b (b)}
              <span class="dot" class:on={b === position.beat} class:first={b === 0}></span>
            {/each}
          </div>
        {/if}
        {#if chart}
          <span class="muted">
            Next:
            {#each ahead as c, i (i)}<strong class="next-name" class:soon={i > 0}>{name(c)}</strong>{' '}{/each}
            {#if !ahead.length}<strong class="next-name">end</strong>{/if}
          </span>
        {:else}
          <span class="muted">Next: <strong class="next-name">{upcoming ? name(upcoming) : 'rest'}</strong></span>
        {/if}
      </div>
      {#if showDiagram && current}
        <ChordDiagram voicing={chordById(current.chord)} lang={settings.lang} width={120} />
      {/if}
    </div>
    <div class="card strip-card">
      <span class="mono tiny muted">{chart ? (current ? sectionOf(current.index).toUpperCase() : '') : 'THIS ROUND'}</span>
      <div class="track-strip">
        {#each chart ? line : round.slots as s (s.index)}
          {@const g = laneGrade(s)}
          <span class="cell" class:current={s === current && position.kind === 'chord'} class:onTime={g === 'onTime'} class:late={g === 'late'} class:missed={g === 'missed'}>
            <span>{name(s.chord)}</span>
            {#if g}<span class="cell-grade">{g === 'onTime' ? 'ON TIME' : g === 'late' ? 'LATE' : 'MISSED'}</span>{/if}
          </span>
        {/each}
      </div>
    </div>
  </div>
{:else if phase === 'done'}
  <section class="card stack">
    <h2>{chart ? (complete ? 'Song done' : 'Stopped') : 'Session done'}</h2>
    {#if summary.chords}
      <div class="stats">
        {#if chart}
          <div><strong>{summary.startBpm}</strong><span class="muted">BPM</span></div>
          <div><strong>{Math.round((100 * summary.onTime) / summary.chords)}%</strong><span class="muted">on time</span></div>
          <div><strong>{summary.chords} / {part.length}</strong><span class="muted">chords played</span></div>
        {:else}
          <div><strong>{summary.startBpm} → {summary.endBpm}</strong><span class="muted">BPM</span></div>
          <div><strong>{Math.round((100 * summary.onTime) / summary.chords)}%</strong><span class="muted">on time</span></div>
          <div><strong>{rounds.length}</strong><span class="muted">rounds</span></div>
        {/if}
        {#if best}<div><strong>{best}</strong><span class="muted">best BPM here</span></div>{/if}
      </div>
      <table>
        <thead><tr><th>Chord</th><th>On time</th><th>Late</th><th>Missed</th></tr></thead>
        <tbody>
          {#each summary.byChord as [chord, c] (chord)}
            <tr><td>{name(chord)}</td><td>{c.onTime}</td><td>{c.late}</td><td class:bad={c.missed > 0}>{c.missed}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">{chart ? 'Stopped before the first chord.' : 'Stopped before the first round ended.'}</p>
    {/if}
    <div class="row">
      <button class="primary" onclick={start}>Again <kbd>SPACE</kbd></button>
      <button onclick={() => (phase = 'ready')}>Change tempo</button>
      <button onclick={onexit}>{backLabel}</button>
    </div>
  </section>
{/if}

<style>
  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    border: 1.5px solid currentColor;
    border-radius: 6px;
    padding: 1px 6px;
    margin-left: 6px;
  }
  .tiny {
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  .meter-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 6px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 200px;
  }
  .meter-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.85rem;
  }
  .meter {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: var(--border);
  }
  .meter-fill {
    height: 100%;
    border-radius: 4px;
    background: var(--good);
  }
  .meter-target {
    position: absolute;
    left: 80%;
    top: -3px;
    width: 2px;
    height: 14px;
    background: var(--text);
  }
  .bpm-box {
    border: 2px solid var(--accent);
    border-radius: 14px;
    padding: 4px 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .bpm-num {
    font-size: 2rem;
    line-height: 1;
  }
  .lane {
    position: relative;
    height: 230px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 24px;
    overflow: hidden;
  }
  .track {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .block {
    position: absolute;
    top: 60px;
    height: 110px;
    box-sizing: border-box;
    border-radius: 16px;
    border: 2px solid var(--border-strong);
    background-color: #1b1f2b;
    background-image: repeating-linear-gradient(90deg, transparent 0, transparent calc(var(--beat) - 1px), #2a3044 calc(var(--beat) - 1px), #2a3044 var(--beat));
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .block.current {
    top: 52px;
    height: 126px;
    border: 3px solid var(--accent);
    background-color: var(--accent-soft);
  }
  .block.onTime {
    border-color: var(--good);
    background-color: #12261e;
  }
  .block.late {
    border-color: var(--warn);
    background-color: #2a2312;
  }
  .block.missed {
    border-color: var(--bad);
    background-color: #2a1218;
  }
  .block-name {
    font-size: 2.2rem;
    line-height: 1;
  }
  .block.current .block-name {
    font-size: 3rem;
  }
  .block-grade {
    font-size: 13px;
    font-weight: 600;
  }
  .block.onTime .block-grade {
    color: var(--good);
  }
  .block.late .block-grade {
    color: var(--warn);
  }
  .block.missed .block-grade {
    color: var(--bad);
  }
  .now {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    margin-left: -2px;
    background: var(--accent);
  }
  .section-tag {
    position: absolute;
    top: 30px;
    font-size: 11px;
    letter-spacing: 1.5px;
    font-weight: 700;
    color: var(--muted);
    white-space: nowrap;
  }
  .meter-fill.progress {
    background: var(--accent);
  }
  .next-name.soon {
    color: var(--muted);
    font-size: 1.05rem;
  }
  .intro {
    color: var(--text);
  }
  .now-label {
    position: absolute;
    top: 14px;
    font-size: 11px;
    letter-spacing: 1.5px;
    color: var(--accent);
    font-weight: 700;
  }
  .count-in {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: rgb(11 13 18 / 0.72);
    text-align: center;
    padding: 0 16px;
  }
  .count {
    font-size: 6rem;
    line-height: 1;
  }
  .below {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    margin-top: 20px;
  }
  .now-card {
    flex: 1 1 360px;
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .now-name {
    font-size: 5.5rem;
    line-height: 0.9;
  }
  .now-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .next-name {
    color: var(--text);
    font-size: 1.3rem;
  }
  .strip-card {
    flex: 1 1 420px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .track-strip {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 6px;
  }
  .cell-grade {
    font-size: 9px;
    font-weight: 700;
  }
  .back {
    background: transparent;
    color: var(--muted);
  }
  .top h2 {
    margin: 0;
    font-size: 1.8rem;
  }
  .top {
    margin-bottom: 1rem;
  }
  .title {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .spacer {
    flex: 1;
  }
  .num {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .stack {
    display: grid;
    gap: 0.9rem;
  }
  input[type='range'] {
    flex: 1;
    min-width: 120px;
  }
  .small {
    margin: 0;
    font-size: 0.9rem;
  }
  .big {
    font-size: 1.2rem;
    padding: 0.6em 2em;
  }
  .count {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: 7rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .first {
    font-size: 1.3rem;
  }
  .beats {
    display: flex;
    gap: 0.6rem;
  }
  .dot {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--surface-2);
    border: 2px solid var(--border);
  }
  .dot.first {
    border-color: var(--muted);
  }
  .dot.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .cell {
    min-width: 0;
    height: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--surface-2);
    font-weight: 800;
    border: 2px solid transparent;
    box-sizing: border-box;
  }
  .cell.current {
    border-color: var(--accent);
  }
  .cell.onTime {
    background: var(--good);
    color: var(--good-ink);
  }
  .cell.late {
    background: var(--warn);
    color: var(--warn-ink);
  }
  .cell.missed {
    background: var(--bad);
    color: var(--bad-ink);
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
  }
  .stats div {
    display: grid;
  }
  .stats strong {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: 1.8rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th {
    text-align: left;
    color: var(--muted);
    font-weight: 500;
  }
  th,
  td {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .bad {
    color: var(--bad);
  }
</style>
