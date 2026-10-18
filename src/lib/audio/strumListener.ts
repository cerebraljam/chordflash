import { analyze, type Analysis } from './chroma';
import type { AudioEngine } from './engine';
import { OnsetDetector } from './onset';

/** Skip the pick attack (noisy, inharmonic) before analysing. */
const ATTACK_SKIP_SEC = 0.06;
/** Length of the analysed window after the attack. */
const WINDOW_SEC = 0.3;

/**
 * Waits for strums on the engine's input and calls `onStrum` with the
 * analysis of the ~0.3 s that follow each one, and when the strum started
 * (audio clock seconds). The call comes ~0.4 s after the strum itself.
 */
export class StrumListener {
  private detector: OnsetDetector;
  private pendingEnd: number | null = null;
  private onsetAt = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private engine: AudioEngine,
    gateDb: number,
    private onStrum: (a: Analysis, at: number) => void,
  ) {
    this.detector = new OnsetDetector(engine.sampleRate, { gateDb });
  }

  set gateDb(db: number) {
    this.detector.opts.gateDb = db;
  }

  start(): void {
    const sr = this.engine.sampleRate;
    const windowLen = Math.round(WINDOW_SEC * sr);
    this.unsubscribe = this.engine.onBlock((block) => {
      if (this.detector.process(block)) {
        // A new strum restarts the window, even if the previous one wasn't analysed yet.
        this.onsetAt = this.engine.position - block.length;
        this.pendingEnd = this.onsetAt + Math.round(ATTACK_SKIP_SEC * sr) + windowLen;
      }
      if (this.pendingEnd !== null && this.engine.position >= this.pendingEnd) {
        const samples = this.engine.read(windowLen, this.pendingEnd);
        this.pendingEnd = null;
        this.onStrum(analyze(samples, sr), this.engine.timeAt(this.onsetAt));
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pendingEnd = null;
  }
}
