import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, ContactShadows, Environment, Lightformer, OrbitControls, Sparkles } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Noise, Scanline, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Car } from './Car.tsx';
import { Pedestal } from './Pedestal.tsx';
import { carSpec, type CarSpec } from './carSpec.ts';
import { SYSTEMS, explodeOffset } from './systems.ts';
import { PRESETS, type LightPreset } from './presets.ts';
import { Headlights, OrbitRings, ScanPlane, SelectionFX } from './fx.tsx';
import { resolveTier, type Tier } from './quality.ts';
import { frame, hud, useHud, xrayActive } from '../hud/store.ts';

/** Studio lighting rig rendered into the environment map (no HDR download). */
function Studio({ p }: { p: LightPreset }) {
  const e = p.env;
  // keyed by preset so the one-frame environment capture re-renders on a switch
  return (
    <Environment key={p.id} resolution={512} frames={1}>
      <Lightformer form="rect" intensity={4 * e.k} color={e.top} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={2.2 * e.k} color={e.front} position={[0, 3, 7]} scale={[10, 2, 1]} />
      <Lightformer form="rect" intensity={2.4 * e.k} color={e.left} position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[12, 0.6, 1]} />
      <Lightformer form="rect" intensity={1.6 * e.k} color={e.right} position={[6, 2, -2]} rotation-y={-Math.PI / 2} scale={[8, 1, 1]} />
      <Lightformer form="ring" intensity={2 * e.k} color={e.ring} position={[0, 2, -8]} scale={4} />
      <Lightformer form="rect" intensity={0.8 * e.k} color={e.accent} position={[4, 0.4, 6]} rotation-y={-Math.PI / 4} scale={[6, 0.3, 1]} />
    </Environment>
  );
}

/** Volumetric-looking light shafts over the pedestal (additive cones with a height falloff). */
const beamMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: { uColor: { value: new THREE.Color('#4fb8ff') }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `varying float vH; varying vec3 vN; varying vec3 vV;
    void main(){ vH = uv.y; vec4 w = modelMatrix * vec4(position,1.0); vN = mat3(modelMatrix)*normal; vV = cameraPosition - w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying float vH; varying vec3 vN; varying vec3 vV;
    void main(){ vec3 n = vN / max(length(vN), 1e-5); vec3 v = vV / max(length(vV), 1e-5);
      float edge = pow(clamp(abs(dot(n, v)), 0.0, 1.0), 2.0);
      float flick = 0.85 + 0.15 * sin(uTime * 1.7 + vH * 6.0);
      gl_FragColor = vec4(uColor, edge * pow(clamp(vH, 0.0, 1.0), 1.4) * 0.16 * flick); }`,
});

/** Soft cyan pool of light under the chassis (no specular hot-spot on the mirror floor). */
const underglow = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color('#1f9fff') } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `uniform vec3 uColor; varying vec2 vUv;
    void main(){ vec2 d = (vUv - 0.5) * 2.0; float r = length(d * vec2(1.0, 1.0)); gl_FragColor = vec4(uColor, smoothstep(1.0, 0.0, r) * 0.32); }`,
});

function Beams() {
  useFrame((s) => (beamMaterial.uniforms.uTime!.value = s.clock.elapsedTime));
  return (
    <group>
      {[
        [-2.6, -1.4, 0.18],
        [2.4, -1.8, -0.15],
        [0.2, 2.3, 0.05],
      ].map(([x, z, tilt], i) => (
        <mesh key={i} position={[x!, 4.2, z!]} rotation={[tilt!, 0, -tilt!]} material={beamMaterial}>
          <cylinderGeometry args={[0.35, 2.1, 8.4, 40, 1, true]} />
        </mesh>
      ))}
    </group>
  );
}

