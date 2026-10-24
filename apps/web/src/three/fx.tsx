import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CarSpec } from './carSpec.ts';
import { headlightMaterial, xrayUniforms } from './materials.ts';
import { SYSTEM_BY_ID, explodeOffset } from './systems.ts';
import { frame, hud } from '../hud/store.ts';

/**
 * U5 scene effects. Each one reads the shared store/frame values so nothing
 * in the HUD has to know they exist.
 */

const vsUv = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

function additive(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms,
    vertexShader: vsUv,
    fragmentShader,
  });
}

/* ------------------------------------------------------------------ scan plane */

/**
 * The visible "scanner sheet": a holographic plane riding the X-ray sweep from
 * nose to tail, with a bright leading edge, a grid and a fading wake.
 */
export function ScanPlane({ spec }: { spec: CarSpec }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      additive(
        /* glsl */ `uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv;
        float line(float v, float n){ float f = abs(fract(v * n) - 0.5); return smoothstep(0.47, 0.5, f); }
        void main(){
          vec2 d = abs(vUv - 0.5) * 2.0;
          float frameEdge = smoothstep(0.92, 1.0, max(d.x, d.y));
          float grid = max(line(vUv.x, 18.0), line(vUv.y, 10.0)) * 0.35;
          float band = 0.55 + 0.45 * sin(vUv.y * 60.0 - uTime * 14.0);
          float body = 0.10 + grid * band;
          float a = (body + frameEdge * 0.9) * uAlpha * (1.0 - smoothstep(0.85, 1.0, d.y) * 0.5);
          gl_FragColor = vec4(uColor * (1.0 + frameEdge * 1.5), a);
        }`,
        { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color('#5fe4ff') } },
      ),
    [],
  );
  const prev = useRef(0);
  useFrame((st, dt) => {
    const m = mesh.current;
    if (!m) return;
    const x = xrayUniforms.uSweep.value;
    const front = spec.length / 2 + 0.6;
    const rear = -spec.length / 2 - 0.6;
    const moving = Math.abs(x - prev.current) > 1e-4;
    prev.current = x;
    const inside = x < front - 0.05 && x > rear + 0.05;
    const goal = moving && inside ? 1 : 0;
    const u = mat.uniforms;
    u.uAlpha!.value = THREE.MathUtils.damp(u.uAlpha!.value, goal, goal ? 18 : 6, dt);
    u.uTime!.value = st.clock.elapsedTime;
    m.position.set(x, spec.roof / 2 + 0.05 + frame.explode * 1.7, 0);
    m.visible = u.uAlpha!.value > 0.01;
  });
  return (
    <mesh ref={mesh} rotation-y={Math.PI / 2} material={mat} renderOrder={5}>
      <planeGeometry args={[spec.width + 0.9, spec.roof + 0.5]} />
    </mesh>
  );
}

/* ------------------------------------------------------ selection shockwave */

/** Floor ring that bursts outward from a newly selected system, plus a vertical data column. */
export function SelectionFX({ spec }: { spec: CarSpec }) {
  const ring = useRef<THREE.Mesh>(null);
  const column = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(
    () =>
      additive(
        /* glsl */ `uniform float uP; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float w = 0.06 + uP * 0.1;
          float ringA = smoothstep(uP - w, uP, r) * (1.0 - smoothstep(uP, uP + 0.015, r));
          float inner = smoothstep(uP, 0.0, r) * 0.12;
          float ticks = step(0.5, fract(atan(vUv.y - 0.5, abs(vUv.x - 0.5) < 1e-4 ? 1e-4 : vUv.x - 0.5) * 9.549)) * 0.6 + 0.4;
          gl_FragColor = vec4(uColor, (ringA * ticks + inner) * (1.0 - uP));
        }`,
        { uP: { value: 1 }, uColor: { value: new THREE.Color('#4fd8ff') } },
      ),
    [],
  );
  const colMat = useMemo(
    () =>
      additive(
        /* glsl */ `uniform float uTime; uniform float uA; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float bands = smoothstep(0.6, 1.0, sin(vUv.y * 40.0 - uTime * 8.0)) * 0.7;
          float edge = pow(abs(sin(vUv.x * 3.14159 * 2.0)), 6.0);
          float fade = smoothstep(1.0, 0.2, vUv.y) * smoothstep(0.0, 0.05, vUv.y);
          gl_FragColor = vec4(uColor, (0.18 + bands + edge * 0.4) * fade * uA);
        }`,
        { uTime: { value: 0 }, uA: { value: 0 }, uColor: { value: new THREE.Color('#4fd8ff') } },
      ),
    [],
  );
  const last = useRef<string | null>(null);
  useFrame((st, dt) => {
    const s = hud.get();
    const t = st.clock.elapsedTime;
    if (s.selected !== last.current) {
      last.current = s.selected;
      if (s.selected) {
        frame.pulseAt = t;
        frame.pulseId = s.selected;
        frame.punch = Math.max(frame.punch, 0.6);
      }
    }
    const def = frame.pulseId ? SYSTEM_BY_ID[frame.pulseId] : null;
    if (!def || !ring.current || !column.current) return;
    const [x, y, z] = def.anchor(spec);
    const [ox, oy, oz] = explodeOffset(def, spec, frame.explode);
    const color = new THREE.Color(def.color);
    // ring: 0 → 1 over 1.1s
    const p = Math.min(1, (t - frame.pulseAt) / 1.1);
    ringMat.uniforms.uP!.value = 1 - Math.pow(1 - p, 3);
    ringMat.uniforms.uColor!.value.copy(color);
    ring.current.position.set(x + ox, 0.02, z + oz);
    ring.current.visible = p < 1;
    // column: stays while the system is selected
    const on = s.selected === def.id ? 1 : 0;
    colMat.uniforms.uA!.value = THREE.MathUtils.damp(colMat.uniforms.uA!.value, on, 5, dt);
    colMat.uniforms.uTime!.value = t;
    colMat.uniforms.uColor!.value.copy(color);
    const top = y + oy;
    column.current.position.set(x + ox, top / 2, z + oz);
    column.current.scale.set(1, Math.max(0.01, top), 1);
    column.current.visible = colMat.uniforms.uA!.value > 0.01;
  });
  return (
    <>
      <mesh ref={ring} rotation-x={-Math.PI / 2} material={ringMat} renderOrder={4}>
        <planeGeometry args={[6, 6]} />
      </mesh>
      <mesh ref={column} material={colMat} renderOrder={4}>
        <cylinderGeometry args={[0.09, 0.16, 1, 24, 1, true]} />
      </mesh>
    </>
  );
}

