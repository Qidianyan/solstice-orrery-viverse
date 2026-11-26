import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const materialsDir = path.resolve(projectRoot, '..', '..', 'materials');
const workDir = '/tmp/orrery_v6';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const TOTAL_SEC = 68.5;
const TOTAL_FRAMES = Math.round(TOTAL_SEC * FPS);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

function findCachedChromium() {
  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!fs.existsSync(cacheRoot)) return undefined;
  const entries = fs
    .readdirSync(cacheRoot)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .reverse();

  for (const dir of entries) {
    const candidates = [
      path.join(
        cacheRoot,
        dir,
        'chrome-mac-arm64',
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing',
      ),
      path.join(cacheRoot, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return undefined;
}

function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const fullPath = path.resolve(rootDir, rel);
      if (
        !fullPath.startsWith(rootDir) ||
        !fs.existsSync(fullPath) ||
        fs.statSync(fullPath).isDirectory()
      ) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function interpOrbit(a, b, u) {
  const s = smoothstep(u);
  return {
    kind: 'orbit',
    target: [
      lerp(a.target[0], b.target[0], s),
      lerp(a.target[1], b.target[1], s),
      lerp(a.target[2], b.target[2], s),
    ],
    yaw: lerp(a.yaw, b.yaw, s),
    pitch: lerp(a.pitch, b.pitch, s),
    distance: lerp(a.distance, b.distance, s),
  };
}

function interpWalk(a, b, u) {
  const s = smoothstep(u);
  return {
    kind: 'walk',
    x: lerp(a.x, b.x, s),
    z: lerp(a.z, b.z, s),
    yaw: lerp(a.yaw, b.yaw, s),
    pitch: lerp(a.pitch, b.pitch, s),
  };
}

/**
 * V6 Choreographed 1080p Camera Track showcasing EVERY V4-V6 upgrade:
 * - 0.0-12.0s: Minimalist 93.1% HUD Orbit panoramic reveal + Noon Gold volumetric god-rays
 * - 12.0-24.0s: First-Person Sanctuary Walkaround strolling past 16 fluted Doric basalt columns up to Astrolabe!
 * - 24.0-33.5s: Trial V Crimson Eclipse Coupled Bronze Gears (1:-0.5) + direct 3D ring hover/clicks
 * - 33.5-41.2s: Trial VII Crimson Eclipse Dual Dichroic Beam Splitters -> 3 simultaneous molten beams & Fresnel prisms!
 * - 41.2-45.5s: North Wing Harmonic Sun-Chimes ascending bronze bells
 * - 45.5-68.5s: Trial VII Zero-Overexposure Dawn Corona Breakthrough + Chronicle Tempo Card + 99.6% Cinema Orbit Finale!
 */
function getCameraFrameForTime(t) {
  if (t < 12.0) {
    return interpOrbit(
      { target: [0, 2.9, -0.8], yaw: -0.42, pitch: 0.24, distance: 23.2 },
      { target: [0, 2.55, -0.3], yaw: 0.28, pitch: 0.31, distance: 19.6 },
      t / 12.0,
    );
  }
  if (t < 18.0) {
    // First-person stroll along south colonnade looking straight through central Apex & fluted columns
    return interpWalk(
      { x: 2.2, z: 12.8, yaw: 0.14, pitch: 0.09 },
      { x: -1.8, z: 8.6, yaw: 0.56, pitch: 0.12 },
      (t - 12.0) / 6.0,
    );
  }
  if (t < 24.0) {
    // Approach West Meridian Astrolabe at eye level (1.78m) triggering E proximity prompt
    return interpWalk(
      { x: -1.8, z: 8.6, yaw: 0.56, pitch: 0.12 },
      { x: -4.8, z: 5.2, yaw: 0.86, pitch: 0.14 },
      (t - 18.0) / 6.0,
    );
  }
  if (t < 33.5) {
    // Trial V Coupled Pinion Astrolabe hero close-up in Crimson Eclipse
    return interpOrbit(
      { target: [-10.5, 3.18, 1.5], yaw: 0.96, pitch: 0.11, distance: 11.1 },
      { target: [-10.5, 3.22, 1.5], yaw: 0.8, pitch: 0.14, distance: 10.1 },
      (t - 24.0) / 9.5,
    );
  }
  if (t < 41.2) {
    // Trial VII Dual Beam Splitters -> 3 Simultaneous Molten Beams sweeping tabletop view
    return interpOrbit(
      { target: [10.5, 1.38, 1.5], yaw: -0.2, pitch: 0.67, distance: 12.2 },
      { target: [10.5, 1.48, 1.5], yaw: 0.24, pitch: 0.61, distance: 10.8 },
      (t - 33.5) / 7.7,
    );
  }
  if (t < 45.5) {
    // North Harmonic Sun-Chimes temple bell pergola push-in
    return interpOrbit(
      { target: [0, 3.1, -11.0], yaw: -0.14, pitch: 0.12, distance: 10.2 },
      { target: [0, 3.1, -11.0], yaw: 0.14, pitch: 0.13, distance: 9.2 },
      (t - 41.2) / 4.3,
    );
  }
  if (t < 50.8) {
    // Approach Solstice Apex Crown for Trial VII Dawn Corona Ignition
    return interpOrbit(
      { target: [0, 3.3, 0], yaw: 0.44, pitch: 0.22, distance: 11.4 },
      { target: [0, 3.5, 0], yaw: 0.18, pitch: 0.27, distance: 9.8 },
      (t - 45.5) / 5.3,
    );
  }
  // Soaring 99.6% Cinema-mode golden orbital climax & pull-back (50.8-68.5s)
  return interpOrbit(
    { target: [0, 3.4, 0], yaw: 0.18, pitch: 0.27, distance: 10.4 },
    { target: [0, 2.75, -0.3], yaw: 1.42, pitch: 0.33, distance: 20.6 },
    (t - 50.8) / 17.7,
  );
}

async function injectV6Overlays(page) {
  await page.evaluate(() => {
    if (document.getElementById('v6-title-slate')) return;
    const style = document.createElement('style');
    style.textContent = `
      #v6-title-slate, #v6-outro-slate, #v6-cover-badge {
        position: fixed;
        pointer-events: none;
        z-index: 40;
        opacity: 0;
        transition: opacity 0.55s ease;
      }
      #v6-title-slate {
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        padding-top: 86px;
        text-align: center;
        background: linear-gradient(180deg, rgba(14,12,11,0.52) 0%, rgba(14,12,11,0) 40%);
      }
      #v6-outro-slate {
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        background: radial-gradient(circle at center, rgba(14,12,11,0.72) 0%, rgba(14,12,11,0.92) 100%);
      }
      #v6-cover-badge {
        left: 56px;
        bottom: 48px;
        padding: 18px 24px;
        background: rgba(14, 12, 11, 0.74);
        border-left: 3px solid #F2B84B;
        text-align: left;
      }
      .v6-kicker {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.24em;
        color: #F2B84B;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .v6-h1 {
        font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
        font-size: 62px;
        font-weight: 700;
        color: #F2EFE9;
        margin: 0;
        line-height: 1.08;
        text-shadow: 0 4px 24px rgba(14,12,11,0.85);
      }
      .v6-cover-h1 {
        font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
        font-size: 46px;
        font-weight: 700;
        color: #F2EFE9;
        margin: 0;
        line-height: 1.08;
        letter-spacing: 0.04em;
      }
      .v6-sub {
        font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
        font-style: italic;
        font-size: 24px;
        color: #F2B84B;
        margin: 6px 0 0;
        text-shadow: 0 2px 14px rgba(14,12,11,0.85);
      }
      .v6-cover-sub {
        font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
        font-style: italic;
        font-size: 20px;
        color: #F2B84B;
        margin: 4px 0 0;
      }
      .v6-rule {
        width: 200px;
        height: 1px;
        background: linear-gradient(90deg, transparent, #F2B84B, transparent);
        margin: 22px 0;
      }
      .v6-meta {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 18px;
        font-weight: 600;
        color: #DFD5C6;
        letter-spacing: 0.06em;
      }
    `;
    document.head.appendChild(style);

    const openEl = document.createElement('div');
    openEl.id = 'v6-title-slate';
    openEl.innerHTML = `
      <div class="v6-kicker">HTC VIVERSE SPARK 2026 &nbsp;&bull;&nbsp; GAMES CATEGORY</div>
      <div class="v6-h1">Solstice Orrery</div>
      <div class="v6-sub">Keeper of the Brass Sky</div>
    `;
    document.body.appendChild(openEl);

    const outroEl = document.createElement('div');
    outroEl.id = 'v6-outro-slate';
    outroEl.innerHTML = `
      <div class="v6-kicker">READY TO LAUNCH ON VIVERSE CREATE HUB</div>
      <div class="v6-h1">Solstice Orrery</div>
      <div class="v6-sub">Keeper of the Brass Sky</div>
      <div class="v6-rule"></div>
      <div class="v6-meta">7 Progressive Trials &nbsp;|&nbsp; Walk &amp; Direct 3D Gears &nbsp;|&nbsp; 93.1% Clear HUD &nbsp;|&nbsp; 60fps 1.79 MB Bundle</div>
    `;
    document.body.appendChild(outroEl);

    const coverBadge = document.createElement('div');
    coverBadge.id = 'v6-cover-badge';
    coverBadge.innerHTML = `
      <div class="v6-kicker">VIVERSE SPARK 2026</div>
      <div class="v6-cover-h1">SOLSTICE ORRERY</div>
      <div class="v6-cover-sub">Keeper of the Brass Sky</div>
    `;
    document.body.appendChild(coverBadge);
  });
}

async function setOverlayOpacity(page, id, opacity) {
  await page.evaluate(
    ({ elId, op }) => {
      const el = document.getElementById(elId);
      if (el) el.style.opacity = String(op);
    },
    { elId: id, op: opacity },
  );
}

async function solveAstrolabeFast(page) {
  for (let r = 0; r < 3; r += 1) {
    for (let g = 0; g < 28; g += 1) {
      const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
      if (snap.astrolabe.rings[r] === 0 || snap.astrolabe.solved) break;
      await page.click(`[data-action="astrolabe-ring-${r}"]`);
    }
  }
}

async function solveMirrorsFast(page) {
  const count = await page.evaluate(
    () => window.__ORRERY__?.getSnapshot().mirrors.mirrors.length ?? 0,
  );
  for (let m = 0; m < count; m += 1) {
    for (let g = 0; g < 5; g += 1) {
      const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
      const node = snap.mirrors.mirrors[m];
      if (!node || node.orientation === node.solutionOrientation || snap.mirrors.solved) break;
      await page.click(`[data-action="mirror-${m}"]`);
    }
  }
}

async function solveChimesFast(page) {
  const order = await page.evaluate(() => {
    const snap = window.__ORRERY__?.getSnapshot();
    const out = [];
    for (let rank = 0; rank < 4; rank += 1) out.push(snap.chimes.slotRanks.indexOf(rank));
    return out;
  });
  for (const slot of order) {
    await page.click(`[data-action="chime-${slot}"]`);
  }
}

async function launchGpuBrowser(executablePath) {
  const commonFlags = [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--use-mock-keychain',
    '--password-store=basic',
  ];
  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--use-gl=angle', '--use-angle=metal', ...commonFlags],
    });
    return { browser, backend: 'metal' };
  } catch (err) {
    console.warn('Metal ANGLE fallback to swiftshader:', err.message);
    const browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--use-gl=angle', '--use-angle=swiftshader', ...commonFlags],
    });
    return { browser, backend: 'swiftshader' };
  }
}

