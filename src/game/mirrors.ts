import type {
  BeamSegment,
  MirrorLayoutSpec,
  MirrorNode,
  MirrorOrientation,
  PillarObstacle,
  SplitterNode,
  Vec2,
} from './types';
import { randInt } from './prng';

const SQRT1_2 = Math.SQRT1_2;

export const COURTYARD_HALF_EXTENT = 4.5;
const MIRROR_HIT_RADIUS = 0.56;
const SPLITTER_HIT_RADIUS = 0.52;
const COLLECTOR_HIT_RADIUS = 0.62;
const EPSILON = 1e-4;
const MAX_SEGMENTS = 24;

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

/** Classic seeded courtyard layouts (retained for Daily Seed compatibility). */
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

/**
 * Progressive 7-Trial Mirror Courtyard layouts:
 * Trials 1-2: Single-beam calibration & pillar deflection
 * Trials 3-4: Dual-pillar 3-mirror optical relays
 * Trials 5-6: Dichroic Beam Splitter Prism driving dual simultaneous collectors
 * Trial 7: Grand Solstice Eclipse Finale — dual splitters converging 3 simultaneous molten beams onto 3 prisms!
 */
export const TRIAL_MIRROR_LAYOUTS: readonly MirrorLayoutSpec[] = [
  // Trial 1: Single-beam calibration
  {
    id: 101,
    name: 'Trial I: Dawn Meridian Calibration',
    emitter: { x: -3.0, z: -2.4 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 0.0, z: 0.0 },
    collectors: [{ x: 0.0, z: 0.0 }],
    pillars: [],
    mirrors: [
      { id: 't1-m1', label: 'Obelisk I', position: { x: 0.0, z: -2.4 }, solutionOrientation: 2 },
    ],
  },
  // Trial 2: Two-mirror deflection around basalt column
  {
    id: 102,
    name: 'Trial II: Basalt Column Deflection',
    emitter: { x: -3.0, z: -2.8 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 0.0, z: 0.0 },
    collectors: [{ x: 0.0, z: 0.0 }],
    pillars: [{ position: { x: -0.4, z: -1.1 }, radius: 0.55 }],
    mirrors: [
      { id: 't2-m1', label: 'Obelisk I', position: { x: 2.8, z: -2.8 }, solutionOrientation: 2 },
      { id: 't2-m2', label: 'Obelisk II', position: { x: 2.8, z: 0.0 }, solutionOrientation: 3 },
    ],
  },
  // Trial 3: Dual-pillar 3-mirror clockwise relay
  {
    id: 103,
    name: 'Trial III: Dual Prism Relay',
    emitter: { x: -3.0, z: -2.8 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 0.0, z: 0.0 },
    collectors: [{ x: 0.0, z: 0.0 }],
    pillars: [
      { position: { x: -1.4, z: -1.0 }, radius: 0.55 },
      { position: { x: 1.5, z: 0.2 }, radius: 0.55 },
    ],
    mirrors: [
      { id: 't3-m1', label: 'Obelisk I', position: { x: 3.0, z: -2.8 }, solutionOrientation: 2 },
      { id: 't3-m2', label: 'Obelisk II', position: { x: 3.0, z: 2.8 }, solutionOrientation: 3 },
      { id: 't3-m3', label: 'Obelisk III', position: { x: 0.0, z: 2.8 }, solutionOrientation: 0 },
    ],
  },
  // Trial 4: Reverse zenith 3-mirror pillar labyrinth
  {
    id: 104,
    name: 'Trial IV: Obsidian Labyrinth',
    emitter: { x: -3.0, z: 2.8 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 0.0, z: 0.0 },
    collectors: [{ x: 0.0, z: 0.0 }],
    pillars: [
      { position: { x: -1.4, z: 1.0 }, radius: 0.55 },
      { position: { x: 1.5, z: -0.2 }, radius: 0.55 },
    ],
    mirrors: [
      { id: 't4-m1', label: 'Obelisk I', position: { x: 3.0, z: 2.8 }, solutionOrientation: 3 },
      { id: 't4-m2', label: 'Obelisk II', position: { x: 3.0, z: -2.8 }, solutionOrientation: 2 },
      { id: 't4-m3', label: 'Obelisk III', position: { x: 0.0, z: -2.8 }, solutionOrientation: 1 },
    ],
  },
  // Trial 5: Beam Splitter Prism + Dual Collectors + Coupled Gears
  {
    id: 105,
    name: 'Trial V: Twin Solstice Split',
    emitter: { x: -3.2, z: 0.0 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 3.0, z: -2.8 },
    collectors: [
      { x: 3.0, z: -2.8 },
      { x: 1.8, z: 1.2 },
    ],
    splitters: [{ id: 't5-s1', label: 'Dichroic Splitter', position: { x: -0.6, z: 0.0 }, orientation: 2 }],
    pillars: [
      { position: { x: -2.0, z: 1.6 }, radius: 0.52 },
      { position: { x: 1.2, z: -1.6 }, radius: 0.52 },
    ],
    mirrors: [
      { id: 't5-m1', label: 'Obelisk I', position: { x: 3.0, z: 0.0 }, solutionOrientation: 3 },
      { id: 't5-m2', label: 'Obelisk II', position: { x: -0.6, z: 2.8 }, solutionOrientation: 0 },
      { id: 't5-m3', label: 'Obelisk III', position: { x: 1.8, z: 2.8 }, solutionOrientation: 3 },
    ],
  },
  // Trial 6: Counter-Gear Central Splitter Dual Corridor
  {
    id: 106,
    name: 'Trial VI: Bifurcated Zenith',
    emitter: { x: -3.2, z: -2.8 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 3.0, z: -2.8 },
    collectors: [
      { x: 3.0, z: -2.8 },
      { x: 3.0, z: 2.8 },
    ],
    splitters: [{ id: 't6-s1', label: 'Zenith Splitter', position: { x: 0.0, z: 0.0 }, orientation: 0 }],
    pillars: [
      { position: { x: -1.6, z: 0.0 }, radius: 0.52 },
      { position: { x: 1.6, z: -1.4 }, radius: 0.52 },
    ],
    mirrors: [
      { id: 't6-m1', label: 'Obelisk I', position: { x: 0.0, z: -2.8 }, solutionOrientation: 2 },
      { id: 't6-m2', label: 'Obelisk II', position: { x: 3.0, z: 0.0 }, solutionOrientation: 3 },
      { id: 't6-m3', label: 'Obelisk III', position: { x: 0.0, z: 2.8 }, solutionOrientation: 0 },
    ],
  },
  // Trial 7: Grand Solstice Eclipse Finale — Dual Splitters -> Triple Simultaneous Convergent Beams!
  {
    id: 107,
    name: 'Trial VII: Grand Eclipse Tri-Beam',
    emitter: { x: -3.2, z: 0.0 },
    emitterDir: { x: 1, z: 0 },
    collector: { x: 2.4, z: -2.8 },
    collectors: [
      { x: 2.4, z: -2.8 },
      { x: 3.2, z: 2.6 },
      { x: -2.4, z: 2.6 },
    ],
    splitters: [
      { id: 't7-s1', label: 'West Splitter', position: { x: -1.2, z: 0.0 }, orientation: 3 },
      { id: 't7-s2', label: 'East Splitter', position: { x: 0.8, z: 0.0 }, orientation: 2 },
    ],
    pillars: [
      { position: { x: -2.2, z: -1.4 }, radius: 0.52 },
      { position: { x: 1.8, z: 1.2 }, radius: 0.52 },
    ],
    mirrors: [
      { id: 't7-m1', label: 'Obelisk I', position: { x: -1.2, z: -2.8 }, solutionOrientation: 1 },
      { id: 't7-m2', label: 'Obelisk II', position: { x: 3.2, z: 0.0 }, solutionOrientation: 2 },
      { id: 't7-m3', label: 'Obelisk III', position: { x: 0.8, z: 2.6 }, solutionOrientation: 3 },
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
  litCollectorIndices: number[];
}

interface PendingRay {
  origin: Vec2;
  dir: Vec2;
  ignoreMirrorIdx: number;
  ignoreSplitterIdx: number;
  depth: number;
}

/**
 * Multi-ray BFS optical beam tracer supporting single/multi collectors,
 * carved basalt pillar occlusion, single-sided gilded mirrors, and
 * dichroic crystal Beam Splitter Prisms.
 */
export function traceCourtyardBeams(params: {
  emitter: Vec2;
  emitterDir: Vec2;
  collectors: readonly Vec2[];
  pillars: readonly PillarObstacle[];
  mirrors: readonly MirrorNode[];
  splitters?: readonly SplitterNode[];
}): MirrorTraceResult {
  const { emitter, emitterDir, collectors, pillars, mirrors } = params;
  const splitters = params.splitters ?? [];

  const segments: BeamSegment[] = [];
  const litMirrors = new Set<number>();
  const litCollectors = new Set<number>();
  const visitedRayKeys = new Set<string>();

  const queue: PendingRay[] = [
    {
      origin: { ...emitter },
      dir: snapCardinal(emitterDir),
      ignoreMirrorIdx: -1,
      ignoreSplitterIdx: -1,
      depth: 0,
    },
  ];

  while (queue.length > 0 && segments.length < MAX_SEGMENTS) {
    const ray = queue.shift();
    if (!ray || ray.depth > 10) continue;

    const rayKey = `${ray.origin.x.toFixed(2)},${ray.origin.z.toFixed(2)}:${ray.dir.x},${ray.dir.z}`;
    if (visitedRayKeys.has(rayKey)) continue;
    visitedRayKeys.add(rayKey);

    let bestT = intersectRayBounds(ray.origin, ray.dir, COURTYARD_HALF_EXTENT);
    let hitKind: BeamSegment['hitKind'] = 'boundary';
    let hitMirrorIdx = -1;
    let hitSplitterIdx = -1;
    let hitCollectorIdx = -1;
    let exactStop: Vec2 = {
      x: ray.origin.x + ray.dir.x * bestT,
      z: ray.origin.z + ray.dir.z * bestT,
    };

    // Check all collector prisms
    for (let c = 0; c < collectors.length; c += 1) {
      const col = collectors[c];
      const tCol = intersectRayCircle(ray.origin, ray.dir, col, COLLECTOR_HIT_RADIUS);
      if (tCol !== null && tCol < bestT) {
        bestT = tCol;
        hitKind = 'collector';
        hitCollectorIdx = c;
        hitMirrorIdx = -1;
        hitSplitterIdx = -1;
        exactStop = { ...col };
      }
    }

    // Check carved basalt obstacle pillars
    for (const pillar of pillars) {
      const tPillar = intersectRayCircle(ray.origin, ray.dir, pillar.position, pillar.radius);
      if (tPillar !== null && tPillar < bestT) {
        bestT = tPillar;
        hitKind = 'pillar';
        hitCollectorIdx = -1;
        hitMirrorIdx = -1;
        hitSplitterIdx = -1;
        exactStop = {
          x: ray.origin.x + ray.dir.x * tPillar,
          z: ray.origin.z + ray.dir.z * tPillar,
        };
      }
    }

    // Check Beam Splitter Prisms
    for (let s = 0; s < splitters.length; s += 1) {
      if (s === ray.ignoreSplitterIdx) continue;
      const sp = splitters[s];
      const tSp = intersectRayCircle(ray.origin, ray.dir, sp.position, SPLITTER_HIT_RADIUS);
      if (tSp !== null && tSp < bestT) {
        bestT = tSp;
        hitKind = 'splitter';
        hitSplitterIdx = s;
        hitMirrorIdx = -1;
        hitCollectorIdx = -1;
        exactStop = { ...sp.position };
      }
    }

    // Check rotatable Mirror Obelisks
    for (let i = 0; i < mirrors.length; i += 1) {
      if (i === ray.ignoreMirrorIdx) continue;
      const mirror = mirrors[i];
      const tMirror = intersectRayCircle(ray.origin, ray.dir, mirror.position, MIRROR_HIT_RADIUS);
      if (tMirror !== null && tMirror < bestT) {
        bestT = tMirror;
        hitMirrorIdx = i;
        hitSplitterIdx = -1;
        hitCollectorIdx = -1;
        const normal = MIRROR_NORMALS[mirror.orientation];
        const dot = ray.dir.x * normal.x + ray.dir.z * normal.z;
        if (dot < -0.1) {
          hitKind = 'mirror-reflect';
          exactStop = { ...mirror.position };
        } else {
          hitKind = 'mirror-back';
          exactStop = {
            x: ray.origin.x + ray.dir.x * tMirror,
            z: ray.origin.z + ray.dir.z * tMirror,
          };
        }
      }
    }

    segments.push({
      from: { ...ray.origin },
      to: exactStop,
      hitKind,
      hitMirrorIndex: hitMirrorIdx >= 0 ? hitMirrorIdx : undefined,
      hitCollectorIndex: hitCollectorIdx >= 0 ? hitCollectorIdx : undefined,
      branchDepth: ray.depth,
    });

    if (hitKind === 'collector' && hitCollectorIdx >= 0) {
      litCollectors.add(hitCollectorIdx);
      continue;
    }

    if (hitKind === 'mirror-reflect' && hitMirrorIdx >= 0) {
      litMirrors.add(hitMirrorIdx);
      const mirror = mirrors[hitMirrorIdx];
      const normal = MIRROR_NORMALS[mirror.orientation];
      const dot = ray.dir.x * normal.x + ray.dir.z * normal.z;
      const reflected = snapCardinal({
        x: ray.dir.x - 2 * dot * normal.x,
        z: ray.dir.z - 2 * dot * normal.z,
      });
      queue.push({
        origin: { ...mirror.position },
        dir: reflected,
        ignoreMirrorIdx: hitMirrorIdx,
        ignoreSplitterIdx: -1,
        depth: ray.depth + 1,
      });
      continue;
    }

    if (hitKind === 'splitter' && hitSplitterIdx >= 0) {
      const sp = splitters[hitSplitterIdx];
      const baseNormal = MIRROR_NORMALS[sp.orientation];
      const dot = ray.dir.x * baseNormal.x + ray.dir.z * baseNormal.z;
      // Dichroic crystal splits incoming ray into straight transmitted ray + 90-degree reflected ray
      const effNormal = dot <= 0 ? baseNormal : { x: -baseNormal.x, z: -baseNormal.z };
      const effDot = ray.dir.x * effNormal.x + ray.dir.z * effNormal.z;
      const splitDir = snapCardinal({
        x: ray.dir.x - 2 * effDot * effNormal.x,
        z: ray.dir.z - 2 * effDot * effNormal.z,
      });

      // Branch 1: Straight transmitted beam
      queue.push({
        origin: { ...sp.position },
        dir: { ...ray.dir },
        ignoreMirrorIdx: -1,
        ignoreSplitterIdx: hitSplitterIdx,
        depth: ray.depth + 1,
      });
      // Branch 2: Reflected orthogonal beam
      queue.push({
        origin: { ...sp.position },
        dir: splitDir,
        ignoreMirrorIdx: -1,
        ignoreSplitterIdx: hitSplitterIdx,
        depth: ray.depth + 1,
      });
    }
  }

  const litCollectorIndices = Array.from(litCollectors).sort((a, b) => a - b);
  return {
    segments,
    hitsCollector: collectors.length > 0 && litCollectorIndices.length === collectors.length,
    litMirrorIndices: Array.from(litMirrors).sort((a, b) => a - b),
    litCollectorIndices,
  };
}

/**
 * Backward-compatible single-collector wrapper used by existing classic Daily Seed tests.
 */
export function traceMirrorBeam(
  emitter: Vec2,
  emitterDir: Vec2,
  collector: Vec2,
  pillars: readonly PillarObstacle[],
  mirrors: readonly MirrorNode[],
): MirrorTraceResult {
  return traceCourtyardBeams({
    emitter,
    emitterDir,
    collectors: [collector],
    pillars,
    mirrors,
  });
}

export function createSeededMirrorNodes(layout: MirrorLayoutSpec, rng: () => number): MirrorNode[] {
  const collectors = layout.collectors ?? [layout.collector];
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

  const check = traceCourtyardBeams({
    emitter: layout.emitter,
    emitterDir: layout.emitterDir,
    collectors,
    pillars: layout.pillars,
    mirrors: nodes,
    splitters: layout.splitters,
  });
  if (check.hitsCollector && nodes.length > 0) {
    nodes[0].orientation = ((nodes[0].orientation + 1) % 4) as MirrorOrientation;
  }
  return nodes;
}
