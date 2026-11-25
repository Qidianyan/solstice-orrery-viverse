#!/usr/bin/env python3
"""
Builds the synchronized English SRT subtitle file and studio ambient + ZONOS3-Mini
narration master audio track for Solstice Orrery VIVERSE Trailer (1080p).
"""
import os
import wave
import numpy as np

SR = 44100
TOTAL_DURATION = 68.5
TRAILER_AUDIO_DIR = "/Volumes/Extra/datasets/wave2_studio_audio/A8_VIVERSE_trailer"
WORK_DIR = "/tmp/orrery_v3"
PROJ_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRT_PATH = os.path.join(PROJ_ROOT, "materials", "Solstice_Orrery_VIVERSE_Trailer_1080p.srt")
MASTER_WAV_PATH = os.path.join(WORK_DIR, "trailer_mix_raw.wav")

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


def add_bronze_bell(buf_l: np.ndarray, buf_r: np.ndarray, t0: float, freq: float, amp: float, dur: float, pan: float = 0.0) -> None:
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


def build_ambient_score(total_samples: int, voice_env: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    t = np.arange(total_samples, dtype=np.float32) / SR
    # Warm D-Lydian celestial string & obsidian sanctuary drone
    breath1 = 0.55 + 0.45 * np.sin(2.0 * np.pi * 0.045 * t)
    breath2 = 0.55 + 0.45 * np.sin(2.0 * np.pi * 0.068 * t + 1.1)

    # Gradual harmonic swell toward Act 3 Solstice Zenith
    act_swell = np.clip(0.58 + 0.42 * np.clip((t - 44.0) / 14.0, 0.0, 1.0), 0.55, 1.05)
    fade_in = np.clip(t / 2.2, 0.0, 1.0)
    fade_out = np.clip((TOTAL_DURATION - t) / 3.0, 0.0, 1.0)
    master_env = fade_in * fade_out * act_swell

    # Low bowed D2 + A2 + F#3 + warm high shimmer A3/D4 (gentle detuned stereo pairs)
    pad_l = (
        0.13 * np.sin(2.0 * np.pi * 73.42 * t)
        + 0.085 * np.sin(2.0 * np.pi * 110.0 * t + 0.3) * breath1
        + 0.052 * np.sin(2.0 * np.pi * 146.83 * t + 0.8) * breath2
        + 0.036 * np.sin(2.0 * np.pi * 185.00 * t + 0.2) * breath1
        + 0.028 * np.sin(2.0 * np.pi * 220.45 * t) * breath2
        + 0.018 * np.sin(2.0 * np.pi * 293.66 * t) * np.clip((t - 45.0) / 8.0, 0.0, 1.0)
    )
    pad_r = (
        0.13 * np.sin(2.0 * np.pi * 73.52 * t + 0.4)
        + 0.085 * np.sin(2.0 * np.pi * 109.85 * t + 1.2) * breath2
        + 0.052 * np.sin(2.0 * np.pi * 147.05 * t + 0.2) * breath1
        + 0.036 * np.sin(2.0 * np.pi * 184.72 * t + 0.9) * breath2
        + 0.028 * np.sin(2.0 * np.pi * 219.80 * t + 0.5) * breath1
        + 0.020 * np.sin(2.0 * np.pi * 369.99 * t) * np.clip((t - 47.0) / 8.0, 0.0, 1.0)
    )

    buf_l = (pad_l * master_env).astype(np.float32)
    buf_r = (pad_r * master_env).astype(np.float32)

    # Choreographed pentatonic bronze bell resonances aligned to visual moments
    bell_events = [
        # Opening reveal
        (0.35, 293.66, 0.14, 5.2, -0.25),
        (1.60, 440.00, 0.08, 4.5, 0.25),
        # Act 1 mid architectural sweep
        (11.50, 369.99, 0.06, 4.4, 0.15),
        # Transition into Act 2
        (23.75, 293.66, 0.12, 4.0, -0.2),
        # Astrolabe ring locks
        (27.60, 329.63, 0.075, 2.8, -0.35),
        (29.80, 369.99, 0.085, 2.8, 0.0),
        (31.80, 440.00, 0.11, 3.6, 0.35),
        # Mirror beam prism lock
        (39.40, 587.33, 0.11, 4.2, 0.3),
        # Harmonic Sun-Chimes ascending 4-bell sequence
        (42.10, 293.66, 0.09, 2.8, -0.45),
        (42.85, 329.63, 0.095, 2.8, -0.15),
        (43.60, 369.99, 0.10, 3.0, 0.15),
        (44.35, 440.00, 0.12, 3.8, 0.45),
        # Act 3 Solstice Apex Ignition grand ascending bronze fanfare
        (49.20, 293.66, 0.13, 5.5, -0.3),
        (49.65, 369.99, 0.12, 5.5, 0.0),
        (50.10, 440.00, 0.13, 5.8, 0.3),
        (50.65, 587.33, 0.14, 6.2, -0.15),
        (51.25, 739.99, 0.09, 6.0, 0.25),
        # Closing golden cadence
        (64.60, 293.66, 0.11, 4.0, -0.2),
        (65.30, 440.00, 0.10, 3.6, 0.2),
    ]
    for t0, freq, amp, dur, pan in bell_events:
        add_bronze_bell(buf_l, buf_r, t0, freq, amp, dur, pan)

    # Gentle stereo cathedral shimmer delay (180ms + 320ms)
    d1 = int(0.18 * SR)
    d2 = int(0.32 * SR)
    wet_l = np.copy(buf_l)
    wet_r = np.copy(buf_r)
    wet_l[d1:] += 0.22 * buf_r[:-d1]
    wet_r[d2:] += 0.20 * buf_l[:-d2]

    # Smooth ducking under studio narration so Wyatt's voice is effortless and crisp
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
                "and tactile orbital camera transitions across\nfive progressive solstice trials.",
            ],
        ),
        (
            "act3_outro.wav",
            45.6,
            [
                "When the final crystal prism ignites, the eclipse sky\nparts into golden solstice light.",
                "Lightweight at 1.78 megabytes, zero-dependency bundled,\nand verified clean across all eight viewports —",
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

        # Proportional word-weight timing across the real detected vocal span
        active_dur = max(1.0, s1 - s0)
        weights = [max(1, len(c.replace("\n", " "))) for c in chunks]
        total_w = sum(weights)
        cursor = start_offset + s0
        for idx, chunk in enumerate(chunks):
            seg_dur = active_dur * (weights[idx] / total_w)
            seg_start = cursor
            seg_end = min(start_offset + s1 + 0.12, cursor + seg_dur - 0.08 if idx < len(chunks) - 1 else start_offset + s1 + 0.15)
            srt_entries.append((seg_start, seg_end, chunk))
            cursor += seg_dur

    # Compute smooth voice activity envelope for music ducking
    env_win = int(SR * 0.25)
    raw_env = np.abs(voice_mix)
    smooth_env = np.convolve(raw_env, np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    voice_env = np.clip(smooth_env / 0.045, 0.0, 1.0)

    amb_l, amb_r = build_ambient_score(total_samples, voice_env)

    # Combine crisp studio narration + warm stereo celestial ambient bed
    out_l = voice_mix * 0.92 + amb_l * 0.72
    out_r = voice_mix * 0.92 + amb_r * 0.72

    # Soft peak limiter before final ffmpeg -14 LUFS loudnorm
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

    # Write synchronized SRT file
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
