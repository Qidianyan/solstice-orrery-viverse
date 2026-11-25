import * as THREE from 'three';
import type { StationId } from '../game/types';

export interface CameraPreset {
  target: [number, number, number];
  yaw: number;
  pitch: number;
  distance: number;
}

/**
 * Carefully framed zero-motion-sickness camera presets per stepping pad.
 * No roll, gentle damped spherical easing, zero involuntary head-bobbing.
 */
export const CAMERA_PRESETS: Record<StationId, CameraPreset> = {
  overview: {
    target: [0, 2.5, -0.4],
    yaw: 0.28,
    pitch: 0.32,
    distance: 20.8,
  },
  astrolabe: {
    target: [-10.5, 3.15, 1.5],
    yaw: 0.92,
    pitch: 0.11,
    distance: 11.1,
  },
  mirrors: {
    target: [10.5, 1.35, 1.5],
    yaw: 0.04,
    pitch: 0.68,
    distance: 11.6,
  },
  chimes: {
    target: [0, 3.1, -11.0],
    yaw: 0.0,
    pitch: 0.11,
    distance: 9.8,
  },
  apex: {
    target: [0, 3.4, 0],
    yaw: 0.38,
    pitch: 0.24,
    distance: 10.8,
  },
};

const TERRACE_CLAMP_RADIUS = 15.2;

export class ComfortCameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly reducedMotion: boolean;

  private currentTarget = new THREE.Vector3(0, 2.4, -0.4);
  private goalTarget = new THREE.Vector3(0, 2.4, -0.4);

  private currentYaw = CAMERA_PRESETS.overview.yaw;
  private goalYaw = CAMERA_PRESETS.overview.yaw;

  private currentPitch = CAMERA_PRESETS.overview.pitch;
  private goalPitch = CAMERA_PRESETS.overview.pitch;

  private currentDistance = CAMERA_PRESETS.overview.distance;
  private goalDistance = CAMERA_PRESETS.overview.distance;

  private activeStation: StationId = 'overview';
  private titleAutoOrbit = true;
  private victoryShowcase = false;
  private keys = new Set<string>();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.applyCameraTransform();
  }

  public setTitleAutoOrbit(enabled: boolean): void {
    this.titleAutoOrbit = enabled;
  }

  public setVictoryShowcase(enabled: boolean): void {
    this.victoryShowcase = enabled;
    if (enabled) {
      this.goalTarget.set(0, 3.4, 0);
      this.goalPitch = 0.28;
      this.goalDistance = 14.5;
    }
  }

  public moveToStation(station: StationId, immediate: boolean = false): void {
    this.activeStation = station;
    this.victoryShowcase = false;
    const preset = CAMERA_PRESETS[station];
    this.goalTarget.set(preset.target[0], preset.target[1], preset.target[2]);
    this.goalYaw = preset.yaw;
    this.goalPitch = preset.pitch;
    this.goalDistance = preset.distance;

    if (immediate || this.reducedMotion) {
      this.currentTarget.copy(this.goalTarget);
      this.currentYaw = this.goalYaw;
      this.currentPitch = this.goalPitch;
      this.currentDistance = this.goalDistance;
      this.applyCameraTransform();
    }
  }

  public resetCurrentView(): void {
    this.moveToStation(this.activeStation, false);
  }

  public setCinematicPose(pose: CameraPreset, immediate: boolean = false): void {
    this.titleAutoOrbit = false;
    this.victoryShowcase = false;
    this.goalTarget.set(pose.target[0], pose.target[1], pose.target[2]);
    this.goalYaw = pose.yaw;
    this.goalPitch = pose.pitch;
    this.goalDistance = pose.distance;

    if (immediate) {
      this.currentTarget.copy(this.goalTarget);
      this.currentYaw = this.goalYaw;
      this.currentPitch = this.goalPitch;
      this.currentDistance = this.goalDistance;
      this.applyCameraTransform();
    }
  }

  public orbitBy(deltaX: number, deltaY: number): void {
    this.titleAutoOrbit = false;
    this.victoryShowcase = false;
    this.goalYaw -= deltaX * 0.0055;
    this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + deltaY * 0.0045, 0.06, 1.18);
  }

  public zoomBy(deltaY: number): void {
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance + deltaY * 0.012, 5.2, 27.5);
  }

  public setKeyState(code: string, down: boolean): void {
    if (down) {
      this.keys.add(code);
      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        this.titleAutoOrbit = false;
        this.victoryShowcase = false;
      }
    } else {
      this.keys.delete(code);
    }
  }

  public clearKeys(): void {
    this.keys.clear();
  }

  public update(deltaSec: number): void {
    const dt = Math.min(0.05, deltaSec);

    if (this.titleAutoOrbit && !this.reducedMotion) {
      this.goalYaw += dt * 0.085;
    } else if (this.victoryShowcase && !this.reducedMotion) {
      this.goalYaw += dt * 0.16;
    }

    // Gentle comfort WASD / Arrow terrace stroll (no head-bob, safe radius boundary)
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;

    if (forward !== 0 || strafe !== 0) {
      const speed = 6.2 * dt;
      const forwardX = -Math.sin(this.currentYaw);
      const forwardZ = -Math.cos(this.currentYaw);
      const rightX = Math.cos(this.currentYaw);
      const rightZ = -Math.sin(this.currentYaw);
      const moveX = (forwardX * forward + rightX * strafe) * speed;
      const moveZ = (forwardZ * forward + rightZ * strafe) * speed;

      this.goalTarget.x += moveX;
      this.goalTarget.z += moveZ;
      const r = Math.hypot(this.goalTarget.x, this.goalTarget.z);
      if (r > TERRACE_CLAMP_RADIUS) {
        this.goalTarget.x = (this.goalTarget.x / r) * TERRACE_CLAMP_RADIUS;
        this.goalTarget.z = (this.goalTarget.z / r) * TERRACE_CLAMP_RADIUS;
      }
    }

    // Critically damped smooth exponential interpolation (zero harsh snaps)
    const ease = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 6.5);
    this.currentTarget.lerp(this.goalTarget, ease);

    let yawDiff = ((this.goalYaw - this.currentYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.currentYaw += yawDiff * ease;
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.goalPitch, ease);
    this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.goalDistance, ease);

    this.applyCameraTransform();
  }

  private applyCameraTransform(): void {
    const horiz = Math.cos(this.currentPitch) * this.currentDistance;
    const vert = Math.sin(this.currentPitch) * this.currentDistance;
    const camX = this.currentTarget.x + Math.sin(this.currentYaw) * horiz;
    const camZ = this.currentTarget.z + Math.cos(this.currentYaw) * horiz;
    const camY = Math.max(1.25, this.currentTarget.y + vert);

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this.currentTarget);
  }
}
