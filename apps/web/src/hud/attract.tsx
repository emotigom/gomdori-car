import { PRESETS } from '../three/presets.ts';
import { BearMark } from './Hud.tsx';
import { frame, hud, useHud, type LightPresetId } from './store.ts';

/**
 * Attract mode: after a while with no input the hangar turns into a showcase —
 * the camera drifts (see Rig), lighting moods cycle, the X-ray pulses and the
 * headlights come on at night. Everything is restored on the first input.
 */
let installed = false;
export function installAttract() {
  if (installed) return;
  installed = true;
  let saved: { lightPreset: LightPresetId; xrayLock: boolean; headlights: boolean } | null = null;
  let timer: number | null = null;
  let step = 0;
  const ids = Object.keys(PRESETS) as LightPresetId[];
  // any input leaves attract mode (installed here, not in the 3D rig, so ?2d can exit too)
  const poke = () => {
    if (performance.now() < frame.attractGrace) return;
    frame.lastInput = performance.now();
    if (hud.get().idle) hud.set({ idle: false });
  };
  for (const e of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(e, poke, { passive: true });
  hud.subscribe(() => {
    const s = hud.get();
    if (s.idle && !saved) {
      saved = { lightPreset: s.lightPreset, xrayLock: s.xrayLock, headlights: s.headlights };
      step = 0;
      timer = window.setInterval(() => {
        step++;
        const cur = hud.get();
        if (step % 2) hud.set({ xrayLock: !cur.xrayLock });
        else {
          const next = ids[(ids.indexOf(cur.lightPreset) + 1) % ids.length]!;
          hud.set({ lightPreset: next, headlights: next === 'night' || next === 'sunset' });
        }
      }, 7000);
    } else if (!s.idle && saved) {
      if (timer) clearInterval(timer);
      timer = null;
      const r = saved;
      saved = null;
      hud.set(r);
    }
  });
}

export function AttractOverlay() {
  const idle = useHud((s) => s.idle);
  const preset = useHud((s) => s.lightPreset);
  if (!idle) return null;
  return (
    <div className="attract" aria-hidden>
      <div className="at-badge">
        <BearMark size={54} />
        <div>
          <b>곰도리</b>
          <span>PARTS COMMAND · {PRESETS[preset].ko}</span>
        </div>
      </div>
      <div className="at-press">마우스를 움직이거나 아무 키나 누르세요</div>
    </div>
  );
}

/** Start the showcase now (button / palette); small grace so the click itself doesn't end it. */
export function startShowcase() {
  frame.attractGrace = performance.now() + 1200;
  frame.lastInput = performance.now() - 60_000;
  hud.set({ view: 'hangar', selected: null, idle: true });
}
