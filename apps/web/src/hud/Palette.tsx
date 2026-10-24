import { useEffect, useMemo, useRef, useState } from 'react';
import type { PartRow } from '@gomdori/core';
import { data } from '../data/index.ts';
import { PRESETS } from '../three/presets.ts';
import { SYSTEMS } from '../three/systems.ts';
import { aud } from '../ui/fmt.ts';
import { captureScene, switchView } from './Hud.tsx';
import { addToOrder } from './order.tsx';
import { setMuted } from './sound.ts';
import { startShowcase } from './attract.tsx';
import { hud, useHud, type LightPresetId, type View } from './store.ts';
import { toast } from './toast.tsx';

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

function commands(): Cmd[] {
  const views: [View, string][] = [
    ['hangar', '격납고'],
    ['analysis', '분석'],
    ['parts', '부품 탐색'],
    ['content', '콘텐츠 기획'],
    ['market', '시장 정보'],
    ['device', '기기·동기화'],
  ];
  return [
    ...views.map(([v, ko]) => ({ id: `view:${v}`, group: '이동', label: `${ko} 열기`, run: () => switchView(v) })),
    ...SYSTEMS.map((d) => ({
      id: `sys:${d.id}`,
      group: '계통',
      label: `${d.ko} 계통 선택`,
      hint: d.hotkey,
      run: () => {
        switchView('hangar');
        hud.set({ selected: d.id });
      },
    })),
    ...(Object.keys(PRESETS) as LightPresetId[]).map((id, i) => ({ id: `light:${id}`, group: '연출', label: `조명: ${PRESETS[id].ko}`, hint: String(i + 1), run: () => hud.set({ lightPreset: id }) })),
    { id: 'xray', group: '연출', label: 'X-RAY 고정 전환', hint: 'X', run: () => hud.set((s) => ({ xrayLock: !s.xrayLock })) },
    { id: 'explode', group: '연출', label: '분해 뷰 전환', hint: 'V', run: () => hud.set((s) => ({ explode: !s.explode, view: 'hangar' })) },
    { id: 'photo', group: '연출', label: '사진 모드', hint: 'P', run: () => hud.set({ photo: true, view: 'hangar', selected: null }) },
    { id: 'capture', group: '연출', label: '지금 화면 캡처 저장', run: () => void (captureScene() ? toast('캡처를 저장했습니다', 'ok') : toast('3D 화면이 없습니다', 'bad')) },
    { id: 'headlights', group: '연출', label: '전조등 켜기/끄기', hint: 'H', run: () => hud.set((s) => ({ headlights: !s.headlights, view: 'hangar' })) },
    { id: 'showcase', group: '연출', label: '쇼케이스(자동 연출) 시작', run: () => startShowcase() },
    { id: 'rotate', group: '연출', label: '자동 회전 전환', hint: 'Space', run: () => hud.set((s) => ({ autoRotate: !s.autoRotate })) },
    { id: 'order', group: '작업', label: '작업 지시서 열기', run: () => hud.set({ orderOpen: true }) },
    { id: 'settings', group: '설정', label: '설정 열기', hint: ',', run: () => hud.set({ settingsOpen: true }) },
    { id: 'help', group: '설정', label: '조작법·단축키 보기', hint: '?', run: () => hud.set({ helpOpen: true }) },
    { id: 'tour', group: '설정', label: '둘러보기 투어 다시 보기', run: () => hud.set({ view: 'hangar', tour: 0 }) },
    { id: 'mute', group: '설정', label: '사운드 켜기/끄기', run: () => setMuted(!hud.get().muted) },
  ];
}

/** Ctrl/⌘+K: jump anywhere, run any toggle, or find a part by name / MPN / SKU. */
export function Palette() {
  const open = useHud((s) => s.paletteOpen);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [parts, setParts] = useState<PartRow[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(commands, []);
  const recent = useHud((s) => s.recent);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        hud.set((s) => ({ paletteOpen: !s.paletteOpen }));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) return setParts([]);
    const t = setTimeout(() => {
      void data
        .run(null, (s) => s.list({ q, limit: 6 }))
        .then((r) => setParts(r.value.items))
        .catch(() => setParts([]));
    }, 160);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;
  const needle = q.trim().toLowerCase();
  const cmds = needle ? all.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(needle)) : all.slice(0, 10);
  const items: { key: string; label: string; group: string; hint?: string; run: () => void; part?: PartRow }[] = [
    ...(needle ? [] : recent.slice(0, 4).map((p) => ({ key: `r:${p.id}`, label: p.name, group: '최근', hint: aud(p.priceCents), run: () => hud.set({ openPart: p }), part: p }))),
    ...cmds.map((c) => ({ key: c.id, label: c.label, group: c.group, hint: c.hint, run: c.run })),
    ...parts.map((p) => ({ key: p.id, label: p.name, group: '부품', hint: aud(p.priceCents), run: () => hud.set({ openPart: p }), part: p })),
  ];
  const close = () => hud.set({ paletteOpen: false });
  const exec = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    it.run();
  };

  return (
    <div className="palette-back" onClick={close}>
      <div className="palette frame" role="dialog" aria-label="명령 팔레트" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="pal-input"
          placeholder="명령이나 부품 검색 (예: 브레이크, 석양, CUK2939)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIdx((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') exec(idx);
            else if (e.key === 'Escape') close();
          }}
        />
        <ul className="pal-list" role="listbox">
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === idx} className="pal-item" onMouseEnter={() => setIdx(i)} onClick={() => exec(i)}>
              <span className="pal-group">{it.group}</span>
              <span className="pal-label ell">{it.label}</span>
              {it.part && (
                <button
                  className="pal-add"
                  title="작업 지시서에 추가"
                  onClick={(e) => {
                    e.stopPropagation();
                    addToOrder(it.part!);
                  }}
                >
                  +
                </button>
              )}
              {it.hint && <kbd>{it.hint}</kbd>}
            </li>
          ))}
          {!items.length && <li className="pal-empty faint">일치하는 명령이나 부품이 없습니다</li>}
        </ul>
        <div className="pal-foot faint">↑↓ 이동 · Enter 실행 · Esc 닫기 · Ctrl+K 열기/닫기</div>
      </div>
    </div>
  );
}
