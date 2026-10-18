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
  import { MAX_BPM, MIN_BPM, grade, nextBpm, planRound, roundScore, slotAt, type Grade, type Round } from '../../practice/metronome';
  import type { Attempt } from '../../practice/types';
  import { references, settings } from '../../settings.svelte';

  let {
    key,
    title,
    next,
    history,
    backLabel,
    onexit,
  }: {
    /** Identifies the chord set or song, to remember its tempo. */
    key: string;
    title: string;
    /** Next chord to play after `from` (song order, or the practice order). */
    next: (from: string | null) => string;
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
  let now = $state(0);

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
  let showDiagram = $derived(current !== null && levels.get(current.chord) !== 'name');

  const name = (id: string) => chordName(chordById(id), settings.lang);

  /** Lane scale: time, not beats, so blocks get shorter as the tempo goes up. */
  const PX_PER_SEC = 90;
  let nowX = $derived(Math.round(laneWidth * 0.22));
  let laneSlots = $derived([...(prevRound?.slots ?? []), ...(round?.slots ?? [])]);
  let shift = $derived(nowX - (now - origin) * PX_PER_SEC);
  /** This round so far: chords whose slot is over, and how many of those were on time. */
  let roundSoFar = $derived.by(() => {
    version;
    const over = round ? round.slots.filter((s) => s.start + s.beats * s.beat <= now || s.hitAt !== null) : [];
    return { over: over.length, onTime: over.filter((s) => grade(s) === 'onTime').length };
  });
  const laneGrade = (s: Round['slots'][number]) => (s.hitAt !== null ? grade(s) : s.start + s.beats * s.beat < now ? 'missed' : null);

  function scheduleRound(r: Round) {
    const ctx = engine.context!;
    for (let b = 0; b < r.leadIn.beats; b++) clicks.push(scheduleClick(ctx, r.leadIn.start + b * (60 / r.bpm), b === 0, settings.metroVolume));
    for (const s of r.slots) for (let b = 0; b < s.beats; b++) clicks.push(scheduleClick(ctx, s.start + b * s.beat, b === 0, settings.metroVolume));
  }

  function makeRound(tempo: number, start: number): Round {
    const chords: string[] = [];
    for (let i = 0; i < ROUND; i++) chords.push((last = next(last)));
    return planRound(chords, tempo, settings.metroBeats, start);
  }

  function start() {
    const ctx = engine.context;
    if (!ctx) return;
    rounds = [];
    message = '';
    last = null;
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
    round = null;
  }

  function finish() {
    stop();
    // Best = fastest tempo of a round that would have moved the tempo up.
    const passed = rounds.filter((r) => r.score >= 0.8).map((r) => r.bpm);
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
  <h2>Rhythm</h2>
  <span class="title">{title}</span>
  <span class="spacer"></span>
  {#if phase === 'playing'}
    <div class="meter-box">
      <div class="meter-top"><strong>Round {rounds.length + 1}</strong><span class="mono muted">{roundSoFar.onTime} / {roundSoFar.over} on time</span></div>
      <div class="meter"><div class="meter-fill" style:width="{roundSoFar.over ? (roundSoFar.onTime / roundSoFar.over) * 100 : 0}%"></div><span class="meter-target"></span></div>
      <span class="muted tiny">{settings.metroAuto ? '80% → tempo up' : 'fixed tempo'}</span>
    </div>
    <div class="bpm-box"><span class="display bpm-num">{round?.bpm ?? bpm}</span><span class="mono tiny muted">BPM</span></div>
    <button onclick={finish}>Stop <kbd>Esc</kbd></button>
  {/if}
</div>

{#if phase === 'ready'}
  <section class="card stack">
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
      {/each}
    </div>
    <span class="now" style:left="{nowX}px"></span>
    <span class="now-label mono" style:left="{nowX + 10}px">NOW</span>
    {#if position.kind === 'lead'}
      <div class="count-in">
        <span class="display count">{position.beats - position.beat}</span>
        <span class="muted">{rounds.length ? message : 'Get ready…'}</span>
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
        <span class="muted">Next: <strong class="next-name">{upcoming ? name(upcoming) : 'rest'}</strong></span>
      </div>
      {#if showDiagram && current}
        <ChordDiagram voicing={chordById(current.chord)} lang={settings.lang} width={120} />
      {/if}
    </div>
    <div class="card strip-card">
      <span class="mono tiny muted">THIS ROUND</span>
      <div class="track-strip">
        {#each round.slots as s (s.index)}
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
    <h2>Session done</h2>
    {#if summary.chords}
      <div class="stats">
        <div><strong>{summary.startBpm} → {summary.endBpm}</strong><span class="muted">BPM</span></div>
        <div><strong>{Math.round((100 * summary.onTime) / summary.chords)}%</strong><span class="muted">on time</span></div>
        <div><strong>{rounds.length}</strong><span class="muted">rounds</span></div>
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
      <p class="muted">Stopped before the first round ended.</p>
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
