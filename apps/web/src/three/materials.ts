import * as THREE from 'three';

/**
 * Shared uniforms for the X-ray scan. `sweep` travels from the nose (+x) to the
 * tail (−x): everything in front of it is X-rayed, behind it is still painted.
 * One value drives the paint fade, the glass fade and the X-ray shell, so the
 * whole car transitions as one scan.
 */
export const xrayUniforms = {
  uSweep: { value: 10 },
  uTime: { value: 0 },
  uXray: { value: 0 },
};

/** Inject the sweep cut into a stock material: alpha drops to `minAlpha` where scanned. */
function withSweep<T extends THREE.Material>(m: T, minAlpha: number): T {
  m.transparent = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSweep = xrayUniforms.uSweep;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSweepW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSweepW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSweepW;\nuniform float uSweep;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float scanned = step(uSweep, vSweepW.x);
         gl_FragColor.a *= mix(1.0, ${minAlpha.toFixed(3)}, scanned);
         float edge = 1.0 - smoothstep(0.0, 0.06, abs(vSweepW.x - uSweep));
         gl_FragColor.rgb += vec3(0.3, 0.85, 1.0) * edge * 2.5;`,
      );
  };
  m.customProgramCacheKey = () => `sweep-${minAlpha}`;
  return m;
}

export function paintMaterial(color: string) {
  return withSweep(
    new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.55,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.4,
      sheen: 0.25,
      sheenColor: new THREE.Color('#9fd8ff'),
    }),
    0.04,
  );
}

export const trimMaterial = withSweep(new THREE.MeshStandardMaterial({ color: '#0d1114', metalness: 0.4, roughness: 0.55 }), 0.04);

export const glassMaterial = withSweep(
  new THREE.MeshPhysicalMaterial({
    color: '#0b1a24',
    metalness: 0.2,
    roughness: 0.04,
    transparent: true,
    opacity: 0.78,
    envMapIntensity: 2.6,
    clearcoat: 1,
    side: THREE.DoubleSide,
  }),
  0.03,
);

export const chromeMaterial = new THREE.MeshStandardMaterial({ color: '#e8eef2', metalness: 0.92, roughness: 0.22, envMapIntensity: 2.4 });
export const rubberMaterial = withSweep(new THREE.MeshStandardMaterial({ color: '#141617', metalness: 0, roughness: 0.92 }), 0.12);
export const headlightMaterial = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: '#bfe8ff', emissiveIntensity: 3.2, toneMapped: false });
export const taillightMaterial = new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1a1a', emissiveIntensity: 2.6, toneMapped: false });
export const frameMaterial = new THREE.MeshStandardMaterial({ color: '#2a3238', metalness: 0.8, roughness: 0.45 });

/** Fresnel hologram shell, revealed behind the sweep. Additive, double sided. */
export function xrayMaterial(color = '#4fd8ff') {
  return new THREE.ShaderMaterial({
    uniforms: { ...xrayUniforms, uColor: { value: new THREE.Color(color) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying vec3 vV;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = mat3(modelMatrix) * normal;
        vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uSweep; uniform float uTime; uniform float uXray;
      varying vec3 vN; varying vec3 vW; varying vec3 vV;
      void main() {
        // NaN-safe fresnel: integrated GPUs (Intel/ANGLE) return NaN for pow() of a
        // tiny negative base or normalize() of a zero vector, and bloom then smears
        // those NaN pixels into a black blob over the whole X-ray shell.
        vec3 n = vN / max(length(vN), 1e-5);
        vec3 v = vV / max(length(vV), 1e-5);
        float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.2);
        float lines = smoothstep(0.92, 1.0, fract(vW.y * 26.0 - uTime * 0.6)) * 0.35;
        float grid = smoothstep(0.96, 1.0, fract(vW.x * 6.0)) * 0.18;
        float scanned = step(uSweep, vW.x);
        float edge = 1.0 - smoothstep(0.0, 0.08, abs(vW.x - uSweep));
        float a = (fres * 0.95 + 0.04 + lines + grid) * scanned + edge * 1.2;
        gl_FragColor = vec4(uColor * (1.0 + edge * 2.0), a * max(uXray, edge));
      }`,
  });
}

/** Internal component material — dull metal normally, emissive system colour when revealed/selected. */
export function systemMaterial(color: string) {
  const m = new THREE.MeshStandardMaterial({
    color: '#59646c',
    metalness: 0.75,
    roughness: 0.38,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0,
    envMapIntensity: 1.2,
  });
  m.userData.baseColor = color;
  return m;
}
