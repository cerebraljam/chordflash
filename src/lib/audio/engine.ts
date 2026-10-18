import workletUrl from './capture.worklet.ts?worker&url';
import { rmsDb } from './onset';

export interface InputDevice {
  id: string;
  label: string;
}

/** What the browser actually gave us — useful to confirm processing is really off. */
export interface InputInfo {
  label: string;
  sampleRate: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/** Newer browsers may report echoCancellation as a mode string ('all', 'remote-only', …). */
const isOn = (v: unknown) => v === true || (typeof v === 'string' && v !== 'none');

type BlockListener = (block: Float32Array, levelDb: number) => void;

const RING_SIZE = 1 << 17; // ~2.7 s at 48 kHz

/**
 * Owns the AudioContext and microphone stream, keeps the last couple of
 * seconds of input in a ring buffer and notifies listeners per 512-sample block.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  /** Sends the input to the speakers / headphones when monitoring is on. */
  private monitorGain: GainNode | null = null;
  private monitorLevel = 0;
  private ring = new Float32Array(RING_SIZE);
  /** Total samples received since start (monotonic). */
  position = 0;
  sampleRate = 48000;
  info: InputInfo | null = null;
  private listeners = new Set<BlockListener>();
  /** Audio clock time at the end of the last block received (pairs with `position`). */
  private clockAtPosition = 0;

  get running(): boolean {
    return this.ctx !== null;
  }

  /** Lists audio inputs. Asks for mic permission first if needed, since labels are hidden until then. */
  async listDevices(): Promise<InputDevice[]> {
    let devices = await navigator.mediaDevices.enumerateDevices();
    if (!devices.some((d) => d.kind === 'audioinput' && d.label)) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    }
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
  }

  async start(deviceId?: string): Promise<void> {
    await this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(ctx, 'capture', { numberOfInputs: 1, numberOfOutputs: 1 });
    node.port.onmessage = (e: MessageEvent<{ samples: Float32Array; time: number }>) => this.push(e.data.samples, e.data.time);
    const source = ctx.createMediaStreamSource(stream);
    source.connect(node);
    // Output is silent; connecting keeps the node pulled by the graph.
    node.connect(ctx.destination);
    const monitor = ctx.createGain();
    monitor.gain.value = this.monitorLevel;
    source.connect(monitor).connect(ctx.destination);
    this.monitorGain = monitor;
    await ctx.resume();

    const track = stream.getAudioTracks()[0];
    const s = track.getSettings();
    this.info = {
      label: track.label,
      sampleRate: ctx.sampleRate,
      echoCancellation: isOn(s.echoCancellation),
      noiseSuppression: isOn(s.noiseSuppression),
      autoGainControl: isOn(s.autoGainControl),
    };
    this.ctx = ctx;
    this.stream = stream;
    this.node = node;
    this.sampleRate = ctx.sampleRate;
    this.position = 0;
    this.ring.fill(0);
  }

  async stop(): Promise<void> {
    this.node?.disconnect();
    this.monitorGain?.disconnect();
    this.monitorGain = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.info = null;
  }

  /** Volume (0 = off) at which the instrument is played back through the computer. */
  setMonitor(level: number): void {
    this.monitorLevel = level;
    if (this.monitorGain && this.ctx) this.monitorGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.02);
  }

  /** The AudioContext, to schedule sounds (metronome clicks) on the same clock as the input. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Audio clock time (seconds) at which input sample `position` was captured. */
  timeAt(position: number): number {
    return this.clockAtPosition - (this.position - position) / this.sampleRate;
  }

  /**
   * Seconds between scheduling a sound and hearing it, plus capturing a sound
   * and the browser seeing it; used to line strums up with metronome clicks.
   */
  get roundTripLatency(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    return (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + 0.01;
  }

  onBlock(fn: BlockListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Copy `length` samples ending at absolute position `end` (default: now). */
  read(length: number, end = this.position): Float32Array {
    const out = new Float32Array(length);
    const start = end - length;
    for (let i = 0; i < length; i++) {
      const p = start + i;
      if (p >= 0 && p > this.position - RING_SIZE) out[i] = this.ring[p % RING_SIZE];
    }
    return out;
  }

  private push(block: Float32Array, time: number): void {
    for (let i = 0; i < block.length; i++) this.ring[(this.position + i) % RING_SIZE] = block[i];
    this.position += block.length;
    this.clockAtPosition = time;
    const db = rmsDb(block);
    for (const fn of this.listeners) fn(block, db);
  }
}

export const engine = new AudioEngine();
