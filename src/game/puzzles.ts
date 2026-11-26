import type {
  AstrolabeState,
  ChimesState,
  GearCoupling,
  MirrorCourtyardState,
  MirrorOrientation,
  TrialMetadata,
  TrialNumber,
} from './types';
import { createRng, randInt, shuffleWithRng } from './prng';
import {
  createSeededMirrorNodes,
  MIRROR_LAYOUTS,
  traceCourtyardBeams,
  TRIAL_MIRROR_LAYOUTS,
} from './mirrors';

export const ASTROLABE_STEPS = 8;
/** Precision 15-degree magnetic detent wheel used in V4 7-Trial Astrolabe gear puzzles. */
export const TRIAL_ASTROLABE_STEPS = 24;

/** Pentatonic brass bell frequencies in Hz: D4, E4, F#4, A4 */
export const CHIME_FREQUENCIES = [293.66, 329.63, 369.99, 440.0] as const;
export const CHIME_NOTE_NAMES = ['D4 · Low', 'E4 · Mid-Low', 'F#4 · Mid-High', 'A4 · High'] as const;

export const TRIAL_CATALOG: readonly TrialMetadata[] = [
  {
    number: 1,
    title: 'Dawn Meridian',
    subtitle: 'Single-beam optical calibration & 15° detent alignment',
    skyStage: 'noon-gold',
    hasCoupledGears: false,
    hasBeamSplitter: false,
    targetBeamCount: 1,
  },
  {
    number: 2,
    title: 'Twin Pillar Deflection',
    subtitle: 'Reflect molten sunlight past carved Doric basalt columns',
    skyStage: 'noon-gold',
    hasCoupledGears: false,
    hasBeamSplitter: false,
    targetBeamCount: 1,
  },
  {
    number: 3,
    title: 'Dual Prism Relay',
    subtitle: 'Three-obelisk refraction across the amber courtyard',
    skyStage: 'amber-dusk',
    hasCoupledGears: false,
    hasBeamSplitter: false,
    targetBeamCount: 1,
  },
  {
    number: 4,
    title: 'Obsidian Labyrinth',
    subtitle: 'Reverse zenith arc with full harmonic chime resonance',
    skyStage: 'amber-dusk',
    hasCoupledGears: false,
    hasBeamSplitter: false,
    targetBeamCount: 1,
  },
  {
    number: 5,
    title: 'Coupled Pinion Resonance',
    subtitle: '1:-0.5 meshed bronze gears & dichroic beam splitter dual-target',
    skyStage: 'crimson-eclipse',
    hasCoupledGears: true,
    hasBeamSplitter: true,
    targetBeamCount: 2,
  },
  {
    number: 6,
    title: 'Harmonic Counter-Gear',
    subtitle: 'Dual-stage coupled gear train (1:-0.5 & 1:+1) with zenith splitter',
    skyStage: 'crimson-eclipse',
    hasCoupledGears: true,
    hasBeamSplitter: true,
    targetBeamCount: 2,
  },
  {
    number: 7,
    title: 'Grand Solstice Eclipse Finale',
    subtitle: 'Triple convergent split sunbeams & crimson eclipse breakthrough',
    skyStage: 'crimson-eclipse',
    hasCoupledGears: true,
    hasBeamSplitter: true,
    targetBeamCount: 3,
  },
];

export function getTrialMetadata(trial: TrialNumber): TrialMetadata {
  return TRIAL_CATALOG[Math.max(0, Math.min(TRIAL_CATALOG.length - 1, trial - 1))];
}

/**
 * Mechanical gear-train coupling definitions per progressive trial:
 * - Trials 1-4: independent 15° magnetic detent calibration (3-notch = 45° click or 1-notch = 15° fine trim)
 * - Trial 5: Outer (+2 notches = +30°) counter-drives Middle (-1 notch = -15°, exact 1:-0.5 ratio)
 * - Trials 6-7: Outer (+2) -> Middle (-1, ratio 1:-0.5) AND Middle (+1) -> Inner (+1, ratio 1:+1)
 */
