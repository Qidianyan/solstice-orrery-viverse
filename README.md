# Solstice Orrery: Keeper of the Brass Sky (V2 Champion Edition)

> **HTC VIVERSE Global Student Hackathon 2026 (VIVERSE Spark) — Games Category**  
> Built with TypeScript, Vite, Three.js (`EffectComposer` + `UnrealBloomPass` + `ACESFilmicToneMapping`), bespoke PBR Volcanic Basalt / Hammered Bronze / Eclipse Skybox Textures, Sculpted Architectural Geometry, Studio-Grade ZONOS3-Mini English Voiceover, and Synthesized WebAudio.

## Art Direction & Worldbuilding

Set inside an **Obsidian Volcanic Gorge & Molten Gold Celestial Sanctuary**, the observatory contrasts matte volcanic basalt (`#0E0C0B`), hand-forged dark bronze (`#8C5327`), quartz white inlays (`#F2EFE9`), and blazing molten gold (`#F2B84B`) optical bloom—strictly avoiding generic neon blue, cyan, teal, or purple palettes.

- **Bespoke High-Resolution PBR Textures (`public/textures/`)**:
  - `obsidian_floor.jpg` (1024×1024 seamless obsidian flagstones with inlaid bronze & molten-gold astronomical rings)
  - `hammered_bronze.jpg` (1024×1024 hand-forged antique hammered bronze interlaced with molten-gold kintsugi fissures)
  - `carved_basalt.jpg` (1024×1024 carved dark volcanic basalt column fluting & solstice chevron reliefs)
  - `eclipse_sky.jpg` (2048×1024 seamless panoramic total solar eclipse skybox blended dynamically with GLSL corona plasma & zenith bloom)
- **Cinematic Post-Processing & Architectural Craft**:
  - `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass` with `ACESFilmicToneMapping` and custom molten-gold PMREM environment reflections.
  - Procedural 16-flute Doric basalt columns with entasis taper and bronze capitals, geared multi-ring Meridian Astrolabe, carved Mirror Obelisks with geared turntables, dual-shell refracting Crystal Collector Prism with dynamic PointLight, `LatheGeometry` acoustic temple bells, floating obsidian celestial arches, and a 12-petal sculpted bronze Lotus Apex Crown.

## Gameplay & 4 Interconnected 3D Instruments

Before the **5-minute Solar Eclipse Countdown** expires (`00:00` lose condition with instant retry), awaken three astronomical wings to flood the floor conduits with molten gold and ignite the central **Solstice Apex Crown**:

1. **Meridian Astrolabe (West Wing)** — Rotate three geared concentric bronze rings in 45° increments until all three glowing solar apertures lock beneath the top Zenith Jewel.
2. **Obsidian Mirror Courtyard (East Wing)** — Pivot three carved basalt-and-bronze reflector obelisks around fluted Doric pillar obstacles to bounce a live glowing 3D molten sunbeam onto the central refracting Collector Prism.
3. **Harmonic Sun-Chimes (North Wing)** — Trigger the Resonate Gong to watch and hear the golden light pulse across four sculpted suspended temple bells (`D4`, `E4`, `F#4`, `A4`), then strike them in ascending harmonic order.
4. **The Solstice Apex Crown (Center Dais)** — Once all three molten conduits glow (`3/3`), ignite the floating 12-petal crown to unleash an animated floral orbital bloom, zenith solstice light pillar, deterministic **1–3 Star Rating**, **Daily Seed Replay Mode**, and **Free Explore Sandbox Mode**.

## Voiceover & Spatial Sound Design

- **Studio-Grade English Narration**: Integrated `public/audio/vo_intro.mp3` and `public/audio/vo_victory.mp3` (sourced from Zyphra ZONOS3-Mini 44.1 kHz studio masters) triggered safely within user interaction gestures, paired with a unified `M` mute toggle.
- **Procedural WebAudio Synthesis**: Real-time FM/overtone pentatonic brass bells, horological detents, carved basalt turntable resonance, conduit ignition swells, and victory fanfare.

## Zero-Motion-Sickness Navigation & Controls

- **Click-to-Teleport Stepping Pads**: Click glowing basalt-and-gold stepping pads on the floor or use the bottom pad dock (`1`–`5`) for critically-damped smooth glides with zero head bobbing.
- **Smooth Orbit & Terrace Stroll**: Drag to orbit smoothly, scroll to adjust distance, and use `WASD` or Arrow keys to stroll gently inside safe sanctuary bounds.
- **Shortcuts**: `R` Reset View · `H` Toggle Field Hint · `M` Mute Sound & Voice · `Space` Pulse Sun-Chimes Sequence.

## Development, Testing & Verification

```bash
npm install
npm run dev          # Local development server
npm run typecheck    # Strict TypeScript verification (tsc --noEmit)
npm test             # Vitest unit tests (PRNG, optical mirrors, puzzles, timer/scoring)
npm run build        # Production build to dist/ (base: './')
npm run verify:e2e   # Automated Playwright WebGL + Bloom + HUD verification & screenshots
```
