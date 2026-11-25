import { describe, expect, it } from 'vitest';
import { GameController } from '../src/game/controller';
import { getAscendingChimeSlots } from '../src/game/puzzles';
import { calculateSolsticeScore, formatCountdown } from '../src/game/scoring';

function solveAllThreeWings(controller: GameController): void {
  // 1. Solve Astrolabe
  for (let r = 0; r < 3; r += 1) {
    while (controller.getSnapshot().astrolabe.rings[r] !== 0) {
      controller.rotateAstrolabe(r, 1);
    }
  }
  // 2. Solve Mirror Courtyard
  for (let m = 0; m < 3; m += 1) {
    while (
      controller.getSnapshot().mirrors.mirrors[m].orientation !==
      controller.getSnapshot().mirrors.mirrors[m].solutionOrientation
    ) {
      controller.rotateMirror(m, 1);
    }
  }
  // 3. Solve Harmonic Chimes
  const order = getAscendingChimeSlots(controller.getSnapshot().chimes);
  for (const slot of order) {
    controller.strikeChime(slot);
  }
}

describe('GameController Win/Lose Lifecycle & Scoring', () => {
  it('locks Apex Crown until all 3 conduits glow, then wins with deterministic star score', () => {
    const controller = new GameController({ seed: 'SOL-2026-11-23', durationSec: 300 });
    controller.startSeededRitual('SOL-2026-11-23', true);

    expect(controller.getSnapshot().phase).toBe('playing');
    expect(controller.triggerApexCrown()).toBe(false);
    expect(controller.getSnapshot().lastEvent?.type).toBe('apex-locked');

    solveAllThreeWings(controller);
    controller.tick(45); // 255s remaining

    const beforeIgnite = controller.getSnapshot();
    expect(beforeIgnite.solvedCount).toBe(3);
    expect(beforeIgnite.apexUnlocked).toBe(true);

    expect(controller.triggerApexCrown()).toBe(true);
    const won = controller.getSnapshot();
    expect(won.phase).toBe('won');
    expect(won.apexIgnited).toBe(true);
    expect(won.score).not.toBeNull();
    expect(won.score!.stars).toBeGreaterThanOrEqual(2);
    expect(won.score!.totalScore).toBeGreaterThan(3000);
  });

  it('transitions to lost state when 5-minute eclipse countdown reaches 0 and supports instant retry', () => {
    const controller = new GameController({ seed: 'SOL-2026-11-23', durationSec: 120 });
    controller.startSeededRitual('SOL-2026-11-23', true);

    controller.tick(60);
    expect(controller.getSnapshot().timeRemainingSec).toBe(60);
    expect(controller.getSnapshot().phase).toBe('playing');

    controller.tick(65);
    const lost = controller.getSnapshot();
    expect(lost.phase).toBe('lost');
    expect(lost.timeRemainingSec).toBe(0);
    expect(lost.lastEvent?.type).toBe('eclipse-expired');

    // Retry resets timer, moves, and puzzles deterministically on the same seed
    controller.retryCurrentSeed();
    const retried = controller.getSnapshot();
    expect(retried.phase).toBe('playing');
    expect(retried.seed).toBe('SOL-2026-11-23');
    expect(retried.timeRemainingSec).toBe(120);
    expect(retried.moves).toBe(0);
    expect(retried.solvedCount).toBe(0);
  });

  it('freezes eclipse timer in Free Explore Sandbox mode while keeping instruments interactive', () => {
    const controller = new GameController({ seed: 'SOL-2026-11-23', durationSec: 300 });
    controller.enterSandboxMode(false);
    expect(controller.getSnapshot().phase).toBe('sandbox');

    controller.tick(400);
    expect(controller.getSnapshot().phase).toBe('sandbox');
    expect(controller.getSnapshot().timeRemainingSec).toBe(300);

    const beforeRing = controller.getSnapshot().astrolabe.rings[0];
    controller.rotateAstrolabe(0, 1);
    expect(controller.getSnapshot().astrolabe.rings[0]).toBe((beforeRing + 1) % 8);
  });

  it('calculates 1, 2, and 3 star ratings cleanly and formats countdown strings', () => {
    expect(calculateSolsticeScore(210, 20).stars).toBe(3);
    expect(calculateSolsticeScore(95, 34).stars).toBe(2);
    expect(calculateSolsticeScore(20, 55).stars).toBe(1);
    expect(formatCountdown(300)).toBe('05:00');
    expect(formatCountdown(61.2)).toBe('01:02');
    expect(formatCountdown(0)).toBe('00:00');
  });
});