export function getTrialGearCouplings(trial: TrialNumber): GearCoupling[] {
  if (trial === 5) {
    return [
      { sourceRing: 0, targetRing: 1, sourceStep: 2, targetStep: -1, ratioLabel: '1 : -0.5' },
    ];
  }
  if (trial >= 6) {
    return [
      { sourceRing: 0, targetRing: 1, sourceStep: 2, targetStep: -1, ratioLabel: '1 : -0.5' },
      { sourceRing: 1, targetRing: 2, sourceStep: 1, targetStep: 1, ratioLabel: '1 : +1' },
    ];
  }
  return [];
}

export interface SeededPuzzles {
  astrolabe: AstrolabeState;
  mirrors: MirrorCourtyardState;
  chimes: ChimesState;
}

/**
 * Classic seeded puzzle generator (backward-compatible with existing Daily Seed tests).
 */
export function createSeededPuzzles(seed: string): SeededPuzzles {
  const rng = createRng(seed);

  const rings: [number, number, number] = [
    randInt(rng, 2, 6),
    randInt(rng, 2, 6),
    randInt(rng, 2, 6),
  ];

  const layoutIndex = randInt(rng, 0, MIRROR_LAYOUTS.length - 1);
  const layout = MIRROR_LAYOUTS[layoutIndex];
  const mirrorNodes = createSeededMirrorNodes(layout, rng);
  const collectors = layout.collectors ?? [layout.collector];
  const trace = traceCourtyardBeams({
    emitter: layout.emitter,
    emitterDir: layout.emitterDir,
    collectors,
    pillars: layout.pillars,
    mirrors: mirrorNodes,
    splitters: layout.splitters,
  });

  let ranks = shuffleWithRng([0, 1, 2, 3], rng);
  if (ranks[0] === 0 && ranks[1] === 1 && ranks[2] === 2 && ranks[3] === 3) {
    ranks = [1, 3, 0, 2];
  }

  return {
    astrolabe: {
      rings,
      stepCount: ASTROLABE_STEPS,
      couplings: [],
      solved: false,
    },
    mirrors: {
      layoutId: layout.id,
      layoutName: layout.name,
      emitter: { ...layout.emitter },
      emitterDir: { ...layout.emitterDir },
      collector: { ...layout.collector },
      collectors: collectors.map((c) => ({ ...c })),
      splitters: (layout.splitters ?? []).map((s) => ({ ...s, position: { ...s.position } })),
      litCollectorIndices: trace.litCollectorIndices,
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

/**
 * Generates guaranteed-solvable puzzles for any of the 7 Progressive Celestial Trials (1..7)
 * using deterministic seed + trial number, constructing coupled gear starting states
 * by reversing known legal moves from [0, 0, 0] so every trial is provably solvable.
 */
export function createTrialPuzzles(trial: TrialNumber, seed: string): SeededPuzzles {
  const rng = createRng(`${seed}::TRIAL-${trial}`);
  const couplings = getTrialGearCouplings(trial);
  const stepCount = TRIAL_ASTROLABE_STEPS;

  // Start solved [0,0,0] and apply inverse clicks so every trial is guaranteed solvable
  let astro: AstrolabeState = {
    rings: [0, 0, 0],
    stepCount,
    couplings,
    solved: false,
  };

  // Number of reverse clicks per ring grows smoothly with trial difficulty
  const reverseCounts: [number, number, number] =
    trial <= 2
      ? [randInt(rng, 2, 4), randInt(rng, 1, 3), randInt(rng, 1, 3)]
      : trial <= 4
        ? [randInt(rng, 3, 6), randInt(rng, 2, 5), randInt(rng, 2, 5)]
        : [randInt(rng, 2, 5), randInt(rng, 2, 5), randInt(rng, 2, 5)];

  for (let ringIdx = 0; ringIdx < 3; ringIdx += 1) {
    for (let k = 0; k < reverseCounts[ringIdx]; k += 1) {
      astro = rotateAstrolabeRing(astro, ringIdx, -1).next;
    }
  }
  // Ensure not trivially solved after coupling cancellation
  if (astro.rings[0] === 0 && astro.rings[1] === 0 && astro.rings[2] === 0) {
    astro = rotateAstrolabeRing(astro, 0, -1).next;
    astro = rotateAstrolabeRing(astro, 2, -1).next;
  }
  astro = { ...astro, solved: false };

  // Build progressive mirror courtyard for this trial
  const layout = TRIAL_MIRROR_LAYOUTS[trial - 1];
  const collectors = layout.collectors ?? [layout.collector];
  const mirrorNodes = createSeededMirrorNodes(layout, rng);
  const trace = traceCourtyardBeams({
    emitter: layout.emitter,
    emitterDir: layout.emitterDir,
    collectors,
    pillars: layout.pillars,
    mirrors: mirrorNodes,
    splitters: layout.splitters,
  });

  let ranks = shuffleWithRng([0, 1, 2, 3], rng);
  if (ranks[0] === 0 && ranks[1] === 1 && ranks[2] === 2 && ranks[3] === 3) {
    ranks = [2, 0, 3, 1];
  }

  return {
    astrolabe: astro,
    mirrors: {
      layoutId: layout.id,
      layoutName: layout.name,
      emitter: { ...layout.emitter },
      emitterDir: { ...layout.emitterDir },
      collector: { ...layout.collector },
      collectors: collectors.map((c) => ({ ...c })),
      splitters: (layout.splitters ?? []).map((s) => ({ ...s, position: { ...s.position } })),
      litCollectorIndices: trace.litCollectorIndices,
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

function wrapMod(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

export function rotateAstrolabeRing(
  state: AstrolabeState,
  ringIndex: number,
  delta: 1 | -1 = 1,
): { next: AstrolabeState; aligned: boolean; justSolved: boolean; coupledRings: number[] } {
  if (ringIndex < 0 || ringIndex > 2) {
    return { next: state, aligned: false, justSolved: false, coupledRings: [] };
  }
  const stepCount = state.stepCount ?? ASTROLABE_STEPS;
  const couplings = state.couplings ?? [];
  const nextRings: [number, number, number] = [...state.rings];
  const matching = couplings.filter((c) => c.sourceRing === ringIndex);

  // If this ring drives a coupled gear with a specific sourceStep (e.g., +2 for 1:-0.5 ratio), apply it
  const primaryStep = matching.length > 0 ? matching[0].sourceStep : 1;
  nextRings[ringIndex] = wrapMod(nextRings[ringIndex] + delta * primaryStep, stepCount);

  const coupledRings: number[] = [];
  for (const link of matching) {
    if (link.targetRing >= 0 && link.targetRing <= 2 && link.targetRing !== ringIndex) {
      nextRings[link.targetRing] = wrapMod(
        nextRings[link.targetRing] + delta * link.targetStep,
        stepCount,
      );
      coupledRings.push(link.targetRing);
    }
  }

  const aligned = nextRings[ringIndex] === 0;
  const nowSolved = nextRings[0] === 0 && nextRings[1] === 0 && nextRings[2] === 0;
  return {
    next: {
      ...state,
      rings: nextRings,
      solved: state.solved || nowSolved,
    },
    aligned,
    justSolved: !state.solved && nowSolved,
    coupledRings,
  };
}

/**
 * Deterministic algebraic solver for any AstrolabeState (including coupled gear trains
 * where Outer -> Middle (1:-0.5) and Middle -> Inner (1:+1)). Returns ordered ring clicks.
 */
export function solveAstrolabePlan(state: AstrolabeState): number[] {
  const stepCount = state.stepCount ?? ASTROLABE_STEPS;
  const plan: number[] = [];
  let cur: AstrolabeState = {
    ...state,
    rings: [...state.rings] as [number, number, number],
    solved: false,
  };

  for (let ringIdx = 0; ringIdx < 3; ringIdx += 1) {
    let guard = 0;
    while (cur.rings[ringIdx] !== 0 && guard < stepCount * 2) {
      cur = rotateAstrolabeRing(cur, ringIdx, 1).next;
      plan.push(ringIdx);
      guard += 1;
    }
  }
  return plan;
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
  const collectors = state.collectors ?? [state.collector];
  const trace = traceCourtyardBeams({
    emitter: state.emitter,
    emitterDir: state.emitterDir,
    collectors,
    pillars: state.pillars,
    mirrors: nextMirrors,
    splitters: state.splitters,
  });
  const justSolved = !state.solved && trace.hitsCollector;
  return {
    next: {
      ...state,
      mirrors: nextMirrors,
      beamSegments: trace.segments,
      litMirrorCount: trace.litMirrorIndices.length,
      litCollectorIndices: trace.litCollectorIndices,
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
