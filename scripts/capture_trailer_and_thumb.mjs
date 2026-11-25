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
const workDir = '/tmp/orrery_v3';

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
      path.join(cacheRoot, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
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
      if (!fullPath.startsWith(rootDir) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
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

function interpPose(a, b, u) {
  const s = smoothstep(u);
  return {
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

/**
 * Computes silky cinematic camera poses synchronized to Acts 1, 2, and 3.
 */
function getCameraPoseForTime(t) {
  // Act 1 (0.0 - 24.4s): Grand establishing obsidian sanctuary sweeps
  if (t < 9.0) {
    // Low sweeping reveal approaching Central Apex & Doric colonnade under Eclipse Sky
    return interpPose(
      { target: [0, 3.0, -1.0], yaw: -0.45, pitch: 0.22, distance: 24.0 },
      { target: [0, 2.7, -0.5], yaw: 0.28, pitch: 0.30, distance: 18.8 },
      t / 9.0,
    );
  }
  if (t < 17.0) {
    // Smooth architectural orbit showcasing hammered-bronze Astrolabe & basalt colonnade
    return interpPose(
      { target: [-4.0, 2.6, 0.5], yaw: 0.32, pitch: 0.29, distance: 18.2 },
      { target: [-8.5, 3.1, 1.4], yaw: 0.85, pitch: 0.16, distance: 13.0 },
      (t - 9.0) / 8.0,
    );
  }
  if (t < 24.4) {
    // Wide sanctuary crest gliding back across Mirror Courtyard & glowing braziers
    return interpPose(
      { target: [4.0, 2.2, 0.8], yaw: 0.62, pitch: 0.42, distance: 19.2 },
      { target: [-10.5, 3.15, 1.5], yaw: 0.96, pitch: 0.12, distance: 11.4 },
      (t - 17.0) / 7.4,
    );
  }

  // Act 2 (24.4 - 45.6s): Interactive puzzle mechanics showcase
  if (t < 32.8) {
    // Meridian Astrolabe slow hero push-in while rings click and lock at zenith
    return interpPose(
      { target: [-10.5, 3.15, 1.5], yaw: 0.98, pitch: 0.12, distance: 11.4 },
      { target: [-10.5, 3.2, 1.5], yaw: 0.82, pitch: 0.14, distance: 10.3 },
      (t - 24.4) / 8.4,
    );
  }
  if (t < 41.2) {
    // Obsidian Mirror Courtyard elevated tabletop sweep as 3D molten beam locks onto prism
    return interpPose(
      { target: [10.5, 1.35, 1.5], yaw: -0.18, pitch: 0.66, distance: 12.2 },
      { target: [10.5, 1.45, 1.5], yaw: 0.22, pitch: 0.62, distance: 10.8 },
      (t - 32.8) / 8.4,
    );
  }
  if (t < 45.6) {
    // North Harmonic Sun-Chimes temple bell pergola push-in
    return interpPose(
      { target: [0, 3.1, -11.0], yaw: -0.14, pitch: 0.12, distance: 10.2 },
      { target: [0, 3.1, -11.0], yaw: 0.14, pitch: 0.13, distance: 9.2 },
      (t - 41.2) / 4.4,
    );
  }

  // Act 3 (45.6 - 68.5s): Solstice Apex Ignition & Golden Sky Bloom Finale
  if (t < 51.0) {
    // Dramatic ascent toward the unlocked Solstice Apex Crown
    return interpPose(
      { target: [0, 3.3, 0], yaw: 0.45, pitch: 0.22, distance: 11.4 },
      { target: [0, 3.5, 0], yaw: 0.18, pitch: 0.26, distance: 9.8 },
      (t - 45.6) / 5.4,
    );
  }
  // Grand golden orbital bloom showcase (51.0 - 68.5s)
  return interpPose(
    { target: [0, 3.6, 0], yaw: 0.18, pitch: 0.26, distance: 10.2 },
    { target: [0, 3.2, -0.4], yaw: 1.55, pitch: 0.34, distance: 20.5 },
    (t - 51.0) / 17.5,
  );
}

async function setHudStyle(page, mode) {
  await page.evaluate((m) => {
    const hud = document.querySelector('.hud-top');
    const bar = document.getElementById('station-bar');
    const dock = document.querySelector('.pad-dock');
    const toast = document.getElementById('toast-banner');
    const hover = document.getElementById('hover-pill');
    const els = [hud, bar, dock, toast, hover].filter(Boolean);
    for (const el of els) {
      el.style.transition = 'opacity 0.45s ease';
      el.style.opacity = m === 'hidden' ? '0' : '1';
      el.style.pointerEvents = m === 'hidden' ? 'none' : '';
    }
  }, mode);
}

async function injectCinematicOverlays(page) {
  await page.evaluate(() => {
    if (document.getElementById('v3-cinematic-title')) return;
    const style = document.createElement('style');
    style.textContent = `
      #v3-cinematic-title, #v3-cinematic-outro {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 40;
        opacity: 0;
        transition: opacity 0.6s ease;
        text-align: center;
      }
      #v3-cinematic-title {
        justify-content: flex-start;
        padding-top: 72px;
        background: linear-gradient(180deg, rgba(14,12,11,0.58) 0%, rgba(14,12,11,0) 42%);
      }
      #v3-cinematic-outro {
        background: radial-gradient(circle at center, rgba(14,12,11,0.72) 0%, rgba(14,12,11,0.92) 100%);
      }
      .v3-kicker {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.28em;
        color: #F2B84B;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      .v3-h1 {
        font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
        font-size: 64px;
        font-weight: 700;
        color: #F2EFE9;
        margin: 0;
        text-shadow: 0 4px 24px rgba(14,12,11,0.85);
      }
      .v3-sub {
        font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
        font-style: italic;
        font-size: 26px;
        color: #F2B84B;
        margin: 8px 0 0;
        text-shadow: 0 2px 16px rgba(14,12,11,0.85);
      }
      .v3-rule {
        width: 180px;
        height: 1px;
        background: linear-gradient(90deg, transparent, #F2B84B, transparent);
        margin: 22px 0;
      }
      .v3-meta {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 19px;
        font-weight: 600;
        color: #DFD5C6;
        letter-spacing: 0.08em;
      }
    `;
    document.head.appendChild(style);

    const openEl = document.createElement('div');
    openEl.id = 'v3-cinematic-title';
    openEl.innerHTML = `
      <div class="v3-kicker">HTC VIVERSE SPARK 2026 &nbsp;&bull;&nbsp; GAMES CATEGORY</div>
      <div class="v3-h1">Solstice Orrery</div>
      <div class="v3-sub">Keeper of the Brass Sky</div>
    `;
    document.body.appendChild(openEl);

    const outroEl = document.createElement('div');
    outroEl.id = 'v3-cinematic-outro';
    outroEl.innerHTML = `
      <div class="v3-kicker">READY TO LAUNCH ON VIVERSE CREATE HUB</div>
      <div class="v3-h1">Solstice Orrery</div>
      <div class="v3-sub">Keeper of the Brass Sky</div>
      <div class="v3-rule"></div>
      <div class="v3-meta">Three.js WebGL &nbsp;&middot;&nbsp; UnrealBloomPass &nbsp;&middot;&nbsp; 1.78 MB Zero-Dependency Bundle</div>
    `;
    document.body.appendChild(outroEl);
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
    console.warn('Metal ANGLE launch fallback to swiftshader:', err.message);
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

  const rawVideoPath = path.join(workDir, 'trailer_raw_1080p.mp4');
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

    // Mute in-browser WebAudio during silent video capture (studio ZONOS3 + ambient score mixed cleanly in ffmpeg)
    await page.click('#btn-start-daily');
    await page.waitForSelector('#modal-title:not([open])', { state: 'attached' });
    await page.click('#btn-mute');

    // Switch to deterministic manual frame stepping so 30 FPS capture is 100% butter-smooth!
    await page.evaluate(() => window.__ORRERY__?.setManualStep(true));

    // =========================================================================
    // PART A: Capture 1920x1080 VIVERSE World Hero Thumbnail (ZERO HUD clutter!)
    // =========================================================================
    // Solve Astrolabe & Mirror Courtyard first while HUD buttons are clickable,
    // then hide HUD so the hero thumbnail displays the pure unobstructed sanctuary:
    await page.click('.pad-btn[data-pad="astrolabe"]');
    for (let r = 0; r < 3; r += 1) {
      for (let g = 0; g < 10; g += 1) {
        const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
        if (snap.astrolabe.rings[r] === 0) break;
        await page.click(`[data-action="astrolabe-ring-${r}"]`);
      }
    }
    await page.click('.pad-btn[data-pad="mirrors"]');
    for (let m = 0; m < 3; m += 1) {
      for (let g = 0; g < 6; g += 1) {
        const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
        if (snap.mirrors.mirrors[m].orientation === snap.mirrors.mirrors[m].solutionOrientation) break;
        await page.click(`[data-action="mirror-${m}"]`);
      }
    }
    await setHudStyle(page, 'hidden');

    await page.evaluate(() => {
      const els = [
        document.querySelector('.hud-top'),
        document.getElementById('station-bar'),
        document.querySelector('.pad-dock'),
        document.getElementById('toast-banner'),
        document.getElementById('hover-pill'),
      ].filter(Boolean);
      for (const el of els) {
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    });

    // Set breathtaking heroic panoramic composition showing colonnade, astrolabe, apex crown & mirror beam
    await page.evaluate(() => {
      window.__ORRERY__?.setCinematicPose(
        { target: [0.2, 2.35, 0.2], yaw: 0.24, pitch: 0.34, distance: 20.2 },
        true,
      );
      // Advance 65 simulated frames (~2.1s) so rings, mirrors, conduits, and particles settle vibrantly
      for (let i = 0; i < 65; i += 1) {
        window.__ORRERY__?.stepFrame(1 / 30);
      }
    });

    const thumbPath = path.join(materialsDir, 'viverse_world_thumbnail_16x9.png');
    await page.screenshot({ path: thumbPath });
    console.log(`Captured 1920x1080 VIVERSE hero thumbnail -> ${thumbPath}`);

    // =========================================================================
    // PART B: Reset cleanly and record 68.5s 1920x1080 @ 30fps live WebGL Trailer
    // =========================================================================
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#modal-title[open]', { state: 'visible' });
    await page.evaluate(() => window.__ORRERY__?.waitForTextures());
    await page.click('#btn-start-daily');
    await page.waitForSelector('#modal-title:not([open])', { state: 'attached' });
    await page.click('#btn-mute');
    await injectCinematicOverlays(page);
    await setHudStyle(page, 'hidden');
    await page.evaluate(() => window.__ORRERY__?.setManualStep(true));

    // Spawn ffmpeg encoder with stderr redirected to file (never unread pipe!)
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

    // Build exact scripted interactive triggers synced to the 3 ZONOS3-Mini acts
    const snapshotInit = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
    const astroClicks = [];
    for (let r = 0; r < 3; r += 1) {
      const stepsNeeded = (8 - snapshotInit.astrolabe.rings[r]) % 8;
      for (let k = 0; k < stepsNeeded; k += 1) {
        astroClicks.push(r);
      }
    }
    const mirrorClicks = [];
    for (let m = 0; m < 3; m += 1) {
      const cur = snapshotInit.mirrors.mirrors[m].orientation;
      const sol = snapshotInit.mirrors.mirrors[m].solutionOrientation;
      const stepsNeeded = (sol - cur + 4) % 4;
      for (let k = 0; k < stepsNeeded; k += 1) {
        mirrorClicks.push(m);
      }
    }
    const chimeOrder = [];
    for (let rank = 0; rank < 4; rank += 1) {
      chimeOrder.push(snapshotInit.chimes.slotRanks.indexOf(rank));
    }

    const scheduledEvents = [];
    // Opening cinematic title card (fade in at 0.5s, fade out at 5.2s)
    scheduledEvents.push({ time: 0.5, fn: () => setOverlayOpacity(page, 'v3-cinematic-title', 1) });
    scheduledEvents.push({ time: 5.2, fn: () => setOverlayOpacity(page, 'v3-cinematic-title', 0) });

    // Act 2 start: reveal clean HUD and focus Astrolabe
    scheduledEvents.push({
      time: 23.9,
      fn: async () => {
        await setHudStyle(page, 'visible');
        await page.click('.pad-btn[data-pad="astrolabe"]');
      },
    });
    // Distribute Astrolabe ring clicks evenly between 25.0s and 31.8s
    astroClicks.forEach((ringIdx, idx) => {
      const at = 25.0 + (idx / Math.max(1, astroClicks.length - 1)) * 6.8;
      scheduledEvents.push({
        time: at,
        fn: () => page.click(`[data-action="astrolabe-ring-${ringIdx}"]`),
      });
    });

    // Switch to Mirror Courtyard at 32.8s and rotate mirrors smoothly between 33.8s and 39.6s
    scheduledEvents.push({
      time: 32.8,
      fn: () => page.click('.pad-btn[data-pad="mirrors"]'),
    });
    mirrorClicks.forEach((mIdx, idx) => {
      const at = 33.8 + (idx / Math.max(1, mirrorClicks.length - 1)) * 5.6;
      scheduledEvents.push({
        time: at,
        fn: () => page.click(`[data-action="mirror-${mIdx}"]`),
      });
    });

    // Switch to Sun-Chimes at 41.2s, pulse at 41.5s, strike ascending bells 42.1s - 44.3s
    scheduledEvents.push({
      time: 41.2,
      fn: () => page.click('.pad-btn[data-pad="chimes"]'),
    });
    scheduledEvents.push({
      time: 41.5,
      fn: () => page.click('[data-action="chimes-pulse"]'),
    });
    chimeOrder.forEach((slotIdx, idx) => {
      scheduledEvents.push({
        time: 42.1 + idx * 0.72,
        fn: () => page.click(`[data-action="chime-${slotIdx}"]`),
      });
    });

    // Act 3: Approach Solstice Apex Crown at 45.6s, ignite at 49.0s!
    scheduledEvents.push({
      time: 45.6,
      fn: () => page.click('.pad-btn[data-pad="apex"]'),
    });
    scheduledEvents.push({
      time: 49.0,
      fn: async () => {
        await page.click('[data-action="apex-ignite"]');
        // Keep the 3-star victory modal visible briefly then enter Free Explore Sandbox so the full blooming golden sanctuary shines unobstructed!
      },
    });
    scheduledEvents.push({
      time: 54.0,
      fn: async () => {
        await page.click('#btn-victory-sandbox');
        await setHudStyle(page, 'hidden');
      },
    });
    // Closing title slate fade-in at 63.8s
    scheduledEvents.push({
      time: 63.8,
      fn: () => setOverlayOpacity(page, 'v3-cinematic-outro', 1),
    });

    scheduledEvents.sort((a, b) => a.time - b.time);
    let eventIdx = 0;

    // Initial pose lock
    const p0 = getCameraPoseForTime(0);
    await page.evaluate((pose) => {
      window.__ORRERY__?.setCinematicPose(pose, true);
      window.__ORRERY__?.stepFrame(1 / 30);
    }, p0);

    const startWall = Date.now();
    for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
      const t = frame / FPS;

      while (eventIdx < scheduledEvents.length && scheduledEvents[eventIdx].time <= t) {
        await scheduledEvents[eventIdx].fn();
        eventIdx += 1;
      }

      const pose = getCameraPoseForTime(t);
      await page.evaluate(
        ({ p, dt }) => {
          window.__ORRERY__?.setCinematicPose(p, true);
          window.__ORRERY__?.stepFrame(dt);
        },
        { p: pose, dt: 1 / FPS },
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
  console.error('[CAPTURE FAILED]', err);
  process.exit(1);
});
