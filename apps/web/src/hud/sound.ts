import { hud, type HudState } from './store.ts';
import { load, save } from './persist.ts';

/**
 * Synthesised UI sound (Web Audio, no files): short sine/square blips for
 * selection, a filtered noise sweep for the X-ray scan, a falling chirp for
 * view warps. Starts after the first user gesture (browser autoplay rules).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let muted = load('muted', false);

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.3 * hud.get().settings.volume;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.6, slide = 0) {
  const a = ac();
  if (!a || !master) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

function noiseSweep(dur: number, from: number, to: number, gain = 0.35) {
  const a = ac();
  if (!a || !master) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(from, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  tick: () => tone(1800, 0.03, 'square', 0.08),
  select: () => {
    tone(660, 0.08, 'triangle', 0.5);
    setTimeout(() => tone(990, 0.1, 'triangle', 0.4), 60);
  },
  deselect: () => tone(520, 0.12, 'triangle', 0.35, -220),
  scan: () => noiseSweep(0.7, 600, 5200, 0.25),
  warp: () => {
    tone(1200, 0.25, 'sawtooth', 0.12, -900);
    noiseSweep(0.3, 3000, 400, 0.15);
  },
  confirm: () => {
    tone(880, 0.07, 'sine', 0.45);
    setTimeout(() => tone(1320, 0.12, 'sine', 0.4), 70);
  },
  error: () => tone(220, 0.25, 'square', 0.2, -60),
  explode: () => noiseSweep(0.9, 200, 1800, 0.3),
  lampOn: () => {
    tone(140, 0.09, 'square', 0.25);
    setTimeout(() => tone(2400, 0.18, 'sine', 0.12, 600), 70);
  },
};

export function setMuted(m: boolean) {
  muted = m;
  save('muted', m);
  hud.set({ muted: m });
  if (!m) sfx.confirm();
  syncAmbient();
}

/**
 * Hangar ambience: two detuned low saws through a slowly breathing low-pass,
 * plus a faint filtered-noise air handler. Off by default.
 */
let amb: { stop(): void } | null = null;
function startAmbient() {
  const a = ac();
  if (!a || !master || amb) return;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, a.currentTime);
  out.gain.exponentialRampToValueAtTime(0.22, a.currentTime + 2.5);
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  lp.Q.value = 4;
  const lfo = a.createOscillator();
  const lfoG = a.createGain();
  lfo.frequency.value = 0.07;
  lfoG.gain.value = 140;
  lfo.connect(lfoG).connect(lp.frequency);
  const oscs = [55, 55.4, 82.6].map((f) => {
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    return o;
  });
  const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const air = a.createBufferSource();
  air.buffer = buf;
  air.loop = true;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  const airG = a.createGain();
  airG.gain.value = 0.08;
  air.connect(bp).connect(airG).connect(out);
  lp.connect(out).connect(master);
  [...oscs, lfo, air].forEach((n) => n.start());
  amb = {
    stop() {
      const t = a.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      [...oscs, lfo, air].forEach((n) => n.stop(t + 0.9));
    },
  };
}
function syncAmbient() {
  const want = hud.get().settings.ambient && !muted;
  if (want && !amb) startAmbient();
  else if (!want && amb) {
    amb.stop();
    amb = null;
  }
}

/** Derive sounds from state changes so feature code never has to call sfx directly. */
let installed = false;
export function installSound() {
  if (installed) return;
  installed = true;
  let prev: HudState = hud.get();
  hud.subscribe(() => {
    const s = hud.get();
    if (s.booted) {
      if (s.selected !== prev.selected) (s.selected ? sfx.select : sfx.deselect)();
      if (s.view !== prev.view) sfx.warp();
      if (s.hoverCar && !prev.hoverCar && !s.selected) sfx.scan();
      if (s.explode !== prev.explode) sfx.explode();
      if (s.headlights !== prev.headlights) (s.headlights ? sfx.lampOn : sfx.deselect)();
      if (s.idle && !prev.idle) sfx.warp();
      if ((s.helpOpen && !prev.helpOpen) || (s.settingsOpen && !prev.settingsOpen) || (s.tour !== null && s.tour !== prev.tour)) sfx.select();
      if (s.lightPreset !== prev.lightPreset || s.order.length > prev.order.length) sfx.confirm();
      if (s.toasts.length > prev.toasts.length) {
        const t = s.toasts[s.toasts.length - 1];
        if (t?.kind === 'bad') sfx.error();
      }
    }
    if (s.settings !== prev.settings) {
      if (master && ctx) master.gain.setTargetAtTime(0.3 * s.settings.volume, ctx.currentTime, 0.05);
      if (s.settings.volume !== prev.settings.volume) sfx.tick();
      syncAmbient();
    }
    prev = s;
  });
  // ambience needs a user gesture before an AudioContext may start
  addEventListener('pointerdown', () => syncAmbient(), { once: true });
  // soft tick on hovering HUD buttons
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest?.('.cmd, .navtab, .sp-chip, .subtab, .pal-item, .hbtn, .switch, .res');
    if (el && el !== lastHover) sfx.tick();
    lastHover = el;
  });
}
let lastHover: Element | null = null;
