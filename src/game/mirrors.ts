import type {
  BeamSegment,
  MirrorLayoutSpec,
  MirrorNode,
  MirrorOrientation,
  PillarObstacle,
  Vec2,
} from './types';
import { randInt } from './prng';

const SQRT1_2 = Math.SQRT1_2;

export const COURTYARD_HALF_EXTENT = 4.5;
const MIRROR_HIT_RADIUS = 0.56;
const COLLECTOR_HIT_RADIUS = 0.62;
const EPSILON = 1e-4;
const MAX_BOUNCES = 8;

export const MIRROR_NORMALS: Record<MirrorOrientation, Vec2> = {
  0: { x: SQRT1_2, z: -SQRT1_2 }, // NE
  1: { x: SQRT1_2, z: SQRT1_2 }, // SE
  2: { x: -SQRT1_2, z: SQRT1_2 }, // SW
  3: { x: -SQRT1_2, z: -SQRT1_2 }, // NW
};

export const MIRROR_ORIENTATION_LABELS: Record<MirrorOrientation, string> = {
  0: 'NE',
  1: 'SE',
  2: 'SW',
  3: 'NW',
};

/**
 * Yaw angle (radians around +Y) aligning a mesh whose reflective face points toward +Z
 * with the mirror's reflective normal in XZ space.
 */
export function orientationToYaw(orientation: MirrorOrientation): number {
  const n = MIRROR_NORMALS[orientation];
  return Math.atan2(n.x, n.z);
}

export const MIRROR_LAYOUTS: readonly MirrorLayoutSpec[] = [
  {
    id: 0,
    name: 'Clockwise Solar Spiral',
    emitter: { x: -3.0, z: -2.8 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 0.0, z: 0.0 },
    pillars: [
      { position: { x: -1.4, z: -1.0 }, radius: 0.55 },
      { position: { x: 1.5, z: 0.2 }, radius: 0.55 },
    ],
    mirrors: [
      { id: 'mirror-a', label: 'Obelisk I', position: { x: 3.0, z: -2.8 }, solutionOrientation: 2 },
      { id: 'mirror-b', label: 'Obelisk II', position: { x: 3.0, z: 2.8 }, solutionOrientation: 3 },
      { id: 'mirror-c', label: 'Obelisk III', position: { x: 0.0, z: 2.8 }, solutionOrientation: 0 },
    ],
  },
  {
    id: 1,
    name: 'Reverse Zenith Arc',
    emitter: { x: -3.0, z: 2.8 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 0.0, z: 0.0 },
    pillars: [
      { position: { x: -1.4, z: 1.0 }, radius: 0.55 },
      { position: { x: 1.5, z: -0.2 }, radius: 0.55 },
    ],
    mirrors: [
      { id: 'mirror-a', label: 'Obelisk I', position: { x: 3.0, z: 2.8 }, solutionOrientation: 3 },
      { id: 'mirror-b', label: 'Obelisk II', position: { x: 3.0, z: -2.8 }, solutionOrientation: 2 },
      { id: 'mirror-c', label: 'Obelisk III', position: { x: 0.0, z: -2.8 }, solutionOrientation: 1 },
    ],
  },
  {
    id: 2,
    name: 'Southern Meridian Hook',
    emitter: { x: -3.0, z: -2.8 },
    emitterDir: { x: 0, z: 1 },
    collector: { x: 0.0, z: 0.0 },
    pillars: [
      { position: { x: -1.2, z: -0.8 }, radius: 0.55 },
      { position: { x: 1.0, z: -1.6 }, radius: 0.55 },
    ],
    mirrors: [
      { id: 'mirror-a', label: 'Obelisk I', position: { x: -3.0, z: 2.8 }, solutionOrientation: 0 },
      { id: 'mirror-b', label: 'Obelisk II', position: { x: 3.0, z: 2.8 }, solutionOrientation: 3 },
      { id: 'mirror-c', label: 'Obelisk III', position: { x: 3.0, z: 0.0 }, solutionOrientation: 2 },
    ],
  },
];

function intersectRayCircle(origin: Vec2, dir: Vec2, center: Vec2, radius: number): number | null {
  const ocX = origin.x - center.x;
  const ocZ = origin.z - center.z;
  const b = ocX * dir.x + ocZ * dir.z;
  const c = ocX * ocX + ocZ * ocZ - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  const t1 = -b - sqrtD;
  if (t1 > EPSILON) return t1;
  const t2 = -b + sqrtD;
  if (t2 > EPSILON) return t2;
  return null;
}

function intersectRayBounds(origin: Vec2, dir: Vec2, halfExtent: number): number {
  let minT = Infinity;
  if (Math.abs(dir.x) > EPSILON) {
    const tx1 = (-halfExtent - origin.x) / dir.x;
    const tx2 = (halfExtent - origin.x) / dir.x;
    if (tx1 > EPSILON && tx1 < minT) minT = tx1;
    if (tx2 > EPSILON && tx2 < minT) minT = tx2;
  }
  if (Math.abs(dir.z) > EPSILON) {
    const tz1 = (-halfExtent - origin.z) / dir.z;
    const tz2 = (halfExtent - origin.z) / dir.z;
    if (tz1 > EPSILON && tz1 < minT) minT = tz1;
    if (tz2 > EPSILON && tz2 < minT) minT = tz2;
  }
  return Number.isFinite(minT) ? minT : halfExtent * 2;
}

