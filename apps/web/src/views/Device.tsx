import { useEffect, useState } from 'react';
import type { Brand, Category } from '@gomdori/core';
import type { SyncProgress, SyncScope } from '@gomdori/sync';
import { data } from '../data/index.ts';
import type { DeviceStatus } from '../data/device.ts';
import { n0 } from '../ui/fmt.ts';

export function Device() {
  const [st, setSt] = useState<DeviceStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [prog, setProg] = useState<SyncProgress | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [scopeKind, setScopeKind] = useState<'category' | 'brand' | 'make' | 'all'>('category');
  const [scopeVal, setScopeVal] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const refresh = async () => {
    try {
      setSt(await data.refreshStatus());
      const est = await navigator.storage?.estimate?.();
      if (est?.quota) setStorage({ usage: est.usage ?? 0, quota: est.quota });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    data.device.onProgress = setProg;
    void refresh();
    void data.run(null, (s) => s.categories()).then((r) => setCats(r.value)).catch(() => {});
    void data.run(null, (s) => s.brands()).then((r) => setBrands(r.value)).catch(() => {});
    void data.run(null, (s) => s.makes()).then((r) => setMakes(r.value)).catch(() => {});
  }, []);

  const scope = (): SyncScope | null => {
    if (scopeKind === 'all') return {};
    if (!scopeVal) return null;
    if (scopeKind === 'category') return { categoryId: [Number(scopeVal)] };
    if (scopeKind === 'brand') return { brandId: [Number(scopeVal)] };
    return { make: scopeVal };
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      setProg(null);
      await refresh();
    }
  };

  const total = st?.scopes.reduce((a, s) => a + s.rows, 0) ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>기기·동기화</h1>
          <p>
            이 브라우저 안에 클라우드와 같은 구조의 SQLite 카탈로그를 둡니다. 필요한 범위(카테고리·브랜드·제조사)만 내려받아 오프라인에서도 검색·검수하고,
            수정은 기기에 먼저 저장한 뒤 연결되면 서버와 합칩니다.
          </p>
        </div>
      </div>

      {err && <div className="banner"><b>오류</b> · {err}</div>}
      {!data.edgeOnline && (
        <div className="banner">
          <b>데모 모드</b> · API 서버가 연결되어 있지 않아, 이 브라우저 안에서 만든 합성 카탈로그로 동작 중입니다. 범위 내려받기·동기화는 API를
          연결(<span className="mono">VITE_API_BASE</span>)하면 사용할 수 있습니다.
        </div>
      )}

      <div className="tiles">
        <div className="tile"><div className="k">기기 저장소</div><div className="v" style={{ fontSize: 16 }}>{st?.label ?? '시작 중…'}</div><div className="s">{st?.persistent ? '브라우저를 닫아도 유지' : '새로고침하면 사라짐'}</div></div>
        <div className="tile good"><div className="k">기기에 있는 부품</div><div className="v">{st ? n0.format(st.parts) : '—'}</div><div className="s">범위 {st?.scopes.length ?? 0}개</div></div>
        <div className={`tile ${st?.pending ? 'warn' : ''}`}><div className="k">보내지 않은 수정</div><div className="v">{st ? st.pending : '—'}</div><div className="s">온라인이 되면 자동 전송</div></div>
        <div className="tile"><div className="k">동기화 위치</div><div className="v">{st ? n0.format(st.seq) : '—'}</div><div className="s mono">{st?.node}</div></div>
        {storage && <div className="tile"><div className="k">브라우저 저장 공간</div><div className="v" style={{ fontSize: 18 }}>{(storage.usage / 1e6).toFixed(0)} MB</div><div className="s">한도 {(storage.quota / 1e9).toFixed(1)} GB</div></div>}
      </div>

      <div className="grid2">
        <section className="card">
          <h2>범위 내려받기</h2>
          <p className="note">전체(100만 건, 수백 MB)보다 작업 범위만 받는 것을 권장합니다. 중단해도 이어받기가 됩니다.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="chips">
              {(['category', 'brand', 'make', 'all'] as const).map((k) => (
                <button key={k} className="chip" aria-pressed={scopeKind === k} onClick={() => { setScopeKind(k); setScopeVal(''); }}>
                  {{ category: '카테고리', brand: '브랜드', make: '차량 제조사', all: '전체' }[k]}
                </button>
              ))}
            </div>
            {scopeKind !== 'all' && (
              <select aria-label="범위 선택" className="select" value={scopeVal} onChange={(e) => setScopeVal(e.target.value)}>
                <option value="">선택하세요</option>
                {scopeKind === 'category' && cats.filter((c) => c.parentId !== null).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                {scopeKind === 'brand' && brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                {scopeKind === 'make' && makes.map((m) => <option key={m}>{m}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={!!busy || !scope() || !data.edgeOnline} onClick={() => act('replicate', () => data.device.replicate(scope()!))}>
                {busy === 'replicate' ? '내려받는 중…' : '이 범위 내려받기'}
              </button>
              <button className="btn" disabled={!!busy || !data.edgeOnline} onClick={() => act('sync', () => data.device.sync())}>{busy === 'sync' ? '동기화 중…' : '지금 동기화'}</button>
              <button className="btn" disabled={!!busy} onClick={() => act('reset', () => data.device.reset())}>기기 데이터 지우기</button>
            </div>
            {prog && (
              <div>
                <div className="faint mono" style={{ fontSize: 12 }}>{prog.phase} · {prog.scope} · {n0.format(prog.rows)}행</div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <h2>내려받은 범위</h2>
          <p className="note">완료된 범위 안의 검색은 네트워크 없이 이 기기에서 답합니다 (데이터: 자동).</p>
          {!st?.scopes.length ? <div className="faint">아직 없습니다.</div> : (
            <table className="t">
              <thead><tr><th>범위</th><th>상태</th><th style={{ textAlign: 'right' }}>부품</th></tr></thead>
              <tbody>
                {st.scopes.map((s) => (
                  <tr key={s.key}><td className="mono">{s.key}</td><td><span className={`pill ${s.done ? 'good' : 'warn'}`}>{s.done ? '완료' : '이어받기 가능'}</span></td><td className="r">{n0.format(s.rows)}</td></tr>
                ))}
                <tr><td colSpan={2} className="faint">합계</td><td className="r">{n0.format(total)}</td></tr>
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <h2>데이터가 사는 곳</h2>
        <p className="note">같은 SQLite 스키마와 같은 쿼리 코드가 네 곳에서 돕니다. 지금 이 화면은 강조된 두 곳을 씁니다.</p>
        <div className="arch">
          <div className="node"><b>클라우드 원본</b>node:sqlite 또는 libSQL(Turso) 기본 리전. 쓰기의 최종 기록과 변경 로그.</div>
          <div className="node here"><b>엣지 API</b>Hono · Cloudflare Workers / Deno / Bun / Node. D1 또는 libSQL 복제본에서 읽고 CDN이 캐시.</div>
          <div className="node here"><b>이 기기</b>sqlite-wasm + OPFS (Web Worker). 범위 복제, 오프라인 검색, 수정 대기열.</div>
          <div className="node"><b>다른 기기</b>태블릿·노트북이 각자 범위를 복제. HLC 최신 변경 우선으로 수렴.</div>
        </div>
      </section>
    </>
  );
}
