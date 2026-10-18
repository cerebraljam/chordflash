<script lang="ts">
  import { onDestroy } from 'svelte';
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
    onexit,
  }: {
    /** Identifies the chord set or song, to remember its tempo. */
    key: string;
    title: string;
    /** Next chord to play after `from` (song order, or the practice order). */
    next: (from: string | null) => string;
    history: Attempt[];
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
    round = makeRound(bpm, ctx.currentTime + 0.3);
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
  <strong>Metronome</strong>
  <span class="title">{title}</span>
  <span class="spacer"></span>
  {#if phase === 'playing'}
    <span class="bpm">{round?.bpm ?? bpm} BPM</span>
    <button onclick={finish}>Stop</button>
  {:else}
    <button onclick={onexit}>Back</button>
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
    <div><button class="primary big" onclick={start} disabled={!engine.context}>Start</button></div>
  </section>
{:else if phase === 'playing' && round && position}
  <section class="card stage">
    {#if position.kind === 'lead'}
      <div class="count">{position.beats - position.beat}</div>
      <div class="muted">{rounds.length ? message : 'Get ready…'}</div>
      <div class="first">First: <strong>{name(round.slots[0].chord)}</strong></div>
    {:else if current}
      <div class="name">{name(current.chord)}</div>
      <div class="beats" aria-label="Beat {position.beat + 1} of {current.beats}">
        {#each Array(current.beats) as _, b (b)}
          <span class="dot" class:on={b === position.beat} class:first={b === 0}></span>
        {/each}
      </div>
      {#if showDiagram}
        <ChordDiagram voicing={chordById(current.chord)} lang={settings.lang} width={150} />
      {/if}
      <div class="next muted">Next: <strong>{upcoming ? name(upcoming) : 'rest'}</strong></div>
      <div class="track">
        {#each round.slots as s (s.index)}
          {@const g = s.hitAt !== null ? grade(s) : s.start + s.beats * s.beat < now ? 'missed' : null}
          <span class="cell" class:current={s === current} class:onTime={g === 'onTime'} class:late={g === 'late'} class:missed={g === 'missed'}>
            {name(s.chord)}
          </span>
        {/each}
      </div>
    {/if}
  </section>
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
      <button class="primary" onclick={() => (phase = 'ready')}>Again</button>
      <button onclick={onexit}>Back</button>
    </div>
  </section>
{/if}

<style>
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
  .bpm,
  .num {
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
  .stage {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    min-height: 26rem;
    align-content: start;
  }
  .count {
    font-size: 7rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .first {
    font-size: 1.3rem;
  }
  .name {
    font-size: clamp(4rem, 18vw, 7rem);
    font-weight: 700;
    line-height: 1;
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
  .next {
    font-size: 1.2rem;
  }
  .track {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem;
    margin-top: 0.5rem;
  }
  .cell {
    min-width: 2.6rem;
    text-align: center;
    padding: 0.2em 0.5em;
    border-radius: 6px;
    background: var(--surface-2);
    font-size: 0.9rem;
    border: 2px solid transparent;
  }
  .cell.current {
    border-color: var(--accent);
  }
  .cell.onTime {
    background: var(--good);
    color: #fff;
  }
  .cell.late {
    background: var(--warn);
    color: #fff;
  }
  .cell.missed {
    background: var(--bad);
    color: #fff;
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
