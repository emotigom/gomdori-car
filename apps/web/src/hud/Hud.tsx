import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Vehicle } from '@gomdori/core';
import { data, type Mode } from '../data/index.ts';
import { carSpec, BODY_KO, type BodyType } from '../three/carSpec.ts';
import { SYSTEMS, SYSTEM_BY_ID } from '../three/systems.ts';
import { aud, compact, n0, pct, STATUS_KO } from '../ui/fmt.ts';
import { garageQuery, leafIds, loadGarage } from './controller.ts';
import { Icon } from './icons.tsx';
import { hud, useHud, xrayActive, type LightPresetId, type View } from './store.ts';
import { PRESETS } from '../three/presets.ts';
import { addToOrder, OrderButton } from './order.tsx';
import { planSystem } from './content.ts';
import { setMuted } from './sound.ts';
import { startShowcase } from './attract.tsx';
import { CountUp } from './overlays.tsx';

const TABS: { id: View; ko: string; en: string }[] = [
  { id: 'hangar', ko: '격납고', en: 'HANGAR' },
  { id: 'analysis', ko: '분석', en: 'ANALYSIS' },
  { id: 'parts', ko: '부품', en: 'PARTS' },
  { id: 'content', ko: '콘텐츠', en: 'CONTENT' },
  { id: 'market', ko: '시장 정보', en: 'INTEL' },
  { id: 'device', ko: '기기', en: 'DEVICE' },
];

export const PAINTS = [
  { name: '코발트', c: '#1f5fa8' },
  { name: '건메탈', c: '#3a4652' },
  { name: '크림슨', c: '#9e1b22' },
  { name: '아크틱', c: '#cfd8de' },
  { name: '앰버', c: '#c9781a' },
  { name: '오닉스', c: '#121519' },
];

/** 곰도리 emblem: a bear head inside the hex badge, drawn for this app. */
export function BearMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <path d="M20 2l16 9v18l-16 9-16-9V11z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="13" cy="13.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="27" cy="13.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="21.5" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <ellipse cx="20" cy="25" rx="3.6" ry="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.4" cy="19.5" r="1.3" fill="currentColor" />
      <circle cx="23.6" cy="19.5" r="1.3" fill="currentColor" />
      <circle cx="20" cy="24.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function TopBar({ mode, setMode, online }: { mode: Mode; setMode: (m: Mode) => void; online: boolean }) {
  const view = useHud((s) => s.view);
  const stats = useHud((s) => s.stats);
  const coverage = useHud((s) => s.coverage);
  const demo = useHud((s) => s.demo);
  const muted = useHud((s) => s.muted);
  const fit = coverage ? Object.values(coverage).reduce((a, b) => a + b, 0) : null;
  const res = [
    { k: '부품', v: stats ? stats.total : null, cls: '' },
    { k: '내 차 적용', v: fit, cls: 'cyan' },
    { k: '콘텐츠 준비', v: stats ? stats.contentReady ?? 0 : null, cls: 'green' },
    { k: 'HOLD', v: stats ? stats.byStatus.hold ?? 0 : null, cls: 'amber' },
  ];
  const fmt = (n: number) => compact.format(Math.round(n));
  return (
    <header className="topbar">
      <div className="emblem">
        <BearMark size={32} />
        <div>
          <b>곰도리</b>
          <span>DEMO PARTS STORE · PARTS COMMAND</span>
        </div>
      </div>
      <nav className="navtabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={view === t.id} className="navtab" onClick={() => switchView(t.id)}>
            <span>{t.ko}</span>
            <small>{t.en}</small>
          </button>
        ))}
      </nav>
      <div className="resources">
        {res.map((r) => (
          <div key={r.k} className={`res stat ${r.cls}`} title={r.k}>
            <i className="res-gem" />
            <span className="res-v">{r.v !== null ? <CountUp value={r.v} format={fmt} /> : <i className="skel skel-num" />}</span>
            <span className="res-k">{r.k}</span>
          </div>
        ))}
        <OrderButton />
        <button className="res sound" onClick={() => setMuted(!muted)} title={muted ? '사운드 켜기' : '사운드 끄기'} aria-pressed={!muted}>
          <Icon name={muted ? 'mute' : 'sound'} size={18} />
        </button>
        <button className="res pal" onClick={() => hud.set({ paletteOpen: true })} title="명령 팔레트 (Ctrl+K)">
          <Icon name="palette" size={18} />
        </button>
        <button className="res icon-btn" onClick={() => hud.set((s) => ({ settingsOpen: !s.settingsOpen, helpOpen: false }))} title="설정 ( , )">
          <Icon name="gear" size={18} />
        </button>
        <button className="res icon-btn" onClick={() => hud.set((s) => ({ helpOpen: !s.helpOpen, settingsOpen: false }))} title="조작법 ( ? )">
          <Icon name="help" size={18} />
        </button>
        <div className="res mode">
          <i className={`dot ${online ? 'on' : 'off'}`} />
          {demo ? (
            <span className="demo-tag" title="API 서버 없이 이 브라우저에서 만든 데모 카탈로그로 동작 중">기기 · 데모</span>
          ) : (
            <select aria-label="데이터 소스" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="auto">자동</option>
              <option value="edge">엣지</option>
              <option value="device">기기</option>
            </select>
          )}
        </div>
      </div>
    </header>
  );
}

