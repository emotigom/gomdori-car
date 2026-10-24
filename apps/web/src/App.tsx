import { lazy, Suspense, useEffect, useState } from 'react';
import { data, type Mode } from './data/index.ts';
import { boot, garageQuery, loadGarage } from './hud/controller.ts';
import { Console, GaragePanel, Hint, PhotoBar, TopBar, useHotkeys } from './hud/Hud.tsx';
import { LeaderLines } from './hud/LeaderLines.tsx';
import { Loader } from './hud/Loader.tsx';
import { OrderPanel } from './hud/order.tsx';
import { Palette } from './hud/Palette.tsx';
import { installSound } from './hud/sound.ts';
import { AttractOverlay, installAttract } from './hud/attract.tsx';
import { HelpOverlay, installOverlays, SettingsPanel, Tour } from './hud/overlays.tsx';
import { initContent } from './hud/content.ts';
import { Toasts } from './hud/toast.tsx';
import { ContentBoard } from './views/Content.tsx';
import { hud, useHud } from './hud/store.ts';
import { Analysis } from './views/Analysis.tsx';
import { Explorer, PartDrawer } from './views/Explorer.tsx';
import { Market } from './views/Market.tsx';
import { Device } from './views/Device.tsx';

// three.js + postprocessing load as their own chunk while the boot screen runs
const Scene = lazy(() => import('./three/Scene.tsx').then((m) => ({ default: m.Scene })));
/** `?2d` skips WebGL entirely (old GPUs, screenshots, accessibility). */
const NO_3D = new URLSearchParams(location.search).has('2d');

/** Screen-flash transition, retriggered on every view change. */
function Warp() {
  const view = useHud((s) => s.view);
  return <div className="warp" key={view} aria-hidden />;
}

export function App() {
  const view = useHud((s) => s.view);
  const booted = useHud((s) => s.booted);
  const openPart = useHud((s) => s.openPart);
  const photo = useHud((s) => s.photo);
  const idle = useHud((s) => s.idle);
  const [mode, setMode] = useState<Mode>('auto');
  const [online, setOnline] = useState(navigator.onLine);
  useHotkeys();

  useEffect(() => {
    if (NO_3D) {
      hud.stage('chassis');
      hud.stage('shaders');
    }
    void boot();
    installSound();
    installAttract();
    installOverlays();
    initContent();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);

  const changeMode = (m: Mode) => {
    data.mode = m;
    setMode(m);
    void loadGarage();
  };

  return (
    <div className={`app view-${view} ${booted ? 'booted' : ''} ${photo ? 'photo' : ''} ${idle ? 'idle' : ''}`}>
      {!NO_3D && (
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      )}
      {view === 'hangar' && <LeaderLines />}
      <div className="hud">
        <TopBar mode={mode} setMode={changeMode} online={online} />
        {view === 'hangar' && (
          <>
            <GaragePanel />
            <Hint />
            <Console />
          </>
        )}
        {view === 'analysis' && <Analysis />}
        {view === 'parts' && (
          <section className="sheet frame wide" aria-label="부품 탐색">
            <Explorer key={mode} />
          </section>
        )}
        {view === 'content' && (
          <section className="sheet frame wide" aria-label="콘텐츠 기획">
            <ContentBoard />
          </section>
        )}
        {view === 'market' && (
          <section className="sheet frame" aria-label="시장 정보">
            <Market />
          </section>
        )}
        {view === 'device' && (
          <section className="sheet frame" aria-label="기기">
            <Device />
          </section>
        )}
      </div>
      <PhotoBar />
      <AttractOverlay />
      <OrderPanel />
      <Toasts />
      <Palette />
      <SettingsPanel />
      <HelpOverlay />
      <Tour />
      <Warp />
      {openPart && (
        <PartDrawer
          part={openPart}
          query={garageQuery()}
          onClose={() => hud.set({ openPart: null })}
          onSaved={(row) => {
            hud.set({ openPart: row });
            void loadGarage();
          }}
        />
      )}
      <Loader />
    </div>
  );
}
