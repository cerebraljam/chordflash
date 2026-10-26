import { describe, expect, it } from 'vitest';
import { rng } from '../audio/synth';
import { hintLevels, CLEAN_TIME_MS } from './hints';
import { PracticeSession, pickNext, sequenceCursor, sequencePicker } from './session';
import { summarize } from './summary';
import type { Attempt } from './types';

const attempt = (to: string, over: Partial<Attempt> = {}): Attempt => ({
  at: 0,
  sessionId: 's',
  from: 'X',
  to,
  timeMs: 1000,
  misses: 0,
  assisted: false,
  skipped: false,
  score: 100,
  ...over,
});

describe('pickNext', () => {
  it('never repeats the previous chord', () => {
    const rand = rng(3);
    let prev: string | null = null;
    for (let i = 0; i < 200; i++) {
      const next = pickNext(['G', 'C', 'D'], prev, rand);
      expect(next).not.toBe(prev);
      prev = next;
    }
  });
});

describe('sequenceCursor', () => {
  it('knows which step of the song is on screen, across the wrap-around', () => {
    const cursor = sequenceCursor(['G', 'D', 'Em', 'G']);
    const s = new PracticeSession({ kind: 'chord', items: ['G', 'D', 'Em'], goal: { kind: 'count', transitions: 6 }, threshold: 70, pick: cursor.pick });
    s.start(0);
    const onScreen = [cursor.positions[s.attempts.length]];
    for (let t = 1; t <= 6; t++) {
      s.strum(100, t * 1000);
      onScreen.push(cursor.positions[s.attempts.length]);
    }
    // The last G and the first G of the next pass are one chord: step 0 is skipped on the way round.
    expect(onScreen).toEqual([0, 1, 2, 3, 1, 2, 3]);
  });
});

describe('sequencePicker', () => {
  it('asks for every note of a riff, repeats and the loop back to the start included', () => {
    const s = new PracticeSession({ kind: 'note', items: ['E', 'G'], goal: { kind: 'count', transitions: 6 }, threshold: 50, pick: sequencePicker(['E', 'E', 'G', 'E'], true) });
    s.start(0);
    for (let t = 1; t <= 7; t++) s.strum(100, t * 1000);
    expect(s.attempts.map((a) => a.to)).toEqual(['E', 'E', 'G', 'E', 'E', 'E', 'G']);
  });

  it('follows the song order and loops without repeating the wrap-around chord', () => {
    const s = new PracticeSession({
      kind: 'chord',
      items: ['G', 'D', 'Em'],
      goal: { kind: 'count', transitions: 6 },
      threshold: 70,
      pick: sequencePicker(['G', 'D', 'Em', 'G']),
    });
    s.start(0);
    for (let t = 1; t <= 7; t++) s.strum(100, t * 1000);
    expect(s.attempts.map((a) => a.to)).toEqual(['G', 'D', 'Em', 'G', 'D', 'Em', 'G']);
  });
});

describe('PracticeSession', () => {
  it('stays on a chord after a miss and records time and misses on the pass', () => {
    const s = new PracticeSession({ kind: 'chord', items: ['G', 'C'], goal: { kind: 'count', transitions: 2 }, threshold: 70 });
    s.start(0);
    const first = s.current;
    expect(s.strum(40, 500)).toBe('miss');
    expect(s.current).toBe(first);
    expect(s.strum(95, 1200)).toBe('pass');
    expect(s.attempts[0]).toMatchObject({ from: null, to: first, timeMs: 1200, misses: 1, score: 95 });
    expect(s.current).not.toBe(first);
    expect(s.transitions).toBe(0);
  });

  it('ends after the requested number of transitions (warm-up chord excluded)', () => {
    const s = new PracticeSession({ kind: 'chord', items: ['G', 'C', 'D'], goal: { kind: 'count', transitions: 3 }, threshold: 70 });
    s.start(0);
    for (let t = 1; t <= 3; t++) s.strum(100, t * 1000);
    expect(s.done).toBe(false);
    s.strum(100, 4000);
    expect(s.done).toBe(true);
    expect(s.strum(100, 5000)).toBe('ignored');
    expect(s.attempts.map((a) => a.from)).toEqual([null, s.attempts[0].to, s.attempts[1].to, s.attempts[2].to]);
  });

  it('ends a timed session with the first chord completed after the time is up', () => {
    const s = new PracticeSession({ kind: 'chord', items: ['G', 'C'], goal: { kind: 'time', minutes: 1 }, threshold: 70 });
    s.start(0);
    s.strum(100, 59_000);
    expect(s.done).toBe(false);
    s.strum(100, 61_000);
    expect(s.done).toBe(true);
  });

  it('records skips and assists', () => {
    const s = new PracticeSession({ kind: 'chord', items: ['G', 'C'], goal: { kind: 'count', transitions: 5 }, threshold: 70 });
    s.start(0);
    s.assist();
    s.strum(90, 6000);
    s.skip(7000);
    expect(s.attempts[0].assisted).toBe(true);
    expect(s.attempts[1]).toMatchObject({ skipped: true, assisted: false, timeMs: 1000 });
  });
});

describe('hintLevels', () => {
  it('shows the diagram until 5 clean plays in a row', () => {
    const history = [attempt('G'), attempt('G'), attempt('G'), attempt('G')];
    expect(hintLevels(history).get('G')).toBe('diagram');
    expect(hintLevels([...history, attempt('G')]).get('G')).toBe('name');
  });

  it('does not count slow plays as clean', () => {
    const history = Array.from({ length: 5 }, () => attempt('G', { timeMs: CLEAN_TIME_MS + 1 }));
    expect(hintLevels(history).get('G')).toBe('diagram');
  });

  it('brings the diagram back after 2 misses in the last 5, and needs 5 clean again to hide it', () => {
    const known = Array.from({ length: 5 }, () => attempt('C'));
    const struggling = [...known, attempt('C', { misses: 2 }), attempt('C'), attempt('C', { assisted: true })];
    expect(hintLevels([...known, attempt('C', { misses: 1 })]).get('C')).toBe('name');
    expect(hintLevels(struggling).get('C')).toBe('diagram');
    const recovering = [...struggling, attempt('C'), attempt('C'), attempt('C'), attempt('C')];
    expect(hintLevels(recovering).get('C')).toBe('diagram');
    expect(hintLevels([...recovering, attempt('C')]).get('C')).toBe('name');
  });

  it('tracks each chord separately', () => {
    const levels = hintLevels([...Array.from({ length: 5 }, () => attempt('G')), attempt('C')]);
    expect(levels.get('G')).toBe('name');
    expect(levels.get('C')).toBe('diagram');
  });
});

describe('summarize', () => {
  it('excludes the warm-up chord and ranks the slowest transitions first', () => {
    const s = summarize([
      attempt('G', { from: null, timeMs: 9000 }),
      attempt('C', { from: 'G', timeMs: 3000, misses: 1 }),
      attempt('G', { from: 'C', timeMs: 1000 }),
      attempt('C', { from: 'G', timeMs: 2000 }),
      attempt('D', { from: 'C', skipped: true, timeMs: 8000 }),
    ]);
    expect(s.transitions).toBe(4);
    expect(s.firstTryRate).toBe(0.5);
    expect(s.avgMs).toBe(2000);
    expect(s.skipped).toBe(1);
    expect(s.pairs.map((p) => `${p.from}→${p.to}`)).toEqual(['C→D', 'G→C', 'C→G']);
    expect(s.pairs[1]).toMatchObject({ count: 2, avgMs: 2500, misses: 1 });
  });
});
