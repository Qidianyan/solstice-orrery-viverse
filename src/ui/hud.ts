import type { GameSnapshot, StationId, TrialNumber } from '../game/types';
import { MIRROR_ORIENTATION_LABELS } from '../game/mirrors';
import { ASTROLABE_STEPS, TRIAL_CATALOG } from '../game/puzzles';
import { formatCountdown } from '../game/scoring';

export interface HudActions {
  onStartDaily: () => void;
  onStartRandom: () => void;
  onStartSandbox: (keepSolved: boolean) => void;
  onRetrySame: () => void;
  onSelectStation: (station: StationId) => void;
  onSelectTrial: (trial: TrialNumber) => void;
  onNextTrial: () => void;
  onToggleCameraMode: () => void;
  onRotateAstrolabe: (ringIndex: number) => void;
  onRotateMirror: (mirrorIndex: number) => void;
  onStrikeChime: (slotIndex: number) => void;
  onPulseChimes: () => void;
  onTriggerApex: () => void;
  onResetView: () => void;
  onToggleMute: () => boolean;
}

const BELL_ROMAN = ['I', 'II', 'III', 'IV'] as const;
const TRIAL_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const RING_SHORT = ['Outer', 'Mid', 'Inner'] as const;

export const TOAST_AUTO_FADE_MS = 2400;

/**
 * Pure Cinema minimalist viewing mode state helper (used by UI and Vitest).
 */
export class CinemaModeController {
  private active = false;

  public isActive(): boolean {
    return this.active;
  }

  public setActive(next: boolean): boolean {
    this.active = next;
    return this.active;
  }

  public toggle(): boolean {
    this.active = !this.active;
    return this.active;
  }
}

export class ObservatoryHud {
  private readonly actions: HudActions;
  private readonly cinema = new CinemaModeController();

  private readonly appShell: HTMLElement;
  private readonly seedLabel: HTMLElement;
  private readonly timerCard: HTMLElement;
  private readonly timerValue: HTMLElement;
  private readonly conduitCount: HTMLElement;
  private readonly conduitSegs: NodeListOf<HTMLElement>;
  private readonly movesValue: HTMLElement;

  private readonly hoverPill: HTMLElement;
  private readonly toastBanner: HTMLElement;
  private readonly walkPrompt: HTMLElement;
  private readonly walkPromptText: HTMLElement;

  private readonly cameraModeBtn: HTMLButtonElement;
  private readonly cameraModeLabel: HTMLElement;
  private readonly cinemaBtn: HTMLButtonElement;
  private readonly cinemaExitBtn: HTMLButtonElement;
  private readonly trialButtons: NodeListOf<HTMLButtonElement>;
  private readonly trialStageTag: HTMLElement;

  private readonly hintBtn: HTMLButtonElement;
  private readonly hintDrawer: HTMLElement;
  private readonly hintBody: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly muteLabel: HTMLElement;

  private readonly stationBar: HTMLElement;
  private readonly stationName: HTMLElement;
  private readonly stationStatus: HTMLElement;
  private readonly stationControls: HTMLElement;
  private readonly padButtons: NodeListOf<HTMLButtonElement>;

  private readonly modalTitle: HTMLDialogElement;
  private readonly modalVictory: HTMLDialogElement;
  private readonly modalRecords: HTMLDialogElement;
  private readonly modalTimeout: HTMLDialogElement;
  private readonly modalGuide: HTMLDialogElement;

  private readonly titleSeedBadge: HTMLElement;
  private readonly titleBestBadge: HTMLElement;
  private readonly victoryNextTrialBtn: HTMLButtonElement;
  private readonly victoryStars: HTMLElement;
  private readonly victorySummary: HTMLElement;
  private readonly victoryTime: HTMLElement;
  private readonly victoryMoves: HTMLElement;
  private readonly victoryScore: HTMLElement;
  private readonly victorySeed: HTMLElement;
  private readonly victoryTempoNote: HTMLElement;
  private readonly recordsOverview: HTMLElement;
  private readonly recordsGrid: HTMLElement;
  private readonly timeoutSummary: HTMLElement;

  private hintOpen = false;
  private toastFadeTimeout: number | null = null;
  private toastHideTimeout: number | null = null;
  private lastPhase: GameSnapshot['phase'] | null = null;
  private lastRenderedStationKey = '';
  private currentSnapshot: GameSnapshot | null = null;

