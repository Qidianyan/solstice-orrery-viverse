import { describe, expect, it } from 'vitest';
import {
  createTrialPuzzles,
  getTrialGearCouplings,
  getTrialMetadata,
  rotateAstrolabeRing,
  rotateMirrorObelisk,
  solveAstrolabePlan,
  TRIAL_ASTROLABE_STEPS,
  TRIAL_CATALOG,
} from '../src/game/puzzles';
import { traceCourtyardBeams, TRIAL_MIRROR_LAYOUTS } from '../src/game/mirrors';
import { GameController } from '../src/game/controller';
import type { TrialNumber } from '../src/game/types';

const ALL_TRIALS: readonly TrialNumber[] = [1, 2, 3, 4, 5, 6, 7];

describe('V4 7-Trial progressive puzzle catalog, coupled bronze gears & beam splitters', () => {
  it('defines 7 distinct progressive trials with 4-stage warm eclipse sky evolution', () => {
    expect(TRIAL_CATALOG).toHaveLength(7);
    expect(TRIAL_MIRROR_LAYOUTS).toHaveLength(7);
    expect(getTrialMetadata(1).skyStage).toBe('noon-gold');
    expect(getTrialMetadata(2).skyStage).toBe('noon-gold');
    expect(getTrialMetadata(3).skyStage).toBe('amber-dusk');
    expect(getTrialMetadata(4).skyStage).toBe('amber-dusk');
    expect(getTrialMetadata(5).skyStage).toBe('crimson-eclipse');
    expect(getTrialMetadata(6).skyStage).toBe('crimson-eclipse');
    expect(getTrialMetadata(7).skyStage).toBe('crimson-eclipse');
    expect(getTrialMetadata(7).targetBeamCount).toBe(3);
  });

  it('guarantees every Trial 1..7 Astrolabe (including coupled gear trains) is provably solvable', () => {
    const seeds = ['SOL-2026-11-25', 'SOL-2026-12-04', 'SOL-VIVERSE-CHAMPION'];
    for (const seed of seeds) {
      for (const trial of ALL_TRIALS) {
        const { astrolabe } = createTrialPuzzles(trial, seed);
        expect(astrolabe.stepCount).toBe(TRIAL_ASTROLABE_STEPS);
        expect(astrolabe.solved).toBe(false);

        const plan = solveAstrolabePlan(astrolabe);
        expect(plan.length).toBeGreaterThan(0);

        let cur = astrolabe;
        for (const ringIdx of plan) {
          cur = rotateAstrolabeRing(cur, ringIdx, 1).next;
        }
        expect(cur.rings).toEqual([0, 0, 0]);
        expect(cur.solved).toBe(true);
      }
    }
  });

  it('enforces exact 1:-0.5 and 1:+1 mechanical bronze gear ratios in Trials 5..7', () => {
    const couplings5 = getTrialGearCouplings(5);
    expect(couplings5).toHaveLength(1);
    expect(couplings5[0]).toMatchObject({
      sourceRing: 0,
      targetRing: 1,
      sourceStep: 2,
      targetStep: -1,
    });

    const state5 = {
      rings: [0, 4, 3] as [number, number, number],
      stepCount: TRIAL_ASTROLABE_STEPS,
      couplings: couplings5,
      solved: false,
    };
    const r5 = rotateAstrolabeRing(state5, 0, 1);
    expect(r5.next.rings).toEqual([2, 3, 3]);
    expect(r5.coupledRings).toEqual([1]);

    const couplings7 = getTrialGearCouplings(7);
    expect(couplings7).toHaveLength(2);
    const state7 = {
      rings: [0, 2, 5] as [number, number, number],
      stepCount: TRIAL_ASTROLABE_STEPS,
      couplings: couplings7,
      solved: false,
    };
    const r7 = rotateAstrolabeRing(state7, 1, 1);
    expect(r7.next.rings).toEqual([0, 3, 6]);
    expect(r7.coupledRings).toEqual([2]);
  });

  it('solves every Trial 1..7 Mirror Courtyard including Dichroic Beam Splitters and Trial 7 triple-beam convergence', () => {
    for (const trial of ALL_TRIALS) {
      const { mirrors } = createTrialPuzzles(trial, 'SOL-2026-12-04');
      expect(mirrors.solved).toBe(false);

      let cur = mirrors;
      for (let i = 0; i < cur.mirrors.length; i += 1) {
        let guard = 0;
        while (cur.mirrors[i].orientation !== cur.mirrors[i].solutionOrientation && guard < 4) {
          cur = rotateMirrorObelisk(cur, i, 1).next;
          guard += 1;
        }
      }

      const expectedCollectors = getTrialMetadata(trial).targetBeamCount;
      expect(cur.solved).toBe(true);
      expect(cur.litCollectorIndices?.length).toBe(expectedCollectors);

      if (trial >= 5) {
        expect((cur.splitters ?? []).length).toBeGreaterThanOrEqual(trial === 7 ? 2 : 1);
        expect(cur.beamSegments.some((seg) => seg.hitKind === 'splitter')).toBe(true);
      }
    }
  });

  it('requires ALL 3 Collector Prisms lit simultaneously in Trial 7 (partial 2/3 does not solve)', () => {
    const layout7 = TRIAL_MIRROR_LAYOUTS[6];
    const mirrorsPartial = layout7.mirrors.map((m, idx) => ({
      ...m,
      orientation: idx === 2 ? (((m.solutionOrientation + 1) % 4) as 0 | 1 | 2 | 3) : m.solutionOrientation,
    }));
    const trace = traceCourtyardBeams({
      emitter: layout7.emitter,
      emitterDir: layout7.emitterDir,
      collectors: layout7.collectors ?? [layout7.collector],
      pillars: layout7.pillars,
      mirrors: mirrorsPartial,
      splitters: layout7.splitters,
    });
    expect(trace.litCollectorIndices.length).toBe(2);
    expect(trace.hitsCollector).toBe(false);
  });

  it('tracks Trial progression and Orbit/Walk camera mode toggles inside GameController', () => {
    const ctrl = new GameController({ seed: 'SOL-2026-12-04', trial: 1 });
    expect(ctrl.getSnapshot().currentTrial).toBe(1);
    expect(ctrl.getSnapshot().cameraMode).toBe('orbit');

    expect(ctrl.toggleCameraMode()).toBe('walk');
    expect(ctrl.getSnapshot().cameraMode).toBe('walk');
    expect(ctrl.toggleCameraMode()).toBe('orbit');

    ctrl.startTrial(5);
    expect(ctrl.getSnapshot().currentTrial).toBe(5);
    expect(ctrl.getSnapshot().trialMeta.hasCoupledGears).toBe(true);
    expect(ctrl.getSnapshot().trialMeta.hasBeamSplitter).toBe(true);

    expect(ctrl.advanceNextTrial()).toBe(true);
    expect(ctrl.getSnapshot().currentTrial).toBe(6);
    expect(ctrl.advanceNextTrial()).toBe(true);
    expect(ctrl.getSnapshot().currentTrial).toBe(7);
    expect(ctrl.advanceNextTrial()).toBe(false);
  });

  it('guards boundary inputs, cyclic mirror loops, single-emit trial switching, and victory walk->orbit sync', () => {
    // 1. Out-of-bounds indices leave puzzle state intact without throwing
    const { astrolabe, mirrors } = createTrialPuzzles(5, 'SOL-EDGE-TEST');
    expect(rotateAstrolabeRing(astrolabe, -1, 1).next).toBe(astrolabe);
    expect(rotateAstrolabeRing(astrolabe, 99, 1).next).toBe(astrolabe);
    expect(rotateMirrorObelisk(mirrors, -1, 1).next).toBe(mirrors);
    expect(rotateMirrorObelisk(mirrors, 42, 1).next).toBe(mirrors);

    // 2. Closed 4-mirror optical loop terminates cleanly without infinite recursion
    const cyclic = traceCourtyardBeams({
      emitter: { x: -3, z: -2 },
      emitterDir: { x: 1, z: 0 },
      collectors: [{ x: 0, z: 0 }],
      pillars: [],
      mirrors: [
        { id: 'c1', label: 'A', position: { x: 2, z: -2 }, orientation: 2, solutionOrientation: 2 },
        { id: 'c2', label: 'B', position: { x: 2, z: 2 }, orientation: 3, solutionOrientation: 3 },
        { id: 'c3', label: 'C', position: { x: -2, z: 2 }, orientation: 0, solutionOrientation: 0 },
        { id: 'c4', label: 'D', position: { x: -2, z: -2 }, orientation: 1, solutionOrientation: 1 },
      ],
    });
    expect(cyclic.segments.length).toBeGreaterThan(0);
    expect(cyclic.segments.length).toBeLessThanOrEqual(24);
    expect(cyclic.hitsCollector).toBe(false);

    // 3. startTrial emits once with trial-changed, and winning from walk mode resets cameraMode to orbit
    const ctrl = new GameController({ seed: 'SOL-EDGE-TEST', trial: 1 });
    ctrl.startDailyRitual();
    let emitCount = 0;
    const unsub = ctrl.subscribe(() => {
      emitCount += 1;
    });
    emitCount = 0;
    ctrl.startTrial(5);
    expect(emitCount).toBe(1);
    expect(ctrl.getSnapshot().lastEvent).toEqual({ type: 'trial-changed', trial: 5 });
    unsub();

    ctrl.setCameraMode('walk');
    const snap = ctrl.getSnapshot();
    for (const r of solveAstrolabePlan(snap.astrolabe)) ctrl.rotateAstrolabe(r, 1);
    for (let i = 0; i < snap.mirrors.mirrors.length; i += 1) {
      while (ctrl.getSnapshot().mirrors.mirrors[i].orientation !== snap.mirrors.mirrors[i].solutionOrientation) {
        ctrl.rotateMirror(i, 1);
      }
    }
    for (let rank = 0; rank < 4; rank += 1) {
      ctrl.strikeChime(ctrl.getSnapshot().chimes.slotRanks.indexOf(rank));
    }
    expect(ctrl.triggerApexCrown()).toBe(true);
    expect(ctrl.getSnapshot().phase).toBe('won');
    expect(ctrl.getSnapshot().cameraMode).toBe('orbit');
  });
});
