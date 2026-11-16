import React, { useCallback, useEffect, useState } from 'react';
import { MissionControlLayout } from './layouts/MissionControlLayout';
import { apiClient } from './services/apiClient';
import { useSeMFStore } from './stores/useSeMFStore';
import type { ActiveFiresPayload, SafeShelter } from './types/semf';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { MonitorPage } from './features/monitor/MonitorPage';
import { TacticalConsolePage } from './features/tactical/TacticalConsolePage';
import { EscapeRoutingPage } from './features/routing/EscapeRoutingPage';
import { HistoricalCalendarPage } from './features/historical/HistoricalCalendarPage';
import { MLAnalyticsPage } from './features/ml-analytics/MLAnalyticsPage';
import { SheltersPage } from './features/shelters/SheltersPage';
import { SettingsPage } from './features/settings/SettingsPage';

export const App: React.FC = () => {
  const { activeView, setSelectedEvent } = useSeMFStore();
  const [firesData, setFiresData] = useState<ActiveFiresPayload | null>(null);
  const [shelters, setShelters] = useState<SafeShelter[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  return (
    <MissionControlLayout
      firesData={firesData}
      isLoading={isLoading}
      onRefreshData={loadAllData}
    >
      {activeView === 'dashboard' && (
        <DashboardPage firesData={firesData} shelters={shelters} />
      )}
      {activeView === 'monitor' && <MonitorPage firesData={firesData} />}
      {activeView === 'tactical' && (
        <TacticalConsolePage firesData={firesData} />
      )}
      {activeView === 'routing' && (
        <EscapeRoutingPage firesData={firesData} shelters={shelters} />
      )}
      {activeView === 'historical' && <HistoricalCalendarPage />}
      {activeView === 'ml-analytics' && <MLAnalyticsPage />}
      {activeView === 'shelters' && <SheltersPage shelters={shelters} />}
      {activeView === 'settings' && (
        <SettingsPage onSettingsUpdated={loadAllData} />
      )}
    </MissionControlLayout>
  );
};

export default App;
