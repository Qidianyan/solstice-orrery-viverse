import { GameController } from './game/controller';
import type { CameraMode, GameSnapshot, StationId, TrialNumber } from './game/types';
import { getAscendingChimeSlots } from './game/puzzles';
import { dispatchDirect3DAction } from './game/directInteraction';
import type { CameraPreset } from './scene/cameraRig';
import type { AdaptiveQualityState } from './scene/adaptiveQuality';
import { SoundEngine } from './audio/soundEngine';
import { ObservatoryScene, type SceneInteractAction } from './scene/observatoryScene';
import { ObservatoryHud } from './ui/hud';

declare global {
  interface Window {
    __ORRERY__?: {
      getSnapshot: () => GameSnapshot;
      snapCameraToStation: (station: StationId) => void;
      setCameraMode: (mode: CameraMode, immediate?: boolean) => void;
      setWalkPose: (x: number, z: number, yaw: number, pitch?: number) => void;
      setTrial: (trial: TrialNumber) => void;
      setCinemaMode: (enabled: boolean) => boolean;
      getInteractableScreenPoint: (
        kind: SceneInteractAction['kind'],
        index?: number,
      ) => { x: number; y: number } | null;
      getQualityStats: () => AdaptiveQualityState;
      setCinematicPose: (pose: CameraPreset, immediate?: boolean) => void;
      setManualStep: (enabled: boolean) => void;
      stepFrame: (deltaSec: number) => void;
      waitForTextures: () => Promise<void>;
    };
  }
}

