<script lang="ts">
  /** good = right (mint ✓), bad = wrong (red ✗), gold = mastered (amber ★). */
  let { tone, text, xp = 0 }: { tone: 'good' | 'bad' | 'gold'; text: string; xp?: number } = $props();
</script>

<div class="pill {tone}" role="status">
  <span class="icon" aria-hidden="true">
    {#if tone === 'good'}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg>
    {:else if tone === 'bad'}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l3 7 7 .6-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6 9 9z" fill="currentColor"></path></svg>
    {/if}
  </span>
  <span>{text}</span>
  {#if xp}<span class="xp mono">+{xp} XP</span>{/if}
</div>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    border-radius: 999px;
    padding: 8px 18px 8px 8px;
    font-size: 1rem;
    border: 1px solid;
    max-width: 100%;
  }
  .icon {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .good {
    background: #12261e;
    border-color: #2b6b50;
    color: #cff7e6;
  }
  .good .icon {
    background: var(--good);
    color: var(--good-ink);
  }
  .bad {
    background: #2a1218;
    border-color: #6b2b38;
    color: #ffd6dc;
  }
  .bad .icon {
    background: var(--bad);
    color: var(--bad-ink);
  }
  .gold {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--text);
    font-weight: 700;
  }
  .gold .icon {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .xp {
    color: var(--accent);
    font-weight: 700;
  }
</style>
