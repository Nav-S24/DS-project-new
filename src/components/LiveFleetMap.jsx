import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import {
  Truck,
  Building2,
  MapPin,
  Clock,
  Radio,
  RotateCcw,
  Compass,
  AlertCircle,
  CheckCircle2,
  Navigation,
  Activity,
  Layers,
  Zap,
  ArrowRight
} from 'lucide-react';
import { formatClockTime, formatETA, formatDuration, getStatusDetails } from '../utils/formatters';

// Pune City Center default bounds
const PUNE_CENTER = [18.5204, 73.8567];

// Create distinct HTML div icons for Leaflet
function createAmbulanceIcon(status, callsign) {
  const isEnRoute = status === 'DISPATCHED';
  const isBusy = status === 'BUSY';
  const bg = isEnRoute ? '#2563eb' : isBusy ? '#d97706' : '#059669';
  const pulse = isEnRoute ? '<div class="absolute -inset-1 rounded-full bg-blue-500/40 animate-ping"></div>' : '';

  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="relative flex items-center justify-center">
        ${pulse}
        <div style="background-color: ${bg};" class="w-8 h-8 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-xs">
          🚑
        </div>
        <div class="absolute -bottom-4 whitespace-nowrap bg-slate-900/90 text-white text-[9px] font-mono px-1 rounded shadow-xs">
          ${callsign}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function createHospitalIcon(hospital) {
  const isFull = hospital.available_beds === 0;
  const bg = isFull ? '#dc2626' : '#047857';

  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="relative flex items-center justify-center">
        <div style="background-color: ${bg};" class="w-8 h-8 rounded-lg border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-xs">
          🏥
        </div>
        <div class="absolute -top-2 -right-2 bg-emerald-500 text-white text-[8px] font-mono font-bold px-1 rounded-full border border-white">
          ${hospital.available_beds}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function createIncidentIcon(severity, incidentId) {
  const bg = severity === 'CRITICAL' ? '#dc2626' : severity === 'HIGH' ? '#ea580c' : '#2563eb';

  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="absolute -inset-1 rounded-full bg-red-500/40 animate-ping"></div>
        <div style="background-color: ${bg};" class="w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-xs">
          ⚠️
        </div>
        <div class="absolute -bottom-4 whitespace-nowrap bg-red-950 text-red-200 text-[9px] font-mono px-1 rounded border border-red-800 shadow-xs">
          ${incidentId}
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

export function LiveFleetMap({
  ambulances = [],
  hospitals = [],
  incidents = [],
  lastEventTime,
  onRequestFleetRefresh,
  onDischargePatient,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routesLayerRef = useRef(null);

  const [tileError, setTileError] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState(null);
  const [filter, setFilter] = useState('ALL');

  // Find currently active incident with moving ambulance
  const activeIncident = useMemo(() => {
    if (selectedIncidentId) {
      const found = incidents.find((i) => i.incident_id === selectedIncidentId);
      if (found) return found;
    }
    return incidents.find(
      (i) =>
        i.status === 'EN_ROUTE_TO_INCIDENT' ||
        i.status === 'ARRIVED_AT_INCIDENT' ||
        i.status === 'PATIENT_PICKED_UP' ||
        i.status === 'EN_ROUTE_TO_HOSPITAL' ||
        i.status === 'DISPATCHED'
    ) || incidents[0] || null;
  }, [incidents, selectedIncidentId]);

  // Selected ambulance
  const selectedAmbulance = useMemo(() => {
    if (selectedAmbulanceId) {
      return ambulances.find((a) => a.id === selectedAmbulanceId);
    }
    if (activeIncident?.assigned_ambulance) {
      return ambulances.find((a) => a.id === activeIncident.assigned_ambulance);
    }
    return ambulances[0] || null;
  }, [ambulances, selectedAmbulanceId, activeIncident]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: PUNE_CENTER,
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
      });

      // OpenStreetMap Standard Tiles
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      });

      tileLayer.on('tileerror', () => {
        setTileError(true);
      });

      tileLayer.addTo(map);

      // Separate feature layers for clean updates
      const routesLayer = L.layerGroup().addTo(map);
      const markersLayer = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
      routesLayerRef.current = routesLayer;
      markersLayerRef.current = markersLayer;
    } catch (err) {
      console.error('Failed to initialize Leaflet street map:', err);
      setTileError(true);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers & Routes whenever state changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const routesLayer = routesLayerRef.current;
    if (!map || !markersLayer || !routesLayer) return;

    markersLayer.clearLayers();
    routesLayer.clearLayers();

    // 1. Add Hospital Markers
    hospitals.forEach((hosp) => {
      const marker = L.marker([hosp.latitude, hosp.longitude], {
        icon: createHospitalIcon(hosp),
      });

      const popupContent = `
        <div class="p-3 text-xs font-sans min-w-[210px]">
          <div class="flex items-center gap-1.5 font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-2">
            <span>🏥</span>
            <span>${hosp.name}</span>
          </div>
          <p class="text-[11px] text-slate-500 mb-2">${hosp.location}</p>
          <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono bg-slate-50 p-2 rounded border border-slate-100">
            <div>Available: <strong class="text-emerald-700">${hosp.available_beds}</strong></div>
            <div>Reserved: <strong class="text-amber-700">${hosp.reserved_beds || 0}</strong></div>
            <div>Occupied: <strong class="text-blue-700">${hosp.occupied_beds || 0}</strong></div>
            <div>Total: <strong>${hosp.total_beds}</strong></div>
          </div>
          ${
            hosp.occupied_beds > 0 && onDischargePatient
              ? `<button id="discharge-btn-${hosp.id}" class="mt-2 w-full py-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold rounded cursor-pointer transition-colors">
                  Discharge Patient (Demo)
                </button>`
              : ''
          }
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('popupopen', () => {
        const btn = document.getElementById(`discharge-btn-${hosp.id}`);
        if (btn) {
          btn.onclick = () => {
            onDischargePatient(hosp.id);
            marker.closePopup();
          };
        }
      });

      markersLayer.addLayer(marker);
    });

    // 2. Add Incident Markers
    incidents
      .filter((inc) => inc.status !== 'COMPLETED' && inc.latitude && inc.longitude)
      .slice(0, 10)
      .forEach((inc) => {
        const marker = L.marker([inc.latitude, inc.longitude], {
          icon: createIncidentIcon(inc.severity, inc.incident_id),
        });

        const status = getStatusDetails(inc.status);
        const popupContent = `
          <div class="p-3 text-xs font-sans min-w-[220px]">
            <div class="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
              <span class="font-mono font-bold text-slate-900">${inc.incident_id}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded ${status.bgClass} font-semibold">${status.label}</span>
            </div>
            <p class="text-slate-700 font-medium mb-1">${inc.description}</p>
            <p class="text-[11px] text-slate-500 font-mono mb-2">📍 ${inc.location}</p>
            <div class="text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100">
              Assigned: <strong>${inc.assigned_ambulance || 'None'}</strong> &bull; 
              Hospital: <strong>${inc.assigned_hospital || 'None'}</strong>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('click', () => setSelectedIncidentId(inc.incident_id));
        markersLayer.addLayer(marker);
      });

    // 3. Add Ambulance Markers
    ambulances.forEach((amb) => {
      const marker = L.marker([amb.latitude, amb.longitude], {
        icon: createAmbulanceIcon(amb.status, amb.callsign),
        zIndexOffset: amb.status === 'DISPATCHED' ? 100 : 0,
      });

      const popupContent = `
        <div class="p-3 text-xs font-sans min-w-[210px]">
          <div class="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
            <span class="font-mono font-bold text-slate-900">${amb.id} (${amb.callsign})</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">${amb.status}</span>
          </div>
          <div class="space-y-1 text-[11px] text-slate-600">
            <div>Speed: <strong class="font-mono">${amb.speed_kmh || 0} km/h</strong></div>
            <div>Destination: <strong>${amb.trip_destination || 'Station'}</strong></div>
            ${amb.eta_text ? `<div>ETA: <strong class="text-blue-600 font-mono">${amb.eta_text}</strong></div>` : ''}
            <div>Coordinates: <span class="font-mono text-[10px]">${amb.latitude.toFixed(4)}, ${amb.longitude.toFixed(4)}</span></div>
          </div>
          <div class="mt-2 text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
            SIMULATED DEMO TELEMETRY
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => setSelectedAmbulanceId(amb.id));
      markersLayer.addLayer(marker);
    });

    // 4. Draw Active Road Route Polyline
    if (activeIncident && activeIncident.route_geometry && activeIncident.route_geometry.length > 1) {
      const routePolyline = L.polyline(activeIncident.route_geometry, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round',
      });

      routesLayer.addLayer(routePolyline);

      // Fit bounds to the active route
      try {
        map.fitBounds(routePolyline.getBounds(), { padding: [40, 40], maxZoom: 14 });
      } catch {
        // Safe bounds catch
      }
    }
  }, [ambulances, hospitals, incidents, activeIncident, onDischargePatient]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(PUNE_CENTER, 12);
    }
  };

  const handleFitActive = () => {
    if (!mapInstanceRef.current) return;
    if (activeIncident?.route_geometry && activeIncident.route_geometry.length > 1) {
      mapInstanceRef.current.fitBounds(L.polyline(activeIncident.route_geometry).getBounds(), {
        padding: [50, 50],
        maxZoom: 15,
      });
    } else {
      handleRecenter();
    }
  };

  // Journey Stages Timeline Steps
  const journeyStages = [
    { key: 'DISPATCHED', label: 'Dispatched', sub: 'Allocated' },
    { key: 'EN_ROUTE_TO_INCIDENT', label: 'En Route', sub: 'To Scene' },
    { key: 'ARRIVED_AT_INCIDENT', label: 'Arrived', sub: 'At Scene' },
    { key: 'PATIENT_PICKED_UP', label: 'Pickup', sub: 'Secured' },
    { key: 'EN_ROUTE_TO_HOSPITAL', label: 'Transport', sub: 'To Hospital' },
    { key: 'ARRIVED_AT_HOSPITAL', label: 'At Hospital', sub: 'Trauma Bay' },
    { key: 'COMPLETED', label: 'Delivered', sub: 'Completed' },
  ];

  const getStageIndex = (stage) => {
    switch (stage) {
      case 'EN_ROUTE_TO_INCIDENT':
      case 'DISPATCHED':
        return 1;
      case 'ARRIVED_AT_INCIDENT':
        return 2;
      case 'PATIENT_PICKED_UP':
        return 3;
      case 'EN_ROUTE_TO_HOSPITAL':
        return 4;
      case 'ARRIVED_AT_HOSPITAL':
        return 5;
      case 'COMPLETED':
        return 6;
      default:
        return 0;
    }
  };

  const currentStageIdx = getStageIndex(activeIncident?.status || activeIncident?.journey_stage);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Top Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/75">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-600" />
              <span>Real-World Street Map & Road Routing</span>
            </h3>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              OpenStreetMap + OSRM
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real geographic coordinates, road-network routing, and full patient transport journey in Pune.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleFitActive}
            className="text-xs bg-white hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200 font-medium cursor-pointer shadow-2xs flex items-center gap-1"
            title="Fit view to active route"
          >
            <Navigation className="w-3.5 h-3.5 text-blue-600" />
            <span>Fit Route</span>
          </button>
          <button
            onClick={handleRecenter}
            className="text-xs bg-white hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200 font-medium cursor-pointer shadow-2xs flex items-center gap-1"
            title="Recenter to Pune Center"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Recenter</span>
          </button>
          {onRequestFleetRefresh && (
            <button
              onClick={onRequestFleetRefresh}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-md font-semibold cursor-pointer shadow-2xs flex items-center gap-1"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Sync Telemetry</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-Stage Journey Bar for Active Incident */}
      {activeIncident && (
        <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-blue-300">
                {activeIncident.incident_id}
              </span>
              <span className="text-slate-300 font-medium truncate max-w-xs sm:max-w-md">
                {activeIncident.description}
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px]">
              {activeIncident.eta_incident && (
                <div className="bg-blue-950/80 border border-blue-600/50 px-2 py-0.5 rounded text-blue-300">
                  ETA at scene: <strong class="text-white">{activeIncident.eta_incident}</strong>
                </div>
              )}
              {activeIncident.eta_hospital && (
                <div className="bg-teal-950/80 border border-teal-600/50 px-2 py-0.5 rounded text-teal-300">
                  ETA at hospital: <strong class="text-white">{activeIncident.eta_hospital}</strong>
                </div>
              )}
              {activeIncident.remaining_distance_km != null && activeIncident.remaining_distance_km > 0 && (
                <span className="text-slate-400">
                  {activeIncident.remaining_distance_km} km remaining
                </span>
              )}
            </div>
          </div>

          {/* Stepper Bar */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {journeyStages.map((step, idx) => {
              const isPast = idx < currentStageIdx;
              const isCurrent = idx === currentStageIdx;
              return (
                <div key={step.key} className="flex flex-col items-center">
                  <div
                    className={`h-1.5 w-full rounded-full transition-colors mb-1.5 ${
                      isPast
                        ? 'bg-emerald-500'
                        : isCurrent
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-slate-700'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-semibold whitespace-nowrap truncate w-full ${
                      isCurrent
                        ? 'text-white'
                        : isPast
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[9px] text-slate-500 hidden md:block">
                    {step.sub}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Grid: Leaflet Map (Left 7) and Telemetry + Hospital Beds (Right 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* Left: Leaflet Street Map Container */}
        <div className="lg:col-span-8 relative min-h-[440px] bg-slate-100">
          {tileError && (
            <div className="absolute top-2 left-2 right-2 z-20 bg-amber-50 text-amber-800 text-xs p-2 rounded-lg border border-amber-200 flex items-center gap-2 shadow-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Map tile service offline or slow; coordinate markers and straight-line path fallback active.</span>
            </div>
          )}

          <div ref={mapContainerRef} className="w-full h-[440px] z-10" />

          {/* Map Floating Legend */}
          <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur-xs p-2 rounded-lg border border-slate-200 shadow-md text-[10px] text-slate-700 flex flex-wrap gap-2.5 items-center">
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Dispatched
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Available Unit
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600" /> At Scene
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-lg bg-emerald-800" /> Hospital
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Incident
            </span>
            <span className="border-l border-slate-300 pl-2 font-mono text-[9px] text-slate-500">
              Simulation: 2.0s Ticks
            </span>
          </div>
        </div>

        {/* Right: Telemetry & Hospital Bed Accounting Panel */}
        <div className="lg:col-span-4 p-4 sm:p-5 flex flex-col justify-between space-y-4 bg-slate-50/50">
          {/* Ambulance Telemetry Card */}
          {selectedAmbulance ? (
            <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-mono">
                      {selectedAmbulance.id} &bull; {selectedAmbulance.callsign}
                    </h4>
                    <span className="text-[10px] text-slate-500">
                      Destination: {selectedAmbulance.trip_destination || 'Base Station'}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {selectedAmbulance.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase block font-sans">Speed & Bearing</span>
                  <strong className="text-slate-800">{selectedAmbulance.speed_kmh || 0} km/h</strong> &bull; {selectedAmbulance.heading || 0}°
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase block font-sans">Next ETA</span>
                  <strong className="text-blue-600">{selectedAmbulance.eta_text || '--:--'}</strong>
                </div>
              </div>

              <div className="text-[10px] font-mono text-slate-500 bg-slate-50 p-1.5 rounded flex items-center justify-between border border-slate-100">
                <span>GPS: {selectedAmbulance.latitude.toFixed(4)}, {selectedAmbulance.longitude.toFixed(4)}</span>
                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                  SIMULATED
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-4 text-center text-xs text-slate-400">
              No ambulance selected.
            </div>
          )}

          {/* Hospital Bed Accounting Card */}
          <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-900">Hospital Bed Capacity Accounting</h4>
              </div>
              <span className="text-[10px] font-mono text-slate-400">FA-1 Model</span>
            </div>

            <p className="text-[11px] text-slate-500 leading-tight">
              Beds are atomically reserved on dispatch commit and converted to occupied upon trauma bay arrival.
            </p>

            <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
              {hospitals.map((hosp) => (
                <div key={hosp.id} className="p-2 rounded border border-slate-100 bg-slate-50/70 text-xs">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="truncate max-w-[140px]">{hosp.name}</span>
                    <span className="text-emerald-700 font-mono">{hosp.available_beds} Available</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1 text-[10px] font-mono text-slate-600">
                    <div>Cap: {hosp.total_beds}</div>
                    <div>Res: {hosp.reserved_beds || 0}</div>
                    <div>Occ: {hosp.occupied_beds || 0}</div>
                  </div>
                  {hosp.occupied_beds > 0 && onDischargePatient && (
                    <button
                      onClick={() => onDischargePatient(hosp.id)}
                      className="mt-1.5 w-full py-0.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-semibold rounded cursor-pointer transition-colors shadow-2xs"
                    >
                      Discharge Patient (Demo)
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
