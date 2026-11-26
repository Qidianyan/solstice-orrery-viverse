import * as THREE from 'three';
import type { PuzzleId, StationId } from '../game/types';
import { PALETTE } from './palette';
import type { SanctuaryTextureSet } from './textures';

export interface SteppingPadVisual {
  station: StationId;
  position: THREE.Vector3;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshStandardMaterial;
}

export interface ObservatoryEnvironment {
  group: THREE.Group;
  interactables: THREE.Object3D[];
  steppingPads: SteppingPadVisual[];
  update: (
    elapsedSec: number,
    deltaSec: number,
    activeStation: StationId,
    conduitStates: Record<PuzzleId, boolean>,
    apexBloom01: number,
  ) => void;
  dispose: () => void;
}

export const WING_POSITIONS = {
  apex: new THREE.Vector3(0, 0, 0),
  astrolabe: new THREE.Vector3(-10.5, 0, 1.5),
  mirrors: new THREE.Vector3(10.5, 0, 1.5),
  chimes: new THREE.Vector3(0, 0, -11.0),
} as const;

export const COLONNADE_PILLAR_COUNT = 16;
export const COLONNADE_RADIUS = 16.5;
export const SANCTUARY_WALK_MAX_RADIUS = 15.85;

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  kind: 'column' | 'monument';
}

export const COLONNADE_ANGLES: readonly number[] = Array.from(
  { length: COLONNADE_PILLAR_COUNT },
  (_, i) => (i / COLONNADE_PILLAR_COUNT) * Math.PI * 2 + Math.PI / COLONNADE_PILLAR_COUNT,
);

/**
 * Shared physics colliders for First-Person Sanctuary Walkaround mode:
 * all 16 outer fluted Doric basalt columns + major sanctuary monuments.
 */
export const SANCTUARY_COLLIDERS: readonly CircleCollider[] = [
  ...COLONNADE_ANGLES.map((a) => ({
    x: Math.cos(a) * COLONNADE_RADIUS,
    z: Math.sin(a) * COLONNADE_RADIUS,
    radius: 0.92,
    kind: 'column' as const,
  })),
  // Central Solstice Apex Dais pedestal
  { x: 0, z: 0, radius: 2.85, kind: 'monument' },
  // West Meridian Astrolabe cradle
  { x: -10.5, z: 1.5, radius: 2.35, kind: 'monument' },
  // North Sun-Chimes twin Doric gateway columns
  { x: -4.05, z: -11.0, radius: 0.95, kind: 'column' },
  { x: 4.05, z: -11.0, radius: 0.95, kind: 'column' },
];

export const STEPPING_PAD_SPECS: ReadonlyArray<{
  station: StationId;
  label: string;
  position: [number, number, number];
}> = [
  { station: 'overview', label: 'Overview Terrace Pad', position: [0, 0.04, 13.6] },
  { station: 'astrolabe', label: 'Meridian Astrolabe Pad', position: [-5.2, 0.04, 5.8] },
  { station: 'mirrors', label: 'Mirror Courtyard Pad', position: [10.5, 0.04, 9.3] },
  { station: 'chimes', label: 'Harmonic Sun-Chimes Pad', position: [0, 0.04, -4.5] },
  { station: 'apex', label: 'Solstice Apex Dais Pad', position: [0, 0.04, 5.9] },
];

/**
 * Generates a sculpted classical fluted Doric column shaft with entasis taper
 * and crisp carved vertical fluting channels.
 */
