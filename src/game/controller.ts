import type {
  AstrolabeState,
  BestRecord,
  CameraMode,
  ChimesState,
  GameEvent,
  GamePhase,
  GameSnapshot,
  MirrorCourtyardState,
  ScoreBreakdown,
  StationId,
  TrialNumber,
  TrialRecord,
} from './types';
import { generateRandomSeed, getDailySeedString } from './prng';
import {
  createSeededPuzzles,
  createTrialPuzzles,
  getAscendingChimeSlots,
  getTrialMetadata,
  rotateAstrolabeRing,
  rotateMirrorObelisk,
  strikeChimeSlot,
} from './puzzles';
import { calculateSolsticeScore, DEFAULT_ECLIPSE_DURATION_SEC } from './scoring';

const STORAGE_KEY = 'solstice-orrery-best-v1';
const TRIAL_RECORDS_KEY = 'solstice-orrery-records-v5';

export type SnapshotListener = (snapshot: GameSnapshot) => void;

function readBestRecord(): BestRecord | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BestRecord>;
    if (
      typeof parsed.seed === 'string' &&
      (parsed.stars === 1 || parsed.stars === 2 || parsed.stars === 3) &&
      typeof parsed.score === 'number' &&
      typeof parsed.timeRemainingSec === 'number' &&
      typeof parsed.moves === 'number'
    ) {
      return parsed as BestRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function writeBestRecord(record: BestRecord): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Sandboxed iframe environments may disallow localStorage; fail silently.
  }
}

