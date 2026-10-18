// Runs on the audio thread: forwards the first input channel to the main
// thread in fixed-size blocks.

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;
/** Audio clock time (seconds) of the start of the current render quantum. */
declare const currentTime: number;
declare const sampleRate: number;

const BLOCK = 512;

class CaptureProcessor extends AudioWorkletProcessor {
  private buf = new Float32Array(BLOCK);
  private n = 0;

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === BLOCK) {
          // Audio clock time just after the block's last sample, so the main thread can time events.
          const time = currentTime + (i + 1) / sampleRate;
          this.port.postMessage({ samples: this.buf, time }, [this.buf.buffer]);
          this.buf = new Float32Array(BLOCK);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('capture', CaptureProcessor);

// Module scope, so the audio-thread globals declared above stay local to this file.
export {};
