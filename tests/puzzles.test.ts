import { describe, expect, it } from 'vitest';
import {
  ASTROLABE_STEPS,
  createSeededPuzzles,
  getAscendingChimeSlots,
  rotateAstrolabeRing,
  rotateMirrorObelisk,
  strikeChimeSlot,
} from '../src/game/puzzles';

describe('Astronomy Puzzle State Machines', () => {
  it('generates identical unsolved puzzles for the same seed and varied ones for different seeds', () => {
    const a = createSeededPuzzles('SOL-2026-11-23');
    const b = createSeededPuzzles('SOL-2026-11-23');
    expect(a).toEqual(b);
    expect(a.astrolabe.solved).toBe(false);
    expect(a.mirrors.solved).toBe(false);
    expect(a.chimes.solved).toBe(false);
  });

  it('solves the Meridian Astrolabe when all 3 rings rotate to zenith step 0', () => {
    let state = createSeededPuzzles('SOL-2026-11-23').astrolabe;
    let solvedEventSeen = false;

    for (let r = 0; r < 3; r += 1) {
      while (state.rings[r] !== 0) {
        const res = rotateAstrolabeRing(state, r, 1);
        state = res.next;
        if (res.justSolved) solvedEventSeen = true;
      }
    }

    expect(state.rings).toEqual([0, 0, 0]);
    expect(state.solved).toBe(true);
    expect(solvedEventSeen).toBe(true);
    expect(ASTROLABE_STEPS).toBe(8);
  });

  it('solves the Mirror Courtyard by rotating each obelisk to its solution orientation', () => {
    let state = createSeededPuzzles('SOL-2026-12-01').mirrors;
    let solvedTriggered = false;

    for (let idx = 0; idx < state.mirrors.length; idx += 1) {
      while (state.mirrors[idx].orientation !== state.mirrors[idx].solutionOrientation) {
        const res = rotateMirrorObelisk(state, idx, 1);
        state = res.next;
        if (res.justSolved) solvedTriggered = true;
      }
    }

    expect(state.solved).toBe(true);
    expect(state.litMirrorCount).toBe(3);
    expect(solvedTriggered).toBe(true);
  });

  it('validates Harmonic Sun-Chimes ascending order and recovers cleanly from mistakes', () => {
    let state = createSeededPuzzles('SOL-2026-11-23').chimes;
    const order = getAscendingChimeSlots(state);
    expect(order.length).toBe(4);

    // Strike wrong bell first (highest pitch)
    const wrong = strikeChimeSlot(state, order[3]);
    expect(wrong.correct).toBe(false);
    expect(wrong.next.progress).toBe(0);
    expect(wrong.next.lastMistakeTick).toBe(1);
    state = wrong.next;

    // Now strike all 4 in ascending order
    for (let i = 0; i < 4; i += 1) {
      const res = strikeChimeSlot(state, order[i]);
      expect(res.correct).toBe(true);
      expect(res.justSolved).toBe(i === 3);
      state = res.next;
    }

    expect(state.solved).toBe(true);
    expect(state.progress).toBe(4);
  });
});
