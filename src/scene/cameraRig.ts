import * as THREE from 'three';
import type { CameraMode, StationId, Vec2 } from '../game/types';
import {
  SANCTUARY_COLLIDERS,
  SANCTUARY_WALK_MAX_RADIUS,
  WING_POSITIONS,
  type CircleCollider,
} from './environment';

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

export const WALK_EYE_HEIGHT = 1.78;
export const PLAYER_COLLISION_RADIUS = 0.52;
const TERRACE_CLAMP_RADIUS = 15.2;

const WALK_SPAWN_BY_STATION: Record<StationId, { pos: [number, number]; yaw: number }> = {
  overview: { pos: [0, 12.6], yaw: 0.0 },
  astrolabe: { pos: [-5.6, 5.4], yaw: 0.92 },
  mirrors: { pos: [5.8, 5.8], yaw: -0.78 },
  chimes: { pos: [0, -4.6], yaw: 0.0 },
  apex: { pos: [0, 5.8], yaw: 0.0 },
};

/**
 * Pure circle-vs-circle + outer sanctuary circular wall collision resolver.
 * Guarantees smooth sliding around all 16 fluted Doric basalt columns and pedestals
 * without clipping or falling off the floating volcanic sanctuary.
 */
export function resolveWalkCollision(
  candidate: Vec2,
  colliders: readonly CircleCollider[] = SANCTUARY_COLLIDERS,
  maxRadius: number = SANCTUARY_WALK_MAX_RADIUS,
  playerRadius: number = PLAYER_COLLISION_RADIUS,
): { x: number; z: number; collided: boolean } {
  let x = Number.isFinite(candidate.x) ? candidate.x : 0;
  let z = Number.isFinite(candidate.z) ? candidate.z : 12.6;
  let collided = !Number.isFinite(candidate.x) || !Number.isFinite(candidate.z);
  const safeOuter = Math.max(2, maxRadius - playerRadius);

  // Three relaxation passes: clamp outer parapet FIRST so column repulsion always pushes cleanly inward
  for (let pass = 0; pass < 3; pass += 1) {
    const r = Math.hypot(x, z);
    if (r > safeOuter) {
      collided = true;
      const scale = safeOuter / r;
      x *= scale;
      z *= scale;
    }

    for (const col of colliders) {
      const dx = x - col.x;
      const dz = z - col.z;
      const minDist = col.radius + playerRadius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        collided = true;
        const dist = Math.sqrt(distSq);
        if (dist > 1e-4) {
          const push = (minDist - dist) / dist;
          x += dx * push;
          z += dz * push;
        } else {
          // Coincident center fallback: push radially inward toward sanctuary center (or +X if at origin)
          const colR = Math.hypot(col.x, col.z);
          if (colR > 1e-4) {
            x -= (col.x / colR) * minDist;
            z -= (col.z / colR) * minDist;
          } else {
            x += minDist;
          }
        }
      }
    }
  }

  return { x, z, collided };
}

/**
 * Returns the nearest interactive instrument station when walking within reach.
 */
export function findNearbyInteractStation(
  pos: Vec2,
  maxDistance: number = 6.8,
): { station: Exclude<StationId, 'overview'>; distance: number } | null {
  const candidates: Array<{ station: Exclude<StationId, 'overview'>; x: number; z: number }> = [
    { station: 'astrolabe', x: WING_POSITIONS.astrolabe.x, z: WING_POSITIONS.astrolabe.z },
    { station: 'mirrors', x: WING_POSITIONS.mirrors.x, z: WING_POSITIONS.mirrors.z },
    { station: 'chimes', x: WING_POSITIONS.chimes.x, z: WING_POSITIONS.chimes.z },
    { station: 'apex', x: WING_POSITIONS.apex.x, z: WING_POSITIONS.apex.z },
  ];

  let best: { station: Exclude<StationId, 'overview'>; distance: number } | null = null;
  for (const c of candidates) {
    const d = Math.hypot(pos.x - c.x, pos.z - c.z);
    if (d <= maxDistance && (!best || d < best.distance)) {
      best = { station: c.station, distance: d };
    }
  }
  return best;
}

