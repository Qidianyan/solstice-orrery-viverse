import { describe, expect, it } from 'vitest';
import { GameController } from '../src/game/controller';
import { solveAstrolabePlan } from '../src/game/puzzles';
import type { TrialNumber } from '../src/game/types';
import {
  ONBOARDING_CUE_MS,
  OnboardingCueController,
  TRIAL_TRANSITION_MS,
} from '../src/ui/hud';

describe('V6-iter3 Judge onboarding cue, 0.6s trial transition & full 7-trial continuous mastery', () => {
  it('displays the 3-second onboarding cue once and dismisses immediately on first interaction or timeout', () => {
    expect(ONBOARDING_CUE_MS).toBe(3000);
    expect(TRIAL_TRANSITION_MS).toBe(600);

    const cue = new OnboardingCueController();
    expect(cue.isVisible()).toBe(false);
    expect(cue.triggerOnce()).toBe(true);
    expect(cue.isVisible()).toBe(true);
    // Subsequent starts do not re-trigger the first-time cue
    expect(cue.triggerOnce()).toBe(false);

    // Immediate dismissal on direct 3D interaction or keypress
    expect(cue.dismiss()).toBe(true);
    expect(cue.isVisible()).toBe(false);
    expect(cue.dismiss()).toBe(false);

    // Auto-timeout path after 3000ms (ignores non-positive/NaN ticks)
    const cue2 = new OnboardingCueController();
    cue2.triggerOnce();
    expect(cue2.tick(Number.NaN)).toBe(false);
    expect(cue2.tick(0)).toBe(false);
    expect(cue2.tick(1500)).toBe(false);
    expect(cue2.isVisible()).toBe(true);
    expect(cue2.tick(1600)).toBe(true);
    expect(cue2.isVisible()).toBe(false);
  });

  it('completes a continuous 7-trial campaign (Trials I..VII) and records all 7/7 best tempo entries', () => {
    const ctrl = new GameController({ seed: 'SOL-V6-CAMPAIGN', trial: 1 });
    ctrl.startDailyRitual();

    for (let t = 1 as TrialNumber; t <= 7; t = (t + 1) as TrialNumber) {
      expect(ctrl.getSnapshot().currentTrial).toBe(t);
      ctrl.tick(8 + t * 2);

      const snap = ctrl.getSnapshot();
      for (const ringIdx of solveAstrolabePlan(snap.astrolabe)) {
        ctrl.rotateAstrolabe(ringIdx, 1);
      }
      expect(ctrl.getSnapshot().astrolabe.solved).toBe(true);

      for (let m = 0; m < snap.mirrors.mirrors.length; m += 1) {
        let guard = 0;
        while (
          ctrl.getSnapshot().mirrors.mirrors[m].orientation !==
            snap.mirrors.mirrors[m].solutionOrientation &&
          guard < 4
        ) {
          ctrl.rotateMirror(m, 1);
          guard += 1;
        }
      }
      expect(ctrl.getSnapshot().mirrors.solved).toBe(true);

      for (let rank = 0; rank < 4; rank += 1) {
        const slot = ctrl.getSnapshot().chimes.slotRanks.indexOf(rank);
        ctrl.strikeChime(slot);
      }
      expect(ctrl.getSnapshot().chimes.solved).toBe(true);
      expect(ctrl.triggerApexCrown()).toBe(true);
      expect(ctrl.getSnapshot().phase).toBe('won');

      if (t < 7) {
        expect(ctrl.advanceNextTrial()).toBe(true);
      } else {
        expect(ctrl.advanceNextTrial()).toBe(false);
      }
    }

    const finalSnap = ctrl.getSnapshot();
    expect(finalSnap.completedTrials).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Object.keys(finalSnap.trialRecords)).toHaveLength(7);
    expect(finalSnap.trialRecords[7]?.trial).toBe(7);
    expect(finalSnap.trialRecords[7]?.stars).toBeGreaterThanOrEqual(2);
  });
});
