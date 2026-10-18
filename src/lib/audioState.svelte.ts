import { engine, type InputInfo } from './audio/engine';
import { settings } from './settings.svelte';

export const audio = $state({
  running: false,
  starting: false,
  error: '',
  info: null as InputInfo | null,
  /** Smoothed input level for meters (dBFS). */
  levelDb: -Infinity,
});

let latestDb = -Infinity;
engine.onBlock((_, db) => {
  latestDb = Math.max(latestDb, db);
});

function tick() {
  // Instant attack, ~90 dB/s release so meters are readable.
  audio.levelDb = Math.max(latestDb, audio.levelDb - 1.5);
  latestDb = -Infinity;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/** Start (or restart) audio on the given device, falling back to the default input if it is gone. */
export async function startAudio(deviceId = settings.deviceId): Promise<void> {
  audio.starting = true;
  audio.error = '';
  try {
    try {
      await engine.start(deviceId ?? undefined);
    } catch (e) {
      if (!deviceId || (e as Error).name !== 'OverconstrainedError') throw e;
      await engine.start();
    }
    audio.running = true;
    audio.info = engine.info;
  } catch (e) {
    audio.running = false;
    audio.error = (e as Error).message || String(e);
  } finally {
    audio.starting = false;
  }
}

// Monitoring follows the settings, also across restarts of the input.
$effect.root(() => {
  $effect(() => {
    audio.running;
    engine.setMonitor(settings.monitor ? settings.monitorVolume : 0);
  });
});
