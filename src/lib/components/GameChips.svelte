<script lang="ts">
  let { combo, xp }: { combo: number; xp: number } = $props();
</script>

<div class="chips">
  {#if combo >= 2}
    <span class="chip" aria-label="Combo: {combo} first tries in a row">
      <span class="label mono">COMBO</span>
      <span class="value display accent">×{combo}</span>
    </span>
  {/if}
  <span class="chip" aria-label="{xp} XP this session">
    <span class="label mono">XP</span>
    <span class="value display">+{xp}</span>
  </span>
</div>

<style>
  .chips {
    display: flex;
    gap: 8px;
  }
  .chip {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 4px 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 64px;
  }
  .label {
    font-size: 10px;
    letter-spacing: 1.5px;
    color: var(--muted);
  }
  .value {
    font-size: 1.3rem;
    line-height: 1.1;
  }
  .accent {
    color: var(--accent);
  }
</style>
