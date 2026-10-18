<script lang="ts">
  let { db, gateDb = null }: { db: number; gateDb?: number | null } = $props();

  const MIN_DB = -70;
  const pct = (d: number) => Math.max(0, Math.min(100, ((d - MIN_DB) / -MIN_DB) * 100));
</script>

<div class="meter" title={Number.isFinite(db) ? `${db.toFixed(0)} dBFS` : 'silence'}>
  <div class="fill" class:hot={db > -3} class:under={gateDb !== null && db < gateDb} style:width="{pct(db)}%"></div>
  {#if gateDb !== null}
    <div class="gate" style:left="{pct(gateDb)}%" title="Sensitivity gate: {gateDb} dB"></div>
  {/if}
</div>

<style>
  .meter {
    position: relative;
    height: 10px;
    min-width: 80px;
    background: var(--surface-2);
    border-radius: 5px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--good);
    transition: width 40ms linear;
  }
  .fill.under {
    background: var(--muted);
  }
  .fill.hot {
    background: var(--bad);
  }
  .gate {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--text);
    opacity: 0.6;
  }
</style>
