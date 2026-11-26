import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const competitionRoot = path.resolve(projectRoot, '..', '..');
const materialsDir = path.join(competitionRoot, 'materials');
const shotsDir = path.join(competitionRoot, 'shots');

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
      path.join(cacheRoot, dir, 'chrome-linux', 'chrome'),
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

async function waitFrames(page, count = 20) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let i = 0;
        const step = () => {
          i += 1;
          if (i >= n) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

async function inspectCanvasPixels(page) {
  return page.evaluate(() => {
    const src = document.getElementById('orrery-canvas');
    if (!(src instanceof HTMLCanvasElement)) {
      return { ok: false, reason: 'Canvas not found' };
    }
    const probe = document.createElement('canvas');
    probe.width = 160;
    probe.height = 90;
    const ctx = probe.getContext('2d');
    if (!ctx) return { ok: false, reason: '2D probe context unavailable' };
    ctx.drawImage(src, 0, 0, 160, 90);
    const data = ctx.getImageData(0, 0, 160, 90).data;

    let nonBlack = 0;
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let blueDominant = 0;
    let clippedWhite = 0;
    const totalPixels = 160 * 90;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalR += r;
      totalG += g;
      totalB += b;
      if (r + g + b > 18) nonBlack += 1;
      if (b > r + 15 && b > g + 10) blueDominant += 1;
      if (r >= 252 && g >= 250 && b >= 242) clippedWhite += 1;
    }

    return {
      ok: nonBlack > totalPixels * 0.65,
      nonBlackRatio: Number((nonBlack / totalPixels).toFixed(3)),
      clippedWhiteRatio: Number((clippedWhite / totalPixels).toFixed(4)),
      avgRgb: [
        Math.round(totalR / totalPixels),
        Math.round(totalG / totalPixels),
        Math.round(totalB / totalPixels),
      ],
      blueDominantPixels: blueDominant,
    };
  });
}

async function measureUnobstructedViewportRatio(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const totalArea = vw * vh;
    const selectors = [
      '.hud-top',
      '.pad-dock',
      '.station-bar',
      '.walk-prompt',
      '.toast-banner',
      '.hover-pill',
      '.hint-drawer',
      '.cinema-exit-btn',
    ];
    let hudArea = 0;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLElement)) continue;
      if (el.hidden) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) {
        continue;
      }
      const r = el.getBoundingClientRect();
      hudArea += Math.max(0, r.width) * Math.max(0, r.height);
    }
    return Number((1 - hudArea / totalArea).toFixed(3));
  });
}

async function solveAstrolabeInUI(page) {
  for (let ringIdx = 0; ringIdx < 3; ringIdx += 1) {
    for (let guard = 0; guard < 28; guard += 1) {
      const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
      if (snap.astrolabe.rings[ringIdx] === 0 || snap.astrolabe.solved) break;
      await page.click(`[data-action="astrolabe-ring-${ringIdx}"]`);
    }
  }
}

async function solveMirrorsInUI(page) {
  const count = await page.evaluate(
    () => window.__ORRERY__?.getSnapshot().mirrors.mirrors.length ?? 0,
  );
  for (let mIdx = 0; mIdx < count; mIdx += 1) {
    for (let guard = 0; guard < 5; guard += 1) {
      const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
      const node = snap.mirrors.mirrors[mIdx];
      if (!node || node.orientation === node.solutionOrientation || snap.mirrors.solved) break;
      await page.click(`[data-action="mirror-${mIdx}"]`);
    }
  }
}

async function solveChimesInUI(page) {
  await page.click('[data-action="chimes-pulse"]');
  const chimeOrder = await page.evaluate(() => {
    const snap = window.__ORRERY__?.getSnapshot();
    const order = [];
    for (let rank = 0; rank < 4; rank += 1) {
      order.push(snap.chimes.slotRanks.indexOf(rank));
    }
    return order;
  });
  for (const slot of chimeOrder) {
    await page.click(`[data-action="chime-${slot}"]`);
    await waitFrames(page, 4);
  }
}

async function launchBrowser(executablePath) {
  const metalArgs = [
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--use-mock-keychain',
    '--password-store=basic',
  ];
  try {
    return await chromium.launch({ headless: true, executablePath, args: metalArgs });
  } catch {
    return await chromium.launch({
      headless: true,
      executablePath,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--no-sandbox',
        '--use-mock-keychain',
        '--password-store=basic',
      ],
    });
  }
}