  constructor(actions: HudActions) {
    this.actions = actions;

    this.appShell = this.req<HTMLElement>('app');
    this.seedLabel = this.req<HTMLElement>('seed-label');
    this.timerCard = this.req<HTMLElement>('timer-card');
    this.timerValue = this.req<HTMLElement>('timer-value');
    this.conduitCount = this.req<HTMLElement>('conduit-count');
    this.conduitSegs = document.querySelectorAll<HTMLElement>('#conduit-bars .conduit-seg');
    this.movesValue = this.req<HTMLElement>('moves-value');

    this.hoverPill = this.req<HTMLElement>('hover-pill');
    this.toastBanner = this.req<HTMLElement>('toast-banner');
    this.walkPrompt = this.req<HTMLElement>('walk-prompt');
    this.walkPromptText = this.req<HTMLElement>('walk-prompt-text');

    this.cameraModeBtn = this.req<HTMLButtonElement>('btn-camera-mode');
    this.cameraModeLabel = this.req<HTMLElement>('camera-mode-label');
    this.cinemaBtn = this.req<HTMLButtonElement>('btn-cinema');
    this.cinemaExitBtn = this.req<HTMLButtonElement>('btn-cinema-exit');
    this.trialButtons = document.querySelectorAll<HTMLButtonElement>('#trial-strip .trial-btn');
    this.trialStageTag = this.req<HTMLElement>('trial-stage-tag');

    this.hintBtn = this.req<HTMLButtonElement>('btn-hint');
    this.hintDrawer = this.req<HTMLElement>('hint-drawer');
    this.hintBody = this.req<HTMLElement>('hint-body');
    this.muteBtn = this.req<HTMLButtonElement>('btn-mute');
    this.muteLabel = this.req<HTMLElement>('mute-label');

    this.stationBar = this.req<HTMLElement>('station-bar');
    this.stationName = this.req<HTMLElement>('station-name');
    this.stationStatus = this.req<HTMLElement>('station-status');
    this.stationControls = this.req<HTMLElement>('station-controls');
    this.padButtons = document.querySelectorAll<HTMLButtonElement>('.pad-btn');

    this.modalTitle = this.req<HTMLDialogElement>('modal-title');
    this.modalVictory = this.req<HTMLDialogElement>('modal-victory');
    this.modalRecords = this.req<HTMLDialogElement>('modal-records');
    this.modalTimeout = this.req<HTMLDialogElement>('modal-timeout');
    this.modalGuide = this.req<HTMLDialogElement>('modal-guide');

    this.titleSeedBadge = this.req<HTMLElement>('title-seed-badge');
    this.titleBestBadge = this.req<HTMLElement>('title-best-badge');
    this.victoryNextTrialBtn = this.req<HTMLButtonElement>('btn-victory-next-trial');
    this.victoryStars = this.req<HTMLElement>('victory-stars');
    this.victorySummary = this.req<HTMLElement>('victory-summary');
    this.victoryTime = this.req<HTMLElement>('victory-time');
    this.victoryMoves = this.req<HTMLElement>('victory-moves');
    this.victoryScore = this.req<HTMLElement>('victory-score');
    this.victorySeed = this.req<HTMLElement>('victory-seed');
    this.victoryTempoNote = this.req<HTMLElement>('victory-tempo-note');
    this.recordsOverview = this.req<HTMLElement>('records-overview');
    this.recordsGrid = this.req<HTMLElement>('records-grid');
    this.timeoutSummary = this.req<HTMLElement>('timeout-summary');

    this.bindControls();
    this.installLightDismissFallback();
  }

