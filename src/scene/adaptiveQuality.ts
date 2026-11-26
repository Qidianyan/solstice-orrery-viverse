export type QualityTier = 'ultra' | 'balanced' | 'performance';

export interface AdaptiveQualityState {
  dpr: number;
  particleScale: number;
  avgFrameMs: number;
  fps: number;
  tier: QualityTier;
}

export interface AdaptiveQualityOptions {
  nativeDpr?: number;
  minDpr?: number;
  maxDpr?: number;
  minParticleScale?: number;
  targetFrameMs?: number;
  adjustCooldownSec?: number;
}

/**
 * Smooth 60fps adaptive quality controller for VIVERSE desktop/mobile WebGL viewports.
 * Monitors EMA frame duration and adjusts device pixel ratio (1.0..2.0) and dust mote
 * draw range (0.45..1.0) with hysteresis to avoid visual oscillation.
 */
export class AdaptiveQualityController {
  private readonly minDpr: number;
  private readonly maxDpr: number;
  private readonly minParticleScale: number;
  private readonly downThresholdMs: number;
  private readonly upThresholdMs: number;
  private readonly cooldownSec: number;

  private dpr: number;
  private particleScale = 1.0;
  private avgFrameMs = 16.67;
  private sampleCount = 0;
  private elapsedSinceAdjust = 0;

  constructor(options?: AdaptiveQualityOptions) {
    const native = Math.max(1.0, options?.nativeDpr ?? 1.5);
    this.minDpr = Math.max(1.0, options?.minDpr ?? 1.0);
    this.maxDpr = Math.max(this.minDpr, Math.min(2.0, options?.maxDpr ?? Math.min(2.0, native)));
    this.minParticleScale = Math.max(0.25, Math.min(1.0, options?.minParticleScale ?? 0.45));
    const targetMs = options?.targetFrameMs ?? 16.67;
    this.downThresholdMs = targetMs * 1.24; // ~20.7ms (<48fps) triggers downscale
    this.upThresholdMs = targetMs * 0.86; // ~14.3ms (>70fps headroom) allows upscale
    this.cooldownSec = Math.max(0.2, options?.adjustCooldownSec ?? 1.2);
    this.dpr = this.maxDpr;
  }

  public recordFrame(deltaSec: number): { changed: boolean; state: AdaptiveQualityState } {
    if (!Number.isFinite(deltaSec) || deltaSec <= 0) {
      return { changed: false, state: this.getState() };
    }
    const frameMs = deltaSec * 1000;
    // Ignore tab-backgrounding stalls > 150ms so returning to tab doesn't drop quality unnecessarily
    if (frameMs > 150) {
      return { changed: false, state: this.getState() };
    }

    const alpha = this.sampleCount < 8 ? 0.25 : 0.12;
    this.avgFrameMs = this.avgFrameMs * (1 - alpha) + frameMs * alpha;
    this.sampleCount += 1;
    this.elapsedSinceAdjust += deltaSec;

    let changed = false;
    if (this.sampleCount >= 12 && this.elapsedSinceAdjust >= this.cooldownSec) {
      if (this.avgFrameMs > this.downThresholdMs) {
        const nextDpr = Number(Math.max(this.minDpr, this.dpr - 0.15).toFixed(2));
        const nextParticles = Number(
          Math.max(this.minParticleScale, this.particleScale - 0.15).toFixed(2),
        );
        if (nextDpr !== this.dpr || nextParticles !== this.particleScale) {
          this.dpr = nextDpr;
          this.particleScale = nextParticles;
          this.elapsedSinceAdjust = 0;
          changed = true;
        }
      } else if (this.avgFrameMs < this.upThresholdMs) {
        const nextDpr = Number(Math.min(this.maxDpr, this.dpr + 0.1).toFixed(2));
        const nextParticles = Number(Math.min(1.0, this.particleScale + 0.1).toFixed(2));
        if (nextDpr !== this.dpr || nextParticles !== this.particleScale) {
          this.dpr = nextDpr;
          this.particleScale = nextParticles;
          this.elapsedSinceAdjust = 0;
          changed = true;
        }
      }
    }

    return { changed, state: this.getState() };
  }

  public getState(): AdaptiveQualityState {
    const safeMs = Math.max(1, this.avgFrameMs);
    const tier: QualityTier =
      this.particleScale >= 0.9 && this.dpr >= Math.min(1.5, this.maxDpr)
        ? 'ultra'
        : this.particleScale >= 0.65
          ? 'balanced'
          : 'performance';
    return {
      dpr: this.dpr,
      particleScale: this.particleScale,
      avgFrameMs: Number(this.avgFrameMs.toFixed(2)),
      fps: Math.round(Math.min(120, 1000 / safeMs)),
      tier,
    };
  }
}
