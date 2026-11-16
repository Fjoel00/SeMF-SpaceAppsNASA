import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ActiveTab, AppHealthState } from './types';
import { AppHeader } from './components/layout/AppHeader';
import { BottomNav } from './components/layout/BottomNav';
import { CalendarView } from './views/CalendarView';
import { PanicView } from './views/PanicView';

// Defer heavy MapLibre GL bundle until Escape tab is opened
const EscapeView = lazy(() =>
  import('./views/EscapeView').then((m) => ({ default: m.EscapeView }))
);

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [health, setHealth] = useState<AppHealthState | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial health check
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setHealth(data);
      })
      .catch(() => {
        setHealth({
          status: 'healthy',
          service: 'SeMF Mobile Client',
          mode: 'demo',
          routingProvider: 'static_fallback',
          firmsLive: false,
        });
      });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getSubtitle = () => {
    switch (activeTab) {
      case 'calendar':
        return 'Histórico Climatológico (2000–2026)';
      case 'escape':
        return 'Evacuación Vial con Evitación de Fuego';
      case 'panic':
        return 'Alerta Rápida y Rescate Ciudadano';
    }
  };

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col justify-between selection:bg-fire selection:text-white">
      <AppHeader health={health} isOnline={isOnline} subtitle={getSubtitle()} />

      <main className="flex-1 w-full max-w-md mx-auto pb-24">
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'escape' && (
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] space-y-3 text-slate-400 text-xs">
                <div className="w-8 h-8 border-2 border-cyan-info border-t-transparent rounded-full animate-spin"></div>
                <span className="font-mono">Iniciando visor geoespacial y capas térmicas...</span>
              </div>
            }
          >
            <EscapeView onTriggerSOS={() => setActiveTab('panic')} />
          </Suspense>
        )}
        {activeTab === 'panic' && <PanicView />}
      </main>

      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </div>
  );
};

export default App;
