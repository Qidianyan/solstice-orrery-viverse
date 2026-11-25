import type {
  AstrolabeState,
  ChimesState,
  MirrorCourtyardState,
  MirrorOrientation,
} from './types';
import { createRng, randInt, shuffleWithRng } from './prng';
import { createSeededMirrorNodes, MIRROR_LAYOUTS, traceMirrorBeam } from './mirrors';

export const ASTROLABE_STEPS = 8;

/** Pentatonic brass bell frequencies in Hz: D4, E4, F#4, A4 */
export const CHIME_FREQUENCIES = [293.66, 329.63, 369.99, 440.0] as const;
export const CHIME_NOTE_NAMES = ['D4 · Low', 'E4 · Mid-Low', 'F#4 · Mid-High', 'A4 · High'] as const;

export interface SeededPuzzles {
  astrolabe: AstrolabeState;
  mirrors: MirrorCourtyardState;
  chimes: ChimesState;
}

export function createSeededPuzzles(seed: string): SeededPuzzles {
  const rng = createRng(seed);

  // 1. Meridian Astrolabe: 3 concentric brass rings with 8 steps each (target = 0)
  const rings: [number, number, number] = [
    randInt(rng, 2, 6),
    randInt(rng, 2, 6),
    randInt(rng, 2, 6),
  ];

  // 2. Sandstone Mirror Courtyard: pick one of 3 geometric layouts + scramble orientations
  const layoutIndex = randInt(rng, 0, MIRROR_LAYOUTS.length - 1);
  const layout = MIRROR_LAYOUTS[layoutIndex];
  const mirrorNodes = createSeededMirrorNodes(layout, rng);
  const trace = traceMirrorBeam(
    layout.emitter,
    layout.emitterDir,
    layout.collector,
    layout.pillars,
    mirrorNodes,
  );

  // 3. Harmonic Sun-Chimes: shuffle pitch ranks [0, 1, 2, 3] across 4 physical bell slots
  let ranks = shuffleWithRng([0, 1, 2, 3], rng);
  if (ranks[0] === 0 && ranks[1] === 1 && ranks[2] === 2 && ranks[3] === 3) {
    // Never leave trivial left-to-right order
    ranks = [1, 3, 0, 2];
  }

  return {
    astrolabe: {
      rings,
      solved: false,
    },
    mirrors: {
      layoutId: layout.id,
      layoutName: layout.name,
      emitter: { ...layout.emitter },
      emitterDir: { ...layout.emitterDir },
      collector: { ...layout.collector },
      pillars: layout.pillars.map((p) => ({ position: { ...p.position }, radius: p.radius })),
      mirrors: mirrorNodes,
      beamSegments: trace.segments,
      litMirrorCount: trace.litMirrorIndices.length,
      solved: trace.hitsCollector,
    },
    chimes: {
      slotRanks: [ranks[0], ranks[1], ranks[2], ranks[3]],
      struckSlots: [],
      progress: 0,
      lastMistakeTick: 0,
      solved: false,
    },
  };
}

export function rotateAstrolabeRing(
  state: AstrolabeState,
  ringIndex: number,
  delta: 1 | -1 = 1,
): { next: AstrolabeState; aligned: boolean; justSolved: boolean } {
  if (ringIndex < 0 || ringIndex > 2) {
    return { next: state, aligned: false, justSolved: false };
  }
  const nextRings: [number, number, number] = [...state.rings];
  nextRings[ringIndex] = (nextRings[ringIndex] + delta + ASTROLABE_STEPS) % ASTROLABE_STEPS;
  const aligned = nextRings[ringIndex] === 0;
  const nowSolved = nextRings[0] === 0 && nextRings[1] === 0 && nextRings[2] === 0;
  return {
    next: {
      rings: nextRings,
      solved: state.solved || nowSolved,
    },
    aligned,
    justSolved: !state.solved && nowSolved,
  };
}

export function rotateMirrorObelisk(
  state: MirrorCourtyardState,
  mirrorIndex: number,
  delta: 1 | -1 = 1,
): { next: MirrorCourtyardState; beamHitsCollector: boolean; justSolved: boolean } {
  if (mirrorIndex < 0 || mirrorIndex >= state.mirrors.length) {
    return { next: state, beamHitsCollector: state.solved, justSolved: false };
  }
  const nextMirrors = state.mirrors.map((m, idx) =>
    idx === mirrorIndex
      ? {
          ...m,
          orientation: ((m.orientation + delta + 4) % 4) as MirrorOrientation,
        }
      : { ...m },
  );
  const trace = traceMirrorBeam(
    state.emitter,
    state.emitterDir,
    state.collector,
    state.pillars,
    nextMirrors,
  );
  const justSolved = !state.solved && trace.hitsCollector;
  return {
    next: {
      ...state,
      mirrors: nextMirrors,
      beamSegments: trace.segments,
      litMirrorCount: trace.litMirrorIndices.length,
      solved: state.solved || trace.hitsCollector,
    },
    beamHitsCollector: trace.hitsCollector,
    justSolved,
  };
}

export function getAscendingChimeSlots(state: ChimesState): number[] {
  const order: number[] = [];
  for (let rank = 0; rank < 4; rank += 1) {
    const slot = state.slotRanks.indexOf(rank);
    if (slot >= 0) order.push(slot);
  }
  return order;
}

export function strikeChimeSlot(
  state: ChimesState,
  slotIndex: number,
): { next: ChimesState; rank: number; correct: boolean; justSolved: boolean } {
  if (slotIndex < 0 || slotIndex > 3) {
    return { next: state, rank: 0, correct: false, justSolved: false };
  }
  const rank = state.slotRanks[slotIndex];

  // Once solved (or in sandbox), striking any bell freely resonates without resetting solved state
  if (state.solved) {
    return { next: state, rank, correct: true, justSolved: false };
  }

  const expectedRank = state.progress;
  if (rank === expectedRank) {
    const nextProgress = state.progress + 1;
    const nextStruck = [...state.struckSlots, slotIndex];
    const nowSolved = nextProgress >= 4;
    return {
      next: {
        ...state,
        struckSlots: nextStruck,
        progress: nextProgress,
        solved: nowSolved,
      },
      rank,
      correct: true,
      justSolved: nowSolved,
    };
  }

  // Wrong bell struck — if player struck rank 0 immediately, start fresh from step 1
  if (rank === 0) {
    return {
      next: {
        ...state,
        struckSlots: [slotIndex],
        progress: 1,
        lastMistakeTick: state.lastMistakeTick + 1,
      },
      rank,
      correct: false,
      justSolved: false,
    };
  }

  return {
    next: {
      ...state,
      struckSlots: [],
      progress: 0,
      lastMistakeTick: state.lastMistakeTick + 1,
    },
    rank,
    correct: false,
    justSolved: false,
  };
}