/* ---------------------------------------------------------------- orbit rings */

/** Two counter-rotating segmented hologram rings around the car; brighter while scanning. */
export function OrbitRings({ spec }: { spec: CarSpec }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      additive(
        /* glsl */ `uniform float uA; uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          vec2 c = vUv - 0.5; float ang = atan(c.y, abs(c.x) < 1e-4 ? 1e-4 : c.x);
          float seg = step(0.18, fract(ang * 3.8197));          // 24 segments with gaps
          float major = step(0.92, fract(ang * 0.6366 + uTime * 0.05)); // 4 travelling bright arcs
          gl_FragColor = vec4(uColor, (seg * 0.35 + major * 0.9) * uA);
        }`,
        { uA: { value: 0.2 }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#4fd8ff') } },
      ),
    [],
  );
  const R = spec.length / 2 + 1.1;
  useFrame((st, dt) => {
    const s = hud.get();
    const goal = s.photo ? 0 : 0.18 + frame.xray * 0.55;
    mat.uniforms.uA!.value = THREE.MathUtils.damp(mat.uniforms.uA!.value, goal, 4, dt);
    mat.uniforms.uTime!.value = st.clock.elapsedTime;
    if (a.current) a.current.rotation.z += dt * 0.12;
    if (b.current) b.current.rotation.z -= dt * 0.08;
  });
  return (
    <group position-y={0.02}>
      <mesh ref={a} rotation-x={-Math.PI / 2} material={mat}>
        <ringGeometry args={[R, R + 0.05, 160]} />
      </mesh>
      <group position-y={spec.roof + 0.35} rotation-x={0.06}>
        <mesh ref={b} rotation-x={-Math.PI / 2} material={mat}>
          <ringGeometry args={[R * 0.72, R * 0.72 + 0.03, 160]} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- headlights */

/** H toggles: volumetric cones out of the lamps, a light pool on the floor, real spot lights. */
export function Headlights({ spec }: { spec: CarSpec }) {
  const grp = useRef<THREE.Group>(null);
  const lamps = useRef<THREE.Group>(null);
  const spots = useRef<(THREE.SpotLight | null)[]>([]);
  const amount = useRef(0);
  const coneMat = useMemo(
    () =>
      additive(
        /* glsl */ `uniform float uA; varying vec2 vUv;
        void main(){ float near = 1.0 - vUv.y; float edge = 0.4 + 0.6 * pow(abs(sin(vUv.x * 6.28318)), 1.5);
          gl_FragColor = vec4(vec3(0.85, 0.94, 1.0), pow(clamp(near, 0.0, 1.0), 1.6) * edge * 0.2 * uA); }`,
        { uA: { value: 0 } },
      ),
    [],
  );
  const poolMat = useMemo(
    () =>
      additive(
        /* glsl */ `uniform float uA; varying vec2 vUv;
        void main(){ vec2 d = (vUv - vec2(0.5, 0.35)) * vec2(2.0, 1.4); float r = length(d);
          gl_FragColor = vec4(vec3(0.8, 0.92, 1.0), smoothstep(1.0, 0.0, r) * 0.35 * uA); }`,
        { uA: { value: 0 } },
      ),
    [],
  );
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(spec.length / 2 + 6, 0, 0);
    return o;
  }, [spec.length]);
  const y = spec.bumperTop + 0.08;
  const nose = spec.length / 2;
  const L = 5.5;
  useFrame((_, dt) => {
    const s = hud.get();
    amount.current = THREE.MathUtils.damp(amount.current, s.headlights ? 1 : 0, 6, dt);
    const k = amount.current;
    coneMat.uniforms.uA!.value = k;
    poolMat.uniforms.uA!.value = k;
    spots.current.forEach((l) => l && (l.intensity = k * 40));
    headlightMaterial.emissiveIntensity = 3.2 + k * 5;
    if (grp.current) grp.current.visible = k > 0.01;
    if (lamps.current) lamps.current.position.y = frame.explode * 1.7;
  });
  return (
    <group ref={grp}>
      <primitive object={target} />
      <group ref={lamps}>
      {[1, -1].map((side, i) => (
        <group key={side} position={[nose, y, side * spec.width * 0.34]}>
          <mesh position-x={L / 2} rotation-z={-Math.PI / 2} material={coneMat}>
            <cylinderGeometry args={[0.9, 0.06, L, 32, 1, true]} />
          </mesh>
          <spotLight ref={(el) => void (spots.current[i] = el)} target={target} angle={0.42} penumbra={0.7} distance={14} intensity={0} color="#e8f4ff" />
        </group>
      ))}
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[nose + 2.8, 0.008, 0]} material={poolMat}>
        <planeGeometry args={[5.5, 3.6]} />
      </mesh>
    </group>
  );
}
