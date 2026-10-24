import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';

/**
 * The hangar floor: a reflective turntable inside a hologram grid, with a
 * slowly counter-rotating tick ring — the "unit pedestal" look of an RTS
 * selection screen.
 */
const gridMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#2fa8e0') } },
  vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
    void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
    float line(float v, float w){ float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4); return 1.0 - min(d / w, 1.0); }
    void main(){
      float r = length(vW.xz);
      float g = max(line(vW.x * 1.0, 1.0), line(vW.z * 1.0, 1.0)) * 0.55;
      float g2 = max(line(vW.x * 4.0, 1.0), line(vW.z * 4.0, 1.0)) * 0.12;
      float fade = smoothstep(26.0, 6.0, r);
      float pulse = smoothstep(0.0, 0.08, 0.08 - abs(fract(r * 0.12 - uTime * 0.15) - 0.5) * 0.16) * 0.6;
      float a = (g + g2 + pulse * 0.4) * fade;
      gl_FragColor = vec4(uColor, a * 0.55);
    }`,
  extensions: { derivatives: true } as never,
});

export function Pedestal({ radius = 4.2, color = '#2fa8e0', reflector = 1024 }: { radius?: number; color?: string; reflector?: number | null }) {
  gridMaterial.uniforms.uColor!.value.set(color);
  const ring = useRef<THREE.Group>(null);
  const ticks = useMemo(() => {
    const g = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.01, 0.22), new THREE.MeshBasicMaterial({ color: '#4fd8ff', toneMapped: false }), 120);
    g.userData.tick = true;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const long = i % 10 === 0;
      m.compose(
        new THREE.Vector3(Math.cos(a) * (radius + 0.35), 0.012, Math.sin(a) * (radius + 0.35)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)),
        new THREE.Vector3(long ? 2 : 1, 1, long ? 1.8 : 1),
      );
      g.setMatrixAt(i, m);
    }
    return g;
  }, [radius]);

  useEffect(() => {
    (ticks.material as THREE.MeshBasicMaterial).color.set(color);
  }, [ticks, color]);
  useFrame((s, dt) => {
    gridMaterial.uniforms.uTime!.value = s.clock.elapsedTime;
    if (ring.current) ring.current.rotation.y -= dt * 0.06;
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
        <circleGeometry args={[radius, 96]} />
        {reflector === null ? (
          <meshStandardMaterial color="#0a121a" metalness={0.7} roughness={0.35} />
        ) : (
        <MeshReflectorMaterial
          key={reflector}
          blur={[400, 120]}
          resolution={reflector}
          mixBlur={1}
          mixStrength={18}
          roughness={0.85}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color="#0a121a"
          metalness={0.6}
          mirror={0.6}
        />
        )}
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
        <ringGeometry args={[radius - 0.03, radius + 0.03, 128]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.003}>
        <ringGeometry args={[radius + 0.6, radius + 0.62, 128]} />
        <meshBasicMaterial color="#1f6f96" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <group ref={ring}>
        <primitive object={ticks} />
      </group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} material={gridMaterial}>
        <planeGeometry args={[60, 60]} />
      </mesh>
    </group>
  );
}
