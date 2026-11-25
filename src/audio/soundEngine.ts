import { CHIME_FREQUENCIES } from '../game/puzzles';

export type VoiceCueId = 'intro' | 'victory';

/**
 * Hybrid sanctuary sound engine:
 * - Studio-grade Zyphra ZONOS3-Mini English voice narration (vo_intro.mp3, vo_victory.mp3)
 * - 100% procedural WebAudio synthesizer for hammered-bronze chimes, horological ratchets,
 *   basalt monolith turns, conduit surges, and solstice brass fanfare.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private activeVoice: HTMLAudioElement | null = null;
  private voiceTracks: Partial<Record<VoiceCueId, HTMLAudioElement>> = {};

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
    if (muted && this.activeVoice) {
      this.activeVoice.pause();
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
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playAstrolabeClick(aligned: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(aligned ? 587.33 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(aligned ? 880 : 120, now + 0.09);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + (aligned ? 0.45 : 0.14));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (aligned ? 0.48 : 0.16));

    if (aligned) {
      this.triggerBellVoice(ctx, 587.33, 0.11, 0.85, now + 0.03);
      this.triggerBellVoice(ctx, 880.0, 0.07, 0.9, now + 0.08);
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

    this.triggerBellVoice(ctx, hitsCollector ? 659.25 : 415.3, 0.075, 0.32, now + 0.06);
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

  public playConduitIgnite(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [293.66, 369.99, 440.0, 587.33];
    notes.forEach((f, idx) => {
      this.triggerBellVoice(ctx, f, 0.11, 1.55, now + idx * 0.09);
    });
  }

  public playTeleportStep(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.12);
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

  public playSolsticeVictory(): void {
    const ctx = this.ensureContext();
    if (ctx) {
      const now = ctx.currentTime;
      const fanfare = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0];
      fanfare.forEach((freq, idx) => {
        this.triggerBellVoice(ctx, freq, 0.09, 2.4, now + idx * 0.12);
      });
    }
    this.playVoiceover('victory');
  }

  public playEclipseExpired(): void {
    const ctx = this.ensureContext();
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
