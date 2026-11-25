import * as THREE from 'three';

export interface SolsticeSkySystem {
  group: THREE.Group;
  sunDirection: THREE.Vector3;
  update: (elapsedSec: number, progress01: number, eclipseUrgency01: number, apexBloom01: number) => void;
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

  // Map painted 16:9->2:1 eclipse_sky.jpg cleanly onto the upper hemisphere + horizon
  float elevNorm = clamp((dir.y + 0.14) / 0.88, 0.01, 0.99);
  vec2 panoUv = vec2(vUv.x, elevNorm);
  vec3 panoCol = texture2D(uSkyTex, panoUv).rgb;
  // Strictly enforce warm obsidian/bronze/molten-gold spectrum (zero stray blue)
  panoCol.b = min(panoCol.b, min(panoCol.r * 0.68, panoCol.g * 0.84));

  // Warm atmospheric lift as conduits awaken toward Solstice Zenith
  vec3 zenithLift = mix(vec3(0.04, 0.025, 0.018), vec3(0.32, 0.18, 0.065), p);
  vec3 horizLift  = mix(vec3(0.14, 0.06, 0.024), vec3(0.68, 0.39, 0.13), p);
  vec3 atmo = mix(horizLift, zenithLift, smoothstep(0.0, 0.65, max(0.0, dir.y)));

  vec3 sky = panoCol * mix(1.05, 1.48, p) + atmo * mix(0.18, 0.48, p);

  // Deep volcanic chasm darkness below horizon
  vec3 gorgeCol = mix(vec3(0.05, 0.032, 0.022), vec3(0.18, 0.09, 0.038), p);
  sky = mix(gorgeCol, sky, smoothstep(-0.22, 0.02, dir.y));

  // Eclipse urgency darkens ambient sky slightly toward obsidian-ember
  sky = mix(sky, vec3(0.05, 0.024, 0.016), uUrgency * 0.42);

  // Subtle drifting golden stardust nebula shimmer across the upper dome
  if (dir.y > 0.04) {
    vec2 cloudUv = dir.xz / (dir.y + 0.36) * 1.5 + vec2(uTime * 0.012, -uTime * 0.007);
    float n = noise2(cloudUv * 2.6) * 0.65 + noise2(cloudUv * 5.8 + vec2(3.7, 1.9)) * 0.35;
    float wisp = smoothstep(0.56, 0.85, n) * smoothstep(0.04, 0.25, dir.y) * (1.0 - smoothstep(0.62, 0.94, dir.y));
    sky += mix(vec3(0.45, 0.2, 0.07), vec3(0.96, 0.74, 0.3), p) * wisp * 0.22;
  }

  // Dynamic molten-gold solstice burst aligned directly with the painted eclipse center!
  vec3 sunDir = normalize(uSunDir);
  float sunAngle = acos(clamp(dot(dir, sunDir), -1.0, 1.0));

  vec3 upRef = vec3(0.0, 1.0, 0.0);
  vec3 sunRight = normalize(cross(upRef, sunDir));
  vec3 sunUp = cross(sunDir, sunRight);
  vec2 sunPlane = vec2(dot(dir - sunDir, sunRight), dot(dir - sunDir, sunUp));
  float rayAngle = atan(sunPlane.y, sunPlane.x);

  // Animated plasma shimmer on the eclipse ring + dramatic zenith flare on Solstice Bloom
  float coronaShimmer = exp(-abs(sunAngle - 0.125) * 28.0) * (0.35 + 0.14 * sin(rayAngle * 8.0 + uTime * 1.4));
  float rays = pow(0.5 + 0.5 * cos(rayAngle * 14.0 + uTime * 0.25), 5.0)
    * exp(-sunAngle * 4.4) * (0.14 + p * 0.52 + uBloom * 0.95);
  float wideGlow = exp(-sunAngle * 3.0) * (0.12 + p * 0.42 + uBloom * 0.72);
  // On Victory Bloom, molten gold erupts from the dark eclipsed center itself!
  float coreReignite = (1.0 - smoothstep(0.0, 0.14, sunAngle)) * (p * 0.35 + uBloom * 1.45);

  sky += vec3(1.0, 0.66, 0.22) * (coronaShimmer + rays * 0.72 + wideGlow * 0.45);
  sky += vec3(1.35, 1.12, 0.68) * coreReignite;

  gl_FragColor = vec4(sky, 1.0);
}
`;

export function createSolsticeSky(
  eclipseSkyMap: THREE.Texture,
  softGlowMap: THREE.Texture,
): SolsticeSkySystem {
  const group = new THREE.Group();
  // Exact direction matching the painted eclipse center when domeMesh.rotation.y = Math.PI * 0.58
  const sunDirection = new THREE.Vector3(-0.24, 0.44, -0.865).normalize();

  const uniforms = {
    uSkyTex: { value: eclipseSkyMap },
    uTime: { value: 0 },
    uProgress: { value: 0.08 },
    uUrgency: { value: 0 },
    uBloom: { value: 0 },
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
  // Rotate sphere so u=0.5 (painted eclipse center) sits directly at NNW behind the Apex Crown!
  domeMesh.rotation.y = Math.PI * 0.58;
  group.add(domeMesh);

  // Volcanic canyon distant obsidian monolith peaks & glowing caldera mist below terrace
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

  // Keep obsidian caldera monolith ledges strictly below the painted mountain horizon so eclipse_sky.jpg shines cleanly
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

  const emberMist = new THREE.Color(0x9a4318);
  const goldMist = new THREE.Color(0xf2b84b);

  return {
    group,
    sunDirection,
    update: (elapsedSec, progress01, eclipseUrgency01, apexBloom01) => {
      uniforms.uTime.value = elapsedSec;
      uniforms.uProgress.value = progress01;
      uniforms.uUrgency.value = eclipseUrgency01;
      uniforms.uBloom.value = apexBloom01;

      for (const item of mistRings) {
        item.mesh.rotation.y = elapsedSec * item.speed;
      }
      wispMat.color.copy(emberMist).lerp(goldMist, progress01);
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
