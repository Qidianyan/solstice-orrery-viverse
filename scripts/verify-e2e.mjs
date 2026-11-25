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
const materialsDir = path.resolve(projectRoot, '..', '..', 'materials');

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

async function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`dist/index.html not found at ${distDir}. Run npm run build first.`);
  }
  fs.mkdirSync(materialsDir, { recursive: true });

  const { server, port } = await startStaticServer(distDir);
  const url = `http://127.0.0.1:${port}/`;
  const executablePath = findCachedChromium();

  const consoleErrors = [];
  const pageErrors = [];

  const browser = await chromium.launch({
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

    const pixelStats = await inspectCanvasPixels(page);
    if (!pixelStats.ok) {
      throw new Error(`WebGL canvas appears blank: ${JSON.stringify(pixelStats)}`);
    }
    if (pixelStats.blueDominantPixels > 0) {
      throw new Error(`Palette violation: detected ${pixelStats.blueDominantPixels} blue-dominant pixels`);
    }

    // 1. Capture Title Observatory screenshot
    await page.screenshot({ path: path.join(materialsDir, '01_title_observatory.png') });

    // Start Daily Ritual (triggers vo_intro.mp3 inside direct click gesture)
    await page.click('#btn-start-daily');
    await page.waitForSelector('#modal-title:not([open])', { state: 'attached' });
    await waitFrames(page, 12);

    // 2. Navigate to Meridian Astrolabe & solve 2 rings for dramatic close-up
    await page.click('.pad-btn[data-pad="astrolabe"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('astrolabe'));
    await waitFrames(page, 20);

    for (let ringIdx = 0; ringIdx < 2; ringIdx += 1) {
      for (let guard = 0; guard < 10; guard += 1) {
        const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
        if (snap.astrolabe.rings[ringIdx] === 0) break;
        await page.click(`[data-action="astrolabe-ring-${ringIdx}"]`);
      }
    }
    await page.click('[data-action="astrolabe-ring-2"]');
    await waitFrames(page, 26);

    const movesAfterAstrolabe = Number(await page.textContent('#moves-value'));
    if (movesAfterAstrolabe <= 0) {
      throw new Error('Expected HUD moves counter to increment after clicking Astrolabe controls');
    }

    await page.screenshot({ path: path.join(materialsDir, '02_astrolabe_puzzle.png') });

    // Finish aligning Astrolabe Ring 2 -> verify Conduit 1/3
    for (let guard = 0; guard < 10; guard += 1) {
      const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
      if (snap.astrolabe.solved) break;
      await page.click('[data-action="astrolabe-ring-2"]');
    }
    await waitFrames(page, 12);
    const conduit1 = await page.textContent('#conduit-count');
    if (conduit1?.trim() !== '1/3') {
      throw new Error(`Expected 1/3 conduits after solving Astrolabe, got ${conduit1}`);
    }

    // 3. Navigate to Obsidian Mirror Courtyard & solve beam reflection to Collector Prism
    await page.click('.pad-btn[data-pad="mirrors"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('mirrors'));
    await waitFrames(page, 18);

    for (let mIdx = 0; mIdx < 3; mIdx += 1) {
      for (let guard = 0; guard < 6; guard += 1) {
        const snap = await page.evaluate(() => window.__ORRERY__?.getSnapshot());
        const node = snap.mirrors.mirrors[mIdx];
        if (node.orientation === node.solutionOrientation) break;
        await page.click(`[data-action="mirror-${mIdx}"]`);
      }
    }
    await waitFrames(page, 30);

    const conduit2 = await page.textContent('#conduit-count');
    if (conduit2?.trim() !== '2/3') {
      throw new Error(`Expected 2/3 conduits after solving Mirror Courtyard, got ${conduit2}`);
    }
    await page.screenshot({ path: path.join(materialsDir, '03_mirror_beam.png') });

    // 4. Navigate to Harmonic Sun-Chimes, trigger pulse & strike ascending order
    await page.click('.pad-btn[data-pad="chimes"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('chimes'));
    await waitFrames(page, 12);

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

    const conduit3 = await page.textContent('#conduit-count');
    if (conduit3?.trim() !== '3/3') {
      throw new Error(`Expected 3/3 conduits after solving Sun-Chimes, got ${conduit3}`);
    }

    // 5. Navigate to Solstice Apex Crown & ignite to trigger Victory Bloom + Star Rating + vo_victory.mp3
    await page.click('.pad-btn[data-pad="apex"]');
    await page.evaluate(() => window.__ORRERY__?.snapCameraToStation('apex'));
    await waitFrames(page, 12);

    await page.click('[data-action="apex-ignite"]');
    await page.waitForSelector('#modal-victory[open]', { state: 'visible' });
    await waitFrames(page, 36);

    const victoryScore = (await page.textContent('#victory-score'))?.trim();
    const victoryStars = (await page.textContent('#victory-stars'))?.trim();
    if (!victoryScore || !victoryStars?.includes('★')) {
      throw new Error(`Victory modal missing score/stars: score=${victoryScore}, stars=${victoryStars}`);
    }

    await page.screenshot({ path: path.join(materialsDir, '04_solstice_victory.png') });

    // Verify Free Explore Sandbox transition works cleanly
    await page.click('#btn-victory-sandbox');
    await waitFrames(page, 12);
    const finalPhase = await page.evaluate(() => window.__ORRERY__?.getSnapshot().phase);
    if (finalPhase !== 'sandbox') {
      throw new Error(`Expected sandbox phase after victory continue, got ${finalPhase}`);
    }

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        `Runtime errors detected! consoleErrors=${JSON.stringify(consoleErrors)} pageErrors=${JSON.stringify(pageErrors)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          canvasCheck: pixelStats,
          movesAfterAstrolabe,
          conduitsVerified: ['1/3', '2/3', '3/3'],
          victoryStars,
          victoryScore,
          finalPhase,
          consoleErrors: 0,
          pageErrors: 0,
          screenshots: [
            '01_title_observatory.png',
            '02_astrolabe_puzzle.png',
            '03_mirror_beam.png',
            '04_solstice_victory.png',
          ],
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
