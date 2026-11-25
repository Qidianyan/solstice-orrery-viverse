import { GameController } from './game/controller';
import type { GameSnapshot, StationId } from './game/types';
import type { CameraPreset } from './scene/cameraRig';
import { SoundEngine } from './audio/soundEngine';
import { ObservatoryScene, type SceneInteractAction } from './scene/observatoryScene';
import { ObservatoryHud } from './ui/hud';

declare global {
  interface Window {
    __ORRERY__?: {
      getSnapshot: () => GameSnapshot;
      snapCameraToStation: (station: StationId) => void;
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

  const controller = new GameController();
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
    onResetView: () => scene.resetView(),
    onToggleMute: () => sound.toggleMute(),
  });

  const handleSceneInteract = (action: SceneInteractAction): void => {
    if (hud.isAnyModalOpen()) return;
    switch (action.kind) {
      case 'pad':
        sound.playTeleportStep();
        controller.setStation(action.station);
        break;
      case 'astrolabe-ring':
        controller.setStation('astrolabe');
        controller.rotateAstrolabe(action.ringIndex, 1);
        break;
      case 'mirror':
        controller.setStation('mirrors');
        controller.rotateMirror(action.mirrorIndex, 1);
        break;
      case 'chime':
        controller.setStation('chimes');
        controller.strikeChime(action.slotIndex);
        break;
      case 'chime-gong':
        controller.setStation('chimes');
        controller.requestChimePulse();
        break;
      case 'apex-crown':
        controller.setStation('apex');
        controller.triggerApexCrown();
        break;
    }
  };

  const scene = new ObservatoryScene(canvas, {
    onInteract: handleSceneInteract,
    onHoverChange: (label) => hud.setHoverLabel(label),
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
      case 'astrolabe-rotated':
        sound.playAstrolabeClick(evt.aligned);
        if (evt.solved) sound.playConduitIgnite();
        break;
      case 'mirror-rotated':
        sound.playMirrorTurn(evt.beamHitsCollector);
        if (evt.solved) sound.playConduitIgnite();
        break;
      case 'chime-struck':
        sound.playChimeBell(evt.rank, evt.correct);
        if (evt.solved) sound.playConduitIgnite();
        break;
      case 'apex-locked':
        sound.playApexLocked();
        break;
      case 'apex-ignited':
        sound.playSolsticeVictory();
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

    if (e.code === 'KeyR') {
      scene.resetView();
      hud.showToast('Vantage point centered');
    } else if (e.code === 'KeyH') {
      hud.toggleHint();
    } else if (e.code === 'KeyM') {
      hud.toggleMute();
    } else if (e.code === 'Space') {
      const snap = controller.getSnapshot();
      if (snap.activeStation === 'chimes') {
        e.preventDefault();
        controller.requestChimePulse();
      }
    } else if (STATION_KEYS[e.code]) {
      sound.playTeleportStep();
      controller.setStation(STATION_KEYS[e.code]);
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
