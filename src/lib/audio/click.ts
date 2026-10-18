/**
 * Schedules a metronome click at `time` (audio clock). Accented clicks (first
 * beat of a chord) are higher. Returns the node so it can be cancelled.
 */
export function scheduleClick(ctx: AudioContext, time: number, accent: boolean, volume = 0.5): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
  return osc;
}
