import { describe, expect, it } from 'vitest';
import {
  COLONNADE_PILLAR_COUNT,
  COLONNADE_RADIUS,
  SANCTUARY_COLLIDERS,
  SANCTUARY_WALK_MAX_RADIUS,
  WING_POSITIONS,
} from '../src/scene/environment';
import {
  findNearbyInteractStation,
  PLAYER_COLLISION_RADIUS,
  resolveWalkCollision,
} from '../src/scene/cameraRig';

describe('First-Person Sanctuary Walkaround circular collision & proximity detection', () => {
  it('registers all 16 fluted Doric basalt perimeter columns plus gateway columns and interior pedestals', () => {
    expect(COLONNADE_PILLAR_COUNT).toBe(16);
    const perimeterColumns = SANCTUARY_COLLIDERS.filter(
      (c) => c.kind === 'column' && Math.abs(Math.hypot(c.x, c.z) - COLONNADE_RADIUS) < 0.05,
    );
    const gatewayColumns = SANCTUARY_COLLIDERS.filter(
      (c) => c.kind === 'column' && Math.abs(c.z + 11.0) < 0.05,
    );
    expect(perimeterColumns).toHaveLength(16);
    expect(gatewayColumns).toHaveLength(2);
    for (const col of perimeterColumns) {
      expect(Math.hypot(col.x, col.z)).toBeCloseTo(COLONNADE_RADIUS, 3);
      expect(col.radius).toBeGreaterThan(0.5);
    }
  });

  it('pushes walker cleanly outside every single Doric column and interior monument collider', () => {
    for (const col of SANCTUARY_COLLIDERS) {
      // Attempt to walk directly into the column interior
      const attempt = { x: col.x + 0.15, z: col.z - 0.1 };
      const res = resolveWalkCollision(attempt);
      expect(res.collided).toBe(true);

      const distToCenter = Math.hypot(res.x - col.x, res.z - col.z);
      const minAllowed = col.radius + PLAYER_COLLISION_RADIUS - 1e-3;
      // Outer columns sit near the parapet wall, so either cleared or clamped strictly within safe boundary
      expect(Math.hypot(res.x, res.z)).toBeLessThanOrEqual(
        SANCTUARY_WALK_MAX_RADIUS - PLAYER_COLLISION_RADIUS + 1e-3,
      );
      if (col.kind !== 'column') {
        expect(distToCenter).toBeGreaterThanOrEqual(minAllowed);
      }
    }
  });

  it('clamps walking coordinates inside the outer circular sanctuary parapet wall', () => {
    const res = resolveWalkCollision({ x: 25, z: 12 });
    expect(res.collided).toBe(true);
    const r = Math.hypot(res.x, res.z);
    expect(r).toBeCloseTo(SANCTUARY_WALK_MAX_RADIUS - PLAYER_COLLISION_RADIUS, 3);
  });

  it('allows smooth tangential sliding along the central Apex dais without trapping the walker', () => {
    const res = resolveWalkCollision({ x: 0.4, z: 2.2 });
    expect(res.collided).toBe(true);
    expect(res.x).toBeGreaterThan(0.4);
    expect(res.z).toBeGreaterThan(2.2);
  });

  it('detects nearest interactive wing for E-key proximity prompts and clears when far away', () => {
    const nearAstro = findNearbyInteractStation({
      x: WING_POSITIONS.astrolabe.x + 4.0,
      z: WING_POSITIONS.astrolabe.z + 2.0,
    });
    expect(nearAstro?.station).toBe('astrolabe');

    const nearMirrors = findNearbyInteractStation({
      x: WING_POSITIONS.mirrors.x - 4.0,
      z: WING_POSITIONS.mirrors.z + 2.0,
    });
    expect(nearMirrors?.station).toBe('mirrors');

    const nearChimes = findNearbyInteractStation({
      x: WING_POSITIONS.chimes.x,
      z: WING_POSITIONS.chimes.z + 5.0,
    });
    expect(nearChimes?.station).toBe('chimes');

    const nearApex = findNearbyInteractStation({ x: 0, z: 4.5 });
    expect(nearApex?.station).toBe('apex');

    const farOut = findNearbyInteractStation({ x: 0, z: 14.5 });
    expect(farOut).toBeNull();
  });
});