function readTrialRecords(): Partial<Record<TrialNumber, TrialRecord>> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(TRIAL_RECORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<TrialRecord>>;
    const out: Partial<Record<TrialNumber, TrialRecord>> = {};
    for (const key of Object.keys(parsed)) {
      const t = Number(key) as TrialNumber;
      const rec = parsed[key];
      if (
        t >= 1 &&
        t <= 7 &&
        rec &&
        (rec.stars === 1 || rec.stars === 2 || rec.stars === 3) &&
        typeof rec.score === 'number' &&
        typeof rec.moves === 'number' &&
        typeof rec.elapsedSec === 'number' &&
        typeof rec.timeRemainingSec === 'number' &&
        typeof rec.seed === 'string'
      ) {
        out[t] = {
          trial: t,
          stars: rec.stars,
          score: rec.score,
          moves: rec.moves,
          elapsedSec: rec.elapsedSec,
          timeRemainingSec: rec.timeRemainingSec,
          seed: rec.seed,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeTrialRecords(records: Partial<Record<TrialNumber, TrialRecord>>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(TRIAL_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Ignore restricted iframe storage errors
  }
}

export class GameController {
  private phase: GamePhase = 'title';
  private seed: string;
  private isDailySeed = true;
  private activeStation: StationId = 'overview';
  private cameraMode: CameraMode = 'orbit';
  private currentTrial: TrialNumber = 1;
  private useTrialMode = false;
  private completedTrials = new Set<TrialNumber>();
  private durationSec: number;
  private timeRemainingSec: number;
  private moves = 0;

  private astrolabe: AstrolabeState;
  private mirrors: MirrorCourtyardState;
  private chimes: ChimesState;
  private apexIgnited = false;
  private score: ScoreBreakdown | null = null;
  private bestRecord: BestRecord | null;
  private trialRecords: Partial<Record<TrialNumber, TrialRecord>>;
  private lastEvent: GameEvent | null = null;

  private listeners = new Set<SnapshotListener>();

  constructor(options?: {
    seed?: string;
    durationSec?: number;
    isDailySeed?: boolean;
    trial?: TrialNumber;
  }) {
    this.durationSec = options?.durationSec ?? DEFAULT_ECLIPSE_DURATION_SEC;
    this.timeRemainingSec = this.durationSec;
    this.seed = options?.seed ?? getDailySeedString();
    this.isDailySeed = options?.isDailySeed ?? true;
    if (options?.trial) {
      this.currentTrial = options.trial;
      this.useTrialMode = true;
      const initial = createTrialPuzzles(options.trial, this.seed);
      this.astrolabe = initial.astrolabe;
      this.mirrors = initial.mirrors;
      this.chimes = initial.chimes;
    } else {
      const initial = createSeededPuzzles(this.seed);
      this.astrolabe = initial.astrolabe;
      this.mirrors = initial.mirrors;
      this.chimes = initial.chimes;
    }
    this.bestRecord = readBestRecord();
    this.trialRecords = readTrialRecords();
    for (const k of Object.keys(this.trialRecords)) {
      this.completedTrials.add(Number(k) as TrialNumber);
    }
  }

  public subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): GameSnapshot {
    const solvedCount =
      (this.astrolabe.solved ? 1 : 0) +
      (this.mirrors.solved ? 1 : 0) +
      (this.chimes.solved ? 1 : 0);

    return {
      phase: this.phase,
      seed: this.seed,
      isDailySeed: this.isDailySeed,
      activeStation: this.activeStation,
      cameraMode: this.cameraMode,
      currentTrial: this.currentTrial,
      trialMeta: getTrialMetadata(this.currentTrial),
      completedTrials: Array.from(this.completedTrials).sort((a, b) => a - b),
      trialRecords: Object.fromEntries(
        Object.entries(this.trialRecords).map(([k, v]) => [k, v ? { ...v } : undefined]),
      ) as Partial<Record<TrialNumber, TrialRecord>>,
      timeRemainingSec: this.timeRemainingSec,
      durationSec: this.durationSec,
      moves: this.moves,
      astrolabe: {
        rings: [...this.astrolabe.rings] as [number, number, number],
        stepCount: this.astrolabe.stepCount,
        couplings: this.astrolabe.couplings ? [...this.astrolabe.couplings] : [],
        solved: this.astrolabe.solved,
      },
      mirrors: {
        ...this.mirrors,
        collectors: (this.mirrors.collectors ?? [this.mirrors.collector]).map((c) => ({ ...c })),
        splitters: (this.mirrors.splitters ?? []).map((s) => ({
          ...s,
          position: { ...s.position },
        })),
        litCollectorIndices: [...(this.mirrors.litCollectorIndices ?? [])],
        mirrors: this.mirrors.mirrors.map((m) => ({ ...m, position: { ...m.position } })),
        beamSegments: this.mirrors.beamSegments.map((s) => ({
          ...s,
          from: { ...s.from },
          to: { ...s.to },
        })),
      },
      chimes: {
        ...this.chimes,
        slotRanks: [...this.chimes.slotRanks] as [number, number, number, number],
        struckSlots: [...this.chimes.struckSlots],
      },
      apexUnlocked: solvedCount === 3,
      apexIgnited: this.apexIgnited,
      solvedCount,
      score: this.score ? { ...this.score } : null,
      bestRecord: this.bestRecord ? { ...this.bestRecord } : null,
      lastEvent: this.lastEvent,
    };
  }

  private emit(event: GameEvent | null): void {
    this.lastEvent = event;
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  public startDailyRitual(date: Date = new Date()): void {
    const dailySeed = getDailySeedString(date);
    this.useTrialMode = true;
    this.currentTrial = 1;
    this.resetRun(dailySeed, true, 'playing');
  }

  public startTrial(trial: TrialNumber): void {
    const safeTrial = Math.max(1, Math.min(7, Math.round(trial))) as TrialNumber;
    this.useTrialMode = true;
    this.currentTrial = safeTrial;
    this.resetRun(
      this.seed,
      this.isDailySeed,
      this.phase === 'sandbox' ? 'sandbox' : 'playing',
      { type: 'trial-changed', trial: safeTrial },
    );
  }

  public advanceNextTrial(): boolean {
    if (this.currentTrial >= 7) return false;
    const next = (this.currentTrial + 1) as TrialNumber;
    this.startTrial(next);
    return true;
  }

  public startSeededRitual(seed: string, isDaily: boolean = false): void {
    this.useTrialMode = false;
    this.resetRun(seed, isDaily, 'playing');
  }

  public startRandomRitual(): void {
    this.useTrialMode = true;
    this.resetRun(generateRandomSeed(), false, 'playing');
  }

  public retryCurrentSeed(): void {
    this.resetRun(this.seed, this.isDailySeed, 'playing');
  }

  public enterSandboxMode(keepCurrentSolvedState: boolean = true): void {
    if (!keepCurrentSolvedState) {
      const fresh = this.useTrialMode
        ? createTrialPuzzles(this.currentTrial, this.seed)
        : createSeededPuzzles(this.seed);
      this.astrolabe = fresh.astrolabe;
      this.mirrors = fresh.mirrors;
      this.chimes = fresh.chimes;
      this.apexIgnited = false;
    }
    this.phase = 'sandbox';
    this.emit({
      type: 'ritual-started',
      seed: this.seed,
      mode: 'sandbox',
      trial: this.currentTrial,
    });
  }

  private resetRun(
    seed: string,
    isDaily: boolean,
    targetPhase: GamePhase,
    customEvent?: GameEvent,
  ): void {
    this.seed = seed;
    this.isDailySeed = isDaily;
    this.phase = targetPhase;
    this.activeStation = 'overview';
    this.timeRemainingSec = this.durationSec;
    this.moves = 0;
    const puzzles = this.useTrialMode
      ? createTrialPuzzles(this.currentTrial, seed)
      : createSeededPuzzles(seed);
    this.astrolabe = puzzles.astrolabe;
    this.mirrors = puzzles.mirrors;
    this.chimes = puzzles.chimes;
    this.apexIgnited = false;
    this.score = null;
    this.emit(
      customEvent ?? {
        type: 'ritual-started',
        seed,
        mode: targetPhase === 'sandbox' ? 'sandbox' : isDaily ? 'daily' : 'random',
        trial: this.currentTrial,
      },
    );
  }

  public setStation(station: StationId): void {
    if (this.activeStation === station) return;
    this.activeStation = station;
    this.emit({ type: 'station-changed', station });
  }

  public setCameraMode(mode: CameraMode): void {
    if (this.cameraMode === mode) return;
    this.cameraMode = mode;
    this.emit({ type: 'camera-mode-changed', mode });
  }

  public toggleCameraMode(): CameraMode {
    const next: CameraMode = this.cameraMode === 'orbit' ? 'walk' : 'orbit';
    this.setCameraMode(next);
    return next;
  }

  public tick(deltaSec: number): void {
    if (this.phase !== 'playing' || deltaSec <= 0) return;
    this.timeRemainingSec = Math.max(0, this.timeRemainingSec - deltaSec);
    if (this.timeRemainingSec <= 0) {
      this.phase = 'lost';
      this.emit({ type: 'eclipse-expired' });
    }
  }

  private canInteract(): boolean {
    return this.phase === 'playing' || this.phase === 'sandbox';
  }

  public rotateAstrolabe(ringIndex: number, delta: 1 | -1 = 1): void {
    if (!this.canInteract()) return;
    if (this.phase === 'playing' && this.astrolabe.solved) return;

    const result = rotateAstrolabeRing(this.astrolabe, ringIndex, delta);
    this.astrolabe = result.next;
    if (this.phase === 'playing') {
      this.moves += 1;
    }
    this.emit({
      type: 'astrolabe-rotated',
      ringIndex,
      aligned: result.aligned,
      solved: result.justSolved,
      coupledRings: result.coupledRings,
    });
  }

  public rotateMirror(mirrorIndex: number, delta: 1 | -1 = 1): void {
    if (!this.canInteract()) return;
    if (this.phase === 'playing' && this.mirrors.solved) return;

    const result = rotateMirrorObelisk(this.mirrors, mirrorIndex, delta);
    this.mirrors = result.next;
    if (this.phase === 'playing') {
      this.moves += 1;
    }
    this.emit({
      type: 'mirror-rotated',
      mirrorIndex,
      solved: result.justSolved,
      beamHitsCollector: result.beamHitsCollector,
    });
  }

  public strikeChime(slotIndex: number): void {
    if (!this.canInteract()) return;

    const result = strikeChimeSlot(this.chimes, slotIndex);
    this.chimes = result.next;
    if (this.phase === 'playing') {
      this.moves += 1;
    }
    this.emit({
      type: 'chime-struck',
      slotIndex,
      rank: result.rank,
      correct: result.correct,
      solved: result.justSolved,
    });
  }

  public requestChimePulse(): number[] {
    const sequenceSlots = getAscendingChimeSlots(this.chimes);
    this.emit({ type: 'chime-pulse-requested', sequenceSlots });
    return sequenceSlots;
  }

  public triggerApexCrown(): boolean {
    if (!this.canInteract()) return false;
    const solvedCount =
      (this.astrolabe.solved ? 1 : 0) +
      (this.mirrors.solved ? 1 : 0) +
      (this.chimes.solved ? 1 : 0);

    if (solvedCount < 3) {
      this.emit({ type: 'apex-locked', remaining: 3 - solvedCount });
      return false;
    }

    this.completedTrials.add(this.currentTrial);

    if (this.phase === 'sandbox') {
      this.apexIgnited = true;
      const sandboxScore = calculateSolsticeScore(
        this.timeRemainingSec,
        Math.max(1, this.moves),
        this.durationSec,
      );
      this.emit({ type: 'apex-ignited', score: sandboxScore });
      return true;
    }

    if (this.apexIgnited) return true;

    this.apexIgnited = true;
    this.phase = 'won';
    this.cameraMode = 'orbit';
    this.score = calculateSolsticeScore(this.timeRemainingSec, this.moves, this.durationSec);

    const elapsedSec = Math.max(1, Math.round(this.durationSec - this.timeRemainingSec));
    const prevTrialRec = this.trialRecords[this.currentTrial];
    if (
      !prevTrialRec ||
      this.score.totalScore > prevTrialRec.score ||
      (this.score.totalScore === prevTrialRec.score && this.moves < prevTrialRec.moves)
    ) {
      this.trialRecords[this.currentTrial] = {
        trial: this.currentTrial,
        stars: this.score.stars,
        score: this.score.totalScore,
        moves: this.moves,
        elapsedSec,
        timeRemainingSec: Math.round(this.timeRemainingSec),
        seed: this.seed,
      };
      writeTrialRecords(this.trialRecords);
    }

    if (!this.bestRecord || this.score.totalScore > this.bestRecord.score) {
      this.bestRecord = {
        seed: this.seed,
        stars: this.score.stars,
        score: this.score.totalScore,
        timeRemainingSec: Math.round(this.timeRemainingSec),
        moves: this.moves,
      };
      writeBestRecord(this.bestRecord);
    }

    this.emit({ type: 'apex-ignited', score: this.score });
    return true;
  }
}