async function writeToStream(stream, buf) {
  if (!stream.write(buf)) {
    await new Promise((resolve) => stream.once('drain', resolve));
  }
}

async function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist/index.html missing — run npm run build first.');
  }
  fs.mkdirSync(materialsDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  const { server, port } = await startStaticServer(distDir);
  const url = `http://127.0.0.1:${port}/`;
  const executablePath = findCachedChromium();
  const { browser, backend } = await launchGpuBrowser(executablePath);
  console.log(`Launched Chromium headless (${backend}) at ${WIDTH}x${HEIGHT}`);

  const rawVideoPath = path.join(workDir, 'demo_raw_1080p.mp4');
  const ffmpegLogPath = path.join(workDir, 'ffmpeg_capture.log');
  const ffmpegLogFd = fs.openSync(ffmpegLogPath, 'w');

  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#orrery-canvas', { state: 'visible' });
    await page.waitForSelector('#modal-title[open]', { state: 'visible' });
    await page.evaluate(() => window.__ORRERY__?.waitForTextures());

    await page.click('#btn-start-daily');
    await page.waitForSelector('#modal-title:not([open])', { state: 'attached' });
    await page.click('#btn-mute');
    await injectV6Overlays(page);
    await page.evaluate(() => window.__ORRERY__?.setManualStep(true));

    // =========================================================================
    // PART A: Capture 1920x1080 V6 Champion Cover (Trial VII Calibrated Dawn Corona Climax!)
    // =========================================================================
    await page.click('#trial-strip .trial-btn[data-trial="7"]');
    await page.click('.pad-btn[data-pad="astrolabe"]');
    await solveAstrolabeFast(page);
    await page.click('.pad-btn[data-pad="mirrors"]');
    await solveMirrorsFast(page);
    await page.click('.pad-btn[data-pad="chimes"]');
    await solveChimesFast(page);
    await page.click('.pad-btn[data-pad="apex"]');
    await page.click('[data-action="apex-ignite"]');
    await page.waitForSelector('#modal-victory[open]', { state: 'visible' });
    await page.click('#btn-victory-sandbox');
    await page.waitForSelector('#modal-victory:not([open])', { state: 'attached' });

    // Cinema mode 99.6% clear view (and hide Exit Cinema chip for clean cover art)
    await page.evaluate(() => {
      window.__ORRERY__?.setCinemaMode(true);
      const exitBtn = document.getElementById('btn-cinema-exit');
      if (exitBtn) exitBtn.style.display = 'none';
      window.__ORRERY__?.setCinematicPose(
        { target: [0.0, 2.55, -0.25], yaw: 0.24, pitch: 0.31, distance: 19.8 },
        true,
      );
      for (let i = 0; i < 85; i += 1) {
        window.__ORRERY__?.stepFrame(1 / 30);
      }
    });

    // Save clean 1920x1080 pure-art thumbnail
    const thumbPath = path.join(materialsDir, 'viverse_world_thumbnail_16x9.png');
    await page.screenshot({ path: thumbPath });

    // Save 1920x1080 flagship cover with minimal bottom-left antique bronze serif crest
    await page.evaluate(() => {
      const badge = document.getElementById('v6-cover-badge');
      if (badge) {
        badge.style.transition = 'none';
        badge.style.opacity = '1';
      }
    });
    const coverPath = path.join(materialsDir, '00_viverse_cover_16x9.png');
    await page.screenshot({ path: coverPath });
    console.log(`Captured 1920x1080 V6 Champion Cover -> ${coverPath}`);

    // =========================================================================
    // PART B: Reset cleanly and record 68.5s V6 1080p @ 30fps Live Gameplay Demo
    // =========================================================================
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#modal-title[open]', { state: 'visible' });
    await page.evaluate(() => window.__ORRERY__?.waitForTextures());
    await page.click('#btn-start-daily');
    await page.waitForSelector('#modal-title:not([open])', { state: 'attached' });
    await page.click('#btn-mute');
    await injectV6Overlays(page);
    await page.evaluate(() => {
      window.__ORRERY__?.setManualStep(true);
      // Dismiss onboarding cue cleanly after opening sweep
      const cue = document.getElementById('onboarding-cue');
      if (cue) cue.hidden = true;
    });

    const ff = spawn(
      'ffmpeg',
      [
        '-y',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-framerate',
        String(FPS),
        '-i',
        '-',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        rawVideoPath,
      ],
      { stdio: ['pipe', 'ignore', ffmpegLogFd] },
    );

    const ffDone = new Promise((resolve, reject) => {
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg video encode exited with code ${code}; check ${ffmpegLogPath}`));
      });
    });

    const scheduledEvents = [];

    // 0.5s-4.8s: Opening title slate over Noon Gold 93.1% minimalist sundial HUD
    scheduledEvents.push({ time: 0.5, fn: () => setOverlayOpacity(page, 'v6-title-slate', 1) });
    scheduledEvents.push({ time: 4.8, fn: () => setOverlayOpacity(page, 'v6-title-slate', 0) });

    // 12.0s: Switch into First-Person Walk Sanctuary mode (strolling past 16 Doric basalt columns)
    scheduledEvents.push({
      time: 12.0,
      fn: () => page.evaluate(() => window.__ORRERY__?.setCameraMode('walk', true)),
    });

    // 24.05s: Enter Trial V (Crimson Eclipse + Coupled 1:-0.5 Bronze Pinion Gears) & focus Astrolabe (strictly after walk ends at 24.0s)
    scheduledEvents.push({
      time: 24.05,
      fn: async () => {
        await page.evaluate(() => window.__ORRERY__?.setCameraMode('orbit', true));
        await page.click('#trial-strip .trial-btn[data-trial="5"]');
        await page.click('.pad-btn[data-pad="astrolabe"]');
        // Compute exact coupled Astrolabe clicks for Trial V and schedule them across 25.0s-32.2s
        const plan = await page.evaluate(() => {
          const s = window.__ORRERY__?.getSnapshot();
          const rings = [...s.astrolabe.rings];
          const steps = s.astrolabe.stepCount ?? 24;
          const out = [];
          // Ring 0 drives Ring 1 by (sourceStep:+2, targetStep:-1) in Trial V
          while (rings[0] !== 0 && out.length < 30) {
            rings[0] = (rings[0] + 2) % steps;
            rings[1] = (rings[1] - 1 + steps) % steps;
            out.push(0);
          }
          while (rings[1] !== 0 && out.length < 60) {
            rings[1] = (rings[1] + 1) % steps;
            out.push(1);
          }
          while (rings[2] !== 0 && out.length < 90) {
            rings[2] = (rings[2] + 1) % steps;
            out.push(2);
          }
          return out;
        });
        // Hover the 3D Outer Ring briefly so viewers see the live molten-gold 3D hover rim glow!
        const pt = await page.evaluate(() =>
          window.__ORRERY__?.getInteractableScreenPoint('astrolabe-ring', 0),
        );
        if (pt) await page.mouse.move(pt.x, pt.y);

        // Execute half the clicks evenly across 25.0-31.8s (compressed cleanly if long)
        const clicksToSpread = plan.slice(0, 14);
        const remaining = plan.slice(14);
        clicksToSpread.forEach((ringIdx, idx) => {
          const at = 25.0 + (idx / Math.max(1, clicksToSpread.length)) * 6.5;
          scheduledEvents.push({
            time: at,
            fn: () => page.click(`[data-action="astrolabe-ring-${ringIdx}"]`),
          });
        });
        if (remaining.length > 0) {
          scheduledEvents.push({
            time: 31.8,
            fn: async () => {
              for (const r of remaining) {
                await page.click(`[data-action="astrolabe-ring-${r}"]`);
              }
            },
          });
        }
        scheduledEvents.sort((a, b) => a.time - b.time);
      },
    });

    // 33.55s: Switch to Trial VII (Grand Solstice Eclipse Finale — Dual Splitters -> 3 Simultaneous Molten Beams!)
    scheduledEvents.push({
      time: 33.55,
      fn: async () => {
        await page.mouse.move(10, 10);
        await page.click('#trial-strip .trial-btn[data-trial="7"]');
        await page.click('.pad-btn[data-pad="astrolabe"]');
        await solveAstrolabeFast(page);
        await page.click('.pad-btn[data-pad="mirrors"]');

        const mirrorClicks = await page.evaluate(() => {
          const s = window.__ORRERY__?.getSnapshot();
          const out = [];
          s.mirrors.mirrors.forEach((m, idx) => {
            const need = (m.solutionOrientation - m.orientation + 4) % 4;
            for (let k = 0; k < need; k += 1) out.push(idx);
          });
          return out;
        });
        mirrorClicks.forEach((mIdx, idx) => {
          const at = 34.4 + (idx / Math.max(1, mirrorClicks.length - 1)) * 5.2;
          scheduledEvents.push({
            time: at,
            fn: () => page.click(`[data-action="mirror-${mIdx}"]`),
          });
        });
        scheduledEvents.sort((a, b) => a.time - b.time);
      },
    });

    // 41.2s: Sweep North to Harmonic Sun-Chimes & strike ascending bells 41.8-44.2s
    scheduledEvents.push({
      time: 41.2,
      fn: async () => {
        await page.click('.pad-btn[data-pad="chimes"]');
        await page.click('[data-action="chimes-pulse"]');
        const order = await page.evaluate(() => {
          const s = window.__ORRERY__?.getSnapshot();
          const out = [];
          for (let rank = 0; rank < 4; rank += 1) out.push(s.chimes.slotRanks.indexOf(rank));
          return out;
        });
        order.forEach((slotIdx, idx) => {
          scheduledEvents.push({
            time: 41.8 + idx * 0.72,
            fn: () => page.click(`[data-action="chime-${slotIdx}"]`),
          });
        });
        scheduledEvents.sort((a, b) => a.time - b.time);
      },
    });

    // 45.5s: Approach Solstice Apex Crown, ignite Trial VII Dawn Corona at 48.8s!
    scheduledEvents.push({
      time: 45.5,
      fn: () => page.click('.pad-btn[data-pad="apex"]'),
    });
    scheduledEvents.push({
      time: 48.8,
      fn: () => page.click('[data-action="apex-ignite"]'),
    });
    // 52.8s: Dismiss Victory into Sandbox & flash Chronicle Best Tempo card briefly (53.0-55.5s)
    scheduledEvents.push({
      time: 52.8,
      fn: async () => {
        await page.click('#btn-victory-sandbox');
        await page.click('#btn-records');
      },
    });
    // 55.6s: Close Chronicle and enter 99.6% Cinema Mode for soaring unobstructed Dawn Corona orbit!
    scheduledEvents.push({
      time: 55.6,
      fn: async () => {
        await page.click('#modal-records button[type="submit"]');
        await page.evaluate(() => {
          window.__ORRERY__?.setCinemaMode(true);
          const exitBtn = document.getElementById('btn-cinema-exit');
          if (exitBtn) exitBtn.style.display = 'none';
        });
      },
    });
    // 64.0s: Fade in architectural V6 Outro Slate
    scheduledEvents.push({
      time: 64.0,
      fn: () => setOverlayOpacity(page, 'v6-outro-slate', 1),
    });

    scheduledEvents.sort((a, b) => a.time - b.time);

    const startWall = Date.now();
    for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
      const t = frame / FPS;

      // Drain any newly scheduled or due events
      while (scheduledEvents.length > 0 && scheduledEvents[0].time <= t) {
        const evt = scheduledEvents.shift();
        await evt.fn();
      }

      const cam = getCameraFrameForTime(t);
      await page.evaluate(
        ({ c, dt }) => {
          if (c.kind === 'walk') {
            window.__ORRERY__?.setWalkPose(c.x, c.z, c.yaw, c.pitch);
          } else {
            window.__ORRERY__?.setCinematicPose(c, true);
          }
          window.__ORRERY__?.stepFrame(dt);
        },
        { c: cam, dt: 1 / FPS },
      );

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 92,
      });
      await writeToStream(ff.stdin, Buffer.from(shot.data, 'base64'));

      if (frame > 0 && frame % 300 === 0) {
        const elapsedWall = ((Date.now() - startWall) / 1000).toFixed(1);
        console.log(`Captured frame ${frame}/${TOTAL_FRAMES} (${t.toFixed(1)}s) in ${elapsedWall}s wall`);
      }
    }

    ff.stdin.end();
    await ffDone;
    const totalWall = ((Date.now() - startWall) / 1000).toFixed(1);
    console.log(`Completed ${TOTAL_FRAMES} frames (${TOTAL_SEC}s @ ${FPS}fps) in ${totalWall}s -> ${rawVideoPath}`);
  } finally {
    fs.closeSync(ffmpegLogFd);
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[V6 CAPTURE FAILED]', err);
  process.exit(1);
});
