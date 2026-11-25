export type GamePhase = 'title' | 'playing' | 'won' | 'lost' | 'sandbox';

export type StationId = 'overview' | 'astrolabe' | 'mirrors' | 'chimes' | 'apex';

export type PuzzleId = 'astrolabe' | 'mirrors' | 'chimes';

export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Diagonal reflective face normals in XZ plane (+X East, +Z South):
 * 0 = NE (+x, -z), 1 = SE (+x, +z), 2 = SW (-x, +z), 3 = NW (-x, -z)
 */
export type MirrorOrientation = 0 | 1 | 2 | 3;

export interface MirrorNode {
  id: string;
  label: string;
  position: Vec2;
  orientation: MirrorOrientation;
  solutionOrientation: MirrorOrientation;
}

export interface PillarObstacle {
  position: Vec2;
  radius: number;
}

export interface BeamSegment {
  from: Vec2;
  to: Vec2;
  hitKind: 'mirror-reflect' | 'mirror-back' | 'pillar' | 'collector' | 'boundary';
  hitMirrorIndex?: number;
}

export interface MirrorLayoutSpec {
  id: number;
  name: string;
  emitter: Vec2;
  emitterDir: Vec2;
  collector: Vec2;
  pillars: PillarObstacle[];
  mirrors: Array<{
    id: string;
    label: string;
    position: Vec2;
    solutionOrientation: MirrorOrientation;
  }>;
}

export interface AstrolabeState {
  /** Ring steps in 0..7 (45 deg each). Zenith alignment target is 0. */
  rings: [number, number, number];
  solved: boolean;
}

export interface MirrorCourtyardState {
  layoutId: number;
  layoutName: string;
  emitter: Vec2;
  emitterDir: Vec2;
  collector: Vec2;
  pillars: PillarObstacle[];
  mirrors: MirrorNode[];
  beamSegments: BeamSegment[];
  litMirrorCount: number;
  solved: boolean;
}

export interface ChimesState {
  /** Maps physical bell index (0..3 left-to-right) to harmonic pitch rank (0=lowest D4 .. 3=highest A4). */
  slotRanks: [number, number, number, number];
  /** Physical slot indices struck correctly so far in current attempt. */
  struckSlots: number[];
  /** Number of consecutive ascending steps currently matched (0..4). */
  progress: number;
  /** Timestamp/counter incremented on wrong strike for visual/audio feedback. */
  lastMistakeTick: number;
  solved: boolean;
}

export interface ScoreBreakdown {
  stars: 1 | 2 | 3;
  totalScore: number;
  timeBonus: number;
  efficiencyBonus: number;
  baseScore: number;
}

export interface BestRecord {
  seed: string;
  stars: 1 | 2 | 3;
  score: number;
  timeRemainingSec: number;
  moves: number;
}

export interface GameSnapshot {
  phase: GamePhase;
  seed: string;
  isDailySeed: boolean;
  activeStation: StationId;
  timeRemainingSec: number;
  durationSec: number;
  moves: number;
  astrolabe: AstrolabeState;
  mirrors: MirrorCourtyardState;
  chimes: ChimesState;
  apexUnlocked: boolean;
  apexIgnited: boolean;
  solvedCount: number;
  score: ScoreBreakdown | null;
  bestRecord: BestRecord | null;
  lastEvent: GameEvent | null;
}

export type GameEvent =
  | { type: 'ritual-started'; seed: string; mode: 'daily' | 'random' | 'sandbox' }
  | { type: 'station-changed'; station: StationId }
  | { type: 'astrolabe-rotated'; ringIndex: number; aligned: boolean; solved: boolean }
  | { type: 'mirror-rotated'; mirrorIndex: number; solved: boolean; beamHitsCollector: boolean }
  | { type: 'chime-struck'; slotIndex: number; rank: number; correct: boolean; solved: boolean }
  | { type: 'chime-pulse-requested'; sequenceSlots: number[] }
  | { type: 'apex-locked'; remaining: number }
  | { type: 'apex-ignited'; score: ScoreBreakdown }
  | { type: 'eclipse-expired' };
