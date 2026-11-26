import type { GameSnapshot, StationId, TrialNumber } from '../game/types';
import { MIRROR_ORIENTATION_LABELS } from '../game/mirrors';
import { ASTROLABE_STEPS } from '../game/puzzles';
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

export class ObservatoryHud {
  private readonly actions: HudActions;

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
  private readonly trialButtons: NodeListOf<HTMLButtonElement>;
  private readonly trialStageTag: HTMLElement;

  private readonly hintBtn: HTMLButtonElement;
  private readonly hintDrawer: HTMLElement;
  private readonly hintBody: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly muteLabel: HTMLElement;

  private readonly stationBar: HTMLElement;
  private readonly stationKicker: HTMLElement;
  private readonly stationName: HTMLElement;
  private readonly stationStatus: HTMLElement;
  private readonly stationControls: HTMLElement;
  private readonly padButtons: NodeListOf<HTMLButtonElement>;

  private readonly modalTitle: HTMLDialogElement;
  private readonly modalVictory: HTMLDialogElement;
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
  private readonly timeoutSummary: HTMLElement;

  private hintOpen = false;
  private toastTimeout: number | null = null;
  private lastPhase: GameSnapshot['phase'] | null = null;
  private lastRenderedStationKey = '';
  private currentSnapshot: GameSnapshot | null = null;
  private walkNearbyStation: Exclude<StationId, 'overview'> | null = null;

  constructor(actions: HudActions) {
    this.actions = actions;

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
    this.trialButtons = document.querySelectorAll<HTMLButtonElement>('#trial-strip .trial-btn');
    this.trialStageTag = this.req<HTMLElement>('trial-stage-tag');

    this.hintBtn = this.req<HTMLButtonElement>('btn-hint');
    this.hintDrawer = this.req<HTMLElement>('hint-drawer');
    this.hintBody = this.req<HTMLElement>('hint-body');
    this.muteBtn = this.req<HTMLButtonElement>('btn-mute');
    this.muteLabel = this.req<HTMLElement>('mute-label');

    this.stationBar = this.req<HTMLElement>('station-bar');
    this.stationKicker = this.req<HTMLElement>('station-kicker');
    this.stationName = this.req<HTMLElement>('station-name');
    this.stationStatus = this.req<HTMLElement>('station-status');
    this.stationControls = this.req<HTMLElement>('station-controls');
    this.padButtons = document.querySelectorAll<HTMLButtonElement>('.pad-btn');

    this.modalTitle = this.req<HTMLDialogElement>('modal-title');
    this.modalVictory = this.req<HTMLDialogElement>('modal-victory');
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
    this.req<HTMLButtonElement>('btn-reset-view').addEventListener('click', () => {
      this.actions.onResetView();
      this.showToast('Vantage point centered');
    });
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.req<HTMLButtonElement>('btn-guide').addEventListener('click', () => {
      if (!this.modalGuide.open) {
        this.modalGuide.showModal();
      }
    });

    for (const dlg of [this.modalTitle, this.modalVictory, this.modalTimeout, this.modalGuide]) {
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
      this.modalTimeout.open ||
      this.modalGuide.open
    );
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
    this.showToast(muted ? 'Sanctuary audio and voice muted' : 'Sanctuary audio and voice enabled');
  }

  public setHoverLabel(label: string | null): void {
    if (!label || this.isAnyModalOpen()) {
      this.hoverPill.hidden = true;
      return;
    }
    this.hoverPill.textContent = label;
    this.hoverPill.hidden = false;
  }

