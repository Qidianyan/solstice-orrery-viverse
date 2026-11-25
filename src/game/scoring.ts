import type { ScoreBreakdown } from './types';

export const DEFAULT_ECLIPSE_DURATION_SEC = 300; // 5 minutes
export const PAR_MOVES = 22;

/**
 * Computes deterministic 1-3 star rating and numerical observatory score
 * from remaining eclipse countdown seconds and total player moves.
 */
export function calculateSolsticeScore(
  timeRemainingSec: number,
  moves: number,
  durationSec: number = DEFAULT_ECLIPSE_DURATION_SEC,
): ScoreBreakdown {
  const clampedTime = Math.max(0, Math.min(durationSec, timeRemainingSec));
  const safeMoves = Math.max(1, Math.floor(moves));

  const baseScore = 1500;
  const timeBonus = Math.round(clampedTime * 10);
  const extraMoves = Math.max(0, safeMoves - PAR_MOVES);
  const efficiencyBonus = Math.max(0, 1500 - extraMoves * 65);
  const totalScore = baseScore + timeBonus + efficiencyBonus;

  let stars: 1 | 2 | 3 = 1;
  if (clampedTime >= 150 && safeMoves <= 28) {
    stars = 3;
  } else if (clampedTime >= 60 && safeMoves <= 42) {
    stars = 2;
  }

  return {
    stars,
    totalScore,
    timeBonus,
    efficiencyBonus,
    baseScore,
  };
}

export function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
