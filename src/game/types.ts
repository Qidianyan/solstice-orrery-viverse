export type GamePhase = 'title' | 'playing' | 'won' | 'lost' | 'sandbox';

export type StationId = 'overview' | 'astrolabe' | 'mirrors' | 'chimes' | 'apex';

export type PuzzleId = 'astrolabe' | 'mirrors' | 'chimes';

export type CameraMode = 'orbit' | 'walk';

export type TrialNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SkyEvolutionStage = 'noon-gold' | 'amber-dusk' | 'crimson-eclipse' | 'dawn-corona';

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

export interface SplitterNode {
  id: string;
  label: string;
  position: Vec2;
  /** Diagonal crystal plane orientation splitting incoming ray into transmitted + reflected orthogonal rays */
  orientation: MirrorOrientation;
}

export interface PillarObstacle {
  position: Vec2;
  radius: number;
}

export interface BeamSegment {
  from: Vec2;
  to: Vec2;
  hitKind: 'mirror-reflect' | 'mirror-back' | 'splitter' | 'pillar' | 'collector' | 'boundary';
  hitMirrorIndex?: number;
  hitCollectorIndex?: number;
  branchDepth?: number;
}

export interface MirrorLayoutSpec {
  id: number;
  name: string;
  emitter: Vec2;
  emitterDir: Vec2;
  collector: Vec2;
  /** Optional multi-collector list for splitter trials; defaults to [collector]. */
  collectors?: Vec2[];
  /** Optional beam splitter prisms splitting a beam into two orthogonal rays. */
  splitters?: SplitterNode[];
  pillars: PillarObstacle[];
  mirrors: Array<{
    id: string;
    label: string;
    position: Vec2;
    solutionOrientation: MirrorOrientation;
  }>;
}

export interface GearCoupling {
  sourceRing: number;
  targetRing: number;
  /** Primary step delta applied to sourceRing per click (e.g., +2 for 30° on 15° detent wheel). */
  sourceStep: number;
  /** Coupled step delta applied to targetRing per click (e.g., -1 for -15°, ratio 1:-0.5). */
  targetStep: number;
  ratioLabel: string;
}

export interface AstrolabeState {
  /** Ring steps in 0..(stepCount-1). Zenith alignment target is 0. */
  rings: [number, number, number];
  /** Discrete detent count per revolution (8 for classic 45°, 24 for 15° magnetic detent). */
  stepCount?: number;
  /** Active mechanical gear couplings between concentric bronze rings. */
  couplings?: GearCoupling[];
  solved: boolean;
}

export interface MirrorCourtyardState {
  layoutId: number;
  layoutName: string;
  emitter: Vec2;
  emitterDir: Vec2;
  collector: Vec2;
  collectors?: Vec2[];
  splitters?: SplitterNode[];
  litCollectorIndices?: number[];
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

export interface TrialMetadata {
  number: TrialNumber;
  title: string;
  subtitle: string;
  skyStage: SkyEvolutionStage;
  hasCoupledGears: boolean;
  hasBeamSplitter: boolean;
  targetBeamCount: number;
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
  cameraMode: CameraMode;
  currentTrial: TrialNumber;
  trialMeta: TrialMetadata;
  completedTrials: TrialNumber[];
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
  | { type: 'ritual-started'; seed: string; mode: 'daily' | 'random' | 'sandbox'; trial: TrialNumber }
  | { type: 'trial-changed'; trial: TrialNumber }
  | { type: 'camera-mode-changed'; mode: CameraMode }
  | { type: 'station-changed'; station: StationId }
  | { type: 'astrolabe-rotated'; ringIndex: number; aligned: boolean; solved: boolean; coupledRings: number[] }
  | { type: 'mirror-rotated'; mirrorIndex: number; solved: boolean; beamHitsCollector: boolean }
  | { type: 'chime-struck'; slotIndex: number; rank: number; correct: boolean; solved: boolean }
  | { type: 'chime-pulse-requested'; sequenceSlots: number[] }
  | { type: 'apex-locked'; remaining: number }
  | { type: 'apex-ignited'; score: ScoreBreakdown }
  | { type: 'eclipse-expired' };
