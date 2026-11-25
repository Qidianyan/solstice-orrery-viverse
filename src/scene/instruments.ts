import * as THREE from 'three';
import type { GameSnapshot } from '../game/types';
import { orientationToYaw } from '../game/mirrors';
import { ASTROLABE_STEPS } from '../game/puzzles';
import { PALETTE } from './palette';
import type { SanctuaryTextureSet } from './textures';
import { createFlutedDoricGeometry, WING_POSITIONS } from './environment';

export interface ObservatoryInstruments {
  group: THREE.Group;
  interactables: THREE.Object3D[];
  triggerChimePulse: (slotOrder: number[]) => void;
  triggerChimeStrikeAnim: (slotIndex: number, correct: boolean) => void;
  syncState: (snapshot: GameSnapshot) => void;
  update: (elapsedSec: number, deltaSec: number) => void;
  getApexBloomFactor: () => number;
  dispose: () => void;
}

const MIRROR_BEAM_Y = 1.72;

/**
 * Generates an acoustic flared temple bell profile via LatheGeometry.
 */
function createSculptedTempleBellGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [
    new THREE.Vector2(0.02, 0.5),
    new THREE.Vector2(0.18, 0.49),
    new THREE.Vector2(0.28, 0.42),
    new THREE.Vector2(0.32, 0.25),
    new THREE.Vector2(0.35, 0.02),
    new THREE.Vector2(0.39, -0.22),
    new THREE.Vector2(0.47, -0.4),
    new THREE.Vector2(0.52, -0.48),
    new THREE.Vector2(0.48, -0.5),
    new THREE.Vector2(0.41, -0.44),
  ];
  const geo = new THREE.LatheGeometry(points, 32);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a curved sculpted bronze lotus blade for the Solstice Apex Crown.
 */
function createLotusPetalGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.34, 0.45, 0.24, 1.18);
  shape.quadraticCurveTo(0.08, 1.56, 0, 1.82);
  shape.quadraticCurveTo(-0.08, 1.56, -0.24, 1.18);
  shape.quadraticCurveTo(-0.34, 0.45, 0, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.translate(0, 0, -0.045);

  // Subtle organic curve along the blade length
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const bend = Math.pow(Math.max(0, y) / 1.82, 1.8) * 0.28;
    pos.setZ(i, z - bend);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createObservatoryInstruments(
  textures: SanctuaryTextureSet,
  onPulseBellAudio: (rank: number) => void,
): ObservatoryInstruments {
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

  const carvedBasaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2b5a8,
      map: textures.basaltMap,
      bumpMap: textures.basaltBump,
      bumpScale: 0.07,
      roughnessMap: textures.basaltRoughness,
      roughness: 0.74,
      metalness: 0.16,
    }),
  );

  const bronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf0be75,
      map: textures.bronzeMap,
      bumpMap: textures.bronzeBump,
      bumpScale: 0.045,
      roughnessMap: textures.bronzeRoughness,
      roughness: 0.26,
      metalness: 0.92,
    }),
  );

  const darkBronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.bronzeDark,
      map: textures.bronzeMap,
      bumpMap: textures.bronzeBump,
      bumpScale: 0.04,
      roughness: 0.38,
      metalness: 0.84,
    }),
  );

  const dialBronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe8b468,
      map: textures.astrolabeDialMap,
      bumpMap: textures.bronzeBump,
      bumpScale: 0.03,
      roughness: 0.28,
      metalness: 0.9,
    }),
  );

  const quartzMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.quartzWhite,
      roughness: 0.3,
      metalness: 0.14,
    }),
  );

  // =========================================================================
  // 1. WEST WING: PRECISION GEARED MERIDIAN ASTROLABE
  // =========================================================================
  const astrolabeRoot = new THREE.Group();
  astrolabeRoot.position.copy(WING_POSITIONS.astrolabe);
  astrolabeRoot.position.y = 0.32;
  astrolabeRoot.rotation.y = Math.atan2(-5.2 - WING_POSITIONS.astrolabe.x, 5.8 - WING_POSITIONS.astrolabe.z);
  group.add(astrolabeRoot);

  // Multi-tiered carved basalt pedestal with gilded collar & bronze buttress cradle
  const cradleTier1 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.75, 2.05, 0.45, 12)), carvedBasaltMat);
  cradleTier1.position.y = 0.22;
  cradleTier1.castShadow = true;
  cradleTier1.receiveShadow = true;
  astrolabeRoot.add(cradleTier1);

  const cradleTier2 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.22, 1.56, 0.72, 12)), darkBronzeMat);
  cradleTier2.position.y = 0.78;
  cradleTier2.castShadow = true;
  astrolabeRoot.add(cradleTier2);

  const cradleCollar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.28, 0.09, 10, 32)), bronzeMat);
  cradleCollar.rotation.x = Math.PI / 2;
  cradleCollar.position.y = 1.12;
  astrolabeRoot.add(cradleCollar);

  // Twin curved bronze yoke cradle holding the astrolabe rings
  const cradleArc = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.74, 0.15, 14, 56, Math.PI)), darkBronzeMat);
  cradleArc.position.y = 3.2;
  cradleArc.rotation.z = Math.PI;
  cradleArc.castShadow = true;
  astrolabeRoot.add(cradleArc);

  const cradleTrim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.88, 0.05, 10, 56, Math.PI)), bronzeMat);
  cradleTrim.position.y = 3.2;
  cradleTrim.rotation.z = Math.PI;
  astrolabeRoot.add(cradleTrim);

  // Sculpted Zenith Spire & Alignment Pawl at 12 o'clock
  const zenithArch = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.45, 0.055, 8, 24)), bronzeMat);
  zenithArch.position.set(0, 6.26, 0);
  astrolabeRoot.add(zenithArch);

  const zenithNeedle = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.18, 0.72, 6)), bronzeMat);
  zenithNeedle.position.set(0, 5.98, 0);
  zenithNeedle.rotation.z = Math.PI;
  astrolabeRoot.add(zenithNeedle);

  const zenithGemMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.solarCore,
      emissive: PALETTE.moltenGold,
      emissiveIntensity: 2.4,
      roughness: 0.12,
      metalness: 0.35,
    }),
  );
  const zenithGem = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.26, 0)), zenithGemMat);
  zenithGem.position.set(0, 6.3, 0);
  astrolabeRoot.add(zenithGem);

  const ringSpecs = [
    { radius: 2.38, tube: 0.15, gearTeeth: 24, label: 'Outer Meridian Ring (Click to Rotate)' },
    { radius: 1.76, tube: 0.135, gearTeeth: 20, label: 'Middle Equinox Ring (Click to Rotate)' },
    { radius: 1.16, tube: 0.12, gearTeeth: 16, label: 'Inner Solar Ring (Click to Rotate)' },
  ];

  const gearToothGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.19, 0.12));
  const astrolabeRings: Array<{
    pivot: THREE.Group;
    apertureMat: THREE.MeshStandardMaterial;
    targetAngle: number;
    currentAngle: number;
    aligned: boolean;
  }> = [];

  for (let i = 0; i < ringSpecs.length; i += 1) {
    const spec = ringSpecs[i];
    const pivot = new THREE.Group();
    pivot.position.set(0, 3.2, 0);
    astrolabeRoot.add(pivot);

    const interactData = {
      kind: 'astrolabe-ring' as const,
      ringIndex: i,
      label: spec.label,
    };

    const torus = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(spec.radius, spec.tube, 18, 64)), dialBronzeMat);
    torus.castShadow = true;
    torus.userData.interactable = interactData;
    pivot.add(torus);
    interactables.push(torus);

    // Fine inner decorative gilded bevel wire
    const innerWire = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(spec.radius - spec.tube * 0.92, 0.032, 8, 48)),
      bronzeMat,
    );
    innerWire.userData.interactable = interactData;
    pivot.add(innerWire);

    // Sculpted interlocking clockwork gear teeth around ring perimeter
    for (let g = 0; g < spec.gearTeeth; g += 1) {
      const a = (g / spec.gearTeeth) * Math.PI * 2;
      if (Math.abs(a) < 0.16 || Math.abs(a - Math.PI * 2) < 0.16) continue;
      const tooth = new THREE.Mesh(gearToothGeo, g % 2 === 0 ? bronzeMat : darkBronzeMat);
      const rOuter = spec.radius + spec.tube + 0.05;
      tooth.position.set(Math.sin(a) * rOuter, Math.cos(a) * rOuter, 0);
      tooth.rotation.z = -a;
      tooth.userData.interactable = interactData;
      pivot.add(tooth);
    }

    // Ornate sunburst aperture housing at 12 o'clock (+Y)
    const apertureMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.solarCore,
        emissive: PALETTE.solarEmber,
        emissiveIntensity: 1.5,
        roughness: 0.14,
        metalness: 0.3,
      }),
    );
    const crestFrame = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.32, 0)), bronzeMat);
    crestFrame.scale.set(1.15, 1.32, 0.72);
    crestFrame.position.set(0, spec.radius, 0);
    crestFrame.userData.interactable = interactData;
    pivot.add(crestFrame);
    interactables.push(crestFrame);

    const apertureOrb = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.21, 0)), apertureMat);
    apertureOrb.position.set(0, spec.radius, 0.12);
    apertureOrb.userData.interactable = interactData;
    pivot.add(apertureOrb);
    interactables.push(apertureOrb);

    astrolabeRings.push({
      pivot,
      apertureMat,
      targetAngle: 0,
      currentAngle: 0,
      aligned: false,
    });
  }

  // Refracting dual-shell central Astrolabe Core Orb
  const astrolabeCoreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.moltenGold,
      emissive: PALETTE.solarEmber,
      emissiveIntensity: 1.35,
      roughness: 0.16,
      metalness: 0.45,
    }),
  );
  const astrolabeCore = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(0.45, 1)), astrolabeCoreMat);
  astrolabeCore.position.set(0, 3.2, 0);
  astrolabeRoot.add(astrolabeCore);

  const astrolabeCoreCage = new THREE.Mesh(
    trackGeo(new THREE.IcosahedronGeometry(0.56, 0)),
    trackMat(new THREE.MeshStandardMaterial({ color: PALETTE.moltenGold, wireframe: true, roughness: 0.25, metalness: 0.9 })),
  );
  astrolabeCoreCage.position.set(0, 3.2, 0);
  astrolabeRoot.add(astrolabeCoreCage);

  const astrolabeLight = new THREE.PointLight(PALETTE.moltenGold, 2.2, 14, 1.6);
  astrolabeLight.position.set(0, 3.4, 1.5);
  astrolabeRoot.add(astrolabeLight);

  // =========================================================================
  // 2. EAST WING: SCULPTED OBSIDIAN MIRROR COURTYARD & REFRACTING PRISM
  // =========================================================================
  const mirrorRoot = new THREE.Group();
  mirrorRoot.position.copy(WING_POSITIONS.mirrors);
  mirrorRoot.position.y = 0.24;
  group.add(mirrorRoot);

  const mirrorDynamicGroup = new THREE.Group();
  mirrorRoot.add(mirrorDynamicGroup);

  const mirrorBeamGroup = new THREE.Group();
  mirrorRoot.add(mirrorBeamGroup);

  const collectorPrismMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: PALETTE.solarCore,
      emissive: PALETTE.solarEmber,
      emissiveIntensity: 1.0,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      reflectivity: 1.0,
    }),
  );

  const emitterOrbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.solarCore,
      emissive: PALETTE.moltenGold,
      emissiveIntensity: 3.4,
      roughness: 0.08,
    }),
  );

  const mirrorGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.goldHighlight,
      emissive: PALETTE.moltenGold,
      emissiveIntensity: 0.55,
      roughness: 0.06,
      metalness: 0.98,
    }),
  );

  const beamCoreMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: PALETTE.solarCore,
    }),
  );

  const beamHaloMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: PALETTE.moltenGold,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const impactSparkMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: PALETTE.solarFlame,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const unitBeamCoreGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.068, 1, 12));
  const unitBeamHaloGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 1, 14));
  const impactOrbGeo = trackGeo(new THREE.SphereGeometry(0.24, 14, 14));

  let activeMirrorLayoutId = -1;
  let collectorPrismMesh: THREE.Mesh | null = null;
  let collectorInnerPrism: THREE.Mesh | null = null;
  const mirrorTurntables: Array<{
    pivot: THREE.Group;
    targetYaw: number;
    currentYaw: number;
  }> = [];
  const dynamicMirrorInteractables: THREE.Object3D[] = [];
  const collectorLight = new THREE.PointLight(PALETTE.moltenGold, 2.4, 16, 1.5);
  collectorLight.position.set(0, 2.6, 0);
  mirrorRoot.add(collectorLight);

  function rebuildMirrorLayout(snapshot: GameSnapshot): void {
    for (const obj of dynamicMirrorInteractables) {
      const idx = interactables.indexOf(obj);
      if (idx >= 0) interactables.splice(idx, 1);
    }
    dynamicMirrorInteractables.length = 0;
    mirrorTurntables.length = 0;
    while (mirrorDynamicGroup.children.length > 0) {
      mirrorDynamicGroup.remove(mirrorDynamicGroup.children[0]);
    }

    const mState = snapshot.mirrors;
    activeMirrorLayoutId = mState.layoutId;

    // Sculpted Solar Emitter Monolith
    const emitterGroup = new THREE.Group();
    emitterGroup.position.set(mState.emitter.x, 0, mState.emitter.z);
    const eStep = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.75, 0.88, 0.32, 8)), carvedBasaltMat);
    eStep.position.y = 0.16;
    emitterGroup.add(eStep);
    const ePed = new THREE.Mesh(
      trackGeo(createFlutedDoricGeometry(0.46, 0.56, 1.15, 12, 36, 6)),
      carvedBasaltMat,
    );
    ePed.position.y = 0.88;
    ePed.castShadow = true;
    emitterGroup.add(ePed);
    const eCollar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.5, 0.09, 12, 28)), bronzeMat);
    eCollar.position.y = MIRROR_BEAM_Y;
    eCollar.rotation.y = Math.atan2(mState.emitterDir.x, mState.emitterDir.z);
    emitterGroup.add(eCollar);
    const eOrb = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(0.32, 1)), emitterOrbMat);
    eOrb.position.y = MIRROR_BEAM_Y;
    emitterGroup.add(eOrb);
    mirrorDynamicGroup.add(emitterGroup);

    // Multi-Faceted Refracting Collector Crystal Prism Chalice
    const colGroup = new THREE.Group();
    colGroup.position.set(mState.collector.x, 0, mState.collector.z);
    const cPlinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.86, 1.02, 0.34, 8)), carvedBasaltMat);
    cPlinth.position.y = 0.17;
    colGroup.add(cPlinth);
    const cBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.58, 0.78, 0.92, 8)), darkBronzeMat);
    cBase.position.y = 0.78;
    cBase.castShadow = true;
    colGroup.add(cBase);
    const cCradle = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.62, 0.075, 10, 28)), bronzeMat);
    cCradle.rotation.x = Math.PI / 2;
    cCradle.position.y = 1.28;
    colGroup.add(cCradle);

    // 4 sculpted bronze chalice prongs gripping the levitating crystal prism
    const prongGeo = trackGeo(new THREE.ConeGeometry(0.08, 0.72, 5));
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const prong = new THREE.Mesh(prongGeo, bronzeMat);
      prong.position.set(Math.cos(a) * 0.56, 1.56, Math.sin(a) * 0.56);
      prong.rotation.z = -Math.cos(a) * 0.32;
      prong.rotation.x = Math.sin(a) * 0.32;
      colGroup.add(prong);
    }

    collectorPrismMesh = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.5, 0)), collectorPrismMat);
    collectorPrismMesh.scale.set(0.9, 1.38, 0.9);
    collectorPrismMesh.position.y = MIRROR_BEAM_Y + 0.12;
    colGroup.add(collectorPrismMesh);

    collectorInnerPrism = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(0.28, 0)), emitterOrbMat);
    collectorInnerPrism.position.y = MIRROR_BEAM_Y + 0.12;
    colGroup.add(collectorInnerPrism);
    mirrorDynamicGroup.add(colGroup);

    // Fluted Doric Basalt Obstacle Pillars with Hammered-Bronze Capitals
    const pillarShaftGeo = trackGeo(createFlutedDoricGeometry(0.45, 0.52, 2.55, 14, 42, 8));
    const pillarBaseGeo = trackGeo(new THREE.BoxGeometry(1.14, 0.28, 1.14));
    const pillarCapGeo = trackGeo(new THREE.BoxGeometry(1.16, 0.22, 1.16));
    const pillarBandGeo = trackGeo(new THREE.TorusGeometry(0.5, 0.055, 8, 24));
    pillarBandGeo.rotateX(Math.PI / 2);

    for (const p of mState.pillars) {
      const pBase = new THREE.Mesh(pillarBaseGeo, carvedBasaltMat);
      pBase.position.set(p.position.x, 0.14, p.position.z);
      mirrorDynamicGroup.add(pBase);

      const pMesh = new THREE.Mesh(pillarShaftGeo, carvedBasaltMat);
      pMesh.position.set(p.position.x, 1.52, p.position.z);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      mirrorDynamicGroup.add(pMesh);

      const band = new THREE.Mesh(pillarBandGeo, bronzeMat);
      band.position.set(p.position.x, 2.7, p.position.z);
      mirrorDynamicGroup.add(band);

      const cap = new THREE.Mesh(pillarCapGeo, darkBronzeMat);
      cap.position.set(p.position.x, 2.86, p.position.z);
      cap.castShadow = true;
      mirrorDynamicGroup.add(cap);
    }

    // 3 Sculpted Geared Bronze & Carved-Basalt Reflector Obelisks
    const baseTurntableGeo = trackGeo(new THREE.CylinderGeometry(0.72, 0.86, 0.42, 16));
    const obeliskBackGeo = trackGeo(new THREE.BoxGeometry(1.14, 2.18, 0.34));
    const pilasterGeo = trackGeo(new THREE.BoxGeometry(0.16, 2.26, 0.42));
    const pedimentGeo = trackGeo(new THREE.ConeGeometry(0.86, 0.42, 4));
    pedimentGeo.rotateY(Math.PI / 4);
    const mirrorFaceGeo = trackGeo(new THREE.BoxGeometry(0.84, 1.62, 0.09));
    const cogGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.12, 0.14));
    const arrowGeo = trackGeo(new THREE.ConeGeometry(0.22, 0.5, 4));
    arrowGeo.rotateX(Math.PI / 2);

    mState.mirrors.forEach((node, idx) => {
      const holder = new THREE.Group();
      holder.position.set(node.position.x, 0, node.position.z);

      const base = new THREE.Mesh(baseTurntableGeo, carvedBasaltMat);
      base.position.y = 0.21;
      base.receiveShadow = true;
      holder.add(base);

      const pivot = new THREE.Group();
      const yaw = orientationToYaw(node.orientation);
      pivot.rotation.y = yaw;
      holder.add(pivot);

      const interactData = {
        kind: 'mirror' as const,
        mirrorIndex: idx,
        label: `Rotate ${node.label} (90° Clockwise)`,
      };

      const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.72, 0.065, 10, 28)), bronzeMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.44;
      ring.userData.interactable = interactData;
      pivot.add(ring);

      // 12 precision turntable gear cogs
      for (let c = 0; c < 12; c += 1) {
        const ca = (c / 12) * Math.PI * 2;
        const cog = new THREE.Mesh(cogGeo, bronzeMat);
        cog.position.set(Math.cos(ca) * 0.78, 0.44, Math.sin(ca) * 0.78);
        cog.rotation.y = -ca;
        pivot.add(cog);
      }

      const backHousing = new THREE.Mesh(obeliskBackGeo, carvedBasaltMat);
      backHousing.position.set(0, 1.54, -0.06);
      backHousing.castShadow = true;
      backHousing.userData.interactable = interactData;
      pivot.add(backHousing);

      // Sculpted bronze framing pilasters & pyramidal capstone pediment
      const leftPilaster = new THREE.Mesh(pilasterGeo, bronzeMat);
      leftPilaster.position.set(-0.54, 1.56, 0.04);
      leftPilaster.userData.interactable = interactData;
      pivot.add(leftPilaster);

      const rightPilaster = new THREE.Mesh(pilasterGeo, bronzeMat);
      rightPilaster.position.set(0.54, 1.56, 0.04);
      rightPilaster.userData.interactable = interactData;
      pivot.add(rightPilaster);

      const pediment = new THREE.Mesh(pedimentGeo, bronzeMat);
      pediment.position.set(0, 2.84, 0.0);
      pediment.userData.interactable = interactData;
      pivot.add(pediment);

      const face = new THREE.Mesh(mirrorFaceGeo, mirrorGlassMat);
      face.position.set(0, 1.64, 0.14);
      face.userData.interactable = interactData;
      pivot.add(face);

      const arrow = new THREE.Mesh(arrowGeo, bronzeMat);
      arrow.position.set(0, 0.56, 0.72);
      arrow.userData.interactable = interactData;
      pivot.add(arrow);

      mirrorDynamicGroup.add(holder);
      interactables.push(backHousing, face, leftPilaster, rightPilaster, pediment, ring, arrow);
      dynamicMirrorInteractables.push(backHousing, face, leftPilaster, rightPilaster, pediment, ring, arrow);
      mirrorTurntables.push({ pivot, targetYaw: yaw, currentYaw: yaw });
    });
  }

  const upVec = new THREE.Vector3(0, 1, 0);
  function rebuildMirrorBeams(snapshot: GameSnapshot): void {
    while (mirrorBeamGroup.children.length > 0) {
      mirrorBeamGroup.remove(mirrorBeamGroup.children[0]);
    }
    const segs = snapshot.mirrors.beamSegments;
    for (const seg of segs) {
      const a = new THREE.Vector3(seg.from.x, MIRROR_BEAM_Y, seg.from.z);
      const b = new THREE.Vector3(seg.to.x, MIRROR_BEAM_Y, seg.to.z);
      const delta = new THREE.Vector3().subVectors(b, a);
      const len = delta.length();
      if (len < 0.05) continue;

      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(upVec, delta.clone().normalize());

      const core = new THREE.Mesh(unitBeamCoreGeo, beamCoreMat);
      core.position.copy(mid);
      core.quaternion.copy(quat);
      core.scale.set(1, len, 1);
      mirrorBeamGroup.add(core);

      const halo = new THREE.Mesh(unitBeamHaloGeo, beamHaloMat);
      halo.position.copy(mid);
      halo.quaternion.copy(quat);
      halo.scale.set(1, len, 1);
      mirrorBeamGroup.add(halo);

      const orb = new THREE.Mesh(
        impactOrbGeo,
        seg.hitKind === 'collector' || seg.hitKind === 'mirror-reflect' ? emitterOrbMat : impactSparkMat,
      );
      orb.position.copy(b);
      orb.scale.setScalar(seg.hitKind === 'collector' ? 1.75 : 1.05);
      mirrorBeamGroup.add(orb);
    }
  }

  // =========================================================================
  // 3. NORTH WING: CATHEDRAL HARMONIC SUN-CHIMES (Sculpted Lathe Temple Bells)
  // =========================================================================
  const chimesRoot = new THREE.Group();
  chimesRoot.position.copy(WING_POSITIONS.chimes);
  chimesRoot.position.y = 0.32;
  group.add(chimesRoot);

  // Fluted Doric basalt gateway columns + stepped entablature & gilded pediment arc
  const gateShaftGeo = trackGeo(createFlutedDoricGeometry(0.42, 0.5, 5.2, 16, 48, 10));
  for (const gx of [-4.05, 4.05]) {
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.3, 0.38, 1.3)), carvedBasaltMat);
    base.position.set(gx, 0.19, 0);
    chimesRoot.add(base);

    const shaft = new THREE.Mesh(gateShaftGeo, carvedBasaltMat);
    shaft.position.set(gx, 2.9, 0);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    chimesRoot.add(shaft);

    const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.34, 0.28, 1.34)), bronzeMat);
    cap.position.set(gx, 5.56, 0);
    chimesRoot.add(cap);
  }

  const lintelLower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.4, 0.46, 1.15)), carvedBasaltMat);
  lintelLower.position.set(0, 5.88, 0);
  lintelLower.castShadow = true;
  chimesRoot.add(lintelLower);

  const lintelCornice = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.85, 0.24, 1.35)), bronzeMat);
  lintelCornice.position.set(0, 6.22, 0);
  chimesRoot.add(lintelCornice);

  const crossBar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 7.6, 14)), bronzeMat);
  crossBar.rotation.z = Math.PI / 2;
  crossBar.position.set(0, 4.95, 0);
  chimesRoot.add(crossBar);

  const archCrest = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.75, 0.085, 12, 36)), bronzeMat);
  archCrest.position.set(0, 7.12, 0);
  chimesRoot.add(archCrest);

  // Resonate Gong Altar
  const gongPed = new THREE.Mesh(
    trackGeo(createFlutedDoricGeometry(0.42, 0.54, 1.15, 12, 36, 6)),
    carvedBasaltMat,
  );
  gongPed.position.set(-4.35, 0.58, 1.55);
  gongPed.castShadow = true;
  chimesRoot.add(gongPed);

  const gongMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.moltenGold,
      emissive: PALETTE.solarFlame,
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.92,
    }),
  );
  const gongDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.58, 0.58, 0.12, 28)), gongMat);
  gongDisc.rotation.x = Math.PI / 2;
  gongDisc.position.set(-4.35, 1.72, 1.55);
  gongDisc.userData.interactable = {
    kind: 'chime-gong',
    label: 'Resonate Harmonic Sequence (Watch & Listen)',
  };
  chimesRoot.add(gongDisc);
  interactables.push(gongDisc);

  const bellSlotsX = [-2.55, -0.85, 0.85, 2.55];
  const bellRoman = ['I', 'II', 'III', 'IV'];
  const chimesVisuals: Array<{
    pivot: THREE.Group;
    bodyMesh: THREE.Mesh;
    crownMat: THREE.MeshStandardMaterial;
    rippleMesh: THREE.Mesh;
    rippleMat: THREE.MeshBasicMaterial;
    swingVel: number;
    swingAngle: number;
    flashIntensity: number;
    ripplePhase: number;
    locked: boolean;
    rank: number;
  }> = [];

  const ropeGeo = trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8));
  const sculptedBellGeo = trackGeo(createSculptedTempleBellGeometry());
  const crownOrbGeo = trackGeo(new THREE.OctahedronGeometry(0.24, 0));
  const rippleGeo = trackGeo(new THREE.RingGeometry(0.46, 0.62, 32));
  rippleGeo.rotateX(-Math.PI / 2);

  for (let i = 0; i < 4; i += 1) {
    const pivot = new THREE.Group();
    pivot.position.set(bellSlotsX[i], 4.95, 0);
    chimesRoot.add(pivot);

    const rope = new THREE.Mesh(ropeGeo, darkBronzeMat);
    rope.position.y = -0.36;
    pivot.add(rope);

    const crownMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.solarCore,
        emissive: PALETTE.solarEmber,
        emissiveIntensity: 0.65,
        roughness: 0.16,
      }),
    );

    const interactData = {
      kind: 'chime' as const,
      slotIndex: i,
      label: `Strike Sun-Chime ${bellRoman[i]}`,
    };

    const crownOrb = new THREE.Mesh(crownOrbGeo, crownMat);
    crownOrb.position.y = -0.78;
    crownOrb.userData.interactable = interactData;
    pivot.add(crownOrb);

    const bellMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf2c177,
        map: textures.bronzeMap,
        bumpMap: textures.bronzeBump,
        bumpScale: 0.035,
        roughness: 0.24,
        metalness: 0.92,
        emissive: PALETTE.moltenGold,
        emissiveIntensity: 0.12,
      }),
    );

    const bodyMesh = new THREE.Mesh(sculptedBellGeo, bellMat);
    bodyMesh.position.y = -1.78;
    bodyMesh.castShadow = true;
    bodyMesh.userData.interactable = interactData;
    pivot.add(bodyMesh);
    interactables.push(bodyMesh, crownOrb);

    const rippleMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.moltenGold,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
    rippleMesh.position.set(bellSlotsX[i], 1.15, 0);
    chimesRoot.add(rippleMesh);

    chimesVisuals.push({
      pivot,
      bodyMesh,
      crownMat,
      rippleMesh,
      rippleMat,
      swingVel: 0,
      swingAngle: 0,
      flashIntensity: 0,
      ripplePhase: 1,
      locked: false,
      rank: i,
    });
  }

  const chimesLight = new THREE.PointLight(PALETTE.moltenGold, 1.8, 14, 1.6);
  chimesLight.position.set(0, 3.8, 2.4);
  chimesRoot.add(chimesLight);

  let pulseQueue: Array<{ slot: number; triggerAt: number }> = [];
  let internalElapsed = 0;

  // =========================================================================
  // 4. CENTER DAIS: MONUMENTAL SOLSTICE APEX CROWN (12-Petal Lotus & Armillary)
  // =========================================================================
  const apexRoot = new THREE.Group();
  apexRoot.position.set(0, 0.72, 0);
  group.add(apexRoot);

  const apexPedestal = new THREE.Mesh(
    trackGeo(createFlutedDoricGeometry(1.12, 1.48, 1.25, 16, 48, 8)),
    carvedBasaltMat,
  );
  apexPedestal.position.y = 0.62;
  apexPedestal.castShadow = true;
  apexPedestal.receiveShadow = true;
  apexRoot.add(apexPedestal);

  const apexQuartzRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.24, 1.28, 0.14, 24)), quartzMat);
  apexQuartzRing.position.y = 1.26;
  apexRoot.add(apexQuartzRing);

  const apexCollar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.26, 0.11, 12, 36)), bronzeMat);
  apexCollar.rotation.x = Math.PI / 2;
  apexCollar.position.y = 1.36;
  apexRoot.add(apexCollar);

  const apexKinetic = new THREE.Group();
  apexKinetic.position.y = 3.15;
  apexRoot.add(apexKinetic);

  const apexInteractData = {
    kind: 'apex-crown' as const,
    label: 'Ignite the Solstice Apex Crown',
  };

  const apexCoreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: PALETTE.solarCore,
      emissive: PALETTE.solarEmber,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.25,
    }),
  );
  const apexCore = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.76, 1)), apexCoreMat);
  apexCore.userData.interactable = apexInteractData;
  apexKinetic.add(apexCore);
  interactables.push(apexCore);

  const apexHitProxy = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(2.0, 12, 12)),
    trackMat(new THREE.MeshBasicMaterial({ visible: false })),
  );
  apexHitProxy.userData.interactable = apexInteractData;
  apexKinetic.add(apexHitProxy);
  interactables.push(apexHitProxy);

  const apexRings: THREE.Mesh[] = [];
  const apexRingRadii = [1.38, 1.76, 2.16];
  for (let i = 0; i < apexRingRadii.length; i += 1) {
    const rMesh = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(apexRingRadii[i], 0.08 - i * 0.01, 14, 56)),
      i === 1 ? dialBronzeMat : bronzeMat,
    );
    rMesh.castShadow = true;
    rMesh.userData.interactable = apexInteractData;
    apexKinetic.add(rMesh);
    apexRings.push(rMesh);
  }

  // 12 Sculpted Curved Hammered-Bronze Lotus Petals
  const apexPetals: THREE.Group[] = [];
  const petalGeo = trackGeo(createLotusPetalGeometry());
  for (let i = 0; i < 12; i += 1) {
    const holder = new THREE.Group();
    holder.rotation.y = (i / 12) * Math.PI * 2;
    const petalPivot = new THREE.Group();
    petalPivot.position.set(0, -0.62, 1.02);
    const petalMesh = new THREE.Mesh(petalGeo, i % 2 === 0 ? bronzeMat : darkBronzeMat);
    petalMesh.castShadow = true;
    petalMesh.userData.interactable = apexInteractData;
    petalPivot.add(petalMesh);
    holder.add(petalPivot);
    apexKinetic.add(holder);
    apexPetals.push(petalPivot);
  }

  // Double-Sheath Molten-Gold Zenith Solstice Pillar (blooms skyward on victory)
  const zenithOuterMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: PALETTE.moltenGold,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const zenithInnerMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: PALETTE.solarCore,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const zenithBeamOuter = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.55, 1.55, 52, 24, 1, true)),
    zenithOuterMat,
  );
  zenithBeamOuter.position.y = 26;
  zenithBeamOuter.visible = false;
  apexRoot.add(zenithBeamOuter);

  const zenithBeamInner = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.2, 0.55, 52, 16, 1, true)),
    zenithInnerMat,
  );
  zenithBeamInner.position.y = 26;
  zenithBeamInner.visible = false;
  apexRoot.add(zenithBeamInner);

  const apexLight = new THREE.PointLight(PALETTE.moltenGold, 2.8, 26, 1.4);
  apexLight.position.set(0, 3.4, 0);
  apexRoot.add(apexLight);

  let solvedCount = 0;
  let apexUnlocked = false;
  let apexIgnited = false;
  let apexBloomFactor = 0;
  let mirrorsSolved = false;
  let chimesSolved = false;
  let astrolabeSolved = false;

  const emberCol = new THREE.Color(PALETTE.solarEmber);
  const goldCol = new THREE.Color(PALETTE.moltenGold);
  const coreCol = new THREE.Color(PALETTE.solarCore);
  const scratchCol = new THREE.Color();

  function shortestAngleLerp(current: number, target: number, alpha: number): number {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * alpha;
  }

  return {
    group,
    interactables,
    triggerChimePulse: (slotOrder) => {
      pulseQueue = slotOrder.map((slot, idx) => ({
        slot,
        triggerAt: internalElapsed + idx * 0.56,
      }));
    },
    triggerChimeStrikeAnim: (slotIndex, correct) => {
      const bell = chimesVisuals[slotIndex];
      if (!bell) return;
      bell.swingVel = correct ? 2.8 : 1.4;
      bell.flashIntensity = correct ? 3.2 : 1.5;
      bell.ripplePhase = 0;
      bell.rippleMat.color.setHex(correct ? PALETTE.moltenGold : PALETTE.solarEmber);
    },
    syncState: (snapshot) => {
      solvedCount = snapshot.solvedCount;
      apexUnlocked = snapshot.apexUnlocked;
      apexIgnited = snapshot.apexIgnited;
      astrolabeSolved = snapshot.astrolabe.solved;
      mirrorsSolved = snapshot.mirrors.solved;
      chimesSolved = snapshot.chimes.solved;

      for (let i = 0; i < 3; i += 1) {
        const step = snapshot.astrolabe.rings[i];
        astrolabeRings[i].targetAngle = -(step / ASTROLABE_STEPS) * Math.PI * 2;
        astrolabeRings[i].aligned = step === 0;
      }

      if (snapshot.mirrors.layoutId !== activeMirrorLayoutId) {
        rebuildMirrorLayout(snapshot);
      }
      snapshot.mirrors.mirrors.forEach((m, idx) => {
        if (mirrorTurntables[idx]) {
          mirrorTurntables[idx].targetYaw = orientationToYaw(m.orientation);
        }
      });
      rebuildMirrorBeams(snapshot);

      snapshot.chimes.slotRanks.forEach((rank, slotIdx) => {
        const bell = chimesVisuals[slotIdx];
        if (!bell) return;
        bell.rank = rank;
        bell.locked = snapshot.chimes.solved || snapshot.chimes.struckSlots.includes(slotIdx);
        const heightScale = 2.15 - rank * 0.28;
        const radiusScale = 1.12 - rank * 0.08;
        bell.bodyMesh.scale.set(radiusScale, heightScale, radiusScale);
        bell.bodyMesh.position.y = -0.98 - heightScale * 0.48;
      });
    },
    update: (elapsedSec, deltaSec) => {
      internalElapsed = elapsedSec;
      const smooth = Math.min(1, deltaSec * 7.5);

      // 1. Animate Precision Astrolabe
      for (let i = 0; i < astrolabeRings.length; i += 1) {
        const r = astrolabeRings[i];
        r.currentAngle = shortestAngleLerp(r.currentAngle, r.targetAngle, smooth);
        r.pivot.rotation.z = r.currentAngle;
        scratchCol.copy(emberCol).lerp(goldCol, r.aligned ? 1 : 0);
        r.apertureMat.emissive.copy(scratchCol);
        r.apertureMat.emissiveIntensity = r.aligned ? 3.2 + Math.sin(elapsedSec * 2.5) * 0.35 : 1.15;
      }
      astrolabeCore.rotation.y = elapsedSec * (astrolabeSolved ? 1.25 : 0.35);
      astrolabeCoreCage.rotation.y = -elapsedSec * 0.45;
      astrolabeCoreCage.rotation.x = elapsedSec * 0.3;
      astrolabeCoreMat.emissive.copy(astrolabeSolved ? goldCol : emberCol);
      astrolabeCoreMat.emissiveIntensity = astrolabeSolved ? 2.4 : 1.05;
      astrolabeLight.intensity = THREE.MathUtils.lerp(astrolabeLight.intensity, astrolabeSolved ? 3.2 : 1.4, smooth);

      // 2. Animate Geared Mirror Turntables & Refracting Collector Crystal
      for (const m of mirrorTurntables) {
        m.currentYaw = shortestAngleLerp(m.currentYaw, m.targetYaw, smooth);
        m.pivot.rotation.y = m.currentYaw;
      }
      if (collectorPrismMesh) {
        collectorPrismMesh.rotation.y = elapsedSec * (mirrorsSolved ? 1.65 : 0.5);
        collectorPrismMesh.position.y = MIRROR_BEAM_Y + 0.14 + Math.sin(elapsedSec * 2.1) * 0.06;
      }
      if (collectorInnerPrism) {
        collectorInnerPrism.rotation.y = -elapsedSec * 1.4;
        collectorInnerPrism.rotation.x = elapsedSec * 0.9;
        collectorInnerPrism.position.y = MIRROR_BEAM_Y + 0.14 + Math.sin(elapsedSec * 2.1) * 0.06;
      }
      collectorPrismMat.emissive.copy(mirrorsSolved ? goldCol : emberCol);
      collectorPrismMat.emissiveIntensity = mirrorsSolved ? 2.4 : 0.85;
      collectorLight.intensity = THREE.MathUtils.lerp(collectorLight.intensity, mirrorsSolved ? 3.4 : 1.3, smooth);

      // 3. Process Chimes sequence pulse queue & bell pendulum physics
      while (pulseQueue.length > 0 && pulseQueue[0].triggerAt <= elapsedSec) {
        const item = pulseQueue.shift();
        if (item) {
          const bell = chimesVisuals[item.slot];
          if (bell) {
            bell.swingVel = 2.0;
            bell.flashIntensity = 3.4;
            bell.ripplePhase = 0;
            bell.rippleMat.color.setHex(PALETTE.moltenGold);
            onPulseBellAudio(bell.rank);
          }
        }
      }

      for (const bell of chimesVisuals) {
        const springAcc = -24 * bell.swingAngle - 4.2 * bell.swingVel;
        bell.swingVel += springAcc * Math.min(0.05, deltaSec);
        bell.swingAngle += bell.swingVel * Math.min(0.05, deltaSec);
        bell.pivot.rotation.x = bell.swingAngle * 0.25;

        bell.flashIntensity = Math.max(0, bell.flashIntensity - deltaSec * 2.8);
        const targetGlow = bell.locked ? 2.6 : 0.55;
        bell.crownMat.emissive.copy(bell.locked || bell.flashIntensity > 0.4 ? goldCol : emberCol);
        bell.crownMat.emissiveIntensity = targetGlow + bell.flashIntensity;

        const bodyMat = bell.bodyMesh.material as THREE.MeshStandardMaterial;
        bodyMat.emissiveIntensity = (bell.locked ? 0.55 : 0.1) + bell.flashIntensity * 0.32;

        if (bell.ripplePhase < 1) {
          bell.ripplePhase = Math.min(1, bell.ripplePhase + deltaSec * 1.2);
          const sc = 0.6 + bell.ripplePhase * 2.4;
          bell.rippleMesh.scale.set(sc, sc, 1);
          bell.rippleMat.opacity = (1 - bell.ripplePhase) * 0.85;
        } else {
          bell.rippleMat.opacity = 0;
        }
      }
      chimesLight.intensity = THREE.MathUtils.lerp(chimesLight.intensity, chimesSolved ? 6.0 : 1.8, smooth);

      // 4. Animate Central Solstice Apex Crown & Lotus Orbital Bloom
      const targetBloom = apexIgnited ? 1 : 0;
      apexBloomFactor = THREE.MathUtils.lerp(apexBloomFactor, targetBloom, Math.min(1, deltaSec * 1.8));

      const activity = 0.3 + solvedCount * 0.24 + apexBloomFactor * 0.9;
      apexKinetic.position.y = 3.12 + Math.sin(elapsedSec * 1.4) * 0.14 + apexBloomFactor * 0.85;
      apexCore.rotation.y = elapsedSec * (0.6 + activity);
      apexCore.rotation.x = Math.sin(elapsedSec * 0.7) * 0.28;
      apexCore.scale.setScalar(1 + apexBloomFactor * 0.42);

      apexRings[0].rotation.x = elapsedSec * 0.55 * activity + 0.4;
      apexRings[0].rotation.y = elapsedSec * 0.35 * activity;
      apexRings[1].rotation.y = -elapsedSec * 0.65 * activity;
      apexRings[1].rotation.z = elapsedSec * 0.28 * activity + 0.8;
      apexRings[2].rotation.z = -elapsedSec * 0.48 * activity;
      apexRings[2].rotation.x = Math.cos(elapsedSec * 0.5) * 0.6;

      const petalTilt = 0.22 + (solvedCount / 3) * 0.44 + apexBloomFactor * 0.92;
      for (let i = 0; i < apexPetals.length; i += 1) {
        const wave = Math.sin(elapsedSec * 1.6 + i * 0.55) * 0.04;
        apexPetals[i].rotation.x = petalTilt + wave;
      }

      scratchCol.copy(emberCol).lerp(goldCol, solvedCount / 3).lerp(coreCol, apexBloomFactor * 0.55);
      apexCoreMat.emissive.copy(scratchCol);
      const readyPulse = apexUnlocked && !apexIgnited ? Math.sin(elapsedSec * 2.8) * 0.5 : 0;
      apexCoreMat.emissiveIntensity = 1.25 + solvedCount * 0.48 + readyPulse + apexBloomFactor * 1.6;
      apexLight.intensity = 2.0 + solvedCount * 0.95 + apexBloomFactor * 3.8;

      const showPillar = apexBloomFactor > 0.03;
      zenithBeamOuter.visible = showPillar;
      zenithBeamInner.visible = showPillar;
      zenithOuterMat.opacity = apexBloomFactor * 0.45;
      zenithInnerMat.opacity = apexBloomFactor * 0.68;
      zenithBeamOuter.rotation.y = elapsedSec * 0.4;
      zenithBeamInner.rotation.y = -elapsedSec * 0.6;
    },
    getApexBloomFactor: () => apexBloomFactor,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
