export const n0 = new Intl.NumberFormat('en-AU');
export const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
export const aud = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return new Date(ms).toISOString().slice(0, 10);
};
export const STATUS_KO: Record<string, string> = { active: '판매중', hold: 'HOLD', draft: '초안', discontinued: '단종' };
export const RIGHTS_KO: Record<string, string> = { own: '자체', licensed: '라이선스', unknown: '미확인' };
export const EVIDENCE_KO: Record<string, string> = { A: 'A 원문확인', B: 'B 보고값', U: 'U 미확인', H: 'H 가설' };
