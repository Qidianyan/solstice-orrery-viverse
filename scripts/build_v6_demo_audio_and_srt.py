#!/usr/bin/env python3
"""
Builds the synchronized English SRT subtitle file and studio ambient + ZONOS3-Mini
narration master audio track for Solstice Orrery V6 VIVERSE Demo (1080p).
Reuses studio-grade Zyphra ZONOS3-Mini WAV masters (zero macOS say) and layers
V5/V6 Pythagorean bronze bell overtones (C4/G4/D5/A5 + Trial 7 Great Solar Chord)
and crisp 15-degree horological ratchet clicks with smooth sidechain ducking.
"""
import os
import wave
import numpy as np

SR = 44100
TOTAL_DURATION = 68.5
TRAILER_AUDIO_DIR = "/Volumes/Extra/datasets/wave2_studio_audio/A8_VIVERSE_trailer"
WORK_DIR = "/tmp/orrery_v6"
PROJ_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRT_PATH = os.path.join(PROJ_ROOT, "materials", "Solstice_Orrery_VIVERSE_Demo_1080p.srt")
MASTER_WAV_PATH = os.path.join(WORK_DIR, "demo_mix_raw.wav")

os.makedirs(WORK_DIR, exist_ok=True)


def read_wav_mono(path: str) -> np.ndarray:
    with wave.open(path, "rb") as wf:
        assert wf.getframerate() == SR, f"Unexpected sample rate {wf.getframerate()}"
        nch = wf.getnchannels()
        frames = wf.readframes(wf.getnframes())
        data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        if nch > 1:
            data = data.reshape(-1, nch).mean(axis=1)
        return data


def detect_active_span(samples: np.ndarray, threshold: float = 0.012) -> tuple[float, float]:
    win = int(SR * 0.04)
    if len(samples) < win:
        return 0.0, len(samples) / SR
    rms = np.sqrt(np.convolve(samples * samples, np.ones(win) / win, mode="same"))
    idx = np.where(rms > threshold)[0]
    if len(idx) == 0:
        return 0.0, len(samples) / SR
    start = max(0.0, idx[0] / SR - 0.04)
    end = min(len(samples) / SR, idx[-1] / SR + 0.08)
    return start, end