function snapCardinal(v: Vec2): Vec2 {
  if (Math.abs(v.x) > Math.abs(v.z)) {
    return { x: v.x >= 0 ? 1 : -1, z: 0 };
  }
  return { x: 0, z: v.z >= 0 ? 1 : -1 };
}

export interface MirrorTraceResult {
  segments: BeamSegment[];
  hitsCollector: boolean;
  litMirrorIndices: number[];
}

export function traceMirrorBeam(
  emitter: Vec2,
  emitterDir: Vec2,
  collector: Vec2,
  pillars: readonly PillarObstacle[],
  mirrors: readonly MirrorNode[],
): MirrorTraceResult {
  const segments: BeamSegment[] = [];
  const litMirrors = new Set<number>();

  let origin: Vec2 = { ...emitter };
  let dir: Vec2 = { ...emitterDir };
  let lastMirrorIdx = -1;
  let hitsCollector = false;

  for (let bounce = 0; bounce < MAX_BOUNCES; bounce += 1) {
    let bestT = intersectRayBounds(origin, dir, COURTYARD_HALF_EXTENT);
    let hitKind: BeamSegment['hitKind'] = 'boundary';
    let hitMirrorIdx = -1;
    let exactStop: Vec2 = {
      x: origin.x + dir.x * bestT,
      z: origin.z + dir.z * bestT,
    };

    // Check collector prism
    const tCollector = intersectRayCircle(origin, dir, collector, COLLECTOR_HIT_RADIUS);
    if (tCollector !== null && tCollector < bestT) {
      bestT = tCollector;
      hitKind = 'collector';
      hitMirrorIdx = -1;
      exactStop = { ...collector };
    }

    // Check sandstone pillars
    for (const pillar of pillars) {
      const tPillar = intersectRayCircle(origin, dir, pillar.position, pillar.radius);
      if (tPillar !== null && tPillar < bestT) {
        bestT = tPillar;
        hitKind = 'pillar';
        hitMirrorIdx = -1;
        exactStop = {
          x: origin.x + dir.x * tPillar,
          z: origin.z + dir.z * tPillar,
        };
      }
    }

    // Check mirrors
    for (let i = 0; i < mirrors.length; i += 1) {
      if (i === lastMirrorIdx) continue;
      const mirror = mirrors[i];
      const tMirror = intersectRayCircle(origin, dir, mirror.position, MIRROR_HIT_RADIUS);
      if (tMirror !== null && tMirror < bestT) {
        bestT = tMirror;
        hitMirrorIdx = i;
        const normal = MIRROR_NORMALS[mirror.orientation];
        const dot = dir.x * normal.x + dir.z * normal.z;
        if (dot < -0.1) {
          hitKind = 'mirror-reflect';
          exactStop = { ...mirror.position };
        } else {
          hitKind = 'mirror-back';
          exactStop = {
            x: origin.x + dir.x * tMirror,
            z: origin.z + dir.z * tMirror,
          };
        }
      }
    }

    segments.push({
      from: { ...origin },
      to: exactStop,
      hitKind,
      hitMirrorIndex: hitMirrorIdx >= 0 ? hitMirrorIdx : undefined,
    });

    if (hitKind === 'collector') {
      hitsCollector = true;
      break;
    }

    if (hitKind === 'mirror-reflect' && hitMirrorIdx >= 0) {
      litMirrors.add(hitMirrorIdx);
      const mirror = mirrors[hitMirrorIdx];
      const normal = MIRROR_NORMALS[mirror.orientation];
      const dot = dir.x * normal.x + dir.z * normal.z;
      const reflected = snapCardinal({
        x: dir.x - 2 * dot * normal.x,
        z: dir.z - 2 * dot * normal.z,
      });
      origin = { ...mirror.position };
      dir = reflected;
      lastMirrorIdx = hitMirrorIdx;
      continue;
    }

    break;
  }

  return {
    segments,
    hitsCollector,
    litMirrorIndices: Array.from(litMirrors),
  };
}

export function createSeededMirrorNodes(layout: MirrorLayoutSpec, rng: () => number): MirrorNode[] {
  const nodes: MirrorNode[] = layout.mirrors.map((spec) => {
    const offset = randInt(rng, 1, 3);
    const orientation = ((spec.solutionOrientation + offset) % 4) as MirrorOrientation;
    return {
      id: spec.id,
      label: spec.label,
      position: { ...spec.position },
      orientation,
      solutionOrientation: spec.solutionOrientation,
    };
  });

  // Safety check: guarantee initial seeded state is never already solved
  const check = traceMirrorBeam(layout.emitter, layout.emitterDir, layout.collector, layout.pillars, nodes);
  if (check.hitsCollector) {
    nodes[0].orientation = ((nodes[0].orientation + 1) % 4) as MirrorOrientation;
  }
  return nodes;
}