export function createFlutedDoricGeometry(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  fluteCount: number = 16,
  radialSegments: number = 64,
  heightSegments: number = 12,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    radialSegments,
    heightSegments,
    false,
  );
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.001) continue;
    const v = (y + height * 0.5) / height;
    const capFade = Math.sin(Math.min(1, Math.max(0, v)) * Math.PI);
    const entasis = 1 + capFade * 0.035;
    const theta = Math.atan2(z, x);
    const fluteCarve = 1 - 0.068 * Math.pow(Math.abs(Math.sin(theta * fluteCount * 0.5)), 0.7) * Math.min(1, capFade * 3.2);
    const scale = entasis * fluteCarve;
    pos.setX(i, x * scale);
    pos.setZ(i, z * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

interface ConduitVisual {
  puzzle: PuzzleId;
  coreMat: THREE.MeshStandardMaterial;
  beads: Array<{ mesh: THREE.Mesh; phase: number; start: THREE.Vector3; end: THREE.Vector3 }>;
  glowFactor: number;
}

export function createObservatoryEnvironment(
  textures: SanctuaryTextureSet,
): ObservatoryEnvironment {
  const group = new THREE.Group();
  const interactables: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // High-res PBR materials bound to bespoke gpt-image / AI textures
  const obsidianFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8cec2,
      map: textures.obsidianFloorMap,
      bumpMap: textures.obsidianFloorBump,
      bumpScale: 0.075,
      roughnessMap: textures.obsidianFloorRoughness,
      roughness: 1.0,
      metalness: 0.14,
    }),
  );

  const carvedBasaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2b5a8,
      map: textures.basaltMap,
      bumpMap: textures.basaltBump,
      bumpScale: 0.08,
      roughnessMap: textures.basaltRoughness,
      roughness: 1.0,
      metalness: 0.12,
    }),
  );

  const rawCliffBasaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.obsidianMid,
      map: textures.basaltMap,
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true,
    }),
  );

  const hammeredBronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xebb972,
      map: textures.bronzeMap,
      bumpMap: textures.bronzeBump,
      bumpScale: 0.045,
      roughnessMap: textures.bronzeRoughness,
      roughness: 0.3,
      metalness: 0.9,
    }),
  );

  const darkBronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.bronzeDark,
      map: textures.bronzeMap,
      bumpMap: textures.bronzeBump,
      bumpScale: 0.035,
      roughness: 0.42,
      metalness: 0.82,
    }),
  );

  const quartzInlayMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.quartzWhite,
      roughness: 0.38,
      metalness: 0.12,
    }),
  );

  const moltenGoldLineMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.moltenGold,
      emissive: PALETTE.moltenGold,
      emissiveIntensity: 1.55,
      roughness: 0.2,
      metalness: 0.85,
    }),
  );

  // 1. Multi-Tiered Floating Obsidian Sanctuary Terrace & Sculpted Volcanic Cliff Base
  const mainDeckGeo = trackGeo(new THREE.CylinderGeometry(18.0, 17.3, 1.5, 64));
  const mainDeck = new THREE.Mesh(mainDeckGeo, [carvedBasaltMat, obsidianFloorMat, rawCliffBasaltMat]);
  mainDeck.position.y = -0.75;
  mainDeck.receiveShadow = true;
  group.add(mainDeck);

  // Lower beveled bronze & carved basalt sanctuary skirt
  const lowerSkirtGeo = trackGeo(new THREE.CylinderGeometry(17.2, 14.8, 1.8, 32));
  const lowerSkirt = new THREE.Mesh(lowerSkirtGeo, carvedBasaltMat);
  lowerSkirt.position.y = -2.35;
  group.add(lowerSkirt);

  // Outer hammered-bronze sanctuary rim cornice + glowing molten hairline ring
  const outerCorniceGeo = trackGeo(new THREE.TorusGeometry(18.02, 0.22, 14, 96));
  outerCorniceGeo.rotateX(Math.PI / 2);
  const outerCornice = new THREE.Mesh(outerCorniceGeo, hammeredBronzeMat);
  outerCornice.position.y = 0.04;
  group.add(outerCornice);

  const innerGoldInlayGeo = trackGeo(new THREE.TorusGeometry(15.2, 0.045, 8, 96));
  innerGoldInlayGeo.rotateX(Math.PI / 2);
  const innerGoldInlay = new THREE.Mesh(innerGoldInlayGeo, moltenGoldLineMat);
  innerGoldInlay.position.y = 0.03;
  group.add(innerGoldInlay);

  const midCompassRingGeo = trackGeo(new THREE.TorusGeometry(7.6, 0.055, 8, 72));
  midCompassRingGeo.rotateX(Math.PI / 2);
  const midCompassRing = new THREE.Mesh(midCompassRingGeo, hammeredBronzeMat);
  midCompassRing.position.y = 0.03;
  group.add(midCompassRing);

  // Sculpted jagged volcanic cliff spire root hanging over the gorge
  const cliffUnderGeo = trackGeo(new THREE.ConeGeometry(15.2, 13.5, 14));
  cliffUnderGeo.rotateX(Math.PI);
  const cliffUnder = new THREE.Mesh(cliffUnderGeo, rawCliffBasaltMat);
  cliffUnder.position.y = -9.6;
  group.add(cliffUnder);

  const buttressGeo = trackGeo(new THREE.CylinderGeometry(1.15, 0.28, 7.6, 6));
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const buttress = new THREE.Mesh(buttressGeo, rawCliffBasaltMat);
    buttress.position.set(Math.cos(a) * 14.9, -4.6 - (i % 3) * 0.7, Math.sin(a) * 14.9);
    buttress.rotation.z = Math.cos(a) * 0.14;
    buttress.rotation.x = -Math.sin(a) * 0.14;
    group.add(buttress);
  }

  // 2. Four-Tiered Stepped Obsidian & Gilded-Bronze Central Solstice Dais
  const daisSteps = [
    { rTop: 4.65, rBot: 4.95, h: 0.18, y: 0.09 },
    { rTop: 3.92, rBot: 4.18, h: 0.18, y: 0.27 },
    { rTop: 3.22, rBot: 3.45, h: 0.18, y: 0.45 },
    { rTop: 2.58, rBot: 2.76, h: 0.18, y: 0.63 },
  ];
  for (let idx = 0; idx < daisSteps.length; idx += 1) {
    const step = daisSteps[idx];
    const geo = trackGeo(new THREE.CylinderGeometry(step.rTop, step.rBot, step.h, 16));
    const mesh = new THREE.Mesh(geo, idx % 2 === 0 ? carvedBasaltMat : obsidianFloorMat);
    mesh.position.y = step.y;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);

    const trimGeo = trackGeo(new THREE.TorusGeometry(step.rTop, 0.048, 10, 48));
    trimGeo.rotateX(Math.PI / 2);
    const trim = new THREE.Mesh(trimGeo, idx === daisSteps.length - 1 ? moltenGoldLineMat : hammeredBronzeMat);
    trim.position.y = step.y + step.h * 0.5;
    group.add(trim);
  }

  // 3. Stepped Sculpted Wing Plinths (West Astrolabe, East Mirror Courtyard, North Chimes)
  // West Astrolabe Octagonal Two-Tier Plinth
  for (let tier = 0; tier < 2; tier += 1) {
    const r = 4.65 - tier * 0.55;
    const h = 0.16;
    const pGeo = trackGeo(new THREE.CylinderGeometry(r, r + 0.2, h, 16));
    const pMesh = new THREE.Mesh(pGeo, tier === 0 ? carvedBasaltMat : obsidianFloorMat);
    pMesh.position.set(WING_POSITIONS.astrolabe.x, 0.08 + tier * 0.16, WING_POSITIONS.astrolabe.z);
    pMesh.receiveShadow = true;
    group.add(pMesh);

    const ringGeo = trackGeo(new THREE.TorusGeometry(r, 0.045, 8, 48));
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, hammeredBronzeMat);
    ring.position.set(WING_POSITIONS.astrolabe.x, 0.16 + tier * 0.16, WING_POSITIONS.astrolabe.z);
    group.add(ring);
  }

  // East Mirror Courtyard Sunken Obsidian Sanctuary Deck + Carved Parapets + Corner Finials
  const eastFloorGeo = trackGeo(new THREE.BoxGeometry(9.6, 0.24, 9.2));
  const eastFloor = new THREE.Mesh(eastFloorGeo, obsidianFloorMat);
  eastFloor.position.set(WING_POSITIONS.mirrors.x, 0.12, WING_POSITIONS.mirrors.z);
  eastFloor.receiveShadow = true;
  group.add(eastFloor);

  const curbSpecs: Array<[number, number, number, number]> = [
    [0, -4.55, 9.6, 0.34],
    [0, 4.55, 9.6, 0.34],
    [-4.75, 0, 0.34, 9.0],
    [4.75, 0, 0.34, 9.0],
  ];
  for (const [cx, cz, w, d] of curbSpecs) {
    const cGeo = trackGeo(new THREE.BoxGeometry(w, 0.42, d));
    const curb = new THREE.Mesh(cGeo, carvedBasaltMat);
    curb.position.set(WING_POSITIONS.mirrors.x + cx, 0.34, WING_POSITIONS.mirrors.z + cz);
    curb.castShadow = true;
    curb.receiveShadow = true;
    group.add(curb);

    const capGeo = trackGeo(new THREE.BoxGeometry(w + 0.06, 0.06, d + 0.06));
    const cap = new THREE.Mesh(capGeo, hammeredBronzeMat);
    cap.position.set(WING_POSITIONS.mirrors.x + cx, 0.56, WING_POSITIONS.mirrors.z + cz);
    group.add(cap);
  }

  const cornerFinialBaseGeo = trackGeo(new THREE.BoxGeometry(0.56, 0.85, 0.56));
  const cornerFinialTopGeo = trackGeo(new THREE.OctahedronGeometry(0.2, 0));
  for (const sx of [-4.72, 4.72]) {
    for (const sz of [-4.52, 4.52]) {
      const fBase = new THREE.Mesh(cornerFinialBaseGeo, carvedBasaltMat);
      fBase.position.set(WING_POSITIONS.mirrors.x + sx, 0.65, WING_POSITIONS.mirrors.z + sz);
      fBase.castShadow = true;
      group.add(fBase);
      const fOrb = new THREE.Mesh(cornerFinialTopGeo, moltenGoldLineMat);
      fOrb.position.set(WING_POSITIONS.mirrors.x + sx, 1.24, WING_POSITIONS.mirrors.z + sz);
      group.add(fOrb);
    }
  }

  // North Sun-Chimes Two-Tier Sanctuary Plinth
  for (let tier = 0; tier < 2; tier += 1) {
    const r = 5.1 - tier * 0.48;
    const pGeo = trackGeo(new THREE.CylinderGeometry(r, r + 0.22, 0.16, 16));
    const pMesh = new THREE.Mesh(pGeo, tier === 0 ? carvedBasaltMat : obsidianFloorMat);
    pMesh.position.set(WING_POSITIONS.chimes.x, 0.08 + tier * 0.16, WING_POSITIONS.chimes.z);
    pMesh.receiveShadow = true;
    group.add(pMesh);
  }

  // 4. Fluted Doric Basalt Colonnade with Hammered-Bronze Capitals, Braziers & Floating Obsidian Arches
  const lanternFlames: Array<{ mesh: THREE.Mesh; baseY: number; phase: number }> = [];
  const flameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.solarCore,
      emissive: PALETTE.moltenGold,
      emissiveIntensity: 3.1,
      roughness: 0.12,
    }),
  );

  const flutedColGeo = trackGeo(createFlutedDoricGeometry(0.35, 0.43, 4.6, 16, 48, 10));
  const plinthBoxGeo = trackGeo(new THREE.BoxGeometry(1.16, 0.36, 1.16));
  const torusBaseGeo = trackGeo(new THREE.TorusGeometry(0.45, 0.08, 10, 24));
  torusBaseGeo.rotateX(Math.PI / 2);
  const echinusGeo = trackGeo(new THREE.CylinderGeometry(0.56, 0.36, 0.28, 16));
  const abacusGeo = trackGeo(new THREE.BoxGeometry(1.18, 0.22, 1.18));
  const brazierBowlGeo = trackGeo(new THREE.CylinderGeometry(0.48, 0.24, 0.38, 12));
  const brazierRimGeo = trackGeo(new THREE.TorusGeometry(0.48, 0.05, 8, 24));
  brazierRimGeo.rotateX(Math.PI / 2);
  const flameGeo = trackGeo(new THREE.OctahedronGeometry(0.24, 1));

  // 16 symmetrically spaced fluted Doric basalt columns around the circular sanctuary colonnade
  for (let i = 0; i < COLONNADE_ANGLES.length; i += 1) {
    const a = COLONNADE_ANGLES[i];
    const r = COLONNADE_RADIUS;
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const tall = i % 2 === 0;

    if (tall) {
      const colGroup = new THREE.Group();
      colGroup.position.set(px, 0, pz);

      const plinth = new THREE.Mesh(plinthBoxGeo, carvedBasaltMat);
      plinth.position.y = 0.18;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      colGroup.add(plinth);

      const baseRing = new THREE.Mesh(torusBaseGeo, hammeredBronzeMat);
      baseRing.position.y = 0.4;
      colGroup.add(baseRing);

      const shaft = new THREE.Mesh(flutedColGeo, carvedBasaltMat);
      shaft.position.y = 2.72;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      colGroup.add(shaft);

      const neckRing = new THREE.Mesh(torusBaseGeo, hammeredBronzeMat);
      neckRing.scale.setScalar(0.84);
      neckRing.position.y = 4.95;
      colGroup.add(neckRing);

      const echinus = new THREE.Mesh(echinusGeo, hammeredBronzeMat);
      echinus.position.y = 5.14;
      colGroup.add(echinus);

      const abacus = new THREE.Mesh(abacusGeo, carvedBasaltMat);
      abacus.position.y = 5.38;
      abacus.castShadow = true;
      colGroup.add(abacus);

      const bowl = new THREE.Mesh(brazierBowlGeo, darkBronzeMat);
      bowl.position.y = 5.68;
      colGroup.add(bowl);

      const rim = new THREE.Mesh(brazierRimGeo, hammeredBronzeMat);
      rim.position.y = 5.86;
      colGroup.add(rim);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = 6.18;
      colGroup.add(flame);
      lanternFlames.push({ mesh: flame, baseY: 6.18, phase: i * 1.15 });

      group.add(colGroup);
    } else {
      const pedGroup = new THREE.Group();
      pedGroup.position.set(px, 0, pz);

      const basePlinth = new THREE.Mesh(plinthBoxGeo, carvedBasaltMat);
      basePlinth.scale.set(0.88, 0.85, 0.88);
      basePlinth.position.y = 0.15;
      pedGroup.add(basePlinth);

      const miniShaft = new THREE.Mesh(
        trackGeo(createFlutedDoricGeometry(0.36, 0.44, 1.35, 12, 36, 6)),
        carvedBasaltMat,
      );
      miniShaft.position.y = 0.96;
      miniShaft.castShadow = true;
      pedGroup.add(miniShaft);

      const bowl = new THREE.Mesh(brazierBowlGeo, hammeredBronzeMat);
      bowl.position.y = 1.82;
      pedGroup.add(bowl);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = 2.18;
      pedGroup.add(flame);
      lanternFlames.push({ mesh: flame, baseY: 2.18, phase: i * 0.82 + 0.5 });

      group.add(pedGroup);
    }
  }

  // Monumental Floating Obsidian & Hammered-Bronze Celestial Arches overhead
  const archGroup = new THREE.Group();
  archGroup.position.set(0, 0.4, -0.8);
  archGroup.rotation.y = Math.PI * 0.14;

  const obsidianArchMain = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(17.1, 0.42, 10, 72, Math.PI)),
    carvedBasaltMat,
  );
  obsidianArchMain.castShadow = true;
  archGroup.add(obsidianArchMain);

  const goldArchSpine = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(16.52, 0.11, 10, 72, Math.PI)),
    moltenGoldLineMat,
  );
  archGroup.add(goldArchSpine);

  const bronzeCounterArch = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(15.6, 0.18, 12, 64, Math.PI)),
    hammeredBronzeMat,
  );
  bronzeCounterArch.rotation.y = -0.32;
  archGroup.add(bronzeCounterArch);

  // Floating keystone monoliths suspended along the celestial arch
  const keystoneGeo = trackGeo(new THREE.OctahedronGeometry(0.45, 0));
  for (let k = 1; k <= 5; k += 1) {
    const ka = (k / 6) * Math.PI;
    const ks = new THREE.Mesh(keystoneGeo, k === 3 ? moltenGoldLineMat : hammeredBronzeMat);
    ks.position.set(Math.cos(ka) * 16.52, Math.sin(ka) * 16.52, 0);
    ks.scale.set(0.8, 1.5, 0.8);
    archGroup.add(ks);
  }
  group.add(archGroup);

  // 5. Three Sculpted Molten-Gold Floor Conduit Channels converging on Central Dais
  const conduitSpecs: Array<{
    puzzle: PuzzleId;
    start: THREE.Vector3;
    end: THREE.Vector3;
  }> = [
    {
      puzzle: 'astrolabe',
      start: new THREE.Vector3(WING_POSITIONS.astrolabe.x + 4.3, 0.04, WING_POSITIONS.astrolabe.z - 0.35),
      end: new THREE.Vector3(-4.55, 0.06, 0.45),
    },
    {
      puzzle: 'mirrors',
      start: new THREE.Vector3(WING_POSITIONS.mirrors.x - 4.75, 0.04, WING_POSITIONS.mirrors.z - 0.35),
      end: new THREE.Vector3(4.55, 0.06, 0.45),
    },
    {
      puzzle: 'chimes',
      start: new THREE.Vector3(WING_POSITIONS.chimes.x, 0.04, WING_POSITIONS.chimes.z + 4.7),
      end: new THREE.Vector3(0, 0.06, -4.55),
    },
  ];

  const conduits: ConduitVisual[] = [];
  const beadGeo = trackGeo(new THREE.OctahedronGeometry(0.16, 0));

  for (const spec of conduitSpecs) {
    const dir = new THREE.Vector3().subVectors(spec.end, spec.start);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(spec.start, spec.end).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir.clone().normalize(),
    );

    const troughGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.1, len));
    const trough = new THREE.Mesh(troughGeo, darkBronzeMat);
    trough.position.copy(mid);
    trough.position.y -= 0.01;
    trough.quaternion.copy(quat);
    group.add(trough);

    const coreMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.moltenGold,
        emissive: PALETTE.solarEmber,
        emissiveIntensity: 0.28,
        roughness: 0.2,
        metalness: 0.78,
      }),
    );
    const coreGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.13, len));
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.copy(mid);
    coreMesh.position.y += 0.025;
    coreMesh.quaternion.copy(quat);
    group.add(coreMesh);

    const beads: ConduitVisual['beads'] = [];
    for (let b = 0; b < 5; b += 1) {
      const beadMesh = new THREE.Mesh(beadGeo, coreMat);
      beadMesh.visible = false;
      group.add(beadMesh);
      beads.push({ mesh: beadMesh, phase: b / 5, start: spec.start, end: spec.end });
    }

    conduits.push({ puzzle: spec.puzzle, coreMat, beads, glowFactor: 0 });
  }

  // 6. Click-to-Teleport Obsidian & Molten-Gold Stepping Pads
  const steppingPads: SteppingPadVisual[] = [];
  const padStoneGeo = trackGeo(new THREE.CylinderGeometry(0.95, 1.12, 0.12, 16));
  const padInlayGeo = trackGeo(new THREE.CylinderGeometry(0.58, 0.58, 0.13, 16));
  const padRingGeo = trackGeo(new THREE.TorusGeometry(0.92, 0.065, 10, 32));
  padRingGeo.rotateX(Math.PI / 2);

  for (const spec of STEPPING_PAD_SPECS) {
    const padGroup = new THREE.Group();
    padGroup.position.set(spec.position[0], spec.position[1], spec.position[2]);

    const interactData = {
      kind: 'pad' as const,
      station: spec.station,
      label: `Glide to ${spec.label}`,
    };

    const stone = new THREE.Mesh(padStoneGeo, carvedBasaltMat);
    stone.receiveShadow = true;
    stone.userData.interactable = interactData;
    padGroup.add(stone);
    interactables.push(stone);

    const inlay = new THREE.Mesh(padInlayGeo, quartzInlayMat);
    inlay.userData.interactable = interactData;
    padGroup.add(inlay);
    interactables.push(inlay);

    const ringMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.moltenGold,
        emissive: PALETTE.moltenGold,
        emissiveIntensity: 1.05,
        roughness: 0.22,
        metalness: 0.9,
      }),
    );
    const ringMesh = new THREE.Mesh(padRingGeo, ringMat);
    ringMesh.position.y = 0.07;
    ringMesh.userData.interactable = interactData;
    padGroup.add(ringMesh);
    interactables.push(ringMesh);

    group.add(padGroup);
    steppingPads.push({
      station: spec.station,
      position: new THREE.Vector3(spec.position[0], spec.position[1], spec.position[2]),
      ringMesh,
      ringMat,
    });
  }

  // 7. Rising Golden Corona Dust & Volcanic Ember Motes (Bloom-ready!)
  const dustCount = 560;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    const angle = (i * 2.399963) % (Math.PI * 2);
    const radius = 1.4 + ((i * 73) % 100) * 0.172;
    const height = 0.4 + ((i * 37) % 100) * 0.145;
    dustPositions[i * 3] = Math.cos(angle) * radius;
    dustPositions[i * 3 + 1] = height;
    dustPositions[i * 3 + 2] = Math.sin(angle) * radius;

    dustSeeds[i * 3] = angle;
    dustSeeds[i * 3 + 1] = radius;
    dustSeeds[i * 3 + 2] = 0.24 + ((i * 19) % 10) * 0.045;
  }

  const dustGeo = trackGeo(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = trackMat(
    new THREE.PointsMaterial({
      color: PALETTE.moltenGold,
      map: textures.softGlowMap,
      size: 0.42,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  group.add(dustPoints);

  const unlitEmissive = new THREE.Color(PALETTE.solarEmber);
  const litEmissive = new THREE.Color(PALETTE.moltenGold);
  const scratchCol = new THREE.Color();

  return {
    group,
    interactables,
    steppingPads,
    update: (elapsedSec, deltaSec, activeStation, conduitStates, apexBloom01) => {
      for (const f of lanternFlames) {
        const sway = Math.sin(elapsedSec * 2.4 + f.phase);
        f.mesh.position.y = f.baseY + sway * 0.05;
        f.mesh.rotation.y = elapsedSec * 0.9 + f.phase;
        const sc = 0.94 + sway * 0.12;
        f.mesh.scale.set(sc, 1.2 + sway * 0.15, sc);
      }

      for (const c of conduits) {
        const target = conduitStates[c.puzzle] ? 1 : 0;
        c.glowFactor = THREE.MathUtils.lerp(c.glowFactor, target, Math.min(1, deltaSec * 4));
        scratchCol.copy(unlitEmissive).lerp(litEmissive, c.glowFactor);
        c.coreMat.emissive.copy(scratchCol);
        c.coreMat.emissiveIntensity = THREE.MathUtils.lerp(
          0.25,
          3.1 + Math.sin(elapsedSec * 2.2) * 0.35,
          c.glowFactor,
        );

        for (const bead of c.beads) {
          bead.mesh.visible = c.glowFactor > 0.25;
          if (bead.mesh.visible) {
            const t = (bead.phase + elapsedSec * 0.34) % 1;
            bead.mesh.position.lerpVectors(bead.start, bead.end, t);
            bead.mesh.position.y += 0.16;
            bead.mesh.rotation.y = elapsedSec * 2.2;
          }
        }
      }

      for (const pad of steppingPads) {
        const isCurrent = pad.station === activeStation;
        const pulse = 0.5 + 0.5 * Math.sin(elapsedSec * 2.0);
        pad.ringMat.emissiveIntensity = isCurrent ? 2.2 + pulse * 0.4 : 0.78 + pulse * 0.25;
        const scale = isCurrent ? 1.05 : 1.0;
        pad.ringMesh.scale.set(scale, 1, scale);
      }

      const posAttr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const riseSpeed = 0.28 + apexBloom01 * 1.65;
      const swirlSpeed = 0.055 + apexBloom01 * 0.36;
      for (let i = 0; i < dustCount; i += 1) {
        const baseAngle = dustSeeds[i * 3];
        const baseRadius = dustSeeds[i * 3 + 1];
        const speedMul = dustSeeds[i * 3 + 2];
        const angle = baseAngle + elapsedSec * swirlSpeed * speedMul;
        const pullIn = 1 - apexBloom01 * 0.24;
        arr[i * 3] = Math.cos(angle) * baseRadius * pullIn;
        arr[i * 3 + 2] = Math.sin(angle) * baseRadius * pullIn;
        let y = arr[i * 3 + 1] + deltaSec * riseSpeed * speedMul;
        if (y > 15.2) y = 0.4;
        arr[i * 3 + 1] = y;
      }
      posAttr.needsUpdate = true;
      dustMat.opacity = 0.72 + apexBloom01 * 0.26;
      dustMat.size = 0.4 + apexBloom01 * 0.25;
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
