import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Incidents } from './pages/Incidents';
import { IncidentForm } from './components/IncidentForm';
import { IncidentDetails } from './components/IncidentDetails';
import { ClusterStatus } from './components/ClusterStatus';
import { getIncidents, getAmbulances, getHospitals, getWebSocketUrl, dischargePatient } from './services/api';
import type { Incident, ActivityEvent, Ambulance, Hospital, ConnectionStatus, WebSocketEventMessage } from './types';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'incidents'>('dashboard');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);

  // Live WebSocket Telemetry State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastEventTime, setLastEventTime] = useState<string>(new Date().toISOString());

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isClusterModalOpen, setIsClusterModalOpen] = useState<boolean>(false);

  // Deduplication cache for WebSocket event_id
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Operational Activity Events Log (Derived from real live events)
  const [activities, setActivities] = useState<ActivityEvent[]>([
    {
      id: 'act-init-1',
      incident_id: 'INC-8021',
      description: 'Patient handover completed at City General Hospital trauma bay',
      timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      type: 'completed',
    },
    {
      id: 'act-init-2',
      incident_id: 'INC-8023',
      description: 'Hospital service timeout — Ambulance assignment rolled back',
      timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      type: 'rollback',
    },
  ]);

  const addActivity = useCallback((description: string, incident_id: string, type: ActivityEvent['type'], correlation_id?: string) => {
    const newEvent: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      incident_id,
      description,
      timestamp: new Date().toISOString(),
      type,
      correlation_id,
    };
    setActivities((prev) => [newEvent, ...prev.slice(0, 24)]);
    setLastEventTime(new Date().toISOString());
  }, []);

  // Fetch initial data from Coordinator Service
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const [incidentsResp, ambulancesResp, hospitalsResp] = await Promise.allSettled([
        getIncidents(),
        getAmbulances(),
        getHospitals(),
      ]);

      if (incidentsResp.status === 'fulfilled' && incidentsResp.value?.data) {
        setIncidents(incidentsResp.value.data);
        setIsBackendConnected(true);
      }
      if (ambulancesResp.status === 'fulfilled' && ambulancesResp.value?.data) {
        setAmbulances(ambulancesResp.value.data);
      }
      if (hospitalsResp.status === 'fulfilled' && hospitalsResp.value?.data) {
        setHospitals(hospitalsResp.value.data);
      }
    } catch (err) {
      console.error('Error fetching coordinator data:', err);
      setIsBackendConnected(false);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle patient discharge action
  const handleDischargePatient = async (hospitalId: string) => {
    try {
      const res = await dischargePatient(hospitalId);
      if (res && res.data?.hospital) {
        const updated = res.data.hospital;
        setHospitals((prev) =>
          prev.map((h) => (h.id === hospitalId ? { ...h, ...updated } : h))
        );
        addActivity(
          `Patient discharged from ${updated.name}. Occupied bed returned to available capacity.`,
          hospitalId,
          'hospital'
        );
      }
    } catch (err) {
      console.error('Failed to discharge patient:', err);
    }
  };

  // -------------------------------------------------------------------------
  // WebSocket Connection & Event Handler with Reconnection Backoff
  // -------------------------------------------------------------------------
  const connectWebSocket = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWebSocketUrl();
    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        setLastEventTime(new Date().toISOString());

        // Immediately request current fleet telemetry snapshot
        ws.send(JSON.stringify({ type: 'REQUEST_FLEET_LOCATIONS' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: WebSocketEventMessage = JSON.parse(event.data);
          if (!msg || typeof msg !== 'object') return;

          // Deduplicate events by event_id
          if (msg.event_id) {
            if (seenEventIdsRef.current.has(msg.event_id)) {
              return;
            }
            seenEventIdsRef.current.add(msg.event_id);
            if (seenEventIdsRef.current.size > 500) {
              const iter = seenEventIdsRef.current.values();
              seenEventIdsRef.current.delete(iter.next().value!);
            }
          }

          setLastEventTime(msg.timestamp || new Date().toISOString());

          // Process known event types safely
          switch (msg.event_type) {
            case 'AMBULANCE_LOCATION_UPDATED': {
              if (msg.ambulance_id && msg.latitude != null && msg.longitude != null) {
                setAmbulances((prev) =>
                  prev.map((amb) =>
                    amb.id === msg.ambulance_id
                      ? {
                          ...amb,
                          latitude: msg.latitude!,
                          longitude: msg.longitude!,
                          speed_kmh: msg.speed_kmh != null ? msg.speed_kmh : amb.speed_kmh,
                          heading: msg.heading != null ? msg.heading : amb.heading,
                          trip_stage: msg.trip_stage || amb.trip_stage,
                          trip_destination: msg.trip_destination || amb.trip_destination,
                          eta_text: msg.eta_incident || msg.eta_hospital || amb.eta_text,
                          status: 'DISPATCHED',
                          current_incident_id: msg.incident_id || amb.current_incident_id,
                          last_updated: msg.timestamp,
                        }
                      : amb
                  )
                );

                if (msg.incident_id) {
                  setIncidents((prev) =>
                    prev.map((inc) =>
                      inc.incident_id === msg.incident_id
                        ? {
                            ...inc,
                            remaining_distance_km: msg.remaining_distance_km ?? inc.remaining_distance_km,
                            remaining_duration_sec: msg.remaining_duration_sec ?? inc.remaining_duration_sec,
                            eta_incident: msg.eta_incident || inc.eta_incident,
                            eta_hospital: msg.eta_hospital || inc.eta_hospital,
                          }
                        : inc
                    )
                  );
                }
              }
              break;
            }

            case 'JOURNEY_STAGE_CHANGED': {
              if (msg.incident_id && msg.status) {
                const stage = msg.status as any;
                setIncidents((prev) =>
                  prev.map((inc) =>
                    inc.incident_id === msg.incident_id
                      ? {
                          ...inc,
                          status: stage,
                          journey_stage: stage,
                          eta_incident: (msg.payload?.eta_incident as string) || inc.eta_incident,
                          eta_hospital: (msg.payload?.eta_hospital as string) || inc.eta_hospital,
                          remaining_distance_km: (msg.payload?.distance_km as number) ?? inc.remaining_distance_km,
                          remaining_duration_sec: (msg.payload?.duration_sec as number) ?? inc.remaining_duration_sec,
                          route_geometry: (msg.payload?.route_coordinates as any) || inc.route_geometry,
                          stage_timestamps: {
                            ...inc.stage_timestamps,
                            [stage.toLowerCase()]: msg.timestamp,
                          },
                        }
                      : inc
                  )
                );

                // Update hospital beds if provided in payload
                const bedsPayload = msg.payload?.hospital_beds as any;
                if (bedsPayload && msg.hospital_id) {
                  setHospitals((prev) =>
                    prev.map((h) =>
                      h.id === msg.hospital_id
                        ? {
                            ...h,
                            available_beds: bedsPayload.available,
                            reserved_beds: bedsPayload.reserved,
                            occupied_beds: bedsPayload.occupied,
                          }
                        : h
                    )
                  );
                }

                // Add activity log notification
                const note =
                  (msg.payload?.message as string) ||
                  `Incident ${msg.incident_id} progressed to stage: ${stage}`;
                addActivity(
                  note,
                  msg.incident_id,
                  stage === 'COMPLETED'
                    ? 'completed'
                    : stage === 'PATIENT_PICKED_UP'
                    ? 'pickup'
                    : stage === 'ARRIVED_AT_HOSPITAL'
                    ? 'arrival'
                    : 'ambulance',
                  msg.correlation_id
                );

                if (stage === 'COMPLETED' || stage === 'ARRIVED_AT_HOSPITAL') {
                  fetchData(true);
                }
              }
              break;
            }

            case 'PATIENT_DISCHARGED': {
              const hospId = msg.payload?.hospital_id as string;
              const beds = msg.payload?.beds as any;
              if (hospId && beds) {
                setHospitals((prev) =>
                  prev.map((h) =>
                    h.id === hospId
                      ? {
                          ...h,
                          available_beds: beds.available,
                          reserved_beds: beds.reserved,
                          occupied_beds: beds.occupied,
                        }
                      : h
                  )
                );
              }
              break;
            }

            case 'FLEET_STATE_SNAPSHOT': {
              const list = msg.payload?.ambulances as Ambulance[] | undefined;
              if (Array.isArray(list)) {
                setAmbulances(list);
              }
              break;
            }

            case 'INCIDENT_REPORTED': {
              if (msg.incident_id) {
                const newInc: Incident = {
                  id: msg.incident_id,
                  incident_id: msg.incident_id,
                  description: (msg.payload?.description as string) || 'Emergency incident logged',
                  location: (msg.payload?.location as string) || 'Sector coordinates',
                  location_type: (msg.payload?.location_type as any) || 'simulated_demo',
                  latitude: (msg.payload?.coordinates as any)?.lat || 18.5204,
                  longitude: (msg.payload?.coordinates as any)?.lng || 73.8567,
                  severity: (msg.payload?.severity as any) || 'MEDIUM',
                  status: 'REPORTED',
                  assigned_ambulance: null,
                  assigned_hospital: null,
                  dispatch_error: null,
                  correlation_id: msg.correlation_id,
                  stage_timestamps: { reported: msg.timestamp },
                  created_at: msg.timestamp || new Date().toISOString(),
                  updated_at: msg.timestamp || new Date().toISOString(),
                };
                setIncidents((prev) => {
                  const exists = prev.some((i) => i.incident_id === newInc.incident_id);
                  return exists ? prev : [newInc, ...prev];
                });
                addActivity(
                  `Emergency incident recorded: ${newInc.description.slice(0, 30)}...`,
                  msg.incident_id,
                  'creation',
                  msg.correlation_id
                );
              }
              break;
            }

            case 'DISPATCHING_STARTED': {
              if (msg.incident_id) {
                setIncidents((prev) =>
                  prev.map((i) =>
                    i.incident_id === msg.incident_id ? { ...i, status: 'DISPATCHING' } : i
                  )
                );
              }
              break;
            }

            case 'AMBULANCE_ALLOCATED': {
              if (msg.incident_id && msg.ambulance_id) {
                setIncidents((prev) =>
                  prev.map((i) =>
                    i.incident_id === msg.incident_id
                      ? { ...i, assigned_ambulance: msg.ambulance_id || null }
                      : i
                  )
                );
                addActivity(
                  `Unit ${msg.ambulance_id} tentatively allocated`,
                  msg.incident_id,
                  'ambulance',
                  msg.correlation_id
                );
              }
              break;
            }

            case 'DISPATCH_COMMITTED': {
              if (msg.incident_id) {
                setIncidents((prev) =>
                  prev.map((i) =>
                    i.incident_id === msg.incident_id
                      ? {
                          ...i,
                          status: 'EN_ROUTE_TO_INCIDENT',
                          assigned_ambulance: msg.ambulance_id || i.assigned_ambulance,
                          assigned_hospital: msg.hospital_id || i.assigned_hospital,
                          dispatch_error: null,
                        }
                      : i
                  )
                );
                addActivity(
                  `Saga committed: Dispatched unit ${msg.ambulance_id || ''} & reserved bed at ${msg.hospital_id || ''}`,
                  msg.incident_id,
                  'dispatched',
                  msg.correlation_id
                );
                fetchData(true);
              }
              break;
            }

            case 'SAGA_ROLLBACK_INITIATED': {
              if (msg.incident_id) {
                setIncidents((prev) =>
                  prev.map((i) =>
                    i.incident_id === msg.incident_id ? { ...i, status: 'ROLLBACK_PENDING' } : i
                  )
                );
                addActivity(
                  `Hospital capacity failure — Initiating compensating rollback`,
                  msg.incident_id,
                  'rollback',
                  msg.correlation_id
                );
              }
              break;
            }

            case 'SAGA_COMPENSATED': {
              if (msg.incident_id) {
                setIncidents((prev) =>
                  prev.map((i) =>
                    i.incident_id === msg.incident_id
                      ? {
                          ...i,
                          status: 'ROLLED_BACK',
                          assigned_ambulance: null,
                          dispatch_error: 'NO_HOSPITAL_BED_AVAILABLE',
                        }
                      : i
                  )
                );
                addActivity(
                  `Compensating rollback complete: Allocated ambulance released`,
                  msg.incident_id,
                  'rollback',
                  msg.correlation_id
                );
                fetchData(true);
              }
              break;
            }

            case 'DISPATCH_WAITING': {
              if (msg.incident_id && msg.status) {
                setIncidents((prev) =>
                  prev.map((i) =>
                    i.incident_id === msg.incident_id
                      ? { ...i, status: msg.status as any }
                      : i
                  )
                );
              }
              break;
            }

            case 'RECONCILIATION_COMPLETED': {
              addActivity(
                `Cluster reconciliation executed: states synchronized`,
                'CLUSTER',
                'hospital'
              );
              fetchData(true);
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.warn('[WebSocket] Error parsing inbound message:', err);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        socketRef.current = null;

        const attempt = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        reconnectAttemptsRef.current += 1;

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      };

      ws.onerror = (err) => {
        console.warn('[WebSocket] Connection error:', err);
        ws.close();
      };
    } catch (err) {
      console.warn('[WebSocket] Initialization error:', err);
      setConnectionStatus('disconnected');
    }
  }, [addActivity, fetchData]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const handleRequestFleetRefresh = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'REQUEST_FLEET_LOCATIONS' }));
    } else {
      fetchData(true);
    }
  }, [fetchData]);

  const handleIncidentCreated = (newIncident: Incident) => {
    setIncidents((prev) => {
      const idx = prev.findIndex((i) => i.incident_id === newIncident.incident_id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = newIncident;
        return copy;
      }
      return [newIncident, ...prev];
    });

    fetchData(true);
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
      i.status === 'REPORTED' ||
      i.status === 'DISPATCHING' ||
      i.status === 'EN_ROUTE_TO_INCIDENT' ||
      i.status === 'ARRIVED_AT_INCIDENT' ||
      i.status === 'PATIENT_PICKED_UP' ||
      i.status === 'EN_ROUTE_TO_HOSPITAL' ||
      i.status === 'ROLLBACK_PENDING' ||
      i.status === 'ROLLED_BACK' ||
      i.status === 'DISPATCH_FAILED' ||
      i.severity === 'CRITICAL'
  ).length;

  return (
    <div className="min-h-screen bg-slate-100/60 flex flex-col font-sans text-slate-900 antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        pageTitle={currentPage === 'dashboard' ? 'Dispatcher Dashboard' : 'Incident Management'}
        onRefresh={() => fetchData(false)}
        isRefreshing={isRefreshing}
        isConnected={isBackendConnected}
        connectionStatus={connectionStatus}
        lastEventTime={lastEventTime}
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
              ambulances={ambulances}
              hospitals={hospitals}
              isLoading={isLoading}
              onOpenNewIncident={() => setIsFormOpen(true)}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
              onViewAllIncidents={() => setCurrentPage('incidents')}
              activities={activities}
              onSelectIncidentId={handleSelectIncidentById}
              lastEventTime={lastEventTime}
              onRequestFleetRefresh={handleRequestFleetRefresh}
              onDischargePatient={handleDischargePatient}
            />
          ) : (
            <Incidents
              incidents={incidents}
              isLoading={isLoading}
              onRefresh={() => fetchData(false)}
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
