import * as THREE from 'three';

export interface SolsticeSkySystem {
  group: THREE.Group;
  sunDirection: THREE.Vector3;
  /**
   * skyStage03:
   *  0.0 = Radiant Noon Gold (Trials 1-2)
   *  1.0 = Amber Dusk (Trials 3-4)
   *  2.0 = Crimson Solar Eclipse (Trials 5-7 pre-ignition)
   *  3.0 = Dawn Corona Radiance (Solstice Finale Ignition)
   */
  update: (
    elapsedSec: number,
    progress01: number,
    eclipseUrgency01: number,
    apexBloom01: number,
    skyStage03?: number,
  ) => void;
  dispose: () => void;
}

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uSkyTex;
uniform float uTime;
uniform float uProgress;
uniform float uUrgency;
uniform float uBloom;
uniform float uSkyStage;
uniform vec3 uSunDir;

varying vec3 vWorldDir;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.53);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float p = clamp(uProgress, 0.0, 1.0);
  float st = clamp(uSkyStage, 0.0, 3.0);

  // Sample painted volcanic eclipse panorama and strictly clamp cool blue channel
  float elevNorm = clamp((dir.y + 0.14) / 0.88, 0.01, 0.99);
  vec2 panoUv = vec2(vUv.x, elevNorm);
  vec3 panoCol = texture2D(uSkyTex, panoUv).rgb;
  panoCol.b = min(panoCol.b, min(panoCol.r * 0.65, panoCol.g * 0.82));

  // 4-Stage Strictly Warm Sky Evolution Palette (ZERO blue/teal/cyan/purple):
  // Stage 0: Noon Gold -> Stage 1: Amber Dusk -> Stage 2: Crimson Eclipse -> Stage 3: Dawn Corona
  vec3 z0 = vec3(0.24, 0.13, 0.045); vec3 h0 = vec3(0.66, 0.42, 0.15);
  vec3 z1 = vec3(0.15, 0.07, 0.032); vec3 h1 = vec3(0.58, 0.28, 0.095);
  vec3 z2 = vec3(0.055, 0.014, 0.012); vec3 h2 = vec3(0.46, 0.10, 0.042);
  vec3 z3 = vec3(0.28, 0.15, 0.048); vec3 h3 = vec3(0.74, 0.46, 0.16);

  vec3 zenithCol;
  vec3 horizCol;
  if (st < 1.0) {
    zenithCol = mix(z0, z1, st);
    horizCol  = mix(h0, h1, st);
  } else if (st < 2.0) {
    float k = st - 1.0;
    zenithCol = mix(z1, z2, k);
    horizCol  = mix(h1, h2, k);
  } else {
    float k = st - 2.0;
    zenithCol = mix(z2, z3, k);
    horizCol  = mix(h2, h3, k);
  }

  vec3 atmo = mix(horizCol, zenithCol, smoothstep(0.0, 0.68, max(0.0, dir.y)));
  vec3 tintedPano = panoCol * mix(0.76, 1.02, p);
  vec3 sky = mix(tintedPano, atmo, mix(0.54, 0.64, clamp(uBloom, 0.0, 1.0)));

  // Volcanic canyon shadow beneath horizon
  vec3 gorgeCol = mix(vec3(0.09, 0.045, 0.022), vec3(0.04, 0.016, 0.012), smoothstep(1.0, 2.0, st));
  gorgeCol = mix(gorgeCol, vec3(0.16, 0.08, 0.032), smoothstep(2.0, 3.0, st));
  sky = mix(gorgeCol, sky, smoothstep(-0.22, 0.02, dir.y));

  // Eclipse countdown urgency deepens shadow toward molten volcanic ember
  sky = mix(sky, vec3(0.06, 0.018, 0.012), uUrgency * 0.4);

  // Sweeping backlit dust clouds in upper sky
  if (dir.y > 0.04) {
    vec2 cloudUv = dir.xz / (dir.y + 0.36) * 1.55 + vec2(uTime * 0.014, -uTime * 0.008);
    float n = noise2(cloudUv * 2.5) * 0.65 + noise2(cloudUv * 5.6 + vec2(3.7, 1.9)) * 0.35;
    float wisp = smoothstep(0.54, 0.85, n) * smoothstep(0.04, 0.24, dir.y) * (1.0 - smoothstep(0.62, 0.94, dir.y));
    vec3 wispTint = mix(vec3(0.84, 0.56, 0.22), vec3(0.74, 0.20, 0.08), smoothstep(0.8, 2.0, st));
    wispTint = mix(wispTint, vec3(0.92, 0.68, 0.28), smoothstep(2.0, 3.0, st));
    sky += wispTint * wisp * 0.16;
  }

  // Animated Solar Eclipse Corona & Crimson-to-Golden Dawn Breakthrough
  vec3 sunDir = normalize(uSunDir);
  float sunAngle = acos(clamp(dot(dir, sunDir), -1.0, 1.0));

  vec3 upRef = vec3(0.0, 1.0, 0.0);
  vec3 sunRight = normalize(cross(upRef, sunDir));
  vec3 sunUp = cross(sunDir, sunRight);
  vec2 sunPlane = vec2(dot(dir - sunDir, sunRight), dot(dir - sunDir, sunUp));
  float rayAngle = atan(sunPlane.y, sunPlane.x);

  float crimsonPhase = smoothstep(1.2, 2.0, st) * (1.0 - smoothstep(2.1, 2.9, st));
  vec3 coronaColor = mix(vec3(0.96, 0.64, 0.22), vec3(1.02, 0.24, 0.09), crimsonPhase);
  coronaColor = mix(coronaColor, vec3(1.04, 0.78, 0.34), uBloom);

  float coronaRing = exp(-abs(sunAngle - 0.115) * 34.0) * (0.42 + crimsonPhase * 0.68 + 0.14 * sin(rayAngle * 10.0 + uTime * 1.6));
  float rays = pow(0.5 + 0.5 * cos(rayAngle * 14.0 + uTime * 0.26), 5.0)
    * exp(-sunAngle * 4.8) * (0.14 + p * 0.34 + crimsonPhase * 0.28 + uBloom * 0.48);
  float wideGlow = exp(-sunAngle * 3.6) * (0.12 + p * 0.22 + uBloom * 0.28);
  float coreReignite = (1.0 - smoothstep(0.0, 0.105, sunAngle)) * (max(0.0, 1.0 - st * 0.55) * 0.48 + uBloom * 0.85);

  // Dark obsidian moon disc during Crimson Eclipse stage (parts on Dawn Corona bloom!)
  float eclipseDisc = (1.0 - smoothstep(0.082, 0.105, sunAngle)) * crimsonPhase * (1.0 - uBloom);

  sky += coronaColor * (coronaRing + rays * 0.62 + wideGlow * 0.36);
  sky = mix(sky, vec3(0.035, 0.012, 0.010), eclipseDisc * 0.94);
  sky += vec3(1.12, 0.88, 0.48) * coreReignite;

  gl_FragColor = vec4(sky, 1.0);
}
`;

export function createSolsticeSky(
  eclipseSkyMap: THREE.Texture,
  softGlowMap: THREE.Texture,
): SolsticeSkySystem {
  const group = new THREE.Group();
  const sunDirection = new THREE.Vector3(-0.24, 0.44, -0.865).normalize();

  const uniforms = {
    uSkyTex: { value: eclipseSkyMap },
    uTime: { value: 0 },
    uProgress: { value: 0.1 },
    uUrgency: { value: 0 },
    uBloom: { value: 0 },
    uSkyStage: { value: 0.0 },
    uSunDir: { value: sunDirection.clone() },
  };

  const domeGeo = new THREE.SphereGeometry(190, 64, 40);
  const domeMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const domeMesh = new THREE.Mesh(domeGeo, domeMat);
  domeMesh.rotation.y = Math.PI * 0.58;
  group.add(domeMesh);

  const gorgeGroup = new THREE.Group();
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];

  const calderaMat = new THREE.MeshStandardMaterial({
    color: 0x16110e,
    roughness: 0.92,
    metalness: 0.08,
    flatShading: true,
  });
  disposablesMat.push(calderaMat);

  const spireGeo = new THREE.DodecahedronGeometry(9.5, 1);
  disposablesGeo.push(spireGeo);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + 0.14;
    const dist = 58 + (i % 3) * 14;
    const spire = new THREE.Mesh(spireGeo, calderaMat);
    spire.position.set(Math.cos(a) * dist, -17.5 - (i % 3) * 2.2, Math.sin(a) * dist);
    spire.scale.set(1.4 + (i % 3) * 0.4, 0.72 + (i % 2) * 0.25, 1.3 + ((i + 1) % 3) * 0.35);
    spire.rotation.y = a * 1.7;
    gorgeGroup.add(spire);
  }

  const mistRingSpecs = [
    { y: -15.5, rIn: 16, rOut: 95, color: 0x5c2b12, opacity: 0.34, speed: 0.012 },
    { y: -23, rIn: 0, rOut: 145, color: 0x2b1309, opacity: 0.56, speed: -0.008 },
  ];
  const mistRings: Array<{ mesh: THREE.Mesh; speed: number }> = [];
  for (const spec of mistRingSpecs) {
    const geo = new THREE.RingGeometry(spec.rIn, spec.rOut, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = spec.y;
    gorgeGroup.add(mesh);
    disposablesGeo.push(geo);
    disposablesMat.push(mat);
    mistRings.push({ mesh, speed: spec.speed });
  }

  const wispGeo = new THREE.PlaneGeometry(36, 15);
  const wispMat = new THREE.MeshBasicMaterial({
    map: softGlowMap,
    color: 0xb85a20,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  disposablesGeo.push(wispGeo);
  disposablesMat.push(wispMat);

  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const dist = 35 + (i % 3) * 11;
    const puff = new THREE.Mesh(wispGeo, wispMat);
    puff.position.set(Math.cos(a) * dist, -11.5 - (i % 3) * 2.5, Math.sin(a) * dist);
    puff.lookAt(0, -8, 0);
    gorgeGroup.add(puff);
  }
  group.add(gorgeGroup);

  const noonMist = new THREE.Color(0xdca048);
  const crimsonMist = new THREE.Color(0xa62c14);
  const dawnMist = new THREE.Color(0xf6cc6c);

  return {
    group,
    sunDirection,
    update: (elapsedSec, progress01, eclipseUrgency01, apexBloom01, skyStage03 = 1.0) => {
      uniforms.uTime.value = elapsedSec;
      uniforms.uProgress.value = progress01;
      uniforms.uUrgency.value = eclipseUrgency01;
      uniforms.uBloom.value = apexBloom01;
      uniforms.uSkyStage.value = skyStage03;

      for (const item of mistRings) {
        item.mesh.rotation.y = elapsedSec * item.speed;
      }
      if (skyStage03 < 2.0) {
        wispMat.color.copy(noonMist).lerp(crimsonMist, Math.max(0, skyStage03 - 0.5) / 1.5);
      } else {
        wispMat.color.copy(crimsonMist).lerp(dawnMist, skyStage03 - 2.0);
      }
      wispMat.opacity = 0.2 + progress01 * 0.14 + apexBloom01 * 0.12;
    },
    dispose: () => {
      domeGeo.dispose();
      domeMat.dispose();
      for (const g of disposablesGeo) g.dispose();
      for (const m of disposablesMat) m.dispose();
    },
  };
}