function bootstrap(): void {
  const canvas = document.getElementById('orrery-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Missing #orrery-canvas element.');
  }

  const controller = new GameController({ trial: 1 });
  const sound = new SoundEngine();
  let lastSecondDisplayed = -1;

  const hud = new ObservatoryHud({
    onStartDaily: () => {
      controller.startDailyRitual();
      sound.playVoiceover('intro');
    },
    onStartRandom: () => {
      controller.startRandomRitual();
      sound.playVoiceover('intro');
    },
    onStartSandbox: (keepSolved) => {
      controller.enterSandboxMode(keepSolved);
      if (!keepSolved) {
        sound.playVoiceover('intro');
      }
    },
    onRetrySame: () => {
      controller.retryCurrentSeed();
      sound.playVoiceover('intro');
    },
    onSelectStation: (station) => {
      sound.playTeleportStep();
      controller.setStation(station);
      scene.teleportToStation(station);
    },
    onSelectTrial: (trial) => {
      sound.playTeleportStep();
      controller.startTrial(trial);
    },
    onNextTrial: () => {
      sound.playTeleportStep();
      controller.advanceNextTrial();
    },
    onToggleCameraMode: () => {
      sound.playTeleportStep();
      controller.toggleCameraMode();
    },
    onRotateAstrolabe: (ringIndex) => controller.rotateAstrolabe(ringIndex, 1),
    onRotateMirror: (mirrorIndex) => controller.rotateMirror(mirrorIndex, 1),
    onStrikeChime: (slotIndex) => controller.strikeChime(slotIndex),
    onPulseChimes: () => {
      controller.requestChimePulse();
    },
    onTriggerApex: () => {
      controller.triggerApexCrown();
    },
    onToggleMute: () => sound.toggleMute(),
  });

  const handleSceneInteract = (action: SceneInteractAction): void => {
    if (hud.isAnyModalOpen()) return;
    dispatchDirect3DAction(controller, action, {
      onTeleportPad: (station) => {
        sound.playTeleportStep();
        scene.teleportToStation(station);
      },
    });
  };

  const triggerProximityInteract = (): void => {
    const snap = controller.getSnapshot();
    const nearby =
      snap.cameraMode === 'walk'
        ? scene.getNearbyWalkStation()
        : snap.activeStation === 'overview'
          ? null
          : snap.activeStation;
    if (!nearby) return;

    if (nearby === 'astrolabe') {
      const nextRing = snap.astrolabe.rings.findIndex((r) => r !== 0);
      controller.rotateAstrolabe(nextRing >= 0 ? nextRing : 0, 1);
    } else if (nearby === 'mirrors') {
      const nextMirror = snap.mirrors.mirrors.findIndex(
        (m) => m.orientation !== m.solutionOrientation,
      );
      controller.rotateMirror(nextMirror >= 0 ? nextMirror : 0, 1);
    } else if (nearby === 'chimes') {
      if (snap.chimes.solved) {
        controller.requestChimePulse();
      } else {
        const order = getAscendingChimeSlots(snap.chimes);
        const nextSlot = order[snap.chimes.progress] ?? 0;
        controller.strikeChime(nextSlot);
      }
    } else if (nearby === 'apex') {
      controller.triggerApexCrown();
    }
  };

  const scene = new ObservatoryScene(canvas, {
    onInteract: handleSceneInteract,
    onHoverChange: (label) => hud.setHoverLabel(label),
    onProximityChange: (station) => hud.setWalkPrompt(station),
    onPulseBellAudio: (rank) => sound.playChimeBell(rank, true),
    onTick: (deltaSec) => {
      controller.tick(deltaSec);
      const snap = controller.getSnapshot();
      const roundedSec = Math.ceil(snap.timeRemainingSec);
      if (roundedSec !== lastSecondDisplayed) {
        lastSecondDisplayed = roundedSec;
        hud.updateTimerOnly(snap);
      }
    },
  });

  controller.subscribe((snapshot) => {
    scene.syncSnapshot(snapshot);
    hud.render(snapshot);

    const evt = snapshot.lastEvent;
    if (!evt) return;
    switch (evt.type) {
      case 'ritual-started':
      case 'trial-changed':
        sound.syncHarmonicLayer(snapshot.solvedCount, snapshot.apexIgnited);
        break;
      case 'astrolabe-rotated':
        sound.playAstrolabeClick(evt.aligned, evt.coupledRings.length);
        if (evt.solved) sound.playConduitIgnite(snapshot.solvedCount);
        break;
      case 'mirror-rotated':
        sound.playMirrorTurn(evt.beamHitsCollector);
        if (evt.solved) sound.playConduitIgnite(snapshot.solvedCount);
        break;
      case 'chime-struck':
        sound.playChimeBell(evt.rank, evt.correct);
        if (evt.solved) sound.playConduitIgnite(snapshot.solvedCount);
        break;
      case 'apex-locked':
        sound.playApexLocked();
        break;
      case 'apex-ignited':
        sound.playSolsticeVictory(snapshot.currentTrial);
        break;
      case 'eclipse-expired':
        sound.playEclipseExpired();
        break;
      default:
        break;
    }
  });

  const STATION_KEYS: Record<string, StationId> = {
    Digit1: 'overview',
    Digit2: 'astrolabe',
    Digit3: 'mirrors',
    Digit4: 'chimes',
    Digit5: 'apex',
  };

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (hud.isAnyModalOpen()) return;

    scene.handleKey(e.code, true);

    if (e.code === 'KeyV') {
      sound.playTeleportStep();
      controller.toggleCameraMode();
    } else if (e.code === 'KeyC') {
      hud.toggleCinemaMode();
    } else if (e.code === 'KeyE') {
      triggerProximityInteract();
    } else if (e.code === 'KeyR') {
      scene.resetView();
      hud.showToast('Vantage point centered');
    } else if (e.code === 'KeyH') {
      hud.toggleHint();
    } else if (e.code === 'KeyM') {
      hud.toggleMute();
    } else if (e.code === 'Space') {
      const snap = controller.getSnapshot();
      const station =
        snap.cameraMode === 'walk' ? scene.getNearbyWalkStation() : snap.activeStation;
      if (station === 'chimes') {
        e.preventDefault();
        controller.requestChimePulse();
      }
    } else if (STATION_KEYS[e.code]) {
      sound.playTeleportStep();
      const st = STATION_KEYS[e.code];
      controller.setStation(st);
      scene.teleportToStation(st);
    }
  });

  window.addEventListener('keyup', (e) => {
    scene.handleKey(e.code, false);
  });

  window.addEventListener('blur', () => {
    scene.clearKeys();
  });

  window.__ORRERY__ = {
    getSnapshot: () => controller.getSnapshot(),
    snapCameraToStation: (station: StationId) => {
      controller.setStation(station);
      scene.snapToStation(station);
    },
    setCameraMode: (mode: CameraMode, immediate: boolean = false) => {
      controller.setCameraMode(mode);
      scene.setCameraMode(mode, immediate);
    },
    setWalkPose: (x: number, z: number, yaw: number, pitch: number = 0.08) => {
      controller.setCameraMode('walk');
      scene.setWalkPose(x, z, yaw, pitch);
    },
    setTrial: (trial: TrialNumber) => {
      controller.startTrial(trial);
    },
    setCinemaMode: (enabled: boolean) => hud.setCinemaMode(enabled),
    getInteractableScreenPoint: (kind: SceneInteractAction['kind'], index: number = 0) =>
      scene.getInteractableScreenPoint(kind, index),
    getQualityStats: () => scene.getQualityStats(),
    setCinematicPose: (pose: CameraPreset, immediate: boolean = false) => {
      scene.setCinematicPose(pose, immediate);
    },
    setManualStep: (enabled: boolean) => {
      scene.setManualStep(enabled);
    },
    stepFrame: (deltaSec: number) => {
      scene.stepFrame(deltaSec);
    },
    waitForTextures: () => scene.waitForTextures(),
  };
}

bootstrap();