/** Plays the screen-transition flash, then switches the view. */
export function switchView(v: View) {
  if (hud.get().view === v) return;
  document.documentElement.dataset.warp = String(Date.now());
  hud.set({ view: v, selected: null, hovered: null });
}

export function GaragePanel() {
  const g = useHud((s) => s.garage);
  const xrayLock = useHud((s) => s.xrayLock);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [span, setSpan] = useState<Vehicle[]>([]);

  // re-read once the catalogue is ready (on a static deploy it is generated on-device during boot)
  const ready = useHud((s) => s.stats?.computedAt ?? 0);
  useEffect(() => {
    void data.run(null, (s) => s.makes()).then((r) => setMakes(r.value)).catch(() => {});
  }, [ready]);
  useEffect(() => {
    void data.run(null, (s) => s.models(g.make)).then((r) => setModels(r.value)).catch(() => {});
    void data.run(null, (s) => s.vehicles(g.make, g.model)).then((r) => setSpan(r.value)).catch(() => {});
  }, [g.make, g.model, ready]);

  const years = useMemo(() => {
    if (!span.length) return [];
    const lo = Math.min(...span.map((v) => v.yearFrom));
    const hi = Math.max(...span.map((v) => v.yearTo));
    return Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  }, [span]);

  const set = (patch: Partial<typeof g>) => {
    hud.set((s) => ({ garage: { ...s.garage, ...patch }, selected: null }));
    void loadGarage();
  };
  const v = g.vehicles[0];
  const engines = [...new Set(g.vehicles.map((x) => x.engine))];
  const sides = [...new Set(g.vehicles.map((x) => x.driveSide))];

  return (
    <aside className="frame garage" aria-label="내 차">
      <div className="frame-title">
        <span>내 차</span>
        <small>MY VEHICLE</small>
      </div>
      <div className="garage-grid">
        <label>
          제조사
          <select value={g.make} onChange={(e) => set({ make: e.target.value, model: '', year: null })}>
            {makes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          모델
          <select
            value={g.model}
            onChange={(e) => set({ model: e.target.value, year: null })}
            onFocus={() => !g.model && models[0] && set({ model: models[0] })}
          >
            {!g.model && <option value="">선택</option>}
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          연식
          <select value={g.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })}>
            <option value="">전체</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <dl className="readout">
        <dt>차체</dt>
        <dd>{v ? BODY_KO[v.body as BodyType] ?? v.body : <i className="skel skel-line" />}</dd>
        <dt>엔진</dt>
        <dd>{v ? engines.join(' · ') : <i className="skel skel-line" />}</dd>
        <dt>핸들</dt>
        <dd>{v ? sides.map((s) => <span key={s} className={`pill ${s === 'LHD' ? 'warn' : 'mute'}`}>{s}</span>) : <i className="skel skel-line" />}</dd>
        <dt>전장</dt>
        <dd className="num">{v ? `${carSpec(v.body).length.toFixed(2)} m` : <i className="skel skel-line" />}</dd>
      </dl>
      <div className="paints" role="radiogroup" aria-label="도장 색">
        {PAINTS.map((p) => (
          <button
            key={p.c}
            role="radio"
            aria-checked={g.paint === p.c}
            title={p.name}
            className="paint"
            style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${p.c} 45%, #000 120%)` }}
            onClick={() => hud.set((s) => ({ garage: { ...s.garage, paint: p.c } }))}
          />
        ))}
      </div>
      <button className={`hbtn ${xrayLock ? 'on' : ''}`} onClick={() => hud.set({ xrayLock: !xrayLock })}>
        <Icon name="xray" size={16} /> X-RAY 고정 <kbd>X</kbd>
      </button>
      <StagePanel />
    </aside>
  );
}

