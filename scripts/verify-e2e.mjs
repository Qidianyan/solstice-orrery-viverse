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
    }

    return {
      ok: nonBlack > totalPixels * 0.65,
      nonBlackRatio: Number((nonBlack / totalPixels).toFixed(3)),
      avgRgb: [
        Math.round(totalR / totalPixels),
        Math.round(totalG / totalPixels),
        Math.round(totalB / totalPixels),
      ],
      blueDominantPixels: blueDominant,
    };
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

    // 2. Start Trial I (Orbit Mode + Volumetric God-Rays + 7-Trial HUD)
    await page.click('#btn-start-daily');
    await page.waitForSelector('#modal-title:not([open])', { state: 'attached' });
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('overview'));
    await waitFrames(page, 30);
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_orbit.png') });

    // 3. Switch to First-Person Sanctuary Walkaround via HUD button & verify proximity E-key interaction
    await page.click('#btn-camera-mode');
    await waitFrames(page, 8);
    const modeAfterClick = await page.evaluate(() => window.__ORRERY__?.getSnapshot().cameraMode);
    if (modeAfterClick !== 'walk') {
      throw new Error(`Expected walk mode after clicking #btn-camera-mode, got ${modeAfterClick}`);
    }

    // Position walker inside the 16 fluted Doric basalt columns approaching Meridian Astrolabe
    await page.evaluate(() => window.__ORRERY__?.setWalkPose(-4.8, 5.2, 0.85, 0.14));
    await waitFrames(page, 24);
    const walkPromptVisible = await page.isVisible('#walk-prompt');
    if (!walkPromptVisible) {
      throw new Error('Expected #walk-prompt to become visible when walking near Meridian Astrolabe');
    }

    const movesBeforeE = Number(await page.textContent('#moves-value'));
    await page.keyboard.press('KeyE');
    await waitFrames(page, 14);
    const movesAfterE = Number(await page.textContent('#moves-value'));
    if (movesAfterE <= movesBeforeE) {
      throw new Error(`Expected KeyE walk interaction to rotate Astrolabe (moves ${movesBeforeE} -> ${movesAfterE})`);
    }
    const walkPixels = await inspectCanvasPixels(page);
    if (!walkPixels.ok || walkPixels.blueDominantPixels > 0) {
      throw new Error(`Walkaround WebGL pixel check failed: ${JSON.stringify(walkPixels)}`);
    }
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_walk.png') });

    // Toggle back to Astronomer Orbit with V key
    await page.keyboard.press('KeyV');
    await waitFrames(page, 10);
    const modeAfterV = await page.evaluate(() => window.__ORRERY__?.getSnapshot().cameraMode);
    if (modeAfterV !== 'orbit') {
      throw new Error(`Expected orbit mode after pressing KeyV, got ${modeAfterV}`);
    }

    // 4. Solve Trial I completely and verify Next Trial button appears on Victory modal
    await page.click('.pad-btn[data-pad="astrolabe"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('astrolabe'));
    await waitFrames(page, 12);
    await solveAstrolabeInUI(page);
    await waitFrames(page, 14);
    if ((await page.textContent('#conduit-count'))?.trim() !== '1/3') {
      throw new Error('Expected 1/3 conduits after solving Trial I Astrolabe');
    }

    await page.click('.pad-btn[data-pad="mirrors"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('mirrors'));
    await waitFrames(page, 12);
    await solveMirrorsInUI(page);
    await waitFrames(page, 16);
    if ((await page.textContent('#conduit-count'))?.trim() !== '2/3') {
      throw new Error('Expected 2/3 conduits after solving Trial I Mirrors');
    }

    await page.click('.pad-btn[data-pad="chimes"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('chimes'));
    await waitFrames(page, 10);
    await solveChimesInUI(page);
    if ((await page.textContent('#conduit-count'))?.trim() !== '3/3') {
      throw new Error('Expected 3/3 conduits after solving Trial I Chimes');
    }

    await page.click('.pad-btn[data-pad="apex"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('apex'));
    await waitFrames(page, 10);
    await page.click('[data-action="apex-ignite"]');
    await page.waitForSelector('#modal-victory[open]', { state: 'visible' });
    const nextBtnVisible = await page.isVisible('#btn-victory-next-trial');
    if (!nextBtnVisible) {
      throw new Error('Expected #btn-victory-next-trial to be visible after completing Trial I');
    }
    await page.click('#btn-victory-next-trial');
    await page.waitForSelector('#modal-victory:not([open])', { state: 'attached' });
    await waitFrames(page, 10);
    const trialAfterAdvance = await page.evaluate(() => window.__ORRERY__?.getSnapshot().currentTrial);
    if (trialAfterAdvance !== 2) {
      throw new Error(`Expected Trial 2 after clicking Advance, got ${trialAfterAdvance}`);
    }

    // 5. Jump to Trial V: Coupled Pinion Resonance + Dichroic Beam Splitter (2 simultaneous targets)
    await page.click('#trial-strip .trial-btn[data-trial="5"]');
    await waitFrames(page, 16);
    await page.click('.pad-btn[data-pad="astrolabe"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('astrolabe'));
    await waitFrames(page, 22);

    // Verify Outer ring rotates Middle ring via 1:-0.5 mechanical coupling
    const ringsBefore = await page.evaluate(() => window.__ORRERY__?.getSnapshot().astrolabe.rings);
    await page.click('[data-action="astrolabe-ring-0"]');
    await waitFrames(page, 16);
    const ringsAfter = await page.evaluate(() => window.__ORRERY__?.getSnapshot().astrolabe.rings);
    if (ringsAfter[0] === ringsBefore[0] || ringsAfter[1] === ringsBefore[1]) {
      throw new Error(`Expected 1:-0.5 gear coupling in Trial V: ${JSON.stringify({ ringsBefore, ringsAfter })}`);
    }
    await page.screenshot({ path: path.join(materialsDir, '02_astrolabe_puzzle.png') });

    // Capture Trial V Dual-Beam Splitter Courtyard
    await page.click('.pad-btn[data-pad="mirrors"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('mirrors'));
    await waitFrames(page, 14);
    await solveMirrorsInUI(page);
    await waitFrames(page, 28);
    const t5LitCollectors = await page.evaluate(
      () => window.__ORRERY__?.getSnapshot().mirrors.litCollectorIndices?.length ?? 0,
    );
    if (t5LitCollectors !== 2) {
      throw new Error(`Expected 2 lit collector prisms in Trial V splitter courtyard, got ${t5LitCollectors}`);
    }
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_trial5_splitter.png') });

    // 6. Jump to Trial VII: Grand Solstice Eclipse Finale (Crimson Eclipse + Triple Split Convergent Beams)
    await page.click('#trial-strip .trial-btn[data-trial="7"]');
    await waitFrames(page, 24);
    const stageTag7 = (await page.textContent('#trial-stage-tag'))?.trim();
    if (stageTag7 !== 'Crimson Eclipse') {
      throw new Error(`Expected Crimson Eclipse stage tag on Trial VII, got "${stageTag7}"`);
    }

    await page.click('.pad-btn[data-pad="mirrors"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('mirrors'));
    await waitFrames(page, 20);
    await solveMirrorsInUI(page);
    await waitFrames(page, 32);

    const t7LitCollectors = await page.evaluate(
      () => window.__ORRERY__?.getSnapshot().mirrors.litCollectorIndices?.length ?? 0,
    );
    if (t7LitCollectors !== 3) {
      throw new Error(`Expected 3 lit collector prisms in Trial VII tri-beam finale, got ${t7LitCollectors}`);
    }
    const eclipsePixels = await inspectCanvasPixels(page);
    if (!eclipsePixels.ok || eclipsePixels.blueDominantPixels > 0) {
      throw new Error(`Crimson Eclipse pixel check failed: ${JSON.stringify(eclipsePixels)}`);
    }
    await page.screenshot({ path: path.join(materialsDir, '03_mirror_beam.png') });
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_trial7_eclipse.png') });

    // Finish Trial VII Astrolabe (coupled 1:-0.5 & 1:+1) + Sun-Chimes + Apex Ignition -> Dawn Corona Breakthrough!
    await page.click('.pad-btn[data-pad="astrolabe"]');
    await waitFrames(page, 8);
    await solveAstrolabeInUI(page);

    await page.click('.pad-btn[data-pad="chimes"]');
    await waitFrames(page, 8);
    await solveChimesInUI(page);

    await page.click('.pad-btn[data-pad="apex"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('apex'));
    await waitFrames(page, 14);
    await page.click('[data-action="apex-ignite"]');
    await page.waitForSelector('#modal-victory[open]', { state: 'visible' });
    await waitFrames(page, 34);

    const victoryScore = (await page.textContent('#victory-score'))?.trim();
    const victoryStars = (await page.textContent('#victory-stars'))?.trim();
    if (!victoryScore || !victoryStars?.includes('★')) {
      throw new Error(`Victory modal missing score/stars: score=${victoryScore}, stars=${victoryStars}`);
    }
    await page.screenshot({ path: path.join(materialsDir, '04_solstice_victory.png') });

    // Enter Sandbox from Trial VII Victory to capture unobstructed Dawn Corona Breakthrough radiance!
    await page.click('#btn-victory-sandbox');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('overview'));
    await waitFrames(page, 36);
    const finalePixels = await inspectCanvasPixels(page);
    if (!finalePixels.ok || finalePixels.blueDominantPixels > 0) {
      throw new Error(`Dawn Corona Finale pixel check failed: ${JSON.stringify(finalePixels)}`);
    }
    await page.screenshot({ path: path.join(shotsDir, 'after_v4_trial7_finale.png') });

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        `Runtime errors detected! consoleErrors=${JSON.stringify(consoleErrors)} pageErrors=${JSON.stringify(pageErrors)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          titlePixels,
          walkPixels,
          eclipsePixels,
          finalePixels,
          walkPromptVerified: true,
          walkKeyEMoves: `${movesBeforeE}->${movesAfterE}`,
          coupledGearVerified: { trial: 5, ringsBefore, ringsAfter },
          trial5SplitCollectors: t5LitCollectors,
          trial7TriBeamCollectors: t7LitCollectors,
          victoryStars,
          victoryScore,
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
