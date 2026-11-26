import { CHIME_FREQUENCIES } from '../game/puzzles';

export type VoiceCueId = 'intro' | 'victory';

/**
 * Pythagorean fifths bronze overtone sequence layered per awakened solar conduit:
 * Conduit 1 = C4 (261.63 Hz), Conduit 2 = G4 (392.00 Hz),
 * Conduit 3 = D5 (587.33 Hz), Apex Zenith = A5 (880.00 Hz).
 */
export const CONDUIT_HARMONIC_CHORD = [261.63, 392.0, 587.33, 880.0] as const;

/** Trial 7 Grand Solstice Eclipse Finale full Great Solar Chord (C3-C4-G4-D5-A5-C6). */
export const GRAND_SOLAR_CHORD = [130.81, 261.63, 392.0, 587.33, 880.0, 1046.5] as const;

/**
 * Pure harmonic pitch selector mapping current sanctuary alignment progress (0..3 conduits + apex)
 * to stacked Pythagorean bronze chime frequencies.
 */
export function getConduitHarmonicFrequencies(
  solvedCount: number,
  options?: { apexIgnited?: boolean; trialNumber?: number },
): number[] {
  const clamped = Math.max(0, Math.min(3, Math.floor(solvedCount)));
  if (options?.apexIgnited && (options.trialNumber ?? 1) >= 7) {
    return [...GRAND_SOLAR_CHORD];
  }
  if (options?.apexIgnited) {
    return [...CONDUIT_HARMONIC_CHORD];
  }
  return CONDUIT_HARMONIC_CHORD.slice(0, clamped);
}

