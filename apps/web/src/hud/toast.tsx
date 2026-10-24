import { useHud, hud } from './store.ts';

export type ToastKind = 'info' | 'ok' | 'warn' | 'bad';
let seq = 0;

/** Push a transient notice into the HUD's message log. */
export function toast(text: string, kind: ToastKind = 'info') {
  const id = ++seq;
  hud.set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, kind }] }));
  setTimeout(() => hud.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600);
}

export function Toasts() {
  const toasts = useHud((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <i />
          {t.text}
        </div>
      ))}
    </div>
  );
}