async function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`dist/index.html not found at ${distDir}. Run npm run build first.`);
  }
  fs.mkdirSync(materialsDir, { recursive: true });
  fs.mkdirSync(shotsDir, { recursive: true });

  const { server, port } = await startStaticServer(distDir);
  const url = `http://127.0.0.1:${port}/`;
  const executablePath = findCachedChromium();

  const consoleErrors = [];
  const pageErrors = [];

  const browser = await launchBrowser(executablePath);

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        consoleErrors.push(`HTTP ${res.status()} ${res.url()}`);
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#orrery-canvas', { state: 'visible' });
    await page.waitForSelector('#modal-title[open]', { state: 'visible' });
    await page.evaluate(() => window.__ORRERY__?.waitForTextures());
    await waitFrames(page, 28);

    const titlePixels = await inspectCanvasPixels(page);
    if (!titlePixels.ok || titlePixels.blueDominantPixels > 0) {
      throw new Error(`Title WebGL pixel check failed: ${JSON.stringify(titlePixels)}`);
    }

    // 1. Title screen capture
    await page.screenshot({ path: path.join(materialsDir, '01_title_observatory.png') });

    // 2. Start Trial I -> Orbit Overview -> measure >= 82% clear 3D viewport!
    await page.click('#btn-start-daily');
    await page.waitForSelector('#modal-title:not([open])', { state: 'attached' });
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('overview'));
    await waitFrames(page, 26);

    const clearViewRatioOrbit = await measureUnobstructedViewportRatio(page);
    if (clearViewRatioOrbit < 0.82) {
      throw new Error(`Expected >= 82% unobstructed 3D viewport in Orbit Overview, got ${clearViewRatioOrbit}`);
    }

    // Verify Cinema Mode toggle via C key -> >= 98% unobstructed viewport, then exit cleanly
    await page.keyboard.press('KeyC');
    await waitFrames(page, 8);
    const clearViewRatioCinema = await measureUnobstructedViewportRatio(page);
    const exitCinemaVisible = await page.isVisible('#btn-cinema-exit');
    if (!exitCinemaVisible || clearViewRatioCinema < 0.96) {
      throw new Error(
        `Cinema mode failed: exitVisible=${exitCinemaVisible}, ratio=${clearViewRatioCinema}`,
      );
    }
    await page.keyboard.press('KeyC');
    await waitFrames(page, 8);

    // Capture V5 Orbit Overview shot (minimalist 2-zone bronze sundial HUD)
    await page.screenshot({ path: path.join(shotsDir, 'after_v5_orbit.png') });
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_orbit.png') });

    // 3. Verify Direct 3D Hover & Click in 3D space (NO HUD buttons clicked!)
    const ringPt = await page.evaluate(() =>
      window.__ORRERY__?.getInteractableScreenPoint('astrolabe-ring', 0),
    );
    if (!ringPt) {
      throw new Error('Could not project 3D Astrolabe Outer Ring screen coordinates');
    }
    const movesBeforeDirect = Number(await page.textContent('#moves-value'));
    await page.mouse.move(ringPt.x, ringPt.y);
    await waitFrames(page, 10);
    const hoverLabel = await page.isVisible('#hover-pill')
      ? (await page.textContent('#hover-pill'))?.trim()
      : null;
    if (!hoverLabel) {
      throw new Error('Expected #hover-pill to appear when hovering 3D Astrolabe ring');
    }
    await page.mouse.click(ringPt.x, ringPt.y);
    await waitFrames(page, 12);
    const movesAfterDirect = Number(await page.textContent('#moves-value'));
    if (movesAfterDirect <= movesBeforeDirect) {
      throw new Error(
        `Direct 3D click on Astrolabe ring did not increment moves (${movesBeforeDirect} -> ${movesAfterDirect})`,
      );
    }

    // 4. First-Person Walk Sanctuary mode (no bottom station card clutter) + KeyE proximity interact
    await page.click('#btn-camera-mode');
    await waitFrames(page, 8);
    const modeAfterClick = await page.evaluate(() => window.__ORRERY__?.getSnapshot().cameraMode);
    if (modeAfterClick !== 'walk') {
      throw new Error(`Expected walk mode after clicking #btn-camera-mode, got ${modeAfterClick}`);
    }
    await page.evaluate(() => window.__ORRERY__?.setWalkPose(-4.8, 5.2, 0.85, 0.14));
    await waitFrames(page, 24);
    const walkPromptVisible = await page.isVisible('#walk-prompt');
    const stationBarHiddenInWalk = await page.isHidden('#station-bar');
    if (!walkPromptVisible || !stationBarHiddenInWalk) {
      throw new Error(
        `Walk mode HUD check failed: walkPromptVisible=${walkPromptVisible}, stationBarHidden=${stationBarHiddenInWalk}`,
      );
    }
    const movesBeforeE = Number(await page.textContent('#moves-value'));
    await page.keyboard.press('KeyE');
    await waitFrames(page, 14);
    const movesAfterE = Number(await page.textContent('#moves-value'));
    if (movesAfterE <= movesBeforeE) {
      throw new Error(`Expected KeyE walk interaction to rotate Astrolabe (${movesBeforeE} -> ${movesAfterE})`);
    }
    const walkPixels = await inspectCanvasPixels(page);
    if (!walkPixels.ok || walkPixels.blueDominantPixels > 0) {
      throw new Error(`Walkaround WebGL pixel check failed: ${JSON.stringify(walkPixels)}`);
    }
    await page.screenshot({ path: path.join(shotsDir, 'after_v5_walk.png') });
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_walk.png') });

    // Switch back to Orbit with V key
    await page.keyboard.press('KeyV');
    await waitFrames(page, 10);

    // 5. Solve Trial I completely -> verify Chronicle / Personal Best Tempo Record persisted!
    await page.click('.pad-btn[data-pad="astrolabe"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('astrolabe'));
    await waitFrames(page, 10);
    await solveAstrolabeInUI(page);
    await page.click('.pad-btn[data-pad="mirrors"]');
    await waitFrames(page, 8);
    await solveMirrorsInUI(page);
    await page.click('.pad-btn[data-pad="chimes"]');
    await waitFrames(page, 8);
    await solveChimesInUI(page);
    await page.click('.pad-btn[data-pad="apex"]');
    await waitFrames(page, 8);
    await page.click('[data-action="apex-ignite"]');
    await page.waitForSelector('#modal-victory[open]', { state: 'visible' });
    const tempoText = (await page.textContent('#victory-tempo-note'))?.trim() ?? '';
    if (!tempoText.includes('1/7 Trials mastered')) {
      throw new Error(`Expected session chronicle note on Victory modal, got "${tempoText}"`);
    }
    await page.click('#btn-victory-next-trial');
    await page.waitForSelector('#modal-victory:not([open])', { state: 'attached' });
    await waitFrames(page, 8);

    // Open Chronicle modal to verify 7-Trial personal best tempo grid renders cleanly
    await page.click('#btn-records');
    await page.waitForSelector('#modal-records[open]', { state: 'visible' });
    const recordRows = await page.locator('#records-grid .record-row').count();
    if (recordRows !== 7) {
      throw new Error(`Expected 7 trial rows in Chronicle modal, got ${recordRows}`);
    }
    await page.click('#modal-records button[type="submit"]');
    await page.waitForSelector('#modal-records:not([open])', { state: 'attached' });

    // 6. Trial V Coupled Gears + Splitter shot
    await page.click('#trial-strip .trial-btn[data-trial="5"]');
    await waitFrames(page, 14);
    await page.click('.pad-btn[data-pad="astrolabe"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('astrolabe'));
    await waitFrames(page, 18);
    await page.click('[data-action="astrolabe-ring-0"]');
    await waitFrames(page, 14);
    await page.screenshot({ path: path.join(materialsDir, '02_astrolabe_puzzle.png') });

    // 7. Trial VII Grand Solstice Eclipse Finale -> Calibrated Dawn Corona (ZERO pure white blowout!)
    await page.click('#trial-strip .trial-btn[data-trial="7"]');
    await waitFrames(page, 18);
    await page.click('.pad-btn[data-pad="mirrors"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('mirrors'));
    await waitFrames(page, 16);
    await solveMirrorsInUI(page);
    await waitFrames(page, 26);
    const t7LitCollectors = await page.evaluate(
      () => window.__ORRERY__?.getSnapshot().mirrors.litCollectorIndices?.length ?? 0,
    );
    if (t7LitCollectors !== 3) {
      throw new Error(`Expected 3 lit collector prisms in Trial VII, got ${t7LitCollectors}`);
    }
    await page.screenshot({ path: path.join(materialsDir, '03_mirror_beam.png') });
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_trial7_eclipse.png') });

    await page.click('.pad-btn[data-pad="astrolabe"]');
    await waitFrames(page, 8);
    await solveAstrolabeInUI(page);
    await page.click('.pad-btn[data-pad="chimes"]');
    await waitFrames(page, 8);
    await solveChimesInUI(page);
    await page.click('.pad-btn[data-pad="apex"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('apex'));
    await waitFrames(page, 10);
    await page.click('[data-action="apex-ignite"]');
    await page.waitForSelector('#modal-victory[open]', { state: 'visible' });
    await waitFrames(page, 26);
    await page.screenshot({ path: path.join(materialsDir, '04_solstice_victory.png') });

    // Enter Sandbox Overview to capture calibrated Dawn Corona Climax shot!
    await page.click('#btn-victory-sandbox');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('overview'));
    await waitFrames(page, 40);
    const finalePixels = await inspectCanvasPixels(page);
    if (!finalePixels.ok || finalePixels.blueDominantPixels > 0) {
      throw new Error(`Dawn Corona Finale pixel check failed: ${JSON.stringify(finalePixels)}`);
    }
    if (finalePixels.clippedWhiteRatio > 0.04) {
      throw new Error(
        `Dawn Corona climax still over-exposed (clippedWhiteRatio=${finalePixels.clippedWhiteRatio} > 0.04)`,
      );
    }
    await page.screenshot({ path: path.join(shotsDir, 'after_v5_finale.png') });
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_trial7_finale.png') });

    const qualityStats = await page.evaluate(() => window.__ORRERY__?.getQualityStats());

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        `Runtime errors detected! consoleErrors=${JSON.stringify(consoleErrors)} pageErrors=${JSON.stringify(pageErrors)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          clearViewRatioOrbit,
          clearViewRatioCinema,
          direct3DClickMoves: `${movesBeforeDirect}->${movesAfterDirect}`,
          walkKeyEMoves: `${movesBeforeE}->${movesAfterE}`,
          trial7TriBeamCollectors: t7LitCollectors,
          titlePixels,
          walkPixels,
          finalePixels,
          qualityStats,
          consoleErrors: 0,
          pageErrors: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[E2E FAILED]', err);
  process.exit(1);
});