/**
 * Hybrid sanctuary sound engine:
 * - Studio-grade Zyphra ZONOS3-Mini English voice narration (vo_intro.mp3, vo_victory.mp3)
 * - 100% procedural WebAudio synthesizer for hammered-bronze chimes, crisp 15° magnetic
 *   ratchet clicks, layered Pythagorean harmonic fifths, and Trial 7 Grand Solar Chord.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private activeVoice: HTMLAudioElement | null = null;
  private voiceTracks: Partial<Record<VoiceCueId, HTMLAudioElement>> = {};
  private noiseBuffer: AudioBuffer | null = null;
  private harmonicLayerGain: GainNode | null = null;
  private harmonicOscs: OscillatorNode[] = [];
  private activeHarmonicCount = 0;
  private activeApexIgnited = false;
  private activeTrialNumber = 1;

  constructor() {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      this.voiceTracks.intro = this.createVoiceElement('./audio/vo_intro.mp3');
      this.voiceTracks.victory = this.createVoiceElement('./audio/vo_victory.mp3');
    }
  }

  private createVoiceElement(src: string): HTMLAudioElement {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = 0.92;
    return audio;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    for (const track of Object.values(this.voiceTracks)) {
      if (track) track.muted = muted;
    }
    if (muted) {
      if (this.activeVoice) {
        this.activeVoice.pause();
      }
      this.stopHarmonicBed();
    } else if (this.activeHarmonicCount > 0 || this.activeApexIgnited) {
      this.syncHarmonicLayer(this.activeHarmonicCount, this.activeApexIgnited, this.activeTrialNumber);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public playVoiceover(cue: VoiceCueId): void {
    if (this.muted) return;
    const track = this.voiceTracks[cue];
    if (!track) return;

    if (this.activeVoice && this.activeVoice !== track) {
      this.activeVoice.pause();
      this.activeVoice.currentTime = 0;
    }
    this.activeVoice = track;
    track.muted = this.muted;
    try {
      track.currentTime = 0;
      const playPromise = track.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Gracefully ignore autoplay rejection in non-interactive headless sessions
        });
      }
    } catch {
      // Ignore playback errors in restricted audio contexts
    }
  }

  public stopVoiceover(): void {
    if (this.activeVoice) {
      this.activeVoice.pause();
      this.activeVoice.currentTime = 0;
      this.activeVoice = null;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx
        .resume()
        .then(() => {
          if (!this.muted && (this.activeHarmonicCount > 0 || this.activeApexIgnited)) {
            this.syncHarmonicLayer(
              this.activeHarmonicCount,
              this.activeApexIgnited,
              this.activeTrialNumber,
            );
          }
        })
        .catch(() => {});
    }
    return this.ctx;
  }

  private getRatchetNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.max(128, Math.floor(ctx.sampleRate * 0.032));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      const env = Math.exp((-i / len) * 6.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private stopHarmonicBed(): void {
    for (const osc of this.harmonicOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Already stopped
      }
    }
    this.harmonicOscs = [];
    if (this.harmonicLayerGain) {
      try {
        this.harmonicLayerGain.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.harmonicLayerGain = null;
    }
  }

  /**
   * Layers soft continuous bronze overtone resonance (C4 -> G4 -> D5 -> A5) as conduits awaken.
   * Strictly autoplay-safe: never creates AudioContext until user has already interacted.
   */
  public syncHarmonicLayer(
    solvedCount: number,
    apexIgnited: boolean = false,
    trialNumber: number = 1,
  ): void {
    this.activeHarmonicCount = Math.max(0, Math.min(3, solvedCount));
    this.activeApexIgnited = apexIgnited;
    this.activeTrialNumber = trialNumber;
    if (this.muted || !this.ctx || this.ctx.state !== 'running') {
      this.stopHarmonicBed();
      return;
    }
    const freqs = getConduitHarmonicFrequencies(this.activeHarmonicCount, {
      apexIgnited,
      trialNumber,
    });
    this.stopHarmonicBed();
    if (freqs.length === 0) return;

    const now = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.022, now + 0.65);
    master.connect(this.ctx.destination);
    this.harmonicLayerGain = master;

    for (let i = 0; i < freqs.length; i += 1) {
      const osc = this.ctx.createOscillator();
      const voiceGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      voiceGain.gain.setValueAtTime(1 / (freqs.length * (1 + i * 0.28)), now);
      osc.connect(voiceGain);
      voiceGain.connect(master);
      osc.start(now);
      this.harmonicOscs.push(osc);
    }
  }

  /**
   * Crisp 15-degree horological bronze ratchet click with magnetic detent snap
   * and coupled pinion secondary tick when mechanical gears engage.
   */
  public playAstrolabeClick(aligned: boolean, coupledCount: number = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Crisp metallic bronze pawl transient (high-Q bandpassed burst)
    const src = ctx.createBufferSource();
    src.buffer = this.getRatchetNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(aligned ? 3400 : 2650, now);
    bp.Q.setValueAtTime(5.5, now);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.16, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.026);
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);

    // 2. Bronze gear tooth mechanical escapement body
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(aligned ? 1174.66 : 940, now);
    osc.frequency.exponentialRampToValueAtTime(aligned ? 587.33 : 310, now + 0.045);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);

    // 3. Coupled meshed pinion secondary metallic tick (1:-0.5 / 1:+1 gear trains)
    if (coupledCount > 0) {
      const tickAt = now + 0.036;
      const pinOsc = ctx.createOscillator();
      const pinGain = ctx.createGain();
      pinOsc.type = 'sine';
      pinOsc.frequency.setValueAtTime(1480, tickAt);
      pinOsc.frequency.exponentialRampToValueAtTime(620, tickAt + 0.035);
      pinGain.gain.setValueAtTime(0.001, tickAt);
      pinGain.gain.linearRampToValueAtTime(0.085, tickAt + 0.004);
      pinGain.gain.exponentialRampToValueAtTime(0.0008, tickAt + 0.05);
      pinOsc.connect(pinGain);
      pinGain.connect(ctx.destination);
      pinOsc.start(tickAt);
      pinOsc.stop(tickAt + 0.055);
    }

    // 4. Magnetic zenith lock resonance (Pythagorean fifth D5 + A5)
    if (aligned) {
      this.triggerBellVoice(ctx, 587.33, 0.12, 0.9, now + 0.025);
      this.triggerBellVoice(ctx, 880.0, 0.075, 1.05, now + 0.07);
    }
  }

  public playMirrorTurn(hitsCollector: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.2);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.085, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);

    this.triggerBellVoice(ctx, hitsCollector ? 587.33 : 392.0, 0.08, 0.36, now + 0.05);
  }

  public playChimeBell(rank: number, isCorrect: boolean = true): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = CHIME_FREQUENCIES[Math.max(0, Math.min(3, rank))];

    if (!isCorrect) {
      this.triggerBellVoice(ctx, 155.56, 0.12, 0.42, now);
      return;
    }

    this.triggerBellVoice(ctx, freq, 0.18, 1.9, now);
  }

  public playConduitIgnite(solvedCount: number = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = getConduitHarmonicFrequencies(Math.max(1, solvedCount));
    notes.forEach((f, idx) => {
      this.triggerBellVoice(ctx, f, 0.12, 1.85, now + idx * 0.095);
    });
    this.syncHarmonicLayer(solvedCount, false);
  }

  public playTeleportStep(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(261.63, now);
    osc.frequency.exponentialRampToValueAtTime(392.0, now + 0.12);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playApexLocked(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.triggerBellVoice(ctx, 146.83, 0.14, 0.7, ctx.currentTime);
  }

  public playSolsticeVictory(trialNumber: number = 1): void {
    const ctx = this.ensureContext();
    if (ctx) {
      const now = ctx.currentTime;
      const fanfare = getConduitHarmonicFrequencies(3, { apexIgnited: true, trialNumber });
      fanfare.forEach((freq, idx) => {
        this.triggerBellVoice(ctx, freq, 0.1, 2.7, now + idx * 0.11);
      });
      this.syncHarmonicLayer(3, true, trialNumber);
    }
    this.playVoiceover('victory');
  }

  public playEclipseExpired(): void {
    const ctx = this.ensureContext();
    this.stopHarmonicBed();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.triggerBellVoice(ctx, 196.0, 0.14, 1.6, now);
    this.triggerBellVoice(ctx, 146.83, 0.16, 2.2, now + 0.35);
  }

  private triggerBellVoice(
    ctx: AudioContext,
    fundamental: number,
    peakGain: number,
    durationSec: number,
    startTime: number,
  ): void {
    const partials: Array<{ ratio: number; weight: number; decayMul: number }> = [
      { ratio: 1.0, weight: 1.0, decayMul: 1.0 },
      { ratio: 2.0, weight: 0.42, decayMul: 0.65 },
      { ratio: 2.756, weight: 0.22, decayMul: 0.42 },
      { ratio: 4.07, weight: 0.1, decayMul: 0.25 },
    ];

    for (const p of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * p.ratio, startTime);
      const decay = Math.max(0.08, durationSec * p.decayMul);
      gain.gain.setValueAtTime(0.0005, startTime);
      gain.gain.linearRampToValueAtTime(peakGain * p.weight, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0005, startTime + decay);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + decay + 0.03);
    }
  }
}