function Lights({ p, tier }: { p: LightPreset; tier: Tier }) {
  const key = useRef<THREE.DirectionalLight>(null);
  return (
    <>
      <ambientLight intensity={p.ambient} color="#9cc8ff" />
      <directionalLight
        ref={key}
        castShadow
        position={[5, 9, 4]}
        intensity={p.key.intensity}
        color={p.key.color}
        shadow-mapSize={[tier.shadow, tier.shadow]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
      />
      <spotLight position={[-6, 4, -5]} angle={0.5} penumbra={0.8} intensity={60} color={p.rimA} />
      <spotLight position={[6, 3, -4]} angle={0.6} penumbra={1} intensity={30} color={p.rimB} />
    </>
  );
}

/** Pulsing target rings on each system anchor, shown while scanning or selected. */
function Hotspots({ spec }: { spec: CarSpec }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const anchors = useMemo(() => SYSTEMS.map((d) => d.anchor(spec)), [spec]);
  useFrame((state) => {
    const s = hud.get();
    const t = state.clock.elapsedTime;
    SYSTEMS.forEach((d, i) => {
      const g = refs.current[i];
      if (!g) return;
      const [ox, oy, oz] = explodeOffset(d, spec, frame.explode);
      g.position.set(ox, oy, oz);
      const focus = s.hovered === d.id || s.selected === d.id;
      const show = frame.xray > 0.4 || focus;
      const k = focus ? 1.6 + Math.sin(t * 6) * 0.2 : 1 + Math.sin(t * 2 + i) * 0.08;
      g.scale.setScalar(show ? k : 0.0001);
    });
  });
  return (
    <>
      {SYSTEMS.map((d, i) => (
        <Billboard key={d.id} position={anchors[i]}>
          <group ref={(el) => void (refs.current[i] = el)}>
            <mesh>
              <ringGeometry args={[0.055, 0.07, 32]} />
              <meshBasicMaterial color={d.color} toneMapped={false} transparent opacity={0.95} depthTest={false} />
            </mesh>
            <mesh>
              <circleGeometry args={[0.022, 16]} />
              <meshBasicMaterial color={d.color} toneMapped={false} depthTest={false} />
            </mesh>
          </group>
        </Billboard>
      ))}
    </>
  );
}

/**
 * Camera behaviour: slow auto-rotation, drag to orbit, fly to a selected
 * system, and a lateral offset when a side panel view is open.
 */
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const IDLE_MS = 30_000;

function Rig({ spec }: { spec: CarSpec }) {
  const controls = useRef<{ target: THREE.Vector3; autoRotate: boolean; autoRotateSpeed: number; update(): void } | null>(null);
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const goalTarget = useRef(new THREE.Vector3());
  const goalDist = useRef(9.5);
  const intro = useRef<number | null>(null);
  const prevExplode = useRef(false);
  const sph = useMemo(() => new THREE.Spherical(), []);
  const booted = useHud((s) => s.booted);
  useEffect(() => {
    camera.position.set(7, 2.6, 6.5);
  }, [camera]);
  // cinematic fly-in once the boot screen lifts
  useEffect(() => {
    if (!booted) return;
    frame.lastInput = performance.now();
    if (!hud.get().settings.reducedMotion) intro.current = performance.now();
  }, [booted]);
  useFrame((state, dt) => {
    const c = controls.current;
    if (!c) return;
    const s = hud.get();
    const now = performance.now();
    const t = state.clock.elapsedTime;

    if (intro.current !== null) {
      const p = Math.min(1, (now - intro.current) / 3000);
      const e = easeInOut(p);
      c.target.set(0, 0.75, 0);
      sph.set(THREE.MathUtils.lerp(26, 9.5, e), THREE.MathUtils.lerp(0.32, 1.38, e), Math.atan2(7, 6.5) + (1 - e) * 2.2);
      camera.position.setFromSpherical(sph).add(c.target);
      camera.lookAt(c.target);
      c.update();
      if (p >= 1) intro.current = null;
      return;
    }

    const busy = s.selected || s.photo || s.openPart || s.paletteOpen || s.helpOpen || s.settingsOpen || s.orderOpen || s.tour !== null;
    const idleNow = s.settings.attract && s.view === 'hangar' && !busy && now - frame.lastInput > IDLE_MS;
    // (manual start sets lastInput into the past, see startShowcase)
    if (idleNow !== s.idle) hud.set({ idle: idleNow });
    if (s.explode !== prevExplode.current) {
      prevExplode.current = s.explode;
      frame.punch = Math.max(frame.punch, 1);
    }
    const sel = s.selected ? SYSTEMS.find((d) => d.id === s.selected) : null;
    const viewOffset = s.view === 'hangar' ? 0 : -3.6;
    if (sel) {
      const [ox, oy, oz] = explodeOffset(sel, spec, frame.explode);
      goalTarget.current.set(...sel.anchor(spec)).add(new THREE.Vector3(ox, oy, oz));
      goalDist.current = 4.2;
    } else {
      goalTarget.current.set(0, 0.75 + frame.explode * 0.9, 0);
      goalDist.current = (s.view === 'hangar' ? 9.5 : 13.5) + frame.explode * 2.5 + (s.idle ? Math.sin(t * 0.16) * 2.4 + 1.8 : 0);
    }
    // shift the orbit centre sideways in screen space so panels don't cover the car
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(viewOffset);
    const tgt = goalTarget.current.clone().add(right);
    c.target.lerp(tgt, 1 - Math.exp(-dt * 3));
    const dir = camera.position.clone().sub(c.target);
    const dist = THREE.MathUtils.damp(dir.length(), goalDist.current, 2.5, dt);
    camera.position.copy(c.target).add(dir.setLength(dist));
    if (s.idle) {
      // attract mode: drift the camera height as it orbits
      sph.setFromVector3(camera.position.clone().sub(c.target));
      sph.phi = THREE.MathUtils.damp(sph.phi, 1.12 + Math.sin(t * 0.11) * 0.28, 0.8, dt);
      camera.position.setFromSpherical(sph).add(c.target);
    }
    c.autoRotate = (s.autoRotate || s.idle) && !s.hoverCar && !s.selected;
    c.autoRotateSpeed = s.idle ? 1.4 : s.settings.reducedMotion ? 0.3 : 0.55;
    c.update();
    // camera punch: a short zoom kick plus shake on big events
    frame.punch = THREE.MathUtils.damp(frame.punch, 0, 4, dt);
    const fov = 32 - frame.punch * 2.2;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (frame.punch > 0.02 && s.settings.shake && !s.photo) {
      const a = frame.punch * frame.punch * 0.012;
      camera.rotateX((Math.random() - 0.5) * a);
      camera.rotateY((Math.random() - 0.5) * a);
    }
    const az = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
    if (Math.abs(az - s.azimuth) > 0.03) hud.set({ azimuth: az });
  });
  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotateSpeed={0.55}
      enablePan={false}
      minDistance={3}
      maxDistance={16}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2 - 0.04}
      rotateSpeed={0.6}
    />
  );
}

