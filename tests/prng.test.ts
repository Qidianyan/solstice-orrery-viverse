import { describe, expect, it } from 'vitest';
import {
  createRng,
  generateRandomSeed,
  getDailySeedString,
  hashSeed,
  randInt,
  shuffleWithRng,
} from '../src/game/prng';

describe('Deterministic PRNG & Daily Seed', () => {
  it('hashes identical seeds identically and distinct seeds differently', () => {
    expect(hashSeed('SOL-2026-11-23')).toBe(hashSeed('SOL-2026-11-23'));
    expect(hashSeed('SOL-2026-11-23')).not.toBe(hashSeed('SOL-2026-11-24'));
  });

  it('produces identical float sequences for the same seed', () => {
    const a = createRng('SOL-2026-12-04');
    const b = createRng('SOL-2026-12-04');
    const seqA = Array.from({ length: 12 }, () => a());
    const seqB = Array.from({ length: 12 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('formats daily seed strings deterministically as SOL-YYYY-MM-DD', () => {
    const sample = new Date(2026, 11, 4); // Dec 4, 2026
    expect(getDailySeedString(sample)).toBe('SOL-2026-12-04');
  });

  it('generates inclusive random integers and deterministic shuffles', () => {
    const rng = createRng('SHUFFLE-SEED');
    for (let i = 0; i < 40; i += 1) {
      const n = randInt(rng, 2, 6);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
    }
    const s1 = shuffleWithRng([0, 1, 2, 3], createRng('PERM-1'));
    const s2 = shuffleWithRng([0, 1, 2, 3], createRng('PERM-1'));
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual([0, 1, 2, 3]);
  });

  it('creates prefixed random challenge seeds', () => {
    const seed = generateRandomSeed(1732400000);
    expect(seed.startsWith('SKY-')).toBe(true);
    expect(seed.length).toBe(9);
  });
});
