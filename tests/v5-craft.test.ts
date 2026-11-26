import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../src/game/controller';
import { dispatchDirect3DAction } from '../src/game/directInteraction';
import { solveAstrolabePlan } from '../src/game/puzzles';
import {
  CONDUIT_HARMONIC_CHORD,
  getConduitHarmonicFrequencies,
  GRAND_SOLAR_CHORD,
} from '../src/audio/soundEngine';
import { AdaptiveQualityController } from '../src/scene/adaptiveQuality';
import { CinemaModeController, TOAST_AUTO_FADE_MS } from '../src/ui/hud';

describe('V5-iter2 3D direct manipulation, bronze harmonics, adaptive DPR & Cinema mode', () => {
  it('dispatches 3D direct clicks across rings, mirrors, chimes, gong, apex, and pads without unwanted camera jumps', () => {
    const ctrl = new GameController({ seed: 'SOL-V5-DIRECT', trial: 5 });
    // Blocked while still on title screen
    expect(
      dispatchDirect3DAction(ctrl, { kind: 'astrolabe-ring', ringIndex: 0, label: 'Outer Ring' }),
    ).toBe(false);

    ctrl.startDailyRitual();
    ctrl.setCameraMode('walk');
    const beforeRings = [...ctrl.getSnapshot().astrolabe.rings];
    expect(
      dispatchDirect3DAction(ctrl, { kind: 'astrolabe-ring', ringIndex: 0, label: 'Outer Ring' }),
    ).toBe(true);
    expect(ctrl.getSnapshot().astrolabe.rings[0]).not.toBe(beforeRings[0]);
    expect(ctrl.getSnapshot().activeStation).toBe('overview'); // No forced camera station jump!

    const beforeOri = ctrl.getSnapshot().mirrors.mirrors[0].orientation;
    expect(
      dispatchDirect3DAction(ctrl, { kind: 'mirror', mirrorIndex: 0, label: 'Obelisk I' }),
    ).toBe(true);
    expect(ctrl.getSnapshot().mirrors.mirrors[0].orientation).toBe((beforeOri + 1) % 4);

    expect(
      dispatchDirect3DAction(ctrl, { kind: 'chime-gong', label: 'Gong' }),
    ).toBe(true);
    expect(ctrl.getSnapshot().lastEvent?.type).toBe('chime-pulse-requested');

    const lowestSlot = ctrl.getSnapshot().chimes.slotRanks.indexOf(0);
    expect(
      dispatchDirect3DAction(ctrl, { kind: 'chime', slotIndex: lowestSlot, label: 'Bell' }),
    ).toBe(true);
    expect(ctrl.getSnapshot().chimes.progress).toBe(1);

    const onTeleportPad = vi.fn();
    expect(
      dispatchDirect3DAction(
        ctrl,
        { kind: 'pad', station: 'apex', label: 'Apex Pad' },
        { onTeleportPad },
      ),
    ).toBe(true);
    expect(ctrl.getSnapshot().activeStation).toBe('apex');
    expect(onTeleportPad).toHaveBeenCalledWith('apex');

    // Clicking locked Apex reports apex-locked event cleanly
    expect(
      dispatchDirect3DAction(ctrl, { kind: 'apex-crown', label: 'Apex Crown' }),
    ).toBe(true);
    expect(ctrl.getSnapshot().lastEvent?.type).toBe('apex-locked');
  });

  it('layers Pythagorean bronze overtones (C4/G4/D5/A5) per conduit and unlocks Great Solar Chord on Trial 7 Finale', () => {
    expect(CONDUIT_HARMONIC_CHORD).toEqual([261.63, 392.0, 587.33, 880.0]);
    expect(getConduitHarmonicFrequencies(0)).toEqual([]);
    expect(getConduitHarmonicFrequencies(-3)).toEqual([]);
    expect(getConduitHarmonicFrequencies(1)).toEqual([261.63]);
    expect(getConduitHarmonicFrequencies(2)).toEqual([261.63, 392.0]);
    expect(getConduitHarmonicFrequencies(3)).toEqual([261.63, 392.0, 587.33]);
    expect(getConduitHarmonicFrequencies(3, { apexIgnited: true, trialNumber: 4 })).toEqual([
      261.63, 392.0, 587.33, 880.0,
    ]);
    expect(getConduitHarmonicFrequencies(3, { apexIgnited: true, trialNumber: 7 })).toEqual([
      ...GRAND_SOLAR_CHORD,
    ]);
  });

  it('smoothly scales DPR (1.0..2.0) and dust particle ratio (0.45..1.0) under sustained load and recovers at 60fps', () => {
    const q = new AdaptiveQualityController({
      nativeDpr: 2.0,
      minDpr: 1.0,
      maxDpr: 2.0,
      adjustCooldownSec: 0.4,
    });
    expect(q.getState().dpr).toBe(2.0);
    expect(q.getState().particleScale).toBe(1.0);

    // Non-finite or background-tab stall (>150ms) never corrupts or drops quality
    expect(q.recordFrame(Number.NaN).changed).toBe(false);
    expect(q.recordFrame(0).changed).toBe(false);
    expect(q.recordFrame(0.8).changed).toBe(false);
    expect(q.getState().dpr).toBe(2.0);

    // Sustained slow frames (~33ms = 30fps) step DPR and particleScale smoothly downward
    let downChanged = false;
    for (let i = 0; i < 60; i += 1) {
      const res = q.recordFrame(0.033);
      if (res.changed) downChanged = true;
    }
    const degraded = q.getState();
    expect(downChanged).toBe(true);
    expect(degraded.dpr).toBeLessThan(2.0);
    expect(degraded.dpr).toBeGreaterThanOrEqual(1.0);
    expect(degraded.particleScale).toBeLessThan(1.0);
    expect(degraded.particleScale).toBeGreaterThanOrEqual(0.45);

    // Sustained fast frames (~10ms = 100fps headroom) recover DPR & particleScale upward
    let upChanged = false;
    for (let i = 0; i < 160; i += 1) {
      const res = q.recordFrame(0.01);
      if (res.changed) upChanged = true;
    }
    const recovered = q.getState();
    expect(upChanged).toBe(true);
    expect(recovered.dpr).toBeGreaterThan(degraded.dpr);
    expect(recovered.dpr).toBeLessThanOrEqual(2.0);
    expect(recovered.particleScale).toBeGreaterThan(degraded.particleScale);
    expect(recovered.particleScale).toBeLessThanOrEqual(1.0);
  });

  it('toggles Cinema minimalist mode cleanly and tracks per-trial personal best tempo records', () => {
    const cinema = new CinemaModeController();
    expect(cinema.isActive()).toBe(false);
    expect(cinema.toggle()).toBe(true);
    expect(cinema.isActive()).toBe(true);
    expect(cinema.toggle()).toBe(false);
    expect(cinema.setActive(true)).toBe(true);
    expect(cinema.setActive(false)).toBe(false);
    expect(TOAST_AUTO_FADE_MS).toBe(2400);

    const ctrl = new GameController({ seed: 'SOL-V5-RECORD', trial: 1 });
    ctrl.startDailyRitual();
    ctrl.tick(24);
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

    const wonSnap = ctrl.getSnapshot();
    const rec1 = wonSnap.trialRecords[1];
    expect(rec1).toBeDefined();
    expect(rec1?.trial).toBe(1);
    expect(rec1?.elapsedSec).toBe(24);
    expect(rec1?.moves).toBe(wonSnap.moves);
    expect(rec1?.stars).toBeGreaterThanOrEqual(1);
  });
});