def fmt_srt_time(sec: float) -> str:
    sec = max(0.0, sec)
    hrs = int(sec // 3600)
    mins = int((sec % 3600) // 60)
    secs = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms >= 1000:
        ms -= 1000
        secs += 1
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def add_bronze_bell(
    buf_l: np.ndarray,
    buf_r: np.ndarray,
    t0: float,
    freq: float,
    amp: float,
    dur: float,
    pan: float = 0.0,
) -> None:
    i0 = int(t0 * SR)
    n = int(dur * SR)
    if i0 >= len(buf_l):
        return
    n = min(n, len(buf_l) - i0)
    t = np.arange(n, dtype=np.float32) / SR
    attack = np.minimum(1.0, t / 0.014)
    sig = np.zeros(n, dtype=np.float32)
    partials = [
        (1.0, 1.0, 1.0),
        (2.0, 0.42, 0.68),
        (2.756, 0.24, 0.44),
        (4.07, 0.10, 0.28),
    ]
    for ratio, weight, dmul in partials:
        env = attack * np.exp(-t / max(0.12, dur * 0.34 * dmul))
        sig += weight * env * np.sin(2.0 * np.pi * (freq * ratio) * t)
    sig *= amp
    gain_l = np.sqrt(0.5 * (1.0 - pan))
    gain_r = np.sqrt(0.5 * (1.0 + pan))
    buf_l[i0 : i0 + n] += sig * gain_l
    buf_r[i0 : i0 + n] += sig * gain_r


def add_ratchet_click(buf_l: np.ndarray, buf_r: np.ndarray, t0: float, amp: float = 0.085, pan: float = -0.2) -> None:
    i0 = int(t0 * SR)
    n = int(0.055 * SR)
    if i0 >= len(buf_l):
        return
    n = min(n, len(buf_l) - i0)
    t = np.arange(n, dtype=np.float32) / SR
    env = np.exp(-t / 0.012)
    freq = 1120.0 * np.exp(-t / 0.025) + 340.0
    phase = 2.0 * np.pi * np.cumsum(freq) / SR
    sig = amp * env * (0.75 * np.sin(phase) + 0.25 * np.sin(phase * 2.4))
    gain_l = np.sqrt(0.5 * (1.0 - pan))
    gain_r = np.sqrt(0.5 * (1.0 + pan))
    buf_l[i0 : i0 + n] += sig * gain_l
    buf_r[i0 : i0 + n] += sig * gain_r


def build_ambient_score(total_samples: int, voice_env: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    t = np.arange(total_samples, dtype=np.float32) / SR
    breath1 = 0.55 + 0.45 * np.sin(2.0 * np.pi * 0.045 * t)
    breath2 = 0.55 + 0.45 * np.sin(2.0 * np.pi * 0.068 * t + 1.1)

    act_swell = np.clip(0.58 + 0.42 * np.clip((t - 44.0) / 14.0, 0.0, 1.0), 0.55, 1.05)
    fade_in = np.clip(t / 2.2, 0.0, 1.0)
    fade_out = np.clip((TOTAL_DURATION - t) / 3.0, 0.0, 1.0)
    master_env = fade_in * fade_out * act_swell

    # Pythagorean fifths celestial sanctuary pad (C2-G2-C3-G3-D4-A4 swell)
    pad_l = (
        0.13 * np.sin(2.0 * np.pi * 65.41 * t)
        + 0.088 * np.sin(2.0 * np.pi * 98.00 * t + 0.3) * breath1
        + 0.056 * np.sin(2.0 * np.pi * 130.81 * t + 0.8) * breath2
        + 0.036 * np.sin(2.0 * np.pi * 196.00 * t + 0.2) * breath1
        + 0.026 * np.sin(2.0 * np.pi * 261.63 * t) * np.clip((t - 24.0) / 8.0, 0.0, 1.0)
        + 0.020 * np.sin(2.0 * np.pi * 392.00 * t) * np.clip((t - 36.0) / 8.0, 0.0, 1.0)
        + 0.018 * np.sin(2.0 * np.pi * 587.33 * t) * np.clip((t - 47.0) / 6.0, 0.0, 1.0)
    )
    pad_r = (
        0.13 * np.sin(2.0 * np.pi * 65.50 * t + 0.4)
        + 0.088 * np.sin(2.0 * np.pi * 97.86 * t + 1.2) * breath2
        + 0.056 * np.sin(2.0 * np.pi * 131.02 * t + 0.2) * breath1
        + 0.036 * np.sin(2.0 * np.pi * 195.74 * t + 0.9) * breath2
        + 0.026 * np.sin(2.0 * np.pi * 261.20 * t + 0.5) * np.clip((t - 24.0) / 8.0, 0.0, 1.0)
        + 0.020 * np.sin(2.0 * np.pi * 392.40 * t + 0.3) * np.clip((t - 36.0) / 8.0, 0.0, 1.0)
        + 0.018 * np.sin(2.0 * np.pi * 880.00 * t) * np.clip((t - 48.5) / 6.0, 0.0, 1.0)
    )

    buf_l = (pad_l * master_env).astype(np.float32)
    buf_r = (pad_r * master_env).astype(np.float32)

    # Crisp 15-degree coupled bronze gear ratchet clicks during Act 2A Astrolabe alignment
    for click_t in [25.2, 26.1, 27.0, 27.9, 28.8, 29.7, 30.6, 31.5]:
        add_ratchet_click(buf_l, buf_r, click_t, amp=0.075, pan=-0.25)
        add_ratchet_click(buf_l, buf_r, click_t + 0.04, amp=0.045, pan=-0.12)

    # Choreographed Pythagorean bronze bell harmonics (C4 / G4 / D5 / A5 + Trial 7 Great Solar Chord)
    bell_events = [
        # Opening reveal
        (0.35, 261.63, 0.13, 5.2, -0.25),
        (1.60, 392.00, 0.08, 4.5, 0.25),
        # First-Person Walk Sanctuary entry
        (12.20, 261.63, 0.085, 4.0, 0.0),
        (13.10, 392.00, 0.065, 3.8, -0.2),
        # Trial V Coupled Astrolabe conduit lock (C4 + G4)
        (28.50, 261.63, 0.09, 3.2, -0.3),
        (31.80, 392.00, 0.11, 4.2, -0.15),
        # Trial VII Triple-Splitter Prism lock (C4 + G4 + D5)
        (39.40, 587.33, 0.12, 4.4, 0.3),
        # Harmonic Sun-Chimes ascending 4-bell sequence
        (41.80, 293.66, 0.09, 2.8, -0.45),
        (42.55, 329.63, 0.095, 2.8, -0.15),
        (43.30, 369.99, 0.10, 3.0, 0.15),
        (44.05, 440.00, 0.12, 3.8, 0.45),
        # Act 3 Trial VII Dawn Corona Great Solar Chord (C3-C4-G4-D5-A5-C6)
        (48.80, 130.81, 0.12, 6.2, 0.0),
        (49.15, 261.63, 0.13, 6.0, -0.3),
        (49.55, 392.00, 0.12, 5.8, 0.25),
        (49.95, 587.33, 0.13, 6.0, -0.15),
        (50.45, 880.00, 0.11, 6.2, 0.2),
        (51.05, 1046.50, 0.075, 5.8, 0.0),
        # Closing golden cadence
        (64.40, 261.63, 0.10, 4.2, -0.2),
        (65.10, 392.00, 0.09, 3.8, 0.2),
    ]
    for t0, freq, amp, dur, pan in bell_events:
        add_bronze_bell(buf_l, buf_r, t0, freq, amp, dur, pan)

    # Stereo cathedral shimmer delay (180ms + 320ms)
    d1 = int(0.18 * SR)
    d2 = int(0.32 * SR)
    wet_l = np.copy(buf_l)
    wet_r = np.copy(buf_r)
    wet_l[d1:] += 0.22 * buf_r[:-d1]
    wet_r[d2:] += 0.20 * buf_l[:-d2]

    # Smooth sidechain ducking under ZONOS3-Mini studio narration
    duck = 1.0 - 0.58 * voice_env
    return wet_l * duck, wet_r * duck


def main() -> None:
    acts = [
        (
            "act1_sanctuary.wav",
            1.0,
            [
                "Welcome to Solstice Orrery, a handcrafted WebGL\nastronomical sanctuary built for VIVERSE Spark.",
                "Carved basalt Doric colonnades, hammered bronze gear rings,\nand physically based obsidian floors",
                "frame a living celestial instrument that runs at\nsixty frames per second right in the browser.",
            ],
        ),
        (
            "act2_mechanics.wav",
            24.4,
            [
                "Rotate the Meridian Astrolabe rings to bend molten\ngolden solar beams across mirrored relay prisms.",
                "Every angular alignment triggers harmonic bronze resonance,\nreal-time bloom refraction,",
                "and tactile orbital camera transitions across\nprogressive solstice trials.",
            ],
        ),
        (
            "act3_outro.wav",
            45.6,
            [
                "When the final crystal prism ignites, the eclipse sky\nparts into golden solstice light.",
                "Lightweight, zero-dependency bundled,\nand verified clean across all viewports,",
                "Solstice Orrery is ready to launch directly on VIVERSE.",
            ],
        ),
    ]

    total_samples = int(TOTAL_DURATION * SR)
    voice_mix = np.zeros(total_samples, dtype=np.float32)
    srt_entries: list[tuple[float, float, str]] = []

    for filename, start_offset, chunks in acts:
        wav_path = os.path.join(TRAILER_AUDIO_DIR, filename)
        samples = read_wav_mono(wav_path)
        s0, s1 = detect_active_span(samples)
        i0 = int(start_offset * SR)
        n = min(len(samples), total_samples - i0)
        voice_mix[i0 : i0 + n] += samples[:n]

        active_dur = max(1.0, s1 - s0)
        weights = [max(1, len(c.replace("\n", " "))) for c in chunks]
        total_w = sum(weights)
        cursor = start_offset + s0
        for idx, chunk in enumerate(chunks):
            seg_dur = active_dur * (weights[idx] / total_w)
            seg_start = cursor
            seg_end = min(
                start_offset + s1 + 0.12,
                cursor + seg_dur - 0.08 if idx < len(chunks) - 1 else start_offset + s1 + 0.15,
            )
            srt_entries.append((seg_start, seg_end, chunk))
            cursor += seg_dur

    env_win = int(SR * 0.25)
    raw_env = np.abs(voice_mix)
    smooth_env = np.convolve(raw_env, np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    voice_env = np.clip(smooth_env / 0.045, 0.0, 1.0)

    amb_l, amb_r = build_ambient_score(total_samples, voice_env)

    out_l = voice_mix * 0.92 + amb_l * 0.74
    out_r = voice_mix * 0.92 + amb_r * 0.74

    peak = float(max(np.max(np.abs(out_l)), np.max(np.abs(out_r)), 1e-6))
    if peak > 0.95:
        scale = 0.95 / peak
        out_l *= scale
        out_r *= scale

    stereo = np.stack([out_l, out_r], axis=1)
    pcm = np.clip(stereo * 32767.0, -32768, 32767).astype(np.int16)

    with wave.open(MASTER_WAV_PATH, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())

    lines: list[str] = []
    for idx, (st, en, text) in enumerate(srt_entries, start=1):
        lines.append(str(idx))
        lines.append(f"{fmt_srt_time(st)} --> {fmt_srt_time(en)}")
        lines.append(text)
        lines.append("")

    with open(SRT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Wrote {MASTER_WAV_PATH} ({TOTAL_DURATION:.1f}s stereo 44.1kHz)")
    print(f"Wrote {SRT_PATH} ({len(srt_entries)} cues, {os.path.getsize(SRT_PATH)} bytes)")


if __name__ == "__main__":
    main()