function Minimap() {
  const vehicles = useHud((s) => s.garage.vehicles);
  const az = useHud((s) => s.azimuth);
  const selected = useHud((s) => s.selected);
  const coverage = useHud((s) => s.coverage);
  const spec = carSpec(vehicles[0]?.body);
  const S = 164;
  const k = (S - 40) / spec.length;
  const max = coverage ? Math.max(1, ...Object.values(coverage)) : 1;
  return (
    <div className="minimap">
      <svg viewBox={`${-S / 2} ${-S / 2} ${S} ${S}`} width="100%" height="100%">
        <circle r={S / 2 - 4} className="mm-ring" />
        <circle r={S / 2 - 22} className="mm-ring faint" />
        <line x1={-S / 2} x2={S / 2} y1={0} y2={0} className="mm-axis" />
        <line y1={-S / 2} y2={S / 2} x1={0} x2={0} className="mm-axis" />
        {/* view cone */}
        <g transform={`rotate(${(-az * 180) / Math.PI + 90})`}>
          <path d={`M0,0 L${S / 2},${-S * 0.2} A${S / 2},${S / 2} 0 0 1 ${S / 2},${S * 0.2} Z`} className="mm-cone" />
        </g>
        {/* car, nose up */}
        <rect x={(-spec.width * k) / 2} y={(-spec.length * k) / 2} width={spec.width * k} height={spec.length * k} rx={6} className="mm-car" />
        {SYSTEMS.map((d) => {
          const [x, , z] = d.anchor(spec);
          const r = 2.5 + (coverage ? (coverage[d.id]! / max) * 3.5 : 0);
          return (
            <circle
              key={d.id}
              cx={z * k}
              cy={-x * k}
              r={selected === d.id ? r + 2 : r}
              fill={d.color}
              className={`mm-dot ${selected === d.id ? 'on' : ''}`}
              onClick={() => hud.set({ selected: selected === d.id ? null : d.id })}
            >
              <title>{d.ko}</title>
            </circle>
          );
        })}
      </svg>
      <span className="mm-label">TOP · {Math.round(((az * 180) / Math.PI + 360) % 360)}°</span>
    </div>
  );
}