function Effects({ p, tier }: { p: LightPreset; tier: Tier }) {
  const active = useHud(xrayActive);
  const photo = useHud((s) => s.photo);
  const fx = useHud((s) => s.settings);
  const chroma = useMemo(() => new THREE.Vector2(0.0007, 0.0009), []);
  // chromatic kick follows the camera punch
  useFrame(() => {
    const k = fx.chroma ? 1 + frame.punch * 6 : 0;
    chroma.set(0.0007 * k, 0.0009 * k);
  });
  return (
    <EffectComposer multisampling={tier.msaa}>
      <Bloom mipmapBlur intensity={fx.bloom ? (active ? 1.45 : 1) * p.bloom : 0} luminanceThreshold={0.62} luminanceSmoothing={0.2} radius={0.75} />
      <ChromaticAberration offset={chroma} radialModulation modulationOffset={0.35} />
      <Scanline blendFunction={BlendFunction.OVERLAY} density={1.4} opacity={photo || !fx.scanlines ? 0 : 0.06} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.35} />
      <Vignette eskil={false} offset={photo ? 0.32 : 0.22} darkness={photo ? 0.95 : 0.82} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

/** Marks the "shaders" load stage once the GPU has drawn a few real frames. */
function FirstFrames() {
  const n = useRef(0);
  const { gl, scene, camera } = useThree();
  useFrame(() => {
    // compile every program up front (parallel where the driver supports it) so a
    // slow integrated GPU doesn't stall or flash once the boot screen lifts
    if (++n.current !== 3) return;
    const done = () => hud.stage('shaders');
    gl.compileAsync(scene, camera).then(done, done);
  });
  return null;
}

export function Scene() {
  const vehicles = useHud((s) => s.garage.vehicles);
  const body = vehicles[0]?.body;
  const spec = useMemo(() => carSpec(body), [body]);
  const p = PRESETS[useHud((s) => s.lightPreset)];
  const particles = useHud((s) => s.settings.particles);
  const tier = resolveTier(useHud((s) => s.settings.quality));
  useEffect(() => {
    beamMaterial.uniforms.uColor!.value.set(p.beam);
    underglow.uniforms.uColor!.value.set(p.under);
  }, [p]);
  return (
    <Canvas
      className="scene"
      shadows="percentage"
      flat
      dpr={tier.dpr}
      camera={{ fov: 32, near: 0.1, far: 120, position: [7, 2.6, 6.5] }}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true }}
      onPointerMissed={() => hud.get().selected && hud.set({ selected: null })}
    >
      <color attach="background" args={[p.bg]} />
      <fog attach="fog" args={[p.bg, p.fog[0], p.fog[1]]} />
      <Suspense fallback={null}>
        <Studio p={p} />
        <Lights key={tier.shadow} p={p} tier={tier} />
        <group position={[0, 0, 0]}>
          <Car spec={spec} />
          <Hotspots spec={spec} />
          <ScanPlane spec={spec} />
          <SelectionFX spec={spec} />
          <OrbitRings spec={spec} />
          <Headlights spec={spec} />
        </group>
        <Beams />
        <mesh rotation-x={-Math.PI / 2} position-y={0.006} material={underglow}>
          <planeGeometry args={[spec.length * 1.5, spec.width * 2.2]} />
        </mesh>
        <Pedestal radius={Math.max(3.6, spec.length / 2 + 1)} color={p.grid} reflector={tier.reflector} />
        <ContactShadows position={[0, 0.001, 0]} opacity={0.75} scale={9} blur={2.6} far={2} color="#000000" />
        {particles && <Sparkles count={140} scale={[14, 5, 14]} position={[0, 2.5, 0]} size={2.2} speed={0.25} opacity={0.5} color={p.sparkle} />}
        <Rig spec={spec} />
        <Effects key={tier.msaa} p={p} tier={tier} />
        <FirstFrames />
      </Suspense>
    </Canvas>
  );
}
