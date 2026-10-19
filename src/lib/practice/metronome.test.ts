import { describe, expect, it } from 'vitest';
import { EARLY_TOLERANCE, grade, nextBpm, planRound, roundScore, slotAt, tapTempo } from './metronome';

describe('metronome', () => {
  const round = planRound(['G', 'C', 'D', 'Em'], 60, 4, 10);

  it('lays out a count-in bar, then each chord for its beats', () => {
    expect(round.slots.map((s) => s.start)).toEqual([14, 18, 22, 26]);
    expect(round.end).toBe(30);
    expect(planRound(['G', 'C'], 120, 2, 0).slots.map((s) => s.start)).toEqual([2, 3]);
  });

  it('puts a strum in the slot whose window it falls in, a little early included', () => {
    expect(slotAt(round, 13.9)?.chord).toBe('G'); // just before the beat
    expect(slotAt(round, 17.9)?.chord).toBe('C');
    expect(slotAt(round, 13)).toBeNull(); // count-in
    expect(slotAt(round, 30)).toBeNull();
  });

  it('grades on time within the first beat, late after, missed without a hit', () => {
    const s = { ...round.slots[0] };
    expect(grade(s)).toBe('missed');
    expect(grade({ ...s, hitAt: 14 - EARLY_TOLERANCE / 2 })).toBe('onTime');
    expect(grade({ ...s, hitAt: 14.9 })).toBe('onTime');
    expect(grade({ ...s, hitAt: 15.5 })).toBe('late');
  });

  it('scores the round and moves the tempo', () => {
    const hits = round.slots.map((s, i) => ({ ...s, hitAt: [s.start, s.start, s.start + 2, null][i] }));
    expect(roundScore(hits)).toBe((1 + 1 + 0.5 + 0) / 4);
    expect(nextBpm(60, 0.85, 5)).toBe(65);
    expect(nextBpm(60, 0.6, 5)).toBe(60);
    expect(nextBpm(60, 0.4, 5)).toBe(55);
    expect(nextBpm(40, 0, 5)).toBe(40);
  });

  it('reads the tempo from taps, ignoring one stray tap', () => {
    expect(tapTempo([1])).toBeNull();
    expect(tapTempo([0, 0.5])).toBe(120);
    // Steady 100 BPM (0.6 s) with one tap a bit late.
    expect(tapTempo([0, 0.6, 1.2, 1.95, 2.4, 3.0])).toBe(100);
    expect(tapTempo([0, 5])).toBe(40);
  });
});
