import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Incidents } from './pages/Incidents';
import { IncidentForm } from './components/IncidentForm';
import { IncidentDetails } from './components/IncidentDetails';
import { ClusterStatus } from './components/ClusterStatus';
import { getIncidents } from './services/api';
import type { Incident, ActivityEvent } from './types';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'incidents'>('dashboard');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);
  
  // Modal states
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isClusterModalOpen, setIsClusterModalOpen] = useState<boolean>(false);

  // Operational Activity Events Log (Derived from real session actions)
  const [activities, setActivities] = useState<ActivityEvent[]>([
    {
      id: 'act-init-1',
      incident_id: 'INC-8021',
      description: 'Ambulance AMB-Unit-04 and Trauma Bay 2 assigned',
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      type: 'dispatched',
    },
    {
      id: 'act-init-2',
      incident_id: 'INC-8023',
      description: 'Hospital service timeout — Ambulance assignment rolled back',
      timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      type: 'rollback',
    },
    {
      id: 'act-init-3',
      incident_id: 'INC-8024',
      description: 'Emergency incident created — Awaiting available fleet unit',
      timestamp: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
      type: 'creation',
    },
  ]);

  const addActivity = useCallback((description: string, incident_id: string, type: ActivityEvent['type']) => {
    const newEvent: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      incident_id,
      description,
      timestamp: new Date().toISOString(),
      type,
    };
    setActivities((prev) => [newEvent, ...prev.slice(0, 19)]);
  }, []);

  // Fetch incidents from Coordinator Service
  const fetchIncidents = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const response = await getIncidents();
      if (response && response.data) {
        setIncidents(response.data);
        setIsBackendConnected(true);
      }
    } catch (err) {
      console.error('Error fetching coordinator incidents:', err);
      setIsBackendConnected(false);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Handle successful creation of an emergency incident
  const handleIncidentCreated = (newIncident: Incident) => {
    // Add to activity log based on dispatch state
    addActivity(
      `New emergency incident logged: ${newIncident.description.slice(0, 32)}...`,
      newIncident.incident_id,
      'creation'
    );

    if (newIncident.status === 'DISPATCHED') {
      addActivity(
        `Ambulance ${newIncident.assigned_ambulance} & ${newIncident.assigned_hospital} assigned`,
        newIncident.incident_id,
        'dispatched'
      );
    } else if (newIncident.status === 'WAITING_FOR_HOSPITAL' || newIncident.dispatch_error === 'HOSPITAL_SERVICE_UNAVAILABLE') {
      addActivity(
        `Hospital service unavailable: Ambulance assignment rolled back`,
        newIncident.incident_id,
        'rollback'
      );
    } else if (newIncident.status === 'WAITING_FOR_AMBULANCE') {
      addActivity(
        `Ambulance unavailable: Queued in sector waiting list`,
        newIncident.incident_id,
        'error'
      );
    }

    // Refresh incidents list
    fetchIncidents(true);
  };

  const handleSelectIncidentById = (incidentId: string) => {
    const found = incidents.find((i) => i.incident_id === incidentId);
    if (found) {
      setSelectedIncident(found);
    }
  };

  const activeCount = incidents.filter(
    (i) =>
      i.status === 'WAITING_FOR_AMBULANCE' ||
      i.status === 'WAITING_FOR_HOSPITAL' ||
      i.status === 'CREATED' ||
      i.status === 'DISPATCH_FAILED' ||
      i.severity === 'CRITICAL'
  ).length;

  return (
    <div className="min-h-screen bg-slate-100/60 flex flex-col font-sans text-slate-900 antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        pageTitle={currentPage === 'dashboard' ? 'Dispatcher Dashboard' : 'Incident Management'}
        onRefresh={() => fetchIncidents(false)}
        isRefreshing={isRefreshing}
        isConnected={isBackendConnected}
        incidentCount={incidents.length}
        onOpenClusterStatus={() => setIsClusterModalOpen(true)}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="hidden md:block">
          <Sidebar
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            activeCount={activeCount}
            totalCount={incidents.length}
          />
        </div>

        {/* Center Main Scrollable View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          {currentPage === 'dashboard' ? (
            <Dashboard
              incidents={incidents}
              isLoading={isLoading}
              onOpenNewIncident={() => setIsFormOpen(true)}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
              onViewAllIncidents={() => setCurrentPage('incidents')}
              activities={activities}
              onSelectIncidentId={handleSelectIncidentById}
            />
          ) : (
            <Incidents
              incidents={incidents}
              isLoading={isLoading}
              onRefresh={() => fetchIncidents(false)}
              onOpenNewIncident={() => setIsFormOpen(true)}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
            />
          )}
        </main>
      </div>

      {/* Create Emergency Incident Modal */}
      <IncidentForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={handleIncidentCreated}
      />

      {/* Incident Details & Timeline Modal */}
      <IncidentDetails
        incident={selectedIncident}
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />

      {/* Distributed Cluster Status & Diagnostics Modal */}
      <ClusterStatus
        isOpen={isClusterModalOpen}
        onClose={() => setIsClusterModalOpen(false)}
      />
    </div>
  );
}
