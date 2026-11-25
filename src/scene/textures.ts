import * as THREE from 'three';

export interface SanctuaryTextureSet {
  obsidianFloorMap: THREE.Texture;
  obsidianFloorBump: THREE.Texture;
  obsidianFloorRoughness: THREE.Texture;
  bronzeMap: THREE.Texture;
  bronzeBump: THREE.Texture;
  bronzeRoughness: THREE.Texture;
  basaltMap: THREE.Texture;
  basaltBump: THREE.Texture;
  basaltRoughness: THREE.Texture;
  eclipseSkyMap: THREE.Texture;
  astrolabeDialMap: THREE.CanvasTexture;
  softGlowMap: THREE.CanvasTexture;
  ready: Promise<void>;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context.');
  }
  return [canvas, ctx];
}

function createAstrolabeDialTexture(): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);

  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#5B3418');
  bg.addColorStop(0.5, '#8C5327');
  bg.addColorStop(1, '#522E14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Precision vernier & astronomical degree tick engravings in molten gold
  for (let i = 0; i < 96; i += 1) {
    const x = (i / 96) * size;
    const major = i % 12 === 0;
    const mid = i % 4 === 0;
    ctx.strokeStyle = major ? '#F2B84B' : mid ? '#C98A3A' : 'rgba(242, 184, 75, 0.45)';
    ctx.lineWidth = major ? 3.5 : mid ? 2.0 : 1.1;
    const len = major ? size * 0.36 : mid ? size * 0.24 : size * 0.14;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, len);
    ctx.moveTo(x, size);
    ctx.lineTo(x, size - len);
    ctx.stroke();
  }

  // Central inlaid molten-gold meridian track
  ctx.fillStyle = '#F2B84B';
  ctx.fillRect(0, size * 0.47, size, size * 0.06);
  ctx.strokeStyle = '#1E140E';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, size * 0.45, size, size * 0.1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createSoftGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 1, cx, cx, cx);
  grad.addColorStop(0, 'rgba(255, 248, 224, 1)');
  grad.addColorStop(0.24, 'rgba(242, 184, 75, 0.88)');
  grad.addColorStop(0.58, 'rgba(212, 91, 34, 0.28)');
  grad.addColorStop(1, 'rgba(140, 53, 20, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildDerivedPbrMaps(
  img: HTMLImageElement,
  baseRoughness: number,
  glossRange: number,
): { bumpCanvas: HTMLCanvasElement; roughCanvas: HTMLCanvasElement } {
  const size = 512;
  const [bumpCanvas, ctxB] = makeCanvas(size, size);
  const [roughCanvas, ctxR] = makeCanvas(size, size);
  ctxB.drawImage(img, 0, 0, size, size);
  const srcData = ctxB.getImageData(0, 0, size, size);
  const bumpOut = ctxB.createImageData(size, size);
  const roughOut = ctxR.createImageData(size, size);

  const d = srcData.data;
  const b = bumpOut.data;
  const r = roughOut.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const bumpByte = Math.round(Math.min(255, Math.max(0, lum * 255)));
    b[i] = bumpByte;
    b[i + 1] = bumpByte;
    b[i + 2] = bumpByte;
    b[i + 3] = 255;

    // Physically inverted roughness: dark volcanic basalt stays matte, bright metallic gold inlays gleam cleanly
    const roughVal = Math.min(0.96, Math.max(0.18, baseRoughness - lum * glossRange));
    const roughByte = Math.round(roughVal * 255);
    r[i] = roughByte;
    r[i + 1] = roughByte;
    r[i + 2] = roughByte;
    r[i + 3] = 255;
  }
  ctxB.putImageData(bumpOut, 0, 0);
  ctxR.putImageData(roughOut, 0, 0);
  return { bumpCanvas, roughCanvas };
}

function loadPbrTriplet(
  loader: THREE.TextureLoader,
  url: string,
  repeatX: number,
  repeatY: number,
  baseRoughness: number,
  glossRange: number,
  pending: Promise<void>[],
): {
  map: THREE.Texture;
  bump: THREE.Texture;
  roughness: THREE.Texture;
} {
  let resolveLoaded!: () => void;
  pending.push(
    new Promise<void>((resolve) => {
      resolveLoaded = resolve;
    }),
  );

  const map = loader.load(
    url,
    () => {
      const { bumpCanvas, roughCanvas } = buildDerivedPbrMaps(
        map.image as HTMLImageElement,
        baseRoughness,
        glossRange,
      );
      bump.image = bumpCanvas;
      bump.needsUpdate = true;
      roughness.image = roughCanvas;
      roughness.needsUpdate = true;
      resolveLoaded();
    },
    undefined,
    () => {
      resolveLoaded();
    },
  );
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const bump = new THREE.Texture();
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(repeatX, repeatY);
  bump.colorSpace = THREE.NoColorSpace;
  bump.anisotropy = 4;

  const roughness = new THREE.Texture();
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(repeatX, repeatY);
  roughness.colorSpace = THREE.NoColorSpace;
  roughness.anisotropy = 4;

  return { map, bump, roughness };
}

export function createSanctuaryTextures(): SanctuaryTextureSet {
  const loader = new THREE.TextureLoader();
  const pending: Promise<void>[] = [];

  // Dark volcanic basalt stone stays rich matte (~0.92), inlaid gold lines gleam (~0.28)
  const floor = loadPbrTriplet(loader, './textures/obsidian_floor.jpg', 3.5, 3.5, 0.94, 0.64, pending);
  // Hammered bronze crevices ~0.58, burnished molten gold veins ~0.20
  const bronze = loadPbrTriplet(loader, './textures/hammered_bronze.jpg', 2, 2, 0.6, 0.4, pending);
  // Carved basalt column shafts ~0.92 matte, warm bronze relief dust ~0.52
  const basalt = loadPbrTriplet(loader, './textures/carved_basalt.jpg', 2, 2, 0.94, 0.42, pending);

  let resolveSky!: () => void;
  pending.push(
    new Promise<void>((resolve) => {
      resolveSky = resolve;
    }),
  );
  const eclipseSkyMap = loader.load(
    './textures/eclipse_sky.jpg',
    () => resolveSky(),
    undefined,
    () => resolveSky(),
  );
  eclipseSkyMap.wrapS = THREE.RepeatWrapping;
  eclipseSkyMap.wrapT = THREE.ClampToEdgeWrapping;
  eclipseSkyMap.colorSpace = THREE.SRGBColorSpace;
  eclipseSkyMap.minFilter = THREE.LinearMipmapLinearFilter;
  eclipseSkyMap.magFilter = THREE.LinearFilter;

  const astrolabeDialMap = createAstrolabeDialTexture();
  const softGlowMap = createSoftGlowTexture();

  const all = [
    floor.map,
    floor.bump,
    floor.roughness,
    bronze.map,
    bronze.bump,
    bronze.roughness,
    basalt.map,
    basalt.bump,
    basalt.roughness,
    eclipseSkyMap,
    astrolabeDialMap,
    softGlowMap,
  ];

  return {
    obsidianFloorMap: floor.map,
    obsidianFloorBump: floor.bump,
    obsidianFloorRoughness: floor.roughness,
    bronzeMap: bronze.map,
    bronzeBump: bronze.bump,
    bronzeRoughness: bronze.roughness,
    basaltMap: basalt.map,
    basaltBump: basalt.bump,
    basaltRoughness: basalt.roughness,
    eclipseSkyMap,
    astrolabeDialMap,
    softGlowMap,
    ready: Promise.all(pending).then(() => undefined),
    dispose: () => {
      for (const tex of all) {
        tex.dispose();
      }
    },
  };
}
