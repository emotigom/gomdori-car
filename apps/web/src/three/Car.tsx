import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCar } from './buildCar.ts';
import type { CarSpec } from './carSpec.ts';
import { xrayUniforms } from './materials.ts';
import { SYSTEMS, explodeOffset } from './systems.ts';
import { frame, hud, useHud, xrayActive } from '../hud/store.ts';

const tmp = new THREE.Vector3();

/**
 * The car + its behaviour: X-ray scan on hover, per-system glow, the
 * "materialise" scan when a new vehicle is built, and projection of every
 * system anchor to screen space for the leader lines.
 */
export function Car({ spec }: { spec: CarSpec }) {
  const paint = useHud((s) => s.garage.paint);
  const booted = useHud((s) => s.booted);
  const build = useMemo(() => buildCar(spec, paint), [spec, paint]);
  const outTimer = useRef<number | null>(null);
  const born = useRef(performance.now());

  useEffect(() => {
    // materialise: start fully X-rayed, then scan the paint back on
    xrayUniforms.uSweep.value = -spec.length / 2 - 0.6;
    xrayUniforms.uXray.value = 1;
    born.current = performance.now();
    hud.stage('chassis');
    return () => build.dispose();
  }, [build, spec.length]);

  // replay the materialise scan the moment the boot screen lifts
  useEffect(() => {
    if (!booted) return;
    xrayUniforms.uSweep.value = -spec.length / 2 - 0.6;
    xrayUniforms.uXray.value = 1;
    born.current = performance.now() + 500;
  }, [booted, spec.length]);

  useFrame((state, dt) => {
    const s = hud.get();
    const active = xrayActive(s) || performance.now() - born.current < 900;
    const front = spec.length / 2 + 0.6;
    const rear = -spec.length / 2 - 0.6;
    const target = active ? rear : front;
    const speed = active ? 7.5 : 5.5; // m/s
    const cur = xrayUniforms.uSweep.value;
    const step = Math.sign(target - cur) * Math.min(Math.abs(target - cur), speed * dt);
    xrayUniforms.uSweep.value = cur + step;
    xrayUniforms.uXray.value = THREE.MathUtils.damp(xrayUniforms.uXray.value, active ? 1 : 0, 5, dt);
    xrayUniforms.uTime.value = state.clock.elapsedTime;
    frame.xray = xrayUniforms.uXray.value;

    const t = state.clock.elapsedTime;
    const focus = s.hovered ?? s.selected;
    for (const def of SYSTEMS) {
      const m = build.systems[def.id]!.material;
      const isFocus = focus === def.id;
      const dimmed = focus !== null && !isFocus;
      const goal = isFocus ? 2.6 + Math.sin(t * 6) * 0.6 : dimmed ? 0.15 : frame.xray * 0.9;
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, goal, 8, dt);
    }

    // exploded view + idle life: wheels turn, body breathes on its springs
    frame.explode = THREE.MathUtils.damp(frame.explode, s.explode ? 1 : 0, 3.2, dt);
    const k = frame.explode;
    for (const def of SYSTEMS) {
      const g = build.systems[def.id]!.group;
      const [ox, oy, oz] = explodeOffset(def, spec, k);
      g.position.set(ox, oy, oz);
    }
    const lift = k * 1.7;
    const sway = Math.sin(t * 1.3) * 0.006 * (1 - k);
    build.shell.position.y = build.xray.position.y = lift + sway;
    build.shell.rotation.x = build.xray.rotation.x = Math.sin(t * 0.9) * 0.0035;
    const spin = s.autoRotate && !s.selected ? dt * 1.6 : 0;
    build.shell.traverse((o) => {
      if (o.userData.wheel) {
        o.rotation.z -= spin;
        o.position.y = spec.wheelR - lift - sway; // wheels stay on the floor
      }
    });

    // project anchors for the DOM leader lines
    const cam = state.camera;
    frame.width = state.size.width;
    frame.height = state.size.height;
    for (const def of SYSTEMS) {
      const [ox, oy, oz] = explodeOffset(def, spec, k);
      tmp.copy(build.anchors[def.id]!).add(new THREE.Vector3(ox, oy, oz)).applyMatrix4(build.root.matrixWorld).project(cam);
      frame.anchors[def.id] = {
        x: (tmp.x * 0.5 + 0.5) * state.size.width,
        y: (-tmp.y * 0.5 + 0.5) * state.size.height,
        visible: tmp.z < 1,
      };
    }
  });

  const systemOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    for (const hit of e.intersections) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.system) return o.userData.system as string;
        o = o.parent;
      }
    }
    return null;
  };

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        if (outTimer.current) clearTimeout(outTimer.current);
        if (!hud.get().hoverCar) hud.set({ hoverCar: true });
        document.body.style.cursor = 'crosshair';
      }}
      onPointerOut={() => {
        if (outTimer.current) clearTimeout(outTimer.current);
        outTimer.current = window.setTimeout(() => {
          hud.set({ hoverCar: false, hovered: null });
          document.body.style.cursor = '';
        }, 220);
      }}
      onPointerMove={(e) => {
        if (frame.xray < 0.5) return;
        const id = systemOf(e);
        if (id !== hud.get().hovered) hud.set({ hovered: id });
      }}
      onClick={(e) => {
        e.stopPropagation();
        const id = systemOf(e);
        if (id) hud.set({ selected: id === hud.get().selected ? null : id });
      }}
    >
      <primitive object={build.root} />
    </group>
  );
}