  private req<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Required HUD element #${id} not found.`);
    }
    return el as T;
  }

  private bindControls(): void {
    this.req<HTMLButtonElement>('btn-start-daily').addEventListener('click', () => {
      this.closeDialog(this.modalTitle);
      this.actions.onStartDaily();
    });
    this.req<HTMLButtonElement>('btn-start-random').addEventListener('click', () => {
      this.closeDialog(this.modalTitle);
      this.actions.onStartRandom();
    });
    this.req<HTMLButtonElement>('btn-start-sandbox').addEventListener('click', () => {
      this.closeDialog(this.modalTitle);
      this.actions.onStartSandbox(false);
    });

    this.victoryNextTrialBtn.addEventListener('click', () => {
      this.closeDialog(this.modalVictory);
      this.actions.onNextTrial();
    });
    this.req<HTMLButtonElement>('btn-victory-sandbox').addEventListener('click', () => {
      this.closeDialog(this.modalVictory);
      this.actions.onStartSandbox(true);
    });
    this.req<HTMLButtonElement>('btn-victory-daily').addEventListener('click', () => {
      this.closeDialog(this.modalVictory);
      this.actions.onStartDaily();
    });
    this.req<HTMLButtonElement>('btn-victory-random').addEventListener('click', () => {
      this.closeDialog(this.modalVictory);
      this.actions.onStartRandom();
    });

    this.req<HTMLButtonElement>('btn-retry-same').addEventListener('click', () => {
      this.closeDialog(this.modalTimeout);
      this.actions.onRetrySame();
    });
    this.req<HTMLButtonElement>('btn-retry-random').addEventListener('click', () => {
      this.closeDialog(this.modalTimeout);
      this.actions.onStartRandom();
    });
    this.req<HTMLButtonElement>('btn-timeout-sandbox').addEventListener('click', () => {
      this.closeDialog(this.modalTimeout);
      this.actions.onStartSandbox(false);
    });

    this.cameraModeBtn.addEventListener('click', () => {
      this.actions.onToggleCameraMode();
    });

    this.cinemaBtn.addEventListener('click', () => this.toggleCinemaMode());
    this.cinemaExitBtn.addEventListener('click', () => this.setCinemaMode(false));

    this.req<HTMLButtonElement>('btn-records').addEventListener('click', () => {
      if (this.currentSnapshot) {
        this.renderRecordsModal(this.currentSnapshot);
      }
      if (!this.modalRecords.open) {
        this.modalRecords.showModal();
      }
    });

    this.trialButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const trialNum = Number(btn.dataset.trial) as TrialNumber;
        if (trialNum >= 1 && trialNum <= 7) {
          this.closeDialog(this.modalTitle);
          this.closeDialog(this.modalVictory);
          this.closeDialog(this.modalTimeout);
          this.actions.onSelectTrial(trialNum);
        }
      });
    });

    this.hintBtn.addEventListener('click', () => this.toggleHint());
    this.req<HTMLButtonElement>('btn-close-hint').addEventListener('click', () => this.setHintOpen(false));
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.req<HTMLButtonElement>('btn-guide').addEventListener('click', () => {
      if (!this.modalGuide.open) {
        this.modalGuide.showModal();
      }
    });

    for (const dlg of [
      this.modalTitle,
      this.modalVictory,
      this.modalRecords,
      this.modalTimeout,
      this.modalGuide,
    ]) {
      dlg.addEventListener('close', () => {
        dlg.returnValue = '';
      });
    }

    this.padButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pad = btn.dataset.pad as StationId | undefined;
        if (pad) this.actions.onSelectStation(pad);
      });
    });
  }

  private installLightDismissFallback(): void {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const isOutside = (e: PointerEvent, dialog: HTMLDialogElement): boolean => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[closedby="any"]');
    dialogs.forEach((dialog) => {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e, dialog)) {
          dialog.close();
        }
      });
    });
  }

  private closeDialog(dlg: HTMLDialogElement): void {
    if (dlg.open) {
      dlg.close();
    }
  }

  public isAnyModalOpen(): boolean {
    return (
      this.modalTitle.open ||
      this.modalVictory.open ||
      this.modalRecords.open ||
      this.modalTimeout.open ||
      this.modalGuide.open
    );
  }

  public isCinemaMode(): boolean {
    return this.cinema.isActive();
  }

  public setCinemaMode(enabled: boolean): boolean {
    const active = this.cinema.setActive(enabled);
    this.appShell.classList.toggle('is-cinema', active);
    this.cinemaBtn.setAttribute('aria-pressed', String(active));
    this.cinemaExitBtn.hidden = !active;
    if (active) {
      this.setHintOpen(false);
    }
    return active;
  }

  public toggleCinemaMode(): boolean {
    return this.setCinemaMode(!this.cinema.isActive());
  }

  public toggleHint(): void {
    this.setHintOpen(!this.hintOpen);
  }

  public setHintOpen(open: boolean): void {
    this.hintOpen = open;
    this.hintDrawer.hidden = !open;
    this.hintBtn.setAttribute('aria-expanded', String(open));
    if (open && this.currentSnapshot) {
      this.hintBody.textContent = this.buildHintText(this.currentSnapshot);
    }
  }

  public toggleMute(): void {
    const muted = this.actions.onToggleMute();
    this.muteBtn.setAttribute('aria-pressed', String(muted));
    this.muteLabel.textContent = muted ? 'Muted' : 'Sound';
    this.showToast(muted ? 'Sanctuary audio muted' : 'Sanctuary audio enabled');
  }

  public setHoverLabel(label: string | null): void {
    if (!label || this.isAnyModalOpen() || this.cinema.isActive()) {
      this.hoverPill.hidden = true;
      return;
    }
    this.hoverPill.textContent = label;
    this.hoverPill.hidden = false;
  }

  public setWalkPrompt(station: Exclude<StationId, 'overview'> | null): void {
    if (
      !station ||
      this.isAnyModalOpen() ||
      this.cinema.isActive() ||
      this.currentSnapshot?.cameraMode !== 'walk'
    ) {
      this.walkPrompt.hidden = true;
      return;
    }
    const labels: Record<Exclude<StationId, 'overview'>, string> = {
      astrolabe: 'Rotate Meridian Astrolabe Ring',
      mirrors: 'Turn Mirror Obelisk',
      chimes: 'Resonate Harmonic Sun-Chimes',
      apex: 'Ignite Solstice Apex Crown',
    };
    this.walkPromptText.textContent = labels[station];
    this.walkPrompt.hidden = false;
  }

  public showToast(message: string): void {
    if (this.cinema.isActive()) return;
    this.toastBanner.textContent = message;
    this.toastBanner.classList.remove('is-fading');
    this.toastBanner.hidden = false;

    if (this.toastFadeTimeout !== null) window.clearTimeout(this.toastFadeTimeout);
    if (this.toastHideTimeout !== null) window.clearTimeout(this.toastHideTimeout);

    this.toastFadeTimeout = window.setTimeout(() => {
      this.toastBanner.classList.add('is-fading');
      this.toastFadeTimeout = null;
    }, Math.max(400, TOAST_AUTO_FADE_MS - 260));

    this.toastHideTimeout = window.setTimeout(() => {
      this.toastBanner.hidden = true;
      this.toastBanner.classList.remove('is-fading');
      this.toastHideTimeout = null;
    }, TOAST_AUTO_FADE_MS);
  }

  public updateTimerOnly(snapshot: GameSnapshot): void {
    if (snapshot.phase === 'sandbox') {
      this.timerValue.textContent = 'Solstice';
      this.timerCard.classList.remove('is-urgent');
      return;
    }
    this.timerValue.textContent = formatCountdown(snapshot.timeRemainingSec);
    const urgent = snapshot.phase === 'playing' && snapshot.timeRemainingSec <= 60;
    this.timerCard.classList.toggle('is-urgent', urgent);
  }

  public render(snapshot: GameSnapshot): void {
    this.currentSnapshot = snapshot;
    const roman = TRIAL_ROMAN[snapshot.currentTrial - 1] ?? 'I';

    const modeTag =
      snapshot.phase === 'sandbox'
        ? `Free Explore (Trial ${roman})`
        : `Trial ${roman}: ${snapshot.trialMeta.title}`;
    this.seedLabel.textContent = modeTag;
    this.updateTimerOnly(snapshot);
    this.conduitCount.textContent = `${snapshot.solvedCount}/3`;
    this.movesValue.textContent = String(snapshot.moves);

    const isWalk = snapshot.cameraMode === 'walk';
    this.cameraModeBtn.setAttribute('aria-pressed', String(isWalk));
    this.cameraModeLabel.textContent = isWalk ? 'Orbit' : 'Walk';
    if (!isWalk) {
      this.walkPrompt.hidden = true;
    }

    this.trialButtons.forEach((btn) => {
      const t = Number(btn.dataset.trial) as TrialNumber;
      const isCurrent = t === snapshot.currentTrial;
      const isDone = snapshot.completedTrials.includes(t);
      btn.classList.toggle('is-active', isCurrent);
      btn.classList.toggle('is-done', isDone && !isCurrent);
      btn.setAttribute('aria-current', isCurrent ? 'step' : 'false');
    });

    const stageLabel = snapshot.apexIgnited
      ? 'Dawn Corona'
      : snapshot.trialMeta.skyStage === 'crimson-eclipse'
        ? 'Crimson Eclipse'
        : snapshot.trialMeta.skyStage === 'amber-dusk'
          ? 'Amber Dusk'
          : 'Noon Gold';
    this.trialStageTag.textContent = stageLabel;
    this.trialStageTag.classList.toggle(
      'is-eclipse',
      !snapshot.apexIgnited && snapshot.trialMeta.skyStage === 'crimson-eclipse',
    );

    this.conduitSegs.forEach((seg) => {
      const p = seg.dataset.puzzle;
      const lit =
        (p === 'astrolabe' && snapshot.astrolabe.solved) ||
        (p === 'mirrors' && snapshot.mirrors.solved) ||
        (p === 'chimes' && snapshot.chimes.solved);
      seg.classList.toggle('is-lit', lit);
    });

    this.padButtons.forEach((btn) => {
      const pad = btn.dataset.pad as StationId;
      btn.classList.toggle('is-active', pad === snapshot.activeStation);
      btn.setAttribute('aria-current', pad === snapshot.activeStation ? 'location' : 'false');
      const solved =
        (pad === 'astrolabe' && snapshot.astrolabe.solved) ||
        (pad === 'mirrors' && snapshot.mirrors.solved) ||
        (pad === 'chimes' && snapshot.chimes.solved) ||
        (pad === 'apex' && snapshot.apexIgnited);
      const ready = pad === 'apex' && snapshot.apexUnlocked && !snapshot.apexIgnited;
      btn.classList.toggle('is-solved', solved);
      btn.classList.toggle('is-ready', ready);
    });

    this.renderStationBar(snapshot);

    if (this.hintOpen) {
      this.hintBody.textContent = this.buildHintText(snapshot);
    }

    if (snapshot.lastEvent) {
      switch (snapshot.lastEvent.type) {
        case 'trial-changed':
          this.showToast(`Trial ${TRIAL_ROMAN[snapshot.lastEvent.trial - 1]}: ${snapshot.trialMeta.title}`);
          break;
        case 'camera-mode-changed':
          this.showToast(
            snapshot.lastEvent.mode === 'walk'
              ? 'Walk Sanctuary active (WASD walk, E or click 3D to interact)'
              : 'Astronomer Orbit vantage active',
          );
          break;
        case 'astrolabe-rotated':
          if (snapshot.lastEvent.solved) {
            this.showToast('Meridian Astrolabe aligned: West conduit lit!');
          }
          break;
        case 'mirror-rotated':
          if (snapshot.lastEvent.solved) {
            const totalC = (snapshot.mirrors.collectors ?? [snapshot.mirrors.collector]).length;
            this.showToast(
              totalC > 1
                ? `All ${totalC} Collector Prisms blazing: East conduit lit!`
                : 'Collector Prism ignited: East conduit lit!',
            );
          }
          break;
        case 'chime-struck':
          if (snapshot.lastEvent.solved) {
            this.showToast('Harmonic Sun-Chimes resonated: North conduit lit!');
          } else if (!snapshot.lastEvent.correct) {
            this.showToast('Strike ascending low to high. Click the gong or press Space to hear again.');
          }
          break;
        case 'apex-locked':
          this.showToast(
            `${snapshot.lastEvent.remaining} solar conduit${snapshot.lastEvent.remaining === 1 ? '' : 's'} still dormant.`,
          );
          break;
        default:
          break;
      }
    }

    if (snapshot.phase !== this.lastPhase) {
      this.lastPhase = snapshot.phase;
      this.syncPhaseModals(snapshot);
    }
  }

  private renderRecordsModal(snapshot: GameSnapshot): void {
    const cleared = Object.keys(snapshot.trialRecords).length;
    const totalScore = Object.values(snapshot.trialRecords).reduce(
      (sum, rec) => sum + (rec?.score ?? 0),
      0,
    );
    this.recordsOverview.textContent =
      cleared > 0
        ? `${cleared}/7 Celestial Trials mastered (Combined Best Score: ${totalScore.toLocaleString()} pts).`
        : 'Complete any trial to record your best moves, completion pace, and star rating locally.';

    this.recordsGrid.innerHTML = '';
    for (const meta of TRIAL_CATALOG) {
      const rec = snapshot.trialRecords[meta.number];
      const roman = TRIAL_ROMAN[meta.number - 1];
      const row = document.createElement('div');
      row.className = `record-row${rec ? ' is-cleared' : ''}`;

      const title = document.createElement('span');
      title.className = 'record-title';
      title.textContent = `Trial ${roman}: ${meta.title}`;

      const pace = document.createElement('span');
      pace.className = 'record-metric';
      pace.textContent = rec ? `${rec.elapsedSec}s pace` : 'Unclaimed';

      const moves = document.createElement('span');
      moves.className = 'record-metric';
      moves.textContent = rec ? `${rec.moves} moves` : 'Ready';

      const stars = document.createElement('span');
      stars.className = 'record-stars';
      stars.textContent = rec
        ? `${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}`
        : '☆☆☆';

      row.append(title, pace, moves, stars);
      this.recordsGrid.appendChild(row);
    }
  }

  private syncPhaseModals(snapshot: GameSnapshot): void {
    const roman = TRIAL_ROMAN[snapshot.currentTrial - 1] ?? 'I';
    if (snapshot.phase === 'title') {
      this.titleSeedBadge.textContent = `Daily Seed: ${snapshot.seed}`;
      const cleared = Object.keys(snapshot.trialRecords).length;
      this.titleBestBadge.textContent = snapshot.bestRecord
        ? `Best: ${'★'.repeat(snapshot.bestRecord.stars)} ${snapshot.bestRecord.score.toLocaleString()} pts (${cleared}/7 Trials)`
        : '7 Progressive Celestial Trials';
      this.closeDialog(this.modalVictory);
      this.closeDialog(this.modalTimeout);
      if (!this.modalTitle.open) {
        this.modalTitle.showModal();
      }
    } else if (snapshot.phase === 'won') {
      this.setCinemaMode(false);
      this.closeDialog(this.modalTitle);
      this.closeDialog(this.modalTimeout);
      const hasNext = snapshot.currentTrial < 7;
      this.victoryNextTrialBtn.hidden = !hasNext;
      if (hasNext) {
        const nextRoman = TRIAL_ROMAN[Math.min(TRIAL_ROMAN.length - 1, snapshot.currentTrial)];
        this.victoryNextTrialBtn.textContent = `Advance to Trial ${nextRoman}`;
      }
      if (snapshot.score) {
        this.victoryStars.textContent = `${'★'.repeat(snapshot.score.stars)}${'☆'.repeat(3 - snapshot.score.stars)}`;
        this.victoryTime.textContent = formatCountdown(snapshot.timeRemainingSec);
        this.victoryMoves.textContent = String(snapshot.moves);
        this.victoryScore.textContent = snapshot.score.totalScore.toLocaleString();
        this.victorySeed.textContent = `Trial ${roman}`;
        const cleared = Object.keys(snapshot.trialRecords).length;
        const bestForTrial = snapshot.trialRecords[snapshot.currentTrial];
        this.victoryTempoNote.textContent = bestForTrial
          ? `Session Chronicle: ${cleared}/7 Trials mastered (Trial ${roman} Best: ${bestForTrial.moves} moves in ${bestForTrial.elapsedSec}s)`
          : `Session Chronicle: ${cleared}/7 Trials mastered`;
        this.victorySummary.textContent =
          snapshot.currentTrial === 7
            ? 'Grand Solstice Eclipse conquered! All three split molten beams shattered the crimson eclipse into Dawn Corona radiance.'
            : snapshot.score.stars === 3
              ? `Master Keeper rank on Trial ${roman}! You aligned the obsidian sanctuary with extraordinary speed and precision.`
              : `Trial ${roman} complete! All three molten conduits surged before the eclipse sealed the sky.`;
      }
      if (!this.modalVictory.open) {
        this.modalVictory.showModal();
      }
    } else if (snapshot.phase === 'lost') {
      this.setCinemaMode(false);
      this.closeDialog(this.modalTitle);
      this.closeDialog(this.modalVictory);
      this.timeoutSummary.textContent = `You awakened ${snapshot.solvedCount} of 3 solar conduits on Trial ${roman} before the eclipse sealed the sanctuary. Rewind this trial or try a fresh alignment.`;
      if (!this.modalTimeout.open) {
        this.modalTimeout.showModal();
      }
    } else {
      this.closeDialog(this.modalTitle);
      this.closeDialog(this.modalVictory);
      this.closeDialog(this.modalTimeout);
    }
  }

  private renderStationBar(snapshot: GameSnapshot): void {
    // Keep Overview AND Walk Sanctuary modes completely free of bottom drawer clutter
    const showBar =
      (snapshot.phase === 'playing' || snapshot.phase === 'sandbox') &&
      snapshot.cameraMode === 'orbit' &&
      snapshot.activeStation !== 'overview';
    this.stationBar.hidden = !showBar;
    if (!showBar) {
      this.lastRenderedStationKey = '';
      return;
    }

    const stateKey = JSON.stringify({
      station: snapshot.activeStation,
      trial: snapshot.currentTrial,
      phase: snapshot.phase,
      astro: snapshot.astrolabe,
      mirrors: snapshot.mirrors.mirrors.map((m) => m.orientation),
      mirrorSolved: snapshot.mirrors.solved,
      litMirrors: snapshot.mirrors.litMirrorCount,
      litCollectors: snapshot.mirrors.litCollectorIndices ?? [],
      chimes: snapshot.chimes.struckSlots,
      chimeSolved: snapshot.chimes.solved,
      apexUnlocked: snapshot.apexUnlocked,
      apexIgnited: snapshot.apexIgnited,
      solvedCount: snapshot.solvedCount,
    });
    if (stateKey === this.lastRenderedStationKey) return;
    this.lastRenderedStationKey = stateKey;

    this.stationControls.innerHTML = '';

    if (snapshot.activeStation === 'astrolabe') {
      const stepCount = snapshot.astrolabe.stepCount ?? ASTROLABE_STEPS;
      const couplings = snapshot.astrolabe.couplings ?? [];
      const alignedCount = snapshot.astrolabe.rings.filter((r) => r === 0).length;
      const couplingNote =
        couplings.length > 0
          ? ` (${couplings
              .map((c) => `${RING_SHORT[c.sourceRing]}->${RING_SHORT[c.targetRing]} ${c.ratioLabel}`)
              .join(', ')})`
          : '';
      this.stationName.textContent = 'Meridian Astrolabe';
      this.stationStatus.textContent = snapshot.astrolabe.solved
        ? 'Aligned'
        : `${alignedCount}/3 aligned${couplingNote}`;

      const labels = ['Outer', 'Middle', 'Inner'];
      labels.forEach((label, idx) => {
        const step = snapshot.astrolabe.rings[idx];
        const aligned = step === 0;
        const deg = Math.round((step * 360) / stepCount);
        const link = couplings.find((c) => c.sourceRing === idx);
        const ratioSuffix = link ? ` [${link.ratioLabel}]` : '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `action-chip${aligned ? ' is-aligned' : ''}`;
        btn.dataset.action = `astrolabe-ring-${idx}`;
        btn.disabled = snapshot.phase === 'playing' && snapshot.astrolabe.solved;
        btn.textContent = aligned ? `${label} ✓` : `${label} (${deg}°)${ratioSuffix}`;
        btn.addEventListener('click', () => this.actions.onRotateAstrolabe(idx));
        this.stationControls.appendChild(btn);
      });
    } else if (snapshot.activeStation === 'mirrors') {
      const totalCollectors = (snapshot.mirrors.collectors ?? [snapshot.mirrors.collector]).length;
      const litCollectors = (snapshot.mirrors.litCollectorIndices ?? []).length;
      this.stationName.textContent = 'Mirror Courtyard';
      this.stationStatus.textContent = snapshot.mirrors.solved
        ? `${totalCollectors}/${totalCollectors} Prisms Lit`
        : totalCollectors > 1
          ? `${litCollectors}/${totalCollectors} Prisms`
          : `${snapshot.mirrors.litMirrorCount}/${snapshot.mirrors.mirrors.length} Lit`;

      snapshot.mirrors.mirrors.forEach((mirror, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'action-chip';
        btn.dataset.action = `mirror-${idx}`;
        btn.disabled = snapshot.phase === 'playing' && snapshot.mirrors.solved;
        btn.textContent = `${mirror.label} (${MIRROR_ORIENTATION_LABELS[mirror.orientation]})`;
        btn.addEventListener('click', () => this.actions.onRotateMirror(idx));
        this.stationControls.appendChild(btn);
      });
    } else if (snapshot.activeStation === 'chimes') {
      this.stationName.textContent = 'Sun-Chimes';
      this.stationStatus.textContent = snapshot.chimes.solved
        ? 'Resonating'
        : `${snapshot.chimes.progress}/4 Ascending`;

      const pulseBtn = document.createElement('button');
      pulseBtn.type = 'button';
      pulseBtn.className = 'action-chip is-accent';
      pulseBtn.dataset.action = 'chimes-pulse';
      pulseBtn.textContent = 'Pulse [Space]';
      pulseBtn.addEventListener('click', () => this.actions.onPulseChimes());
      this.stationControls.appendChild(pulseBtn);

      BELL_ROMAN.forEach((roman, slotIdx) => {
        const struck = snapshot.chimes.struckSlots.includes(slotIdx);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `action-chip${struck ? ' is-aligned' : ''}`;
        btn.dataset.action = `chime-${slotIdx}`;
        btn.textContent = struck ? `Bell ${roman} ✓` : `Bell ${roman}`;
        btn.addEventListener('click', () => this.actions.onStrikeChime(slotIdx));
        this.stationControls.appendChild(btn);
      });
    } else if (snapshot.activeStation === 'apex') {
      this.stationName.textContent = 'Solstice Apex';
      this.stationStatus.textContent = snapshot.apexIgnited
        ? 'Dawn Corona Active'
        : snapshot.apexUnlocked
          ? 'Ready to Ignite'
          : `${snapshot.solvedCount}/3 Conduits`;

      const igniteBtn = document.createElement('button');
      igniteBtn.type = 'button';
      igniteBtn.className = `action-chip${snapshot.apexUnlocked ? ' is-ignite' : ''}`;
      igniteBtn.dataset.action = 'apex-ignite';
      igniteBtn.textContent = snapshot.apexIgnited
        ? 'Pulse Dawn Corona'
        : snapshot.apexUnlocked
          ? 'Ignite Solstice Apex Crown'
          : `Requires 3/3 Conduits`;
      igniteBtn.addEventListener('click', () => this.actions.onTriggerApex());
      this.stationControls.appendChild(igniteBtn);
    }
  }

  private buildHintText(snapshot: GameSnapshot): string {
    if (snapshot.activeStation === 'astrolabe') {
      if (snapshot.astrolabe.solved) {
        return 'The Meridian Astrolabe is aligned! Click any other instrument directly in 3D or walk across the sanctuary.';
      }
      const hasCouplings = (snapshot.astrolabe.couplings ?? []).length > 0;
      return hasCouplings
        ? 'Click the Outer bronze ring directly in 3D until it locks at 0°, then align Middle (driving Inner if coupled), and finish with Inner.'
        : 'Hover and click each geared bronze ring directly in 3D (or press E nearby in Walk mode) until its glowing aperture locks under the top Zenith Jewel.';
    }
    if (snapshot.activeStation === 'mirrors') {
      if (snapshot.mirrors.solved) {
        return 'Every Collector Prism is blazing! Head to any remaining dormant wing.';
      }
      const hasSplitters = (snapshot.mirrors.splitters ?? []).length > 0;
      return hasSplitters
        ? 'Dichroic Beam Splitter Prisms bifurcate the molten sunbeam. Click basalt obelisks directly in 3D so every branch lights all Collector Prisms.'
        : 'Click each carved basalt obelisk directly in 3D to bounce the molten sunbeam around fluted pillars into the Collector Prism.';
    }
    if (snapshot.activeStation === 'chimes') {
      if (snapshot.chimes.solved) {
        return 'The Sun-Chimes are harmonizing! Return to the Central Apex or finish any remaining instruments.';
      }
      return 'Click the bronze gong (or press Space) to hear and watch the golden pulse from lowest to highest, then click the four temple bells directly in 3D.';
    }
    if (snapshot.activeStation === 'apex') {
      if (snapshot.apexUnlocked) {
        return 'All three molten conduits converge at the dais! Click the floating Apex Crown directly in 3D to ignite the Dawn Corona breakthrough.';
      }
      const missing: string[] = [];
      if (!snapshot.astrolabe.solved) missing.push('West Meridian Astrolabe');
      if (!snapshot.mirrors.solved) missing.push('East Mirror Courtyard');
      if (!snapshot.chimes.solved) missing.push('North Harmonic Sun-Chimes');
      return `Awaken the remaining dormant wing(s): ${missing.join(', ')}.`;
    }
    return 'Click bronze rings, basalt obelisks, or temple bells directly in 3D, press V to walk the 16-column Doric sanctuary, or press C for Cinema mode.';
  }
}
