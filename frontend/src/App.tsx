import React, { useCallback, useEffect, useState } from 'react';
import { MissionControlLayout } from './layouts/MissionControlLayout';
import { apiClient } from './services/apiClient';
import { useSeMFStore } from './stores/useSeMFStore';
import type { ActiveFiresPayload, SafeShelter } from './types/semf';
import { HistoricalCalendarPage } from './features/historical/HistoricalCalendarPage';
import { TacticalConsolePage } from './features/tactical/TacticalConsolePage';
import { IntelligencePage } from './features/intelligence/IntelligencePage';

export const App: React.FC = () => {
  const { activeView, setActiveView, setSelectedEvent } = useSeMFStore();
  const [firesData, setFiresData] = useState<ActiveFiresPayload | null>(null);
  const [shelters, setShelters] = useState<SafeShelter[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Redirección determinista de URLs heredadas a las 3 pestañas principales
  useEffect(() => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('calendar') || path.includes('historico')) {
      setActiveView('historical');
    } else if (
      path.includes('escape') ||
      path.includes('routing') ||
      path.includes('shelters') ||
      path.includes('monitor') ||
      path.includes('dashboard') ||
      path.includes('tactical')
    ) {
      setActiveView('tactical');
    } else if (
      path.includes('ml') ||
      path.includes('settings') ||
      path.includes('intelligence')
    ) {
      setActiveView('intelligence');
    }
  }, [setActiveView]);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fires, sheltersRes] = await Promise.all([
        apiClient.getActiveFires(),
        apiClient.getShelters(),
      ]);
      setFiresData(fires);
      setShelters(sheltersRes.shelters || []);
      if (fires.events.length > 0) {
        setSelectedEvent(fires.events[0]);
      }
    } catch (err) {
      console.error('[SeMF 2.0] Error cargando telemetría inicial:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setSelectedEvent]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Resolución de la pestaña activa (con redirección de vistas heredadas)
  const isHistorical = activeView === 'historical';
  const isIntelligence =
    activeView === 'intelligence' ||
    activeView === 'settings' ||
    activeView === 'ml-analytics';
  const isTactical = !isHistorical && !isIntelligence;

  return (
    <MissionControlLayout
      firesData={firesData}
      isLoading={isLoading}
      onRefreshData={loadAllData}
    >
      {isHistorical && <HistoricalCalendarPage />}
      {isTactical && (
        <TacticalConsolePage firesData={firesData} shelters={shelters} />
      )}
      {isIntelligence && <IntelligencePage onSettingsUpdated={loadAllData} />}
    </MissionControlLayout>
  );
};

export default App;
