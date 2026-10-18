<script lang="ts">
  import { attemptGrade } from '../practice/game';
  import type { Goal } from '../practice/session';
  import type { Attempt } from '../practice/types';

  let {
    attempts,
    goal,
    elapsedMs,
    label,
  }: { attempts: Attempt[]; goal: Goal; elapsedMs: number; label: string } = $props();

  /** Count goals: one segment per item (warm-up + transitions), colored by result. */
  let segments = $derived(goal.kind === 'count' ? goal.transitions + 1 : 0);
  let done = $derived(attempts.filter((a) => a.from !== null).length);
  let timeShare = $derived(goal.kind === 'time' ? Math.min(1, elapsedMs / (goal.minutes * 60_000)) : 0);
  let timeLeft = $derived.by(() => {
    if (goal.kind !== 'time') return '';
    const left = Math.max(0, goal.minutes * 60_000 - elapsedMs);
    return `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')} left`;
  });
</script>

<div class="progress">
  <div class="top">
    <span class="label">{label}</span>
    <span class="mono muted">{goal.kind === 'count' ? `${done} / ${goal.transitions}` : timeLeft}</span>
  </div>
  {#if goal.kind === 'count'}
    <div
      class="segments"
      style:--n={segments}
      aria-label="{done} of {goal.transitions} changes done"
    >
      {#each Array(segments) as _, i (i)}
        {@const a = attempts[i]}
        <span class="seg {a ? attemptGrade(a) : i === attempts.length ? 'current' : ''}"></span>
      {/each}
    </div>
  {:else}
    <div class="time"><div class="fill" style:width="{timeShare * 100}%"></div></div>
  {/if}
</div>

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.9rem;
  }
  .label {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .segments {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 3px;
  }
  .seg {
    height: 8px;
    border-radius: 2px;
    background: var(--surface-2);
  }
  .seg.good {
    background: var(--good);
  }
  .seg.warn {
    background: var(--warn);
  }
  .seg.bad {
    background: var(--bad);
  }
  .seg.current {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .time {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .time .fill {
    height: 100%;
    background: var(--good);
  }
</style>
