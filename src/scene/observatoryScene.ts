import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { CameraMode, GameSnapshot, SkyEvolutionStage, StationId } from '../game/types';
import { PALETTE } from './palette';
import { createSanctuaryTextures, type SanctuaryTextureSet } from './textures';
import { createSolsticeSky, type SolsticeSkySystem } from './sky';
import { createObservatoryEnvironment, type ObservatoryEnvironment } from './environment';
import {
  createObservatoryInstruments,
  type HoveredInstrumentTarget,
  type ObservatoryInstruments,
} from './instruments';
import {
  AdaptiveQualityController,
  type AdaptiveQualityState,
} from './adaptiveQuality';
import {
  ComfortCameraRig,
  findNearbyInteractStation,
  type CameraPreset,
} from './cameraRig';

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
  onProximityChange?: (station: Exclude<StationId, 'overview'> | null) => void;
  onPulseBellAudio: (rank: number) => void;
  onTick: (deltaSec: number) => void;
}

const GOD_RAY_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalDir;
varying vec3 vViewDir;

void main() {
  vUv = uv;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vNormalDir = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const GOD_RAY_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormalDir;
varying vec3 vViewDir;

void main() {
  // Soft grazing Fresnel fade so volumetric god-ray cone edges vanish seamlessly
  float edge = pow(abs(dot(normalize(vNormalDir), normalize(vViewDir))), 1.75);
  // Smooth vertical shaft fade (gentle entry from sky oculus, soft dissipation near obsidian floor)
  float verticalFade = smoothstep(0.0, 0.24, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));
  // Subtle scrolling dust-curtain striations along the slanted beam
  float rays = 0.65 + 0.35 * sin(vUv.x * 25.1327 + uTime * 0.45 + vUv.y * 4.5);
  float shimmer = 0.8 + 0.2 * sin(vUv.y * 14.0 - uTime * 1.1 + vUv.x * 12.566);

  float alpha = edge * verticalFade * rays * shimmer * uOpacity;
  gl_FragColor = vec4(uColor * (0.9 + rays * 0.25), clamp(alpha, 0.0, 0.42));
}
`;

function skyStageToFloat(stage: SkyEvolutionStage, apexIgnited: boolean): number {
  if (apexIgnited) return 3.0;
  switch (stage) {
    case 'noon-gold':
      return 0.0;
    case 'amber-dusk':
      return 1.0;
    case 'crimson-eclipse':
      return 2.0;
    case 'dawn-corona':
      return 3.0;
  }
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
  private readonly quality: AdaptiveQualityController;
  private readonly callbacks: ObservatorySceneCallbacks;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly fog: THREE.FogExp2;
  private readonly envRenderTarget: THREE.WebGLRenderTarget;
  private readonly hoverHalo: THREE.Mesh;
  private readonly hoverHaloMat: THREE.MeshBasicMaterial;

  private readonly godRayGroup: THREE.Group;
  private readonly godRayGeo: THREE.BufferGeometry;
  private readonly godRayMat: THREE.ShaderMaterial;
  private readonly godRayUniforms: {
    uTime: { value: number };
    uColor: { value: THREE.Color };
    uOpacity: { value: number };
  };

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  private snapshot: GameSnapshot | null = null;
  private progressVisual = 0.08;
  private skyStageVisual = 0.0;
  private rafId = 0;
  private lastFrameMs = 0;
  private elapsedSec = 0;
  private disposed = false;
  private manualStepMode = false;

  private pointerDownPos = { x: 0, y: 0 };
  private isDragging = false;
  private dragMoved = false;
  private lastHoveredLabel: string | null = null;
  private lastNearbyStation: Exclude<StationId, 'overview'> | null = null;

  // Strictly warm 4-stage palette anchors (zero blue/cyan/teal/purple)
  private readonly fogNoon = new THREE.Color(0x28170c);
  private readonly fogAmber = new THREE.Color(0x1f1109);
  private readonly fogCrimson = new THREE.Color(0x1a0907);
  private readonly fogDawn = new THREE.Color(0x361d0d);

  private readonly sunNoon = new THREE.Color(0xffd786);
  private readonly sunAmber = new THREE.Color(0xf09b42);
  private readonly sunCrimson = new THREE.Color(0xe04f20);
  private readonly sunDawn = new THREE.Color(0xffe6a6);

  private readonly rayNoon = new THREE.Color(0xf7c564);
  private readonly rayAmber = new THREE.Color(0xe88e36);
  private readonly rayCrimson = new THREE.Color(0xdc441c);
  private readonly rayDawn = new THREE.Color(0xffdf90);

  constructor(canvas: HTMLCanvasElement, callbacks: ObservatorySceneCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.quality = new AdaptiveQualityController({
      nativeDpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    });
    const initialDpr = this.quality.getState().dpr;
    this.renderer.setPixelRatio(initialDpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0x28170e, 0.0076);
    this.scene.fog = this.fog;

    const width = canvas.clientWidth || window.innerWidth || 1280;
    const height = canvas.clientHeight || window.innerHeight || 720;
    this.renderer.setSize(width, height, false);

    this.envRenderTarget = this.createMoltenGoldEnvironment();
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 1.35;

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.2, 260);
    this.cameraRig = new ComfortCameraRig(this.camera);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(initialDpr);
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.28,
      0.32,
      0.94,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.hemiLight = new THREE.HemisphereLight(0xf2bd6b, PALETTE.obsidianBase, 0.88);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffcb7a, 2.5);
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

    this.rimLight = new THREE.DirectionalLight(0xd46a28, 0.95);
    this.rimLight.position.set(20, 11, 22);
    this.scene.add(this.rimLight);

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

    // Custom GLSL Volumetric God-Ray Cones pouring diagonally from celestial oculus into sanctuary
    this.godRayUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffd778) },
      uOpacity: { value: 0.24 },
    };
    this.godRayGeo = new THREE.CylinderGeometry(1.5, 6.2, 32, 32, 1, true);
    this.godRayMat = new THREE.ShaderMaterial({
      vertexShader: GOD_RAY_VERTEX,
      fragmentShader: GOD_RAY_FRAGMENT,
      uniforms: this.godRayUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.godRayGroup = new THREE.Group();
    const rayConfigs: Array<{ pos: [number, number, number]; scale: [number, number, number]; tiltZ: number; tiltX: number }> = [
      { pos: [-1.4, 14.5, -2.2], scale: [1.15, 1.05, 1.15], tiltZ: -0.22, tiltX: 0.24 },
      { pos: [-10.8, 13.5, 0.4], scale: [0.78, 0.96, 0.78], tiltZ: -0.22, tiltX: 0.24 },
      { pos: [9.8, 13.5, 0.4], scale: [0.82, 0.96, 0.82], tiltZ: -0.22, tiltX: 0.24 },
    ];
    for (const cfg of rayConfigs) {
      const cone = new THREE.Mesh(this.godRayGeo, this.godRayMat);
      cone.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      cone.scale.set(cfg.scale[0], cfg.scale[1], cfg.scale[2]);
      cone.rotation.z = cfg.tiltZ;
      cone.rotation.x = cfg.tiltX;
      this.godRayGroup.add(cone);
    }
    this.scene.add(this.godRayGroup);

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
    const prevCameraMode = this.snapshot?.cameraMode;
    this.snapshot = snapshot;

    this.instruments.syncState(snapshot);

    if (snapshot.phase === 'title') {
      this.cameraRig.setTitleAutoOrbit(true);
    } else if (prevPhase === 'title') {
      this.cameraRig.setTitleAutoOrbit(false);
    }

    if (snapshot.cameraMode !== prevCameraMode) {
      this.cameraRig.setMode(snapshot.cameraMode, false);
      if (snapshot.cameraMode === 'orbit') {
        this.lastNearbyStation = null;
        this.callbacks.onProximityChange?.(null);
      }
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

  private clearHoverState(): void {
    this.hoverHalo.visible = false;
    this.instruments.setHoveredTarget(null);
    if (this.lastHoveredLabel !== null) {
      this.lastHoveredLabel = null;
      this.callbacks.onHoverChange(null);
    }
  }

  public snapToStation(station: StationId): void {
    this.clearHoverState();
    this.cameraRig.moveToStation(station, true, true);
  }

  public teleportToStation(station: StationId): void {
    this.clearHoverState();
    this.cameraRig.moveToStation(station, false, true);
  }

  public setCameraMode(mode: CameraMode, immediate: boolean = false): void {
    this.clearHoverState();
    this.cameraRig.setMode(mode, immediate);
  }

  public setWalkPose(x: number, z: number, yaw: number, pitch: number = 0.08): void {
    this.clearHoverState();
    this.cameraRig.setWalkPose(x, z, yaw, pitch);
    const near = findNearbyInteractStation(this.cameraRig.getWalkPosition());
    const nextStation = near ? near.station : null;
    this.lastNearbyStation = nextStation;
    this.callbacks.onProximityChange?.(nextStation);
  }

  public getNearbyWalkStation(): Exclude<StationId, 'overview'> | null {
    if (this.cameraRig.getMode() !== 'walk') return null;
    const near = findNearbyInteractStation(this.cameraRig.getWalkPosition());
    return near ? near.station : null;
  }

  public setCinematicPose(pose: CameraPreset, immediate: boolean = false): void {
    this.cameraRig.setCinematicPose(pose, immediate);
  }

  public getQualityStats(): AdaptiveQualityState {
    return this.quality.getState();
  }

  public getInteractableScreenPoint(
    kind: SceneInteractAction['kind'],
    index: number = 0,
  ): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const all = [...this.instruments.interactables, ...this.env.interactables];
    for (const obj of all) {
      const data = obj.userData.interactable as SceneInteractAction | undefined;
      if (!data || data.kind !== kind) continue;
      if (kind === 'astrolabe-ring' && data.kind === 'astrolabe-ring') {
        if (data.ringIndex !== index) continue;
        // Skip hollow torus center; project a solid crest/aperture/tooth mesh on the ring rim
        if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.TorusGeometry) continue;
      }
      if (kind === 'mirror' && data.kind === 'mirror' && data.mirrorIndex !== index) continue;
      if (kind === 'chime' && data.kind === 'chime' && data.slotIndex !== index) continue;
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      const projected = worldPos.project(this.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      return {
        x: rect.left + ((projected.x + 1) * 0.5) * rect.width,
        y: rect.top + ((-projected.y + 1) * 0.5) * rect.height,
      };
    }
    return null;
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
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onResize);
  }

  private onPointerLeave = (): void => {
    this.clearHoverState();
  };

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
        this.instruments.setHoveredTarget(null);
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
        const hoveredTarget: HoveredInstrumentTarget =
          hit.action.kind === 'astrolabe-ring'
            ? { kind: 'astrolabe-ring', ringIndex: hit.action.ringIndex }
            : hit.action.kind === 'mirror'
              ? { kind: 'mirror', mirrorIndex: hit.action.mirrorIndex }
              : hit.action.kind === 'chime'
                ? { kind: 'chime', slotIndex: hit.action.slotIndex }
                : hit.action.kind === 'chime-gong'
                  ? { kind: 'chime-gong' }
                  : hit.action.kind === 'apex-crown'
                    ? { kind: 'apex-crown' }
                    : null;
        this.instruments.setHoveredTarget(hoveredTarget);
      } else {
        this.hoverHalo.visible = false;
        this.instruments.setHoveredTarget(null);
      }
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
    } else {
      this.clearHoverState();
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

  private lerpFourStageColor(
    out: THREE.Color,
    c0: THREE.Color,
    c1: THREE.Color,
    c2: THREE.Color,
    c3: THREE.Color,
    stage03: number,
  ): void {
    const s = Math.max(0, Math.min(3, stage03));
    if (s < 1) {
      out.copy(c0).lerp(c1, s);
    } else if (s < 2) {
      out.copy(c1).lerp(c2, s - 1);
    } else {
      out.copy(c2).lerp(c3, s - 2);
    }
  }

  private renderFrame(deltaSec: number): void {
    this.elapsedSec += deltaSec;

    this.callbacks.onTick(deltaSec);
    this.cameraRig.update(deltaSec);

    // Report live Walkaround proximity station changes
    if (this.cameraRig.getMode() === 'walk') {
      const near = findNearbyInteractStation(this.cameraRig.getWalkPosition());
      const nextNear = near ? near.station : null;
      if (nextNear !== this.lastNearbyStation) {
        this.lastNearbyStation = nextNear;
        this.callbacks.onProximityChange?.(nextNear);
      }
    }

    const snap = this.snapshot;
    const solvedRatio = snap ? snap.solvedCount / 3 : 0;
    const targetProgress = snap?.apexIgnited ? 1.0 : 0.1 + solvedRatio * 0.62;
    this.progressVisual = THREE.MathUtils.lerp(
      this.progressVisual,
      targetProgress,
      Math.min(1, deltaSec * 1.6),
    );

    const targetSkyStage = snap
      ? skyStageToFloat(snap.trialMeta.skyStage, snap.apexIgnited)
      : 1.0;
    this.skyStageVisual = THREE.MathUtils.lerp(
      this.skyStageVisual,
      targetSkyStage,
      Math.min(1, deltaSec * 2.2),
    );

    const urgency =
      snap && snap.phase === 'playing' && snap.timeRemainingSec < 60
        ? 1 - snap.timeRemainingSec / 60
        : snap?.phase === 'lost'
          ? 1
          : 0;

    this.instruments.update(this.elapsedSec, deltaSec);
    const bloom = this.instruments.getApexBloomFactor();

    this.sky.update(this.elapsedSec, this.progressVisual, urgency, bloom, this.skyStageVisual);

    // 4-Stage dynamic lighting & volumetric god-rays evolution (Noon Gold -> Amber Dusk -> Crimson Eclipse -> Dawn Corona)
    this.sunLight.position.copy(this.sky.sunDirection).multiplyScalar(44);
    this.lerpFourStageColor(
      this.sunLight.color,
      this.sunNoon,
      this.sunAmber,
      this.sunCrimson,
      this.sunDawn,
      this.skyStageVisual,
    );
    const crimsonDip = this.skyStageVisual > 1.2 && this.skyStageVisual < 2.5 ? 0.35 : 0;
    this.sunLight.intensity = 2.15 - crimsonDip + this.progressVisual * 0.45 + bloom * 0.25 - urgency * 0.35;
    this.hemiLight.intensity = 0.72 - crimsonDip * 0.3 + this.progressVisual * 0.22 - urgency * 0.14;
    this.rimLight.intensity = 0.82 + crimsonDip * 0.55 + this.progressVisual * 0.2 + bloom * 0.2;

    this.lerpFourStageColor(
      this.fog.color,
      this.fogNoon,
      this.fogAmber,
      this.fogCrimson,
      this.fogDawn,
      this.skyStageVisual,
    );
    this.fog.density = THREE.MathUtils.lerp(0.0052, 0.0032, this.progressVisual);

    // Volumetric God-Ray Cones animation & color sync (ducked cleanly during Apex Dawn Corona so central bronze rings stay razor sharp)
    this.godRayUniforms.uTime.value = this.elapsedSec;
    this.lerpFourStageColor(
      this.godRayUniforms.uColor.value,
      this.rayNoon,
      this.rayAmber,
      this.rayCrimson,
      this.rayDawn,
      this.skyStageVisual,
    );
    this.godRayUniforms.uOpacity.value = Math.max(0.08, 0.14 + this.progressVisual * 0.05 - bloom * 0.05);

    // Photographic ACES exposure compression + disciplined Bloom during Dawn Corona climax (ZERO white blowout!)
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.04, 0.88, bloom);
    this.bloomPass.strength = THREE.MathUtils.lerp(0.28 + this.progressVisual * 0.04, 0.26, bloom);
    this.bloomPass.threshold = THREE.MathUtils.lerp(0.94, 0.98, bloom);

    // 60fps Adaptive DPR & dust particle scaler
    if (!this.manualStepMode) {
      const q = this.quality.recordFrame(deltaSec);
      if (q.changed) {
        this.renderer.setPixelRatio(q.state.dpr);
        this.composer.setPixelRatio(q.state.dpr);
        this.env.setParticleRatio(q.state.particleScale);
      }
    }

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
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);
    this.hoverHalo.geometry.dispose();
    this.hoverHaloMat.dispose();
    this.godRayGeo.dispose();
    this.godRayMat.dispose();
    this.sky.dispose();
    this.env.dispose();
    this.instruments.dispose();
    this.textures.dispose();
    this.envRenderTarget.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