export class ComfortCameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly reducedMotion: boolean;

  private mode: CameraMode = 'orbit';
  private modeBlend = 0; // 0 = orbit, 1 = walk (smoothly interpolated on V toggle)

  // Orbit spherical state
  private currentTarget = new THREE.Vector3(0, 2.5, -0.4);
  private goalTarget = new THREE.Vector3(0, 2.5, -0.4);
  private currentYaw = CAMERA_PRESETS.overview.yaw;
  private goalYaw = CAMERA_PRESETS.overview.yaw;
  private currentPitch = CAMERA_PRESETS.overview.pitch;
  private goalPitch = CAMERA_PRESETS.overview.pitch;
  private currentDistance = CAMERA_PRESETS.overview.distance;
  private goalDistance = CAMERA_PRESETS.overview.distance;

  // First-Person Walkaround state
  private walkPos = new THREE.Vector2(0, 12.6);
  private walkVel = new THREE.Vector2(0, 0);
  private walkYaw = 0.0;
  private goalWalkYaw = 0.0;
  private walkPitch = 0.08;
  private goalWalkPitch = 0.08;

  private activeStation: StationId = 'overview';
  private titleAutoOrbit = true;
  private victoryShowcase = false;
  private keys = new Set<string>();

  private readonly scratchOrbitPos = new THREE.Vector3();
  private readonly scratchWalkPos = new THREE.Vector3();
  private readonly scratchWalkLook = new THREE.Vector3();
  private readonly scratchFinalPos = new THREE.Vector3();
  private readonly scratchFinalLook = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.applyCameraTransform();
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public getWalkPosition(): Vec2 {
    return { x: this.walkPos.x, z: this.walkPos.y };
  }

  public setMode(nextMode: CameraMode, immediate: boolean = false): void {
    if (this.mode === nextMode && !immediate) return;
    this.mode = nextMode;
    this.titleAutoOrbit = false;
    this.victoryShowcase = false;

    if (nextMode === 'walk') {
      const spawn = WALK_SPAWN_BY_STATION[this.activeStation] ?? WALK_SPAWN_BY_STATION.overview;
      const safe = resolveWalkCollision({ x: spawn.pos[0], z: spawn.pos[1] });
      this.walkPos.set(safe.x, safe.z);
      this.walkVel.set(0, 0);
      this.walkYaw = spawn.yaw;
      this.goalWalkYaw = spawn.yaw;
      this.walkPitch = 0.09;
      this.goalWalkPitch = 0.09;
    }

    if (immediate || this.reducedMotion) {
      this.modeBlend = nextMode === 'walk' ? 1 : 0;
      this.applyCameraTransform();
    }
  }

  public setTitleAutoOrbit(enabled: boolean): void {
    this.titleAutoOrbit = enabled;
  }

  public setVictoryShowcase(enabled: boolean): void {
    this.victoryShowcase = enabled;
    if (enabled) {
      this.mode = 'orbit';
      this.goalTarget.set(0, 3.4, 0);
      this.goalPitch = 0.28;
      this.goalDistance = 14.5;
    }
  }

  public moveToStation(
    station: StationId,
    immediate: boolean = false,
    relocateWalk: boolean = false,
  ): void {
    this.activeStation = station;
    this.victoryShowcase = false;
    const preset = CAMERA_PRESETS[station];
    this.goalTarget.set(preset.target[0], preset.target[1], preset.target[2]);
    this.goalYaw = preset.yaw;
    this.goalPitch = preset.pitch;
    this.goalDistance = preset.distance;

    const spawn = WALK_SPAWN_BY_STATION[station];
    if (spawn && (this.mode === 'orbit' || relocateWalk)) {
      const safe = resolveWalkCollision({ x: spawn.pos[0], z: spawn.pos[1] });
      this.walkPos.set(safe.x, safe.z);
      this.walkVel.set(0, 0);
      this.goalWalkYaw = spawn.yaw;
      this.goalWalkPitch = 0.1;
    }

    if (immediate || this.reducedMotion) {
      this.currentTarget.copy(this.goalTarget);
      this.currentYaw = this.goalYaw;
      this.currentPitch = this.goalPitch;
      this.currentDistance = this.goalDistance;
      if (this.mode === 'orbit' || relocateWalk) {
        this.walkYaw = this.goalWalkYaw;
        this.walkPitch = this.goalWalkPitch;
      }
      this.applyCameraTransform();
    }
  }

  public setWalkPose(x: number, z: number, yaw: number, pitch: number = 0.08): void {
    const safe = resolveWalkCollision({ x, z });
    this.mode = 'walk';
    this.modeBlend = 1;
    this.titleAutoOrbit = false;
    this.victoryShowcase = false;
    this.walkPos.set(safe.x, safe.z);
    this.walkVel.set(0, 0);
    this.walkYaw = yaw;
    this.goalWalkYaw = yaw;
    this.walkPitch = THREE.MathUtils.clamp(pitch, -0.52, 0.72);
    this.goalWalkPitch = this.walkPitch;
    this.applyCameraTransform();
  }

  public resetCurrentView(): void {
    this.moveToStation(this.activeStation, false, true);
  }

  public setCinematicPose(pose: CameraPreset, immediate: boolean = false): void {
    this.mode = 'orbit';
    this.modeBlend = 0;
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
    if (this.mode === 'walk') {
      this.goalWalkYaw -= deltaX * 0.0045;
      this.goalWalkPitch = THREE.MathUtils.clamp(this.goalWalkPitch - deltaY * 0.0038, -0.52, 0.72);
      return;
    }
    this.goalYaw -= deltaX * 0.0055;
    this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + deltaY * 0.0045, 0.06, 1.18);
  }

  public zoomBy(deltaY: number): void {
    if (this.mode === 'walk') return;
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
    const ease = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 6.5);

    const targetBlend = this.mode === 'walk' ? 1 : 0;
    this.modeBlend = this.reducedMotion
      ? targetBlend
      : THREE.MathUtils.lerp(this.modeBlend, targetBlend, 1 - Math.exp(-dt * 5.2));

    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;

    if (this.mode === 'walk') {
      const lookEase = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 10.0);
      this.walkYaw = THREE.MathUtils.lerp(this.walkYaw, this.goalWalkYaw, lookEase);
      this.walkPitch = THREE.MathUtils.lerp(this.walkPitch, this.goalWalkPitch, lookEase);

      const moveLen = Math.hypot(forward, strafe);
      const maxSpeed = 5.4;
      let targetVx = 0;
      let targetVz = 0;
      if (moveLen > 0) {
        const nf = forward / moveLen;
        const ns = strafe / moveLen;
        const fwdX = -Math.sin(this.walkYaw);
        const fwdZ = -Math.cos(this.walkYaw);
        const rightX = Math.cos(this.walkYaw);
        const rightZ = -Math.sin(this.walkYaw);
        targetVx = (fwdX * nf + rightX * ns) * maxSpeed;
        targetVz = (fwdZ * nf + rightZ * ns) * maxSpeed;
      }
      const accel = 1 - Math.exp(-dt * 9.5);
      this.walkVel.x = THREE.MathUtils.lerp(this.walkVel.x, targetVx, accel);
      this.walkVel.y = THREE.MathUtils.lerp(this.walkVel.y, targetVz, accel);

      if (Math.hypot(this.walkVel.x, this.walkVel.y) > 0.005) {
        const resolved = resolveWalkCollision({
          x: this.walkPos.x + this.walkVel.x * dt,
          z: this.walkPos.y + this.walkVel.y * dt,
        });
        this.walkPos.set(resolved.x, resolved.z);
      }
    } else {
      if (this.titleAutoOrbit && !this.reducedMotion) {
        this.goalYaw += dt * 0.085;
      } else if (this.victoryShowcase && !this.reducedMotion) {
        this.goalYaw += dt * 0.16;
      }

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
    }

    this.currentTarget.lerp(this.goalTarget, ease);
    let yawDiff = ((this.goalYaw - this.currentYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.currentYaw += yawDiff * ease;
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.goalPitch, ease);
    this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.goalDistance, ease);

    this.applyCameraTransform();
  }

  private applyCameraTransform(): void {
    // 1. Orbit camera position & look target
    const horiz = Math.cos(this.currentPitch) * this.currentDistance;
    const vert = Math.sin(this.currentPitch) * this.currentDistance;
    this.scratchOrbitPos.set(
      this.currentTarget.x + Math.sin(this.currentYaw) * horiz,
      Math.max(1.25, this.currentTarget.y + vert),
      this.currentTarget.z + Math.cos(this.currentYaw) * horiz,
    );

    // 2. First-Person Walkaround camera position & forward gaze target (zero head-bob)
    this.scratchWalkPos.set(this.walkPos.x, WALK_EYE_HEIGHT, this.walkPos.y);
    const lookDist = 6.0;
    const cosP = Math.cos(this.walkPitch);
    this.scratchWalkLook.set(
      this.walkPos.x - Math.sin(this.walkYaw) * cosP * lookDist,
      WALK_EYE_HEIGHT + Math.sin(this.walkPitch) * lookDist,
      this.walkPos.y - Math.cos(this.walkYaw) * cosP * lookDist,
    );

    // 3. Smooth cubic blend between Orbit and First-Person Walkaround
    const s = this.modeBlend * this.modeBlend * (3 - 2 * this.modeBlend);
    this.scratchFinalPos.lerpVectors(this.scratchOrbitPos, this.scratchWalkPos, s);
    this.scratchFinalLook.lerpVectors(this.currentTarget, this.scratchWalkLook, s);

    this.camera.position.copy(this.scratchFinalPos);
    this.camera.lookAt(this.scratchFinalLook);
  }
}
