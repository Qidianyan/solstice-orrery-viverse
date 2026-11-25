import type {
  AstrolabeState,
  BestRecord,
  ChimesState,
  GameEvent,
  GamePhase,
  GameSnapshot,
  MirrorCourtyardState,
  ScoreBreakdown,
  StationId,
} from './types';
import { generateRandomSeed, getDailySeedString } from './prng';
import {
  createSeededPuzzles,
  getAscendingChimeSlots,
  rotateAstrolabeRing,
  rotateMirrorObelisk,
  strikeChimeSlot,
} from './puzzles';
import { calculateSolsticeScore, DEFAULT_ECLIPSE_DURATION_SEC } from './scoring';

const STORAGE_KEY = 'solstice-orrery-best-v1';

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

export class GameController {
  private phase: GamePhase = 'title';
  private seed: string;
  private isDailySeed = true;
  private activeStation: StationId = 'overview';
  private durationSec: number;
  private timeRemainingSec: number;
  private moves = 0;

  private astrolabe: AstrolabeState;
  private mirrors: MirrorCourtyardState;
  private chimes: ChimesState;
  private apexIgnited = false;
  private score: ScoreBreakdown | null = null;
  private bestRecord: BestRecord | null;
  private lastEvent: GameEvent | null = null;

  private listeners = new Set<SnapshotListener>();

  constructor(options?: { seed?: string; durationSec?: number; isDailySeed?: boolean }) {
    this.durationSec = options?.durationSec ?? DEFAULT_ECLIPSE_DURATION_SEC;
    this.timeRemainingSec = this.durationSec;
    this.seed = options?.seed ?? getDailySeedString();
    this.isDailySeed = options?.isDailySeed ?? true;
    const initial = createSeededPuzzles(this.seed);
    this.astrolabe = initial.astrolabe;
    this.mirrors = initial.mirrors;
    this.chimes = initial.chimes;
    this.bestRecord = readBestRecord();
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
      timeRemainingSec: this.timeRemainingSec,
      durationSec: this.durationSec,
      moves: this.moves,
      astrolabe: {
        rings: [...this.astrolabe.rings] as [number, number, number],
        solved: this.astrolabe.solved,
      },
      mirrors: {
        ...this.mirrors,
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
    this.resetRun(dailySeed, true, 'playing');
  }

  public startSeededRitual(seed: string, isDaily: boolean = false): void {
    this.resetRun(seed, isDaily, 'playing');
  }

  public startRandomRitual(): void {
    this.resetRun(generateRandomSeed(), false, 'playing');
  }

  public retryCurrentSeed(): void {
    this.resetRun(this.seed, this.isDailySeed, 'playing');
  }

  public enterSandboxMode(keepCurrentSolvedState: boolean = true): void {
    if (!keepCurrentSolvedState) {
      const fresh = createSeededPuzzles(this.seed);
      this.astrolabe = fresh.astrolabe;
      this.mirrors = fresh.mirrors;
      this.chimes = fresh.chimes;
      this.apexIgnited = false;
    }
    this.phase = 'sandbox';
    this.emit({ type: 'ritual-started', seed: this.seed, mode: 'sandbox' });
  }

  private resetRun(seed: string, isDaily: boolean, targetPhase: GamePhase): void {
    this.seed = seed;
    this.isDailySeed = isDaily;
    this.phase = targetPhase;
    this.activeStation = 'overview';
    this.timeRemainingSec = this.durationSec;
    this.moves = 0;
    const puzzles = createSeededPuzzles(seed);
    this.astrolabe = puzzles.astrolabe;
    this.mirrors = puzzles.mirrors;
    this.chimes = puzzles.chimes;
    this.apexIgnited = false;
    this.score = null;
    this.emit({
      type: 'ritual-started',
      seed,
      mode: targetPhase === 'sandbox' ? 'sandbox' : isDaily ? 'daily' : 'random',
    });
  }

  public setStation(station: StationId): void {
    if (this.activeStation === station) return;
    this.activeStation = station;
    this.emit({ type: 'station-changed', station });
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
    this.score = calculateSolsticeScore(this.timeRemainingSec, this.moves, this.durationSec);

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