function InfoPanel() {
  const selected = useHud((s) => s.selected);
  const g = useHud((s) => s.garage);
  const coverage = useHud((s) => s.coverage);
  const samples = useHud((s) => s.samples);
  const stats = useHud((s) => s.stats);
  if (selected) {
    const d = SYSTEM_BY_ID[selected]!;
    const ids = new Set(leafIds(selected));
    const catalogue = stats?.byCategory.filter((c) => ids.has(c.id)).reduce((a, c) => a + c.count, 0) ?? 0;
    const list = samples[selected];
    return (
      <div className="info" key={selected} style={{ ['--c' as string]: d.color }}>
        <div className="portrait">
          <div className="portrait-rings" />
          <Icon name={d.id} size={54} />
          <span className="portrait-code">{d.code}</span>
        </div>
        <div className="info-body">
          <div className="info-head">
            <h2>{d.ko}</h2>
            <span className="faint">{d.group}</span>
            <span className="grow" />
            <button className="hbtn sm" onClick={() => planSystem(selected)}>
              콘텐츠로 기획
            </button>
            <button className="hbtn sm" onClick={() => openInExplorer(selected)}>
              부품 탐색에서 전체 보기
            </button>
          </div>
          <div className="info-stats">
            <div>
              <b className="num">{coverage ? n0.format(coverage[selected] ?? 0) : '—'}</b>
              <span>{g.make} {g.model} 적용</span>
            </div>
            <div>
              <b className="num">{compact.format(catalogue)}</b>
              <span>카탈로그 전체</span>
            </div>
            <div>
              <b className="num">{coverage && catalogue ? pct(coverage[selected] ?? 0, catalogue) : '—'}</b>
              <span>적용 비율</span>
            </div>
          </div>
          <div className="info-list">
            {!list ? (
              Array.from({ length: 4 }, (_, i) => <i key={i} className="skel skel-row" />)
            ) : !list.length ? (
              <div className="faint">이 차량에 등록된 적용 부품이 없습니다.</div>
            ) : (
              list.map((p) => (
                <div key={p.id} className="info-row" role="button" tabIndex={0} onClick={() => hud.set({ openPart: p })} onKeyDown={(e) => e.key === 'Enter' && hud.set({ openPart: p })}>
                  <span className="mono faint">{p.sku}</span>
                  <span className="ell">{p.name}</span>
                  <span className={`pill ${p.status}`}>{STATUS_KO[p.status]}</span>
                  <span className="num r">{aud(p.priceCents)}</span>
                  <button
                    className="row-add"
                    title="작업 지시서에 추가"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToOrder(p);
                    }}
                  >
                    +
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }
  const total = coverage ? Object.values(coverage).reduce((a, b) => a + b, 0) : null;
  const max = coverage ? Math.max(1, ...Object.values(coverage)) : 1;
  return (
    <div className="info">
      <div className="info-body">
        <div className="info-head">
          <h2>
            {g.make} {g.model} {g.year ?? ''}
          </h2>
          <span className="faint">적용 부품 {total !== null ? n0.format(total) : '…'}개</span>
        </div>
        <div className="sys-bars">
          {SYSTEMS.map((d) => (
            <button key={d.id} className="sys-bar" style={{ ['--c' as string]: d.color }} onClick={() => hud.set({ selected: d.id })} onMouseEnter={() => hud.set({ hovered: d.id })} onMouseLeave={() => hud.set({ hovered: null })}>
              <span>{d.ko}</span>
              <span className="track">{coverage ? <span className="fill" style={{ width: `${((coverage[d.id] ?? 0) / max) * 100}%` }} /> : <i className="skel skel-line" />}</span>
              <span className="num r">{coverage ? n0.format(coverage[d.id] ?? 0) : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Scene direction: lighting mood, exploded view, photo mode. */
function StagePanel() {
  const preset = useHud((s) => s.lightPreset);
  const explode = useHud((s) => s.explode);
  const headlights = useHud((s) => s.headlights);
  return (
    <div className="stagepanel">
      <div className="sp-label">조명</div>
      <div className="sp-presets" role="radiogroup" aria-label="조명 프리셋">
        {(Object.keys(PRESETS) as LightPresetId[]).map((id, i) => (
          <button key={id} role="radio" aria-checked={preset === id} className={`sp-chip p-${id}`} onClick={() => hud.set({ lightPreset: id })} title={`${PRESETS[id].ko} (${i + 1})`}>
            <kbd>{i + 1}</kbd>
            {PRESETS[id].ko}
          </button>
        ))}
      </div>
      <div className="sp-row">
        <button className={`hbtn sm ${explode ? 'on' : ''}`} onClick={() => hud.set({ explode: !explode })}>
          분해 뷰 <kbd>V</kbd>
        </button>
        <button className="hbtn sm" onClick={() => hud.set({ photo: true, selected: null })}>
          사진 모드 <kbd>P</kbd>
        </button>
      </div>
      <div className="sp-row">
        <button className={`hbtn sm ${headlights ? 'on' : ''}`} onClick={() => hud.set({ headlights: !headlights })}>
          전조등 <kbd>H</kbd>
        </button>
        <button className="hbtn sm" onClick={startShowcase} title="입력이 30초 없으면 자동으로 시작됩니다">
          쇼케이스
        </button>
      </div>
    </div>
  );
}

/** Save what the canvas shows (the renderer keeps its drawing buffer for this). */
export function captureScene() {
  const c = document.querySelector('canvas');
  if (!c) return false;
  const a = document.createElement('a');
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.download = `gomdori-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
  return true;
}

export function PhotoBar() {
  const photo = useHud((s) => s.photo);
  const autoRotate = useHud((s) => s.autoRotate);
  if (!photo) return null;
  return (
    <div className="photobar frame">
      <span className="pb-title">사진 모드</span>
      <button className="hbtn sm" onClick={() => captureScene()}>캡처 저장</button>
      <button className={`hbtn sm ${autoRotate ? 'on' : ''}`} onClick={() => hud.set({ autoRotate: !autoRotate })}>회전</button>
      <button className="hbtn sm" onClick={() => hud.set((s) => ({ xrayLock: !s.xrayLock }))}>X-RAY</button>
      <button className="hbtn sm" onClick={() => hud.set({ photo: false })}>닫기 <kbd>Esc</kbd></button>
    </div>
  );
}

export function openInExplorer(systemId: string | null) {
  hud.set({ preset: { ...garageQuery(), categoryId: systemId ? leafIds(systemId) : undefined } });
  switchView('parts');
}

/** SC2-style tooltip above the command card: name, hotkey, coverage, top part. */
function CmdTip({ id }: { id: string }) {
  const d = SYSTEM_BY_ID[id]!;
  const coverage = useHud((s) => s.coverage);
  const samples = useHud((s) => s.samples[id]);
  const g = useHud((s) => s.garage);
  const stats = useHud((s) => s.stats);
  const ids = new Set(leafIds(id));
  const catalogue = stats?.byCategory.filter((c) => ids.has(c.id)).reduce((a, c) => a + c.count, 0) ?? 0;
  const top = samples?.[0];
  // portal: the console frame's clip-path would cut the tooltip off
  return createPortal(
    <div className="cmdtip frame" style={{ ['--c' as string]: d.color }} role="tooltip">
      <div className="ct-head">
        <Icon name={d.id} size={18} />
        <b>{d.ko}</b>
        <span className="faint">{d.group}</span>
        <span className="grow" />
        <kbd>{d.hotkey}</kbd>
      </div>
      <div className="ct-stats">
        <span>
          <b className="num">{coverage ? n0.format(coverage[id] ?? 0) : '…'}</b> {g.make} {g.model} 적용
        </span>
        <span>
          <b className="num">{compact.format(catalogue)}</b> 카탈로그
        </span>
      </div>
      {top && (
        <div className="ct-top ell">
          대표 부품 · {top.name} <span className="num">{aud(top.priceCents)}</span>
        </div>
      )}
      <div className="ct-foot faint">클릭 선택 · 더블클릭 부품 탐색 · {d.code}</div>
    </div>,
    document.body,
  );
}

function CommandCard() {
  const selected = useHud((s) => s.selected);
  const xrayLock = useHud((s) => s.xrayLock);
  const autoRotate = useHud((s) => s.autoRotate);
  const [tip, setTip] = useState<string | null>(null);
  return (
    <div className="cmdcard" role="toolbar" aria-label="명령">
      {tip && <CmdTip id={tip} />}
      {SYSTEMS.map((d) => (
        <button
          key={d.id}
          className={`cmd ${selected === d.id ? 'on' : ''}`}
          style={{ ['--c' as string]: d.color }}
          aria-label={`${d.ko} (${d.hotkey})`}
          onClick={() => hud.set({ selected: selected === d.id ? null : d.id })}
          onDoubleClick={() => openInExplorer(d.id)}
          onMouseEnter={() => {
            setTip(d.id);
            hud.set({ hovered: d.id });
          }}
          onMouseLeave={() => {
            setTip(null);
            hud.set({ hovered: null });
          }}
        >
          <kbd>{d.hotkey}</kbd>
          <Icon name={d.id} />
          <span>{d.ko}</span>
        </button>
      ))}
      <button className={`cmd util ${xrayLock ? 'on' : ''}`} title="X-RAY 고정 (X)" onClick={() => hud.set({ xrayLock: !xrayLock })}>
        <kbd>X</kbd>
        <Icon name="xray" />
        <span>X-RAY</span>
      </button>
      <button className={`cmd util ${autoRotate ? 'on' : ''}`} title="자동 회전 (Space)" onClick={() => hud.set({ autoRotate: !autoRotate })}>
        <kbd>␣</kbd>
        <Icon name="rotate" />
        <span>회전</span>
      </button>
    </div>
  );
}

export function Console() {
  return (
    <footer className="console">
      <div className="frame console-mm">
        <Minimap />
      </div>
      <div className="frame console-info">
        <InfoPanel />
      </div>
      <div className="frame console-cmd">
        <CommandCard />
      </div>
    </footer>
  );
}

export function Hint() {
  const active = useHud(xrayActive);
  const selected = useHud((s) => s.selected);
  return (
    <div className={`hint ${active ? 'live' : ''}`}>
      {selected ? 'ESC 선택 해제 · 드래그로 회전 · 다른 계통을 클릭해 이동' : active ? 'X-RAY 스캔 중 · 계통을 클릭하면 부품 목록이 열립니다' : '차량에 마우스를 올리면 X-RAY · 드래그로 회전 · 단축키로 계통 선택'}
    </div>
  );
}

/** Keyboard: system hotkeys, X (x-ray lock), Space (rotate), Esc (deselect). */
export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Ctrl/⌘/Alt combos belong to the browser and the palette (Ctrl+K must not also select brakes)
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const s0 = hud.get();
      if (t.closest?.('input, select, textarea') || s0.view !== 'hangar' || s0.paletteOpen || s0.helpOpen || s0.tour !== null) return;
      const k = e.key.toUpperCase();
      if (e.key === 'Escape') hud.set({ selected: null, openPart: null, photo: false });
      else if (k === 'V') hud.set((s) => ({ explode: !s.explode }));
      else if (k === 'P') hud.set((s) => ({ photo: !s.photo, selected: null }));
      else if (['1', '2', '3', '4'].includes(e.key)) hud.set({ lightPreset: (Object.keys(PRESETS) as LightPresetId[])[Number(e.key) - 1]! });
      else if (k === 'X') hud.set((s) => ({ xrayLock: !s.xrayLock }));
      else if (k === 'H') hud.set((s) => ({ headlights: !s.headlights }));
      else if (e.key === ' ') {
        e.preventDefault();
        hud.set((s) => ({ autoRotate: !s.autoRotate }));
      } else {
        const d = SYSTEMS.find((x) => x.hotkey === k);
        if (d) hud.set((s) => ({ selected: s.selected === d.id ? null : d.id }));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
