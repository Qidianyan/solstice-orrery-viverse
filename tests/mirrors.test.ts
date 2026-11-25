import { describe, expect, it } from 'vitest';
import {
  createSeededMirrorNodes,
  MIRROR_LAYOUTS,
  orientationToYaw,
  traceMirrorBeam,
} from '../src/game/mirrors';
import { createRng } from '../src/game/prng';

describe('Sandstone Mirror Courtyard Optical Ray Tracer', () => {
  it('solves cleanly when all mirrors are set to solution orientations in every layout', () => {
    for (const layout of MIRROR_LAYOUTS) {
      const solvedNodes = layout.mirrors.map((m) => ({
        id: m.id,
        label: m.label,
        position: { ...m.position },
        orientation: m.solutionOrientation,
        solutionOrientation: m.solutionOrientation,
      }));
      const trace = traceMirrorBeam(
        layout.emitter,
        layout.emitterDir,
        layout.collector,
        layout.pillars,
        solvedNodes,
      );
      expect(trace.hitsCollector).toBe(true);
      expect(trace.litMirrorIndices).toEqual([0, 1, 2]);
      expect(trace.segments.length).toBe(4);
      expect(trace.segments[3].hitKind).toBe('collector');
    }
  });

  it('stops beams cleanly when hitting the non-reflective back of a mirror', () => {
    const layout = MIRROR_LAYOUTS[0];
    const blockedNodes = layout.mirrors.map((m, idx) => ({
      id: m.id,
      label: m.label,
      position: { ...m.position },
      // Layout 0 emitter fires East (+1,0); NE (0) has normal (+x,-z) whose dot with (+1,0) > 0 (back face)
      orientation: idx === 0 ? (0 as const) : m.solutionOrientation,
      solutionOrientation: m.solutionOrientation,
    }));
    const trace = traceMirrorBeam(
      layout.emitter,
      layout.emitterDir,
      layout.collector,
      layout.pillars,
      blockedNodes,
    );
    expect(trace.hitsCollector).toBe(false);
    expect(trace.segments.length).toBe(1);
    expect(trace.segments[0].hitKind).toBe('mirror-back');
  });

  it('occludes rays that strike a sandstone pillar obstacle', () => {
    const trace = traceMirrorBeam(
      { x: -3, z: 0 },
      { x: 1, z: 0 },
      { x: 3, z: 0 },
      [{ position: { x: 0, z: 0 }, radius: 0.55 }],
      [],
    );
    expect(trace.hitsCollector).toBe(false);
    expect(trace.segments.length).toBe(1);
    expect(trace.segments[0].hitKind).toBe('pillar');
    expect(trace.segments[0].to.x).toBeCloseTo(-0.55, 2);
  });

  it('never generates an already-solved mirror courtyard across 60 seeds', () => {
    for (let i = 0; i < 60; i += 1) {
      const rng = createRng(`MIRROR-SEED-${i}`);
      const layout = MIRROR_LAYOUTS[i % MIRROR_LAYOUTS.length];
      const nodes = createSeededMirrorNodes(layout, rng);
      const initial = traceMirrorBeam(
        layout.emitter,
        layout.emitterDir,
        layout.collector,
        layout.pillars,
        nodes,
      );
      expect(initial.hitsCollector).toBe(false);
    }
  });

  it('maps all 4 diagonal orientations to distinct 90-degree separated yaws', () => {
    const yaws = [0, 1, 2, 3].map((o) => orientationToYaw(o as 0 | 1 | 2 | 3));
    expect(new Set(yaws.map((y) => Math.round(y * 100))).size).toBe(4);
  });
});
