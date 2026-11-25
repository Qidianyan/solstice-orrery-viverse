import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GameSnapshot, StationId } from '../game/types';
import { PALETTE } from './palette';
import { createSanctuaryTextures, type SanctuaryTextureSet } from './textures';
import { createSolsticeSky, type SolsticeSkySystem } from './sky';
import { createObservatoryEnvironment, type ObservatoryEnvironment } from './environment';
import { createObservatoryInstruments, type ObservatoryInstruments } from './instruments';
import { ComfortCameraRig, type CameraPreset } from './cameraRig';

export type SceneInteractAction =
  | { kind: 'pad'; station: StationId; label: string }
  | { kind: 'astrolabe-ring'; ringIndex: number; label: string }
  | { kind: 'mirror'; mirrorIndex: number; label: string }
  | { kind: 'chime'; slotIndex: number; label: string }
  | { kind: 'chime-gong'; label: string }
  | { kind: 'apex-crown'; label: string };

export interface ObservatorySceneCallbacks {
  onInteract: (action: SceneInteractAction) => void;
  onHoverChange: (label: string | null) => void;
  onPulseBellAudio: (rank: number) => void;
  onTick: (deltaSec: number) => void;
}

export class ObservatoryScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly cameraRig: ComfortCameraRig;
  private readonly textures: SanctuaryTextureSet;
  private readonly sky: SolsticeSkySystem;
  private readonly env: ObservatoryEnvironment;
  private readonly instruments: ObservatoryInstruments;
  private readonly callbacks: ObservatorySceneCallbacks;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly fog: THREE.FogExp2;
  private readonly envRenderTarget: THREE.WebGLRenderTarget;
  private readonly hoverHalo: THREE.Mesh;
  private readonly hoverHaloMat: THREE.MeshBasicMaterial;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  private snapshot: GameSnapshot | null = null;
  private progressVisual = 0.08;
  private rafId = 0;
  private lastFrameMs = 0;
  private elapsedSec = 0;
  private disposed = false;
  private manualStepMode = false;

  private pointerDownPos = { x: 0, y: 0 };
  private isDragging = false;
  private dragMoved = false;
  private lastHoveredLabel: string | null = null;

  private readonly fogEclipse = new THREE.Color(0x1b120d);
  private readonly fogSolstice = new THREE.Color(0x523118);
  private readonly sunEclipse = new THREE.Color(0xf29c46);
  private readonly sunSolstice = new THREE.Color(0xffedb8);

  constructor(canvas: HTMLCanvasElement, callbacks: ObservatorySceneCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0x1b120d, 0.0082);
    this.scene.fog = this.fog;

    const width = canvas.clientWidth || window.innerWidth || 1280;
    const height = canvas.clientHeight || window.innerHeight || 720;
    this.renderer.setSize(width, height, false);

    // Warm obsidian & molten-gold studio PMREM reflections so hammered bronze & basalt gleam crisply
    this.envRenderTarget = this.createMoltenGoldEnvironment();
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 1.35;

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.2, 260);
    this.cameraRig = new ComfortCameraRig(this.camera);

    // Post-processing pipeline: RenderPass -> UnrealBloomPass -> OutputPass
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.42, // crisp molten-gold strength without milky washout
      0.38, // tight optical halo radius
      0.88, // high threshold so only emissive molten beams/crystals bloom, never floor glare
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Cinematic warm volcanic sanctuary lighting (zero blue/cyan/purple)
    this.hemiLight = new THREE.HemisphereLight(0xf2bd6b, PALETTE.obsidianBase, 0.88);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffcb7a, 2.75);
    this.sunLight.position.set(-22, 24, -26);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 94;
    this.sunLight.shadow.camera.left = -24;
    this.sunLight.shadow.camera.right = 24;
    this.sunLight.shadow.camera.top = 24;
    this.sunLight.shadow.camera.bottom = -24;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Sculpted molten-amber rim light from opposite volcanic horizon for basalt carving relief
    this.rimLight = new THREE.DirectionalLight(0xd46a28, 1.05);
    this.rimLight.position.set(20, 11, 22);
    this.scene.add(this.rimLight);

    // Subtle 3D golden hover beacon ring on hovered interactive objects
    this.hoverHaloMat = new THREE.MeshBasicMaterial({
      color: PALETTE.moltenGold,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.hoverHalo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32), this.hoverHaloMat);
    this.hoverHalo.visible = false;
    this.scene.add(this.hoverHalo);

    this.textures = createSanctuaryTextures();
    this.sky = createSolsticeSky(this.textures.eclipseSkyMap, this.textures.softGlowMap);
    this.scene.add(this.sky.group);

    this.env = createObservatoryEnvironment(this.textures);
    this.scene.add(this.env.group);

    this.instruments = createObservatoryInstruments(this.textures, callbacks.onPulseBellAudio);
    this.scene.add(this.instruments.group);

    this.bindEvents();
    this.lastFrameMs = performance.now();
    this.animate(this.lastFrameMs);
  }

  public waitForTextures(): Promise<void> {
    return this.textures.ready;
  }

  public syncSnapshot(snapshot: GameSnapshot): void {
    const prevPhase = this.snapshot?.phase;
    const prevStation = this.snapshot?.activeStation;
    this.snapshot = snapshot;

    this.instruments.syncState(snapshot);

    if (snapshot.phase === 'title') {
      this.cameraRig.setTitleAutoOrbit(true);
    } else if (prevPhase === 'title') {
      this.cameraRig.setTitleAutoOrbit(false);
    }

    if (snapshot.activeStation !== prevStation) {
      this.cameraRig.moveToStation(snapshot.activeStation, false);
    }

    if (snapshot.lastEvent) {
      if (snapshot.lastEvent.type === 'chime-pulse-requested') {
        this.instruments.triggerChimePulse(snapshot.lastEvent.sequenceSlots);
      } else if (snapshot.lastEvent.type === 'chime-struck') {
        this.instruments.triggerChimeStrikeAnim(
          snapshot.lastEvent.slotIndex,
          snapshot.lastEvent.correct,
        );
      } else if (snapshot.lastEvent.type === 'apex-ignited') {
        this.cameraRig.setVictoryShowcase(true);
      }
    }
  }

  public snapToStation(station: StationId): void {
    this.cameraRig.moveToStation(station, true);
  }

  public setCinematicPose(pose: CameraPreset, immediate: boolean = false): void {
    this.cameraRig.setCinematicPose(pose, immediate);
  }

  public setManualStep(enabled: boolean): void {
    this.manualStepMode = enabled;
    if (!enabled) {
      this.lastFrameMs = performance.now();
    }
  }

  public stepFrame(deltaSec: number): void {
    if (this.disposed) return;
    this.renderFrame(Math.min(0.1, Math.max(0.001, deltaSec)));
  }

  public resetView(): void {
    this.cameraRig.resetCurrentView();
  }

  public handleKey(code: string, down: boolean): void {
    this.cameraRig.setKeyState(code, down);
  }

  public clearKeys(): void {
    this.cameraRig.clearKeys();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onResize);
  }

  private raycastInteractable(
    clientX: number,
    clientY: number,
  ): { action: SceneInteractAction; point: THREE.Vector3 } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const targets = [...this.instruments.interactables, ...this.env.interactables];
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const data = hit.object.userData.interactable as SceneInteractAction | undefined;
      if (data) return { action: data, point: hit.point };
    }
    return null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.dragMoved = false;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isDragging) {
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) {
        this.dragMoved = true;
      }
      if (this.dragMoved) {
        this.cameraRig.orbitBy(e.movementX, e.movementY);
        this.canvas.style.cursor = 'grabbing';
        this.hoverHalo.visible = false;
        return;
      }
    }

    if (e.target === this.canvas) {
      const hit = this.raycastInteractable(e.clientX, e.clientY);
      const nextLabel = hit ? hit.action.label : null;
      if (nextLabel !== this.lastHoveredLabel) {
        this.lastHoveredLabel = nextLabel;
        this.callbacks.onHoverChange(nextLabel);
      }
      if (hit) {
        this.hoverHalo.visible = true;
        this.hoverHalo.position.copy(hit.point);
        this.hoverHalo.lookAt(this.camera.position);
      } else {
        this.hoverHalo.visible = false;
      }
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const wasClick = !this.dragMoved;
    this.isDragging = false;
    this.dragMoved = false;
    this.canvas.style.cursor = 'grab';

    if (wasClick && e.target === this.canvas) {
      const hit = this.raycastInteractable(e.clientX, e.clientY);
      if (hit) {
        this.callbacks.onInteract(hit.action);
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.cameraRig.zoomBy(e.deltaY);
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const width = this.canvas.clientWidth || window.innerWidth || 1280;
    const height = this.canvas.clientHeight || window.innerHeight || 720;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  };

  private animate = (nowMs: number): void => {
    if (this.disposed) return;
    this.rafId = window.requestAnimationFrame(this.animate);
    if (this.manualStepMode) return;

    const deltaSec = Math.min(0.1, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    this.renderFrame(deltaSec);
  };

  private renderFrame(deltaSec: number): void {
    this.elapsedSec += deltaSec;

    this.callbacks.onTick(deltaSec);
    this.cameraRig.update(deltaSec);

    const snap = this.snapshot;
    const solvedRatio = snap ? snap.solvedCount / 3 : 0;
    const targetProgress = snap?.apexIgnited ? 1.0 : 0.1 + solvedRatio * 0.62;
    this.progressVisual = THREE.MathUtils.lerp(
      this.progressVisual,
      targetProgress,
      Math.min(1, deltaSec * 1.4),
    );

    const urgency =
      snap && snap.phase === 'playing' && snap.timeRemainingSec < 60
        ? 1 - snap.timeRemainingSec / 60
        : snap?.phase === 'lost'
          ? 1
          : 0;

    this.instruments.update(this.elapsedSec, deltaSec);
    const bloom = this.instruments.getApexBloomFactor();

    this.sky.update(this.elapsedSec, this.progressVisual, urgency, bloom);

    this.sunLight.position.copy(this.sky.sunDirection).multiplyScalar(44);
    this.sunLight.color.copy(this.sunEclipse).lerp(this.sunSolstice, this.progressVisual);
    this.sunLight.intensity = 2.1 + this.progressVisual * 0.75 + bloom * 0.45 - urgency * 0.5;
    this.hemiLight.intensity = 0.74 + this.progressVisual * 0.34 - urgency * 0.18;
    this.rimLight.intensity = 0.85 + this.progressVisual * 0.32 + bloom * 0.25;
    this.fog.color.copy(this.fogEclipse).lerp(this.fogSolstice, this.progressVisual);
    this.fog.density = THREE.MathUtils.lerp(0.008, 0.005, this.progressVisual);

    // Crisp calibrated UnrealBloomPass: molten gold glows sharply while obsidian stays deep and rich
    this.bloomPass.strength = 0.38 + this.progressVisual * 0.09 + bloom * 0.16;
    this.bloomPass.threshold = THREE.MathUtils.lerp(0.88, 0.8, bloom);

    if (this.hoverHalo.visible) {
      const pulse = 1 + Math.sin(this.elapsedSec * 4.5) * 0.1;
      this.hoverHalo.scale.setScalar(pulse);
    }

    this.env.update(
      this.elapsedSec,
      deltaSec,
      snap?.activeStation ?? 'overview',
      {
        astrolabe: snap?.astrolabe.solved ?? false,
        mirrors: snap?.mirrors.solved ?? false,
        chimes: snap?.chimes.solved ?? false,
      },
      bloom,
    );

    this.composer.render();
  }

  private createMoltenGoldEnvironment(): THREE.WebGLRenderTarget {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x28180e);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const panelSpecs: Array<{ pos: [number, number, number]; scale: [number, number, number]; color: number }> = [
      { pos: [0, 12, 0], scale: [26, 1, 26], color: 0xf7cf7c },
      { pos: [-11, 7, -11], scale: [12, 12, 1], color: 0xfff3cc },
      { pos: [12, 6, 9], scale: [14, 10, 1], color: 0xd98e3a },
      { pos: [0, 5, 14], scale: [18, 9, 1], color: 0xb56624 },
      { pos: [-14, 4, 4], scale: [1, 10, 16], color: 0xf2b84b },
      { pos: [14, 4, -4], scale: [1, 10, 16], color: 0x8c5327 },
      { pos: [0, -10, 0], scale: [28, 1, 28], color: 0x160f0b },
    ];
    const tempMats: THREE.Material[] = [];
    for (const p of panelSpecs) {
      const m = new THREE.MeshBasicMaterial({ color: p.color });
      tempMats.push(m);
      const mesh = new THREE.Mesh(boxGeo, m);
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
      envScene.add(mesh);
    }

    const rt = pmrem.fromScene(envScene, 0.04);
    boxGeo.dispose();
    for (const m of tempMats) m.dispose();
    pmrem.dispose();
    return rt;
  }

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);
    this.hoverHalo.geometry.dispose();
    this.hoverHaloMat.dispose();
    this.sky.dispose();
    this.env.dispose();
    this.instruments.dispose();
    this.textures.dispose();
    this.envRenderTarget.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