  public setWalkPrompt(station: Exclude<StationId, 'overview'> | null): void {
    this.walkNearbyStation = station;
    if (!station || this.isAnyModalOpen() || this.currentSnapshot?.cameraMode !== 'walk') {
      this.walkPrompt.hidden = true;
      if (this.currentSnapshot) {
        this.renderStationBar(this.currentSnapshot);
      }
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
    if (this.currentSnapshot) {
      this.renderStationBar(this.currentSnapshot);
    }
  }

  public showToast(message: string): void {
    this.toastBanner.textContent = message;
    this.toastBanner.hidden = false;
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toastBanner.hidden = true;
      this.toastTimeout = null;
    }, 3200);
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
    this.cameraModeLabel.textContent = isWalk ? 'Astronomer Orbit' : 'Walk Sanctuary';
    if (!isWalk) {
      this.walkNearbyStation = null;
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
              ? 'First-Person Walk Sanctuary active (WASD to walk, E to interact)'
              : 'Astronomer Orbit vantage active',
          );
          break;
        case 'astrolabe-rotated':
          if (snapshot.lastEvent.solved) {
            this.showToast('Meridian Astrolabe aligned: West molten conduit ignited!');
          }
          break;
        case 'mirror-rotated':
          if (snapshot.lastEvent.solved) {
            const totalC = (snapshot.mirrors.collectors ?? [snapshot.mirrors.collector]).length;
            this.showToast(
              totalC > 1
                ? `All ${totalC} Collector Prisms ignited: East molten conduit flowing!`
                : 'Collector Prism ignited: East molten conduit flowing!',
            );
          }
          break;
        case 'chime-struck':
          if (snapshot.lastEvent.solved) {
            this.showToast('Harmonic Sun-Chimes resonated: North molten conduit lit!');
          } else if (!snapshot.lastEvent.correct) {
            this.showToast('Out of ascending harmonic order. Press Pulse Sequence to listen again.');
          }
          break;
        case 'apex-locked':
          this.showToast(
            `${snapshot.lastEvent.remaining} solar conduit${snapshot.lastEvent.remaining === 1 ? '' : 's'} still dormant before the Apex can ignite.`,
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

  private syncPhaseModals(snapshot: GameSnapshot): void {
    const roman = TRIAL_ROMAN[snapshot.currentTrial - 1] ?? 'I';
    if (snapshot.phase === 'title') {
      this.titleSeedBadge.textContent = `Daily Seed: ${snapshot.seed}`;
      this.titleBestBadge.textContent = snapshot.bestRecord
        ? `Best: ${'★'.repeat(snapshot.bestRecord.stars)} ${snapshot.bestRecord.score.toLocaleString()} pts`
        : '7 Progressive Celestial Trials';
      this.closeDialog(this.modalVictory);
      this.closeDialog(this.modalTimeout);
      if (!this.modalTitle.open) {
        this.modalTitle.showModal();
      }
    } else if (snapshot.phase === 'won') {
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
    const displayedStation: StationId =
      snapshot.cameraMode === 'walk' && this.walkNearbyStation
        ? this.walkNearbyStation
        : snapshot.activeStation;

    const showBar =
      (snapshot.phase === 'playing' || snapshot.phase === 'sandbox') &&
      displayedStation !== 'overview';
    this.stationBar.hidden = !showBar;
    if (!showBar) {
      this.lastRenderedStationKey = '';
      return;
    }

    const stateKey = JSON.stringify({
      station: displayedStation,
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

    if (displayedStation === 'astrolabe') {
      const stepCount = snapshot.astrolabe.stepCount ?? ASTROLABE_STEPS;
      const couplings = snapshot.astrolabe.couplings ?? [];
      const alignedCount = snapshot.astrolabe.rings.filter((r) => r === 0).length;
      const couplingNote =
        couplings.length > 0
          ? ` Coupled pinions: ${couplings
              .map((c) => `${RING_SHORT[c.sourceRing]}->${RING_SHORT[c.targetRing]} (${c.ratioLabel})`)
              .join(', ')}`
          : '';
      this.stationKicker.textContent = 'West Wing (Instrument I)';
      this.stationName.textContent = 'Meridian Astrolabe';
      this.stationStatus.textContent = snapshot.astrolabe.solved
        ? 'All 3 bronze apertures locked at zenith. West conduit glowing!'
        : `${alignedCount}/3 rings aligned (15° magnetic detent).${couplingNote}`;

      const labels = ['Outer Ring', 'Middle Ring', 'Inner Ring'];
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
        btn.textContent = aligned
          ? `${label}: Locked ✓`
          : `Rotate ${label} (${deg}°)${ratioSuffix}`;
        btn.addEventListener('click', () => this.actions.onRotateAstrolabe(idx));
        this.stationControls.appendChild(btn);
      });
    } else if (displayedStation === 'mirrors') {
      const totalMirrors = snapshot.mirrors.mirrors.length;
      const totalCollectors = (snapshot.mirrors.collectors ?? [snapshot.mirrors.collector]).length;
      const litCollectors = (snapshot.mirrors.litCollectorIndices ?? []).length;
      const splitterCount = (snapshot.mirrors.splitters ?? []).length;
      const prismSummary =
        totalCollectors > 1
          ? `${litCollectors}/${totalCollectors} prisms lit (${splitterCount} splitter${splitterCount === 1 ? '' : 's'})`
          : `${snapshot.mirrors.litMirrorCount}/${totalMirrors} reflector${totalMirrors === 1 ? '' : 's'} catching beam`;
      this.stationKicker.textContent = 'East Wing (Instrument II)';
      this.stationName.textContent = 'Obsidian Mirror Courtyard';
      this.stationStatus.textContent = snapshot.mirrors.solved
        ? totalCollectors > 1
          ? `All ${totalCollectors} Collector Prisms blazing! East conduit glowing!`
          : 'Molten sunbeam locked onto the Collector Prism. East conduit glowing!'
        : `${snapshot.mirrors.layoutName}, ${prismSummary}`;

      snapshot.mirrors.mirrors.forEach((mirror, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'action-chip';
        btn.dataset.action = `mirror-${idx}`;
        btn.disabled = snapshot.phase === 'playing' && snapshot.mirrors.solved;
        btn.textContent = `Turn ${mirror.label} (${MIRROR_ORIENTATION_LABELS[mirror.orientation]})`;
        btn.addEventListener('click', () => this.actions.onRotateMirror(idx));
        this.stationControls.appendChild(btn);
      });
    } else if (displayedStation === 'chimes') {
      this.stationKicker.textContent = 'North Wing (Instrument III)';
      this.stationName.textContent = 'Harmonic Sun-Chimes';
      this.stationStatus.textContent = snapshot.chimes.solved
        ? 'Ascending pentatonic resonance complete. North conduit glowing!'
        : `Strike bells lowest to highest (${snapshot.chimes.progress}/4 struck)`;

      const pulseBtn = document.createElement('button');
      pulseBtn.type = 'button';
      pulseBtn.className = 'action-chip is-accent';
      pulseBtn.dataset.action = 'chimes-pulse';
      pulseBtn.textContent = 'Pulse Sequence [Space]';
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
    } else if (displayedStation === 'apex') {
      this.stationKicker.textContent = 'Central Dais (Finale)';
      this.stationName.textContent = 'The Solstice Apex Crown';
      this.stationStatus.textContent = snapshot.apexIgnited
        ? 'Dawn Corona radiance achieved. The molten brass sky blooms overhead.'
        : snapshot.apexUnlocked
          ? 'All 3 molten conduits lit! Trigger the Crown to ignite the Solstice Zenith.'
          : `${snapshot.solvedCount}/3 conduits lit. Awaken the remaining wings first.`;

      const igniteBtn = document.createElement('button');
      igniteBtn.type = 'button';
      igniteBtn.className = `action-chip${snapshot.apexUnlocked ? ' is-ignite' : ''}`;
      igniteBtn.dataset.action = 'apex-ignite';
      igniteBtn.textContent = snapshot.apexIgnited
        ? 'Pulse Solstice Bloom'
        : snapshot.apexUnlocked
          ? 'Ignite Solstice Apex Crown'
          : `Requires 3/3 Conduits (${snapshot.solvedCount}/3)`;
      igniteBtn.addEventListener('click', () => this.actions.onTriggerApex());
      this.stationControls.appendChild(igniteBtn);
    }
  }

  private buildHintText(snapshot: GameSnapshot): string {
    const station =
      snapshot.cameraMode === 'walk' && this.walkNearbyStation
        ? this.walkNearbyStation
        : snapshot.activeStation;

    if (station === 'astrolabe') {
      if (snapshot.astrolabe.solved) {
        return 'The Meridian Astrolabe is aligned! Step to another wing using the bottom pad dock or walk across the sanctuary.';
      }
      const hasCouplings = (snapshot.astrolabe.couplings ?? []).length > 0;
      return hasCouplings
        ? 'Align the Outer Ring to 0° first, then the Middle Ring (which counter-rotates via the meshed bronze pinion), and finish with the Inner Ring.'
        : 'Click each geared bronze ring (or press E nearby in Walk mode) until its glowing solar aperture locks straight beneath the 12 o’clock Zenith Jewel (0°).';
    }
    if (station === 'mirrors') {
      if (snapshot.mirrors.solved) {
        return 'Every Collector Prism is blazing! Head to any remaining dormant wing.';
      }
      const hasSplitters = (snapshot.mirrors.splitters ?? []).length > 0;
      return hasSplitters
        ? 'Dichroic Beam Splitter Prisms split the molten sunbeam into two orthogonal rays. Pivot each bronze obelisk so every branch illuminates all Collector Prisms simultaneously.'
        : 'Follow the glowing beam from the Solar Emitter. Turn each bronze obelisk so its gilded mirror face steers the sunbeam around the fluted basalt pillars into the Collector Prism.';
    }
    if (station === 'chimes') {
      if (snapshot.chimes.solved) {
        return 'The Sun-Chimes are harmonizing! Return to the Central Apex or finish any remaining instruments.';
      }
      return 'Press "Pulse Sequence" (or click the bronze gong) to watch and hear the golden light travel from the deepest bell to the brightest bell, then strike them in ascending order.';
    }
    if (station === 'apex') {
      if (snapshot.apexUnlocked) {
        return 'All three molten floor conduits converge at the dais! Click the floating Apex Crown (or press E / Ignite) to ignite the Dawn Corona breakthrough.';
      }
      const missing: string[] = [];
      if (!snapshot.astrolabe.solved) missing.push('West Meridian Astrolabe');
      if (!snapshot.mirrors.solved) missing.push('East Mirror Courtyard');
      if (!snapshot.chimes.solved) missing.push('North Harmonic Sun-Chimes');
      return `Awaken the remaining dormant wing(s): ${missing.join(', ')}.`;
    }
    return 'Press V to walk inside the fluted Doric sanctuary or click a stepping pad below to visit the Astrolabe, Mirror Courtyard, and Sun-Chimes across all 7 Celestial Trials.';
  }
}
