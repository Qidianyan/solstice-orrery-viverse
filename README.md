# Solstice Orrery: Keeper of the Brass Sky (V6 Final Champion Edition)

> **HTC VIVERSE Global Student Hackathon 2026 (VIVERSE Spark) — Games Category**  
> Built with TypeScript, Vite, Three.js (`EffectComposer` + `UnrealBloomPass` + `ACESFilmicToneMapping`), bespoke PBR Volcanic Basalt / Hammered Bronze / Eclipse Skybox Textures, Custom GLSL Volumetric God-Rays & Flowing Molten Beam Shaders, Studio-Grade `ZONOS3-Mini` English Voiceover, Procedural Pythagorean WebAudio, and a 60fps Adaptive DPR Scaler.

## Art Direction & Atmospheric Shaders

Set inside an **Obsidian Volcanic Gorge & Molten Gold Celestial Sanctuary**, the observatory pairs matte carved basalt (`#0E0C0B`), hand-forged antique bronze (`#8C5327`), burnished gold inlays (`#D4B98C`), and calibrated molten gold (`#F2B84B`) — strictly enforcing zero blue, cyan, teal, or purple primaries across every sky stage, shader, and UI token.

- **Bespoke High-Resolution PBR Textures (`public/textures/`)**:
  - `obsidian_floor.jpg` (1024×1024 seamless obsidian flagstones with inlaid bronze & molten-gold astronomical rings)
  - `hammered_bronze.jpg` (1024×1024 hand-forged antique bronze interlaced with kintsugi gold fissures)
  - `carved_basalt.jpg` (1024×1024 fluted dark volcanic basalt column reliefs with physically inverted roughness)
  - `eclipse_sky.jpg` (2048×1024 seamless total solar eclipse panorama dynamically evolved across 4 warm sky stages)
- **Custom GLSL Shaders & Photographic Exposure Calibration**:
  - Slanted **Volumetric Dust-Shaft God-Ray Cones** (`GOD_RAY_FRAGMENT`) descending from the sanctuary oculus.
  - **Flowing Molten Energy Pulse Beams** (`BEAM_PULSE_FRAGMENT`) and warm **Fresnel Prism Dispersion Halos** (`PRISM_FRESNEL_FRAGMENT`).
  - **Calibrated Warm-Gold Zenith Pillar** (`ZENITH_PILLAR_FRAGMENT`, `#FFE29E → #D4882A`) paired with dynamic ACES exposure compression (`1.04 → 0.88`) and high-threshold Bloom (`0.94 → 0.98`) so Trial VII Dawn Corona achieves **0.00% clipped pure-white washout** while keeping the 12-petal bronze lotus and 3 armillary rings razor-sharp.
  - **4-Stage Dynamic Sky Evolution**: *Noon Gold* (Trials I–II) → *Amber Dusk* (Trials III–IV) → *Crimson Solar Eclipse* (Trials V–VII) → *Dawn Corona Radiance* (Finale Ignition).

## Gameplay: 7 Progressive Celestial Trials & Direct 3D Interaction

Before the **5-minute Solar Eclipse Countdown** reaches `00:00` (clear lose condition with instant retry), awaken all three astronomical instruments to ignite the central **Solstice Apex Crown**:

1. **Meridian Astrolabe — Mechanically Coupled Bronze Gears (West Wing)**: Hover and click 24-tooth (`15°` magnetic detent, spring-damped inertia) bronze rings directly in 3D. Trials V–VII engage physical meshing transfer pinion gears (`1:-0.5` Outer→Middle in Trial V; `1:-0.5` & `1:+1` dual-stage gear train in Trials VI–VII).
2. **Obsidian Mirror Courtyard — Dichroic Beam Splitters (East Wing)**: Turn carved basalt obelisks directly in 3D to steer flowing molten sunbeams around fluted Doric obstacles and through **Dichroic Beam Splitter Prisms** — illuminating 1 Collector Prism in Trials I–IV, 2 simultaneous prisms in Trials V–VI, and **3 simultaneous convergent prisms** in Trial VII.
3. **Harmonic Sun-Chimes (North Wing)**: Strike the four sculpted `LatheGeometry` suspended temple bells directly in 3D in ascending pentatonic order (`D4`, `E4`, `F#4`, `A4`).
4. **Solstice Apex Crown & Chronicle Mastery (Center Dais)**: Once all 3 molten floor conduits surge (`3/3`), ignite the 12-petal crown to shatter the eclipse, earn **1–3 golden stars**, persist per-trial best pace/moves in **Keeper's Trial Chronicle**, advance across all **7 Trials**, or explore freely in **Sandbox Mode**.

## Dual-Mode Spatial Comfort, Minimalist HUD & Adaptive Audio/Performance

- **Dual-Mode Spatial Navigation (`V`)**: Smooth cubic interpolation between overhead **Astronomer Orbit** and eye-level **First-Person Sanctuary Walkaround** (`1.78m`, WASD/Arrows movement, drag-look with zero head-bobbing, 3-pass circular collision against all 16 fluted Doric colonnade columns + 2 gateway columns + outer parapet, and `E`-key proximity interaction).
- **Minimalist Bronze Sundial HUD & Cinema Mode (`C`)**: Single-row `40px` bronze top bar integrating Trials I–VII + slim stepping-pad dock delivers **93.1% unobstructed 3D viewport** (**99.6%** in Cinema mode `C`), 0.6s warm-gold trial transition veil, and a 3s auto-fading first-frame onboarding micro-cue (`sloplint --render`: `0 FAIL, 0 REFLEX, 0 WARN`).
- **Studio Voiceover & Pythagorean Bronze Overtones**: Integrates Zyphra `ZONOS3-Mini` studio narration (`vo_intro.mp3`, `vo_victory.mp3`) alongside procedural WebAudio `15°` bronze ratchet clicks, layered Pythagorean fifths (`C4 / G4 / D5 / A5`) per awakened conduit, and the Trial VII Great Solar Chord (`C3–C6`).
- **60fps Adaptive DPR Scaler**: `AdaptiveQualityController` monitors EMA frame times and smoothly adjusts WebGL DPR (`1.0–2.0`) and dust mote draw range (`0.45–1.0`) for fluid VIVERSE desktop & mobile playback.

## Development, Testing & Verification

```bash
npm install
npm run dev          # Local Vite dev server
npm run typecheck    # Strict TypeScript check (tsc --noEmit)
npm test             # Vitest suite (8 files / 38 unit tests covering all 7 trials, gears, splitters, collision, direct 3D, audio & DPR)
npm run build        # Production build to dist/ (base: './', zero external CDN runtime deps)
npm run verify:e2e   # Automated Metal-GPU Playwright 7-trial continuous playthrough & pixel/HUD verification
```
