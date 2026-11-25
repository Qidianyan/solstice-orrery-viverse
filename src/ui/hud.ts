import type { GameSnapshot, StationId } from '../game/types';
import { MIRROR_ORIENTATION_LABELS } from '../game/mirrors';
import { ASTROLABE_STEPS } from '../game/puzzles';
import { formatCountdown } from '../game/scoring';

export interface HudActions {
  onStartDaily: () => void;
  onStartRandom: () => void;
  onStartSandbox: (keepSolved: boolean) => void;
  onRetrySame: () => void;
  onSelectStation: (station: StationId) => void;
  onRotateAstrolabe: (ringIndex: number) => void;
  onRotateMirror: (mirrorIndex: number) => void;
  onStrikeChime: (slotIndex: number) => void;
  onPulseChimes: () => void;
  onTriggerApex: () => void;
  onResetView: () => void;
  onToggleMute: () => boolean;
}

const BELL_ROMAN = ['I', 'II', 'III', 'IV'] as const;

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

    const modeTag =
      snapshot.phase === 'sandbox'
        ? `Free Explore (${snapshot.seed})`
        : snapshot.isDailySeed
          ? `Daily Seed: ${snapshot.seed}`
          : `Seed: ${snapshot.seed}`;
    this.seedLabel.textContent = modeTag;
    this.updateTimerOnly(snapshot);
    this.conduitCount.textContent = `${snapshot.solvedCount}/3`;
    this.movesValue.textContent = String(snapshot.moves);

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
        case 'astrolabe-rotated':
          if (snapshot.lastEvent.solved) {
            this.showToast('Meridian Astrolabe aligned: West molten conduit ignited!');
          }
          break;
        case 'mirror-rotated':
          if (snapshot.lastEvent.solved) {
            this.showToast('Collector Prism ignited: East molten conduit flowing!');
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
    if (snapshot.phase === 'title') {
      this.titleSeedBadge.textContent = `Daily Seed: ${snapshot.seed}`;
      this.titleBestBadge.textContent = snapshot.bestRecord
        ? `Best: ${'★'.repeat(snapshot.bestRecord.stars)} ${snapshot.bestRecord.score.toLocaleString()} pts`
        : '5:00 Eclipse Countdown, 3 Instruments';
      this.closeDialog(this.modalVictory);
      this.closeDialog(this.modalTimeout);
      if (!this.modalTitle.open) {
        this.modalTitle.showModal();
      }
    } else if (snapshot.phase === 'won') {
      this.closeDialog(this.modalTitle);
      this.closeDialog(this.modalTimeout);
      if (snapshot.score) {
        this.victoryStars.textContent = `${'★'.repeat(snapshot.score.stars)}${'☆'.repeat(3 - snapshot.score.stars)}`;
        this.victoryTime.textContent = formatCountdown(snapshot.timeRemainingSec);
        this.victoryMoves.textContent = String(snapshot.moves);
        this.victoryScore.textContent = snapshot.score.totalScore.toLocaleString();
        this.victorySeed.textContent = snapshot.seed;
        this.victorySummary.textContent =
          snapshot.score.stars === 3
            ? 'Master Keeper rank! You aligned the obsidian sanctuary with extraordinary speed and precision.'
            : snapshot.score.stars === 2
              ? 'Illuminated Keeper rank! All three molten conduits surged before the eclipse sealed the sky.'
              : 'Solstice Preserved! The brass sky burns brightly again. Try a faster run for three golden stars.';
      }
      if (!this.modalVictory.open) {
        this.modalVictory.showModal();
      }
    } else if (snapshot.phase === 'lost') {
      this.closeDialog(this.modalTitle);
      this.closeDialog(this.modalVictory);
      this.timeoutSummary.textContent = `You awakened ${snapshot.solvedCount} of 3 solar conduits before the eclipse sealed the sanctuary. Rewind the same seed or try a fresh alignment.`;
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
    const showBar =
      (snapshot.phase === 'playing' || snapshot.phase === 'sandbox') &&
      snapshot.activeStation !== 'overview';
    this.stationBar.hidden = !showBar;
    if (!showBar) {
      this.lastRenderedStationKey = '';
      return;
    }

    const stateKey = JSON.stringify({
      station: snapshot.activeStation,
      phase: snapshot.phase,
      astro: snapshot.astrolabe,
      mirrors: snapshot.mirrors.mirrors.map((m) => m.orientation),
      mirrorSolved: snapshot.mirrors.solved,
      litMirrors: snapshot.mirrors.litMirrorCount,
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
      const alignedCount = snapshot.astrolabe.rings.filter((r) => r === 0).length;
      this.stationKicker.textContent = 'West Wing (Instrument I)';
      this.stationName.textContent = 'Meridian Astrolabe';
      this.stationStatus.textContent = snapshot.astrolabe.solved
        ? 'All 3 bronze apertures locked at zenith. West conduit glowing!'
        : `${alignedCount}/3 rings aligned to the top zenith jewel`;

      const labels = ['Outer Ring', 'Middle Ring', 'Inner Ring'];
      labels.forEach((label, idx) => {
        const step = snapshot.astrolabe.rings[idx];
        const aligned = step === 0;
        const deg = (step * 360) / ASTROLABE_STEPS;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `action-chip${aligned ? ' is-aligned' : ''}`;
        btn.dataset.action = `astrolabe-ring-${idx}`;
        btn.disabled = snapshot.phase === 'playing' && snapshot.astrolabe.solved;
        btn.textContent = aligned ? `${label}: Locked ✓` : `Rotate ${label} (${deg}°)`;
        btn.addEventListener('click', () => this.actions.onRotateAstrolabe(idx));
        this.stationControls.appendChild(btn);
      });
    } else if (snapshot.activeStation === 'mirrors') {
      this.stationKicker.textContent = 'East Wing (Instrument II)';
      this.stationName.textContent = 'Obsidian Mirror Courtyard';
      this.stationStatus.textContent = snapshot.mirrors.solved
        ? 'Molten sunbeam locked onto the Collector Prism. East conduit glowing!'
        : `${snapshot.mirrors.layoutName}, ${snapshot.mirrors.litMirrorCount}/3 reflectors catching beam`;

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
    } else if (snapshot.activeStation === 'chimes') {
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
    } else if (snapshot.activeStation === 'apex') {
      this.stationKicker.textContent = 'Central Dais (Finale)';
      this.stationName.textContent = 'The Solstice Apex Crown';
      this.stationStatus.textContent = snapshot.apexIgnited
        ? 'Solstice Zenith achieved. The molten brass sky blooms overhead.'
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
    if (snapshot.activeStation === 'astrolabe') {
      if (snapshot.astrolabe.solved) {
        return 'The Meridian Astrolabe is aligned! Step to another wing using the bottom pad dock or glowing basalt pads.';
      }
      return 'Click each geared bronze ring (or use the buttons below) until its glowing solar aperture aligns straight beneath the top 12 o’clock Zenith Jewel (0°).';
    }
    if (snapshot.activeStation === 'mirrors') {
      if (snapshot.mirrors.solved) {
        return 'The molten sunbeam already illuminates the Collector Prism! Head to any remaining dormant wing.';
      }
      return 'Follow the glowing beam from the Solar Emitter. Turn each bronze obelisk so its gilded mirror face and base spear steer the beam around the fluted basalt pillars into the central Collector Prism.';
    }
    if (snapshot.activeStation === 'chimes') {
      if (snapshot.chimes.solved) {
        return 'The Sun-Chimes are harmonizing! Return to the Central Apex or finish any remaining instruments.';
      }
      return 'Press "Pulse Sequence" (or click the bronze gong on the left) to watch and hear the golden light travel from the deepest bell to the brightest bell, then strike them in that exact ascending order.';
    }
    if (snapshot.activeStation === 'apex') {
      if (snapshot.apexUnlocked) {
        return 'All three molten floor conduits converge at the dais! Click the floating Apex Crown (or press Ignite) to unleash the Solstice Bloom.';
      }
      const missing: string[] = [];
      if (!snapshot.astrolabe.solved) missing.push('West Meridian Astrolabe');
      if (!snapshot.mirrors.solved) missing.push('East Mirror Courtyard');
      if (!snapshot.chimes.solved) missing.push('North Harmonic Sun-Chimes');
      return `Awaken the remaining dormant wing(s): ${missing.join(', ')}.`;
    }
    return 'Select a glowing stepping pad on the obsidian floor (or use the bottom dock) to visit the Astrolabe, Mirror Courtyard, and Sun-Chimes. Light all three conduits before the 5:00 Eclipse Countdown reaches zero.';
  }
}
