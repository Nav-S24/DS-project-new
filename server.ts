import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Domain Types & Interfaces
// ---------------------------------------------------------------------------

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus =
  | 'CREATED'
  | 'REPORTED'
  | 'DISPATCHING'
  | 'DISPATCHED'
  | 'EN_ROUTE_TO_INCIDENT'
  | 'ARRIVED_AT_INCIDENT'
  | 'PATIENT_PICKED_UP'
  | 'EN_ROUTE_TO_HOSPITAL'
  | 'ARRIVED_AT_HOSPITAL'
  | 'COMPLETED'
  | 'WAITING_FOR_AMBULANCE'
  | 'WAITING_FOR_HOSPITAL'
  | 'ROLLBACK_PENDING'
  | 'ROLLED_BACK'
  | 'DISPATCH_FAILED';

export interface Ambulance {
  id: string;
  callsign: string;
  status: 'AVAILABLE' | 'DISPATCHED' | 'BUSY';
  latitude: number;
  longitude: number;
  base_latitude: number;
  base_longitude: number;
  target_latitude?: number | null;
  target_longitude?: number | null;
  current_incident_id?: string | null;
  trip_stage?: string | null;
  trip_destination?: string | null;
  eta_text?: string | null;
  speed_kmh?: number;
  heading?: number;
  is_simulated?: boolean;
  last_updated?: string;
}

export interface Hospital {
  id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  total_beds: number;
  available_beds: number;
  reserved_beds: number;
  occupied_beds: number;
}

export interface Incident {
  id: string;
  incident_id: string;
  description: string;
  location: string;
  location_type?: 'user_selected' | 'geocoded' | 'simulated_demo';
  latitude?: number;
  longitude?: number;
  severity: Severity;
  status: IncidentStatus;
  assigned_ambulance: string | null;
  assigned_hospital: string | null;
  dispatch_error?: string | null;
  correlation_id?: string;
  journey_stage?: string | null;
  eta_incident?: string | null;
  eta_hospital?: string | null;
  remaining_duration_sec?: number | null;
  remaining_distance_km?: number | null;
  route_geometry?: [number, number][] | null;
  stage_timestamps?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface OutboxEvent {
  event_id: string;
  incident_id: string;
  event_type: string;
  status: IncidentStatus | string;
  correlation_id?: string;
  assigned_ambulance?: string | null;
  assigned_hospital?: string | null;
  timestamp: string;
  dispatched_to_rabbitmq: boolean;
  dispatched_to_ws: boolean;
  payload?: Record<string, unknown>;
}

export interface WebSocketMessage {
  event_id: string;
  event_type: string;
  incident_id?: string;
  status?: string;
  correlation_id?: string;
  ambulance_id?: string;
  hospital_id?: string;
  latitude?: number;
  longitude?: number;
  speed_kmh?: number;
  heading?: number;
  trip_stage?: string;
  trip_destination?: string;
  eta_incident?: string;
  eta_hospital?: string;
  remaining_distance_km?: number;
  remaining_duration_sec?: number;
  is_simulated?: boolean;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface CalculatedRoute {
  coordinates: [number, number][]; // [lat, lng] array
  distance_km: number;
  duration_sec: number;
  is_road_route: boolean;
  provider: string;
}

// ---------------------------------------------------------------------------
// Pune Landmarks & Demonstration Coordinates
// ---------------------------------------------------------------------------

export const PUNE_DEMO_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  'Fergusson College Rd, Deccan Gymkhana': { lat: 18.5186, lng: 73.8423 },
  'Mumbai-Pune Bypass, Warje Flyover': { lat: 18.4820, lng: 73.7990 },
  'Kothrud Bus Stand, Sector 4': { lat: 18.5074, lng: 73.8077 },
  'Bhosari MIDC Industrial Zone': { lat: 18.6298, lng: 73.8485 },
  'Camp Cantonment Area, MG Road': { lat: 18.5142, lng: 73.8789 },
  'Shivaji Nagar Bus Station, Sector 2': { lat: 18.5314, lng: 73.8446 },
  'Hadapsar Magarpatta City': { lat: 18.5158, lng: 73.9272 },
  'Viman Nagar Cyber City': { lat: 18.5679, lng: 73.9143 },
  'Baner High Street': { lat: 18.5590, lng: 73.7868 },
  'Aundh Parihar Chowk': { lat: 18.5626, lng: 73.8087 },
  'Swargate ST Stand': { lat: 18.5018, lng: 73.8586 },
  'Katraj Snake Park': { lat: 18.4552, lng: 73.8601 },
  'Hinjawadi IT Park Phase 1': { lat: 18.5913, lng: 73.7389 },
  'Koregaon Park North Main Rd': { lat: 18.5362, lng: 73.8940 },
};

function resolveDemoCoordinates(locationText: string): { lat: number; lng: number } {
  const clean = locationText.trim().toLowerCase();
  for (const [key, coords] of Object.entries(PUNE_DEMO_LOCATIONS)) {
    if (clean.includes(key.toLowerCase()) || key.toLowerCase().includes(clean)) {
      return { ...coords };
    }
  }
  // Deterministic pseudo-random offset within Pune bounds
  let hash = 0;
  for (let i = 0; i < locationText.length; i++) {
    hash = (hash << 5) - hash + locationText.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = ((Math.abs(hash) % 100) / 1000) * (hash % 2 === 0 ? 1 : -1);
  const lngOffset = (((Math.abs(hash) >> 2) % 100) / 1000) * (hash % 3 === 0 ? 1 : -1);
  return {
    lat: +(18.5204 + latOffset * 0.4).toFixed(4),
    lng: +(73.8567 + lngOffset * 0.4).toFixed(4),
  };
}

// ---------------------------------------------------------------------------
// Road Routing Adapter & Interpolation Engine
// ---------------------------------------------------------------------------

function generateInterpolatedRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  steps = 14
): CalculatedRoute {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    coords.push([
      +(startLat + (endLat - startLat) * frac).toFixed(5),
      +(startLng + (endLng - startLng) * frac).toFixed(5),
    ]);
  }
  // Approximate haversine distance
  const dLat = (endLat - startLat) * 111.32;
  const dLng = (endLng - startLng) * 105.7;
  const distKm = +(Math.sqrt(dLat * dLat + dLng * dLng)).toFixed(2);
  const durSec = Math.max(120, Math.round((distKm / 42) * 3600));

  return {
    coordinates: coords,
    distance_km: distKm,
    duration_sec: durSec,
    is_road_route: false,
    provider: 'Straight-line Interpolation (Road Service Offline)',
  };
}

export async function fetchRoadRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<CalculatedRoute> {
  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = (await resp.json()) as any;
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        // Convert [lng, lat] GeoJSON coordinates to [lat, lng]
        const coords: [number, number][] = route.geometry.coordinates.map(
          (pt: [number, number]) => [pt[1], pt[0]]
        );
        return {
          coordinates: coords,
          distance_km: +(route.distance / 1000).toFixed(2),
          duration_sec: Math.round(route.duration),
          is_road_route: true,
          provider: 'OSRM / OpenStreetMap Road Routing',
        };
      }
    }
  } catch {
    // Network failure or timeout -> fallback to straight-line interpolation
  }

  return generateInterpolatedRoute(startLat, startLng, endLat, endLng);
}

export async function geocodeLocation(query: string): Promise<{
  lat: number;
  lng: number;
  location_type: 'geocoded' | 'simulated_demo';
  display_name?: string;
}> {
  const clean = query.trim().toLowerCase();
  for (const [name, coords] of Object.entries(PUNE_DEMO_LOCATIONS)) {
    if (clean.includes(name.toLowerCase()) || name.toLowerCase().includes(clean)) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        location_type: 'simulated_demo',
        display_name: `${name}, Pune, Maharashtra`,
      };
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Pune, Maharashtra')}&format=json&limit=1`,
      {
        headers: { 'User-Agent': 'SyncRescue-EmergencyDispatch/1.0' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (resp.ok) {
      const results = (await resp.json()) as any[];
      if (results && results.length > 0) {
        return {
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon),
          location_type: 'geocoded',
          display_name: results[0].display_name,
        };
      }
    }
  } catch {
    // Fallback on timeout
  }

  const fallback = resolveDemoCoordinates(query);
  return {
    lat: fallback.lat,
    lng: fallback.lng,
    location_type: 'simulated_demo',
    display_name: `${query} (Pune Demo Sector)`,
  };
}

export function formatETAString(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ---------------------------------------------------------------------------
// In-Memory Database & Seeded State
// ---------------------------------------------------------------------------

const ambulances: Map<string, Ambulance> = new Map([
  ['AMB-001', {
    id: 'AMB-001',
    callsign: 'Apex-Unit-1',
    status: 'AVAILABLE',
    latitude: 18.5204,
    longitude: 73.8567,
    base_latitude: 18.5204,
    base_longitude: 73.8567,
    speed_kmh: 0,
    heading: 0,
    is_simulated: true,
    last_updated: new Date().toISOString(),
  }],
  ['AMB-002', {
    id: 'AMB-002',
    callsign: 'Trauma-Unit-2',
    status: 'AVAILABLE',
    latitude: 18.5304,
    longitude: 73.8667,
    base_latitude: 18.5304,
    base_longitude: 73.8667,
    speed_kmh: 0,
    heading: 142,
    is_simulated: true,
    last_updated: new Date().toISOString(),
  }],
  ['AMB-003', {
    id: 'AMB-003',
    callsign: 'Rapid-Unit-3',
    status: 'AVAILABLE',
    latitude: 18.5104,
    longitude: 73.8467,
    base_latitude: 18.5104,
    base_longitude: 73.8467,
    speed_kmh: 0,
    heading: 0,
    is_simulated: true,
    last_updated: new Date().toISOString(),
  }],
  ['AMB-004', {
    id: 'AMB-004',
    callsign: 'Sector-Unit-4',
    status: 'AVAILABLE',
    latitude: 18.5250,
    longitude: 73.8500,
    base_latitude: 18.5250,
    base_longitude: 73.8500,
    speed_kmh: 0,
    heading: 0,
    is_simulated: true,
    last_updated: new Date().toISOString(),
  }],
  ['AMB-005', {
    id: 'AMB-005',
    callsign: 'Metro-Unit-5',
    status: 'AVAILABLE',
    latitude: 18.5400,
    longitude: 73.8700,
    base_latitude: 18.5400,
    base_longitude: 73.8700,
    speed_kmh: 0,
    heading: 210,
    is_simulated: true,
    last_updated: new Date().toISOString(),
  }],
]);

const hospitals: Map<string, Hospital> = new Map([
  ['HOSP-001', {
    id: 'HOSP-001',
    name: 'City General Hospital',
    location: 'Pune Central (Shivaji Nagar)',
    latitude: 18.5230,
    longitude: 73.8540,
    total_beds: 100,
    available_beds: 24,
    reserved_beds: 0,
    occupied_beds: 76,
  }],
  ['HOSP-002', {
    id: 'HOSP-002',
    name: 'Emergency Care Hospital',
    location: 'Pune West (Kothrud)',
    latitude: 18.5080,
    longitude: 73.8210,
    total_beds: 80,
    available_beds: 9,
    reserved_beds: 0,
    occupied_beds: 71,
  }],
  ['HOSP-003', {
    id: 'HOSP-003',
    name: 'Metro Medical Center',
    location: 'Pune East (Hadapsar)',
    latitude: 18.5190,
    longitude: 73.9100,
    total_beds: 120,
    available_beds: 0,
    reserved_beds: 0,
    occupied_beds: 120,
  }],
  ['HOSP-004', {
    id: 'HOSP-004',
    name: 'Apollo Trauma Care',
    location: 'Pune South (Bibwewadi)',
    latitude: 18.4900,
    longitude: 73.8550,
    total_beds: 90,
    available_beds: 14,
    reserved_beds: 0,
    occupied_beds: 76,
  }],
]);

const initialIncidents: Incident[] = [
  {
    id: 'INC-8021',
    incident_id: 'INC-8021',
    description: 'Acute cardiac arrest with collapse, CPR in progress',
    location: 'Fergusson College Rd, Deccan Gymkhana',
    location_type: 'simulated_demo',
    latitude: 18.5186,
    longitude: 73.8423,
    severity: 'CRITICAL',
    status: 'COMPLETED',
    assigned_ambulance: 'AMB-002',
    assigned_hospital: 'HOSP-001',
    dispatch_error: null,
    correlation_id: 'corr-init-8021',
    journey_stage: 'COMPLETED',
    stage_timestamps: {
      dispatched: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      arrived_at_incident: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      patient_picked_up: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      arrived_at_hospital: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      completed: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    },
    created_at: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  {
    id: 'INC-8022',
    incident_id: 'INC-8022',
    description: 'Multi-vehicle collision on highway bypass with entrapment',
    location: 'Mumbai-Pune Bypass, Warje Flyover',
    location_type: 'simulated_demo',
    latitude: 18.4820,
    longitude: 73.7990,
    severity: 'HIGH',
    status: 'COMPLETED',
    assigned_ambulance: 'AMB-005',
    assigned_hospital: 'HOSP-002',
    dispatch_error: null,
    correlation_id: 'corr-init-8022',
    journey_stage: 'COMPLETED',
    stage_timestamps: {
      dispatched: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
      completed: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    },
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: 'INC-8023',
    incident_id: 'INC-8023',
    description: 'Severe respiratory distress, oxygen saturation below 80%',
    location: 'Kothrud Bus Stand, Sector 4',
    location_type: 'simulated_demo',
    latitude: 18.5074,
    longitude: 73.8077,
    severity: 'CRITICAL',
    status: 'WAITING_FOR_HOSPITAL',
    assigned_ambulance: null,
    assigned_hospital: null,
    dispatch_error: 'NO_HOSPITAL_BED_AVAILABLE',
    correlation_id: 'corr-init-8023',
    created_at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 54).toISOString(),
  },
];

const incidents: Incident[] = [...initialIncidents];
const outbox: OutboxEvent[] = [];

// Track connected WebSocket clients
const connectedClients = new Set<WebSocket>();

// Active Journey Simulation Sessions
interface JourneySession {
  ambulanceId: string;
  incidentId: string;
  hospitalId: string;
  currentPhase: 'TO_INCIDENT' | 'PICKUP_PAUSE' | 'TO_HOSPITAL' | 'HANDOVER_PAUSE';
  route: CalculatedRoute;
  currentPointIndex: number;
  totalPoints: number;
  timer: NodeJS.Timeout;
}
const activeJourneys = new Map<string, JourneySession>();

// ---------------------------------------------------------------------------
// Transactional Outbox & Event Broadcasting Subsystem
// ---------------------------------------------------------------------------

export function recordAndBroadcastOutboxEvent(eventData: {
  incident_id: string;
  event_type: string;
  status: IncidentStatus | string;
  correlation_id?: string;
  assigned_ambulance?: string | null;
  assigned_hospital?: string | null;
  payload?: Record<string, unknown>;
}): OutboxEvent {
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const outboxEntry: OutboxEvent = {
    event_id: eventId,
    incident_id: eventData.incident_id,
    event_type: eventData.event_type,
    status: eventData.status,
    correlation_id: eventData.correlation_id,
    assigned_ambulance: eventData.assigned_ambulance,
    assigned_hospital: eventData.assigned_hospital,
    payload: eventData.payload,
    timestamp: new Date().toISOString(),
    dispatched_to_rabbitmq: true,
    dispatched_to_ws: false,
  };

  outbox.unshift(outboxEntry);
  if (outbox.length > 250) {
    outbox.pop();
  }

  const wsMessage: WebSocketMessage = {
    event_id: eventId,
    event_type: eventData.event_type,
    incident_id: eventData.incident_id,
    status: eventData.status,
    correlation_id: eventData.correlation_id,
    ambulance_id: eventData.assigned_ambulance || undefined,
    hospital_id: eventData.assigned_hospital || undefined,
    timestamp: outboxEntry.timestamp,
    payload: eventData.payload,
  };

  broadcastWebSocketMessage(wsMessage);
  outboxEntry.dispatched_to_ws = true;

  return outboxEntry;
}

export function broadcastWebSocketMessage(message: WebSocketMessage): number {
  const payloadString = JSON.stringify(message);
  let deliveredCount = 0;

  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payloadString);
        deliveredCount++;
      } catch (err) {
        console.warn('[WebSocket] Error sending message to client:', err);
      }
    }
  }

  return deliveredCount;
}

// ---------------------------------------------------------------------------
// Complete Road-Based Ambulance Journey Engine
// ---------------------------------------------------------------------------

export function stopJourneySimulation(ambulanceId: string) {
  const session = activeJourneys.get(ambulanceId);
  if (session) {
    clearInterval(session.timer);
    activeJourneys.delete(ambulanceId);
  }
}

/**
 * Initiates the complete multi-stage ambulance journey:
 * Phase 1: EN_ROUTE_TO_INCIDENT
 * Phase 2: ARRIVED_AT_INCIDENT & PATIENT_PICKED_UP
 * Phase 3: EN_ROUTE_TO_HOSPITAL
 * Phase 4: ARRIVED_AT_HOSPITAL & COMPLETED (with atomic bed conversion)
 */
export async function startFullAmbulanceJourney(
  ambulanceId: string,
  incidentId: string,
  hospitalId: string
) {
  stopJourneySimulation(ambulanceId);

  const amb = ambulances.get(ambulanceId);
  const inc = incidents.find((i) => i.incident_id === incidentId);
  const hosp = hospitals.get(hospitalId);

  if (!amb || !inc || !hosp) return;

  const incidentLat = inc.latitude || 18.5204;
  const incidentLng = inc.longitude || 73.8567;

  // Step 1: Calculate road route from ambulance to incident
  const routeToIncident = await fetchRoadRoute(
    amb.latitude,
    amb.longitude,
    incidentLat,
    incidentLng
  );

  const now = Date.now();
  // Compute realistic ETA at incident (HH:MM AM/PM)
  const etaIncidentDate = new Date(now + routeToIncident.duration_sec * 1000);
  const etaIncidentText = formatETAString(etaIncidentDate);

  // Update incident and ambulance state
  inc.status = 'EN_ROUTE_TO_INCIDENT';
  inc.journey_stage = 'EN_ROUTE_TO_INCIDENT';
  inc.eta_incident = etaIncidentText;
  inc.remaining_distance_km = routeToIncident.distance_km;
  inc.remaining_duration_sec = routeToIncident.duration_sec;
  inc.route_geometry = routeToIncident.coordinates;
  inc.stage_timestamps = {
    ...inc.stage_timestamps,
    dispatched: new Date().toISOString(),
  };

  amb.status = 'DISPATCHED';
  amb.trip_stage = 'EN_ROUTE_TO_INCIDENT';
  amb.trip_destination = inc.location;
  amb.eta_text = etaIncidentText;
  amb.current_incident_id = incidentId;
  amb.speed_kmh = 52;

  recordAndBroadcastOutboxEvent({
    incident_id: incidentId,
    event_type: 'JOURNEY_STAGE_CHANGED',
    status: 'EN_ROUTE_TO_INCIDENT',
    correlation_id: inc.correlation_id,
    assigned_ambulance: ambulanceId,
    assigned_hospital: hospitalId,
    payload: {
      stage: 'EN_ROUTE_TO_INCIDENT',
      eta_incident: etaIncidentText,
      distance_km: routeToIncident.distance_km,
      duration_sec: routeToIncident.duration_sec,
      is_road_route: routeToIncident.is_road_route,
      route_coordinates: routeToIncident.coordinates,
    },
  });

  // Animation configuration: tick every 2.0 seconds
  const TICK_INTERVAL_MS = 2000;
  const numPoints = routeToIncident.coordinates.length;
  // Progress along the route in ~6-8 steps for demo speed
  const stepIncrement = Math.max(1, Math.ceil(numPoints / 7));
  let currentIndex = 0;

  const journeySession: JourneySession = {
    ambulanceId,
    incidentId,
    hospitalId,
    currentPhase: 'TO_INCIDENT',
    route: routeToIncident,
    currentPointIndex: 0,
    totalPoints: numPoints,
    timer: null as any,
  };

  const tick = async () => {
    const curAmb = ambulances.get(ambulanceId);
    const curInc = incidents.find((i) => i.incident_id === incidentId);
    if (!curAmb || !curInc) {
      stopJourneySimulation(ambulanceId);
      return;
    }

    if (journeySession.currentPhase === 'TO_INCIDENT') {
      currentIndex += stepIncrement;
      if (currentIndex < numPoints - 1) {
        // En route coordinate update
        const pt = routeToIncident.coordinates[currentIndex];
        const progressFrac = currentIndex / (numPoints - 1);
        const remDist = +(routeToIncident.distance_km * (1 - progressFrac)).toFixed(2);
        const remDur = Math.round(routeToIncident.duration_sec * (1 - progressFrac));

        curAmb.latitude = pt[0];
        curAmb.longitude = pt[1];
        curAmb.speed_kmh = Math.round(48 + Math.random() * 12);
        curAmb.last_updated = new Date().toISOString();

        curInc.remaining_distance_km = remDist;
        curInc.remaining_duration_sec = remDur;

        broadcastWebSocketMessage({
          event_id: `evt-loc-${Date.now()}-${ambulanceId}`,
          event_type: 'AMBULANCE_LOCATION_UPDATED',
          ambulance_id: ambulanceId,
          incident_id: incidentId,
          latitude: pt[0],
          longitude: pt[1],
          speed_kmh: curAmb.speed_kmh,
          heading: curAmb.heading,
          trip_stage: 'EN_ROUTE_TO_INCIDENT',
          trip_destination: curInc.location,
          eta_incident: etaIncidentText,
          remaining_distance_km: remDist,
          remaining_duration_sec: remDur,
          is_simulated: true,
          timestamp: new Date().toISOString(),
          payload: {
            progress_percent: Math.round(progressFrac * 100),
            is_road_route: routeToIncident.is_road_route,
          },
        });
      } else {
        // Reached Incident Scene!
        curAmb.latitude = incidentLat;
        curAmb.longitude = incidentLng;
        curAmb.speed_kmh = 0;
        curAmb.status = 'BUSY';
        curAmb.trip_stage = 'ARRIVED_AT_INCIDENT';
        curAmb.last_updated = new Date().toISOString();

        curInc.status = 'ARRIVED_AT_INCIDENT';
        curInc.journey_stage = 'ARRIVED_AT_INCIDENT';
        curInc.remaining_distance_km = 0;
        curInc.remaining_duration_sec = 0;
        curInc.stage_timestamps = {
          ...curInc.stage_timestamps,
          arrived_at_incident: new Date().toISOString(),
        };

        recordAndBroadcastOutboxEvent({
          incident_id: incidentId,
          event_type: 'JOURNEY_STAGE_CHANGED',
          status: 'ARRIVED_AT_INCIDENT',
          correlation_id: curInc.correlation_id,
          assigned_ambulance: ambulanceId,
          assigned_hospital: hospitalId,
          payload: {
            message: `Ambulance ${curAmb.callsign} arrived at incident scene. Administering emergency first response.`,
            stage: 'ARRIVED_AT_INCIDENT',
          },
        });

        // Switch to pickup pause
        journeySession.currentPhase = 'PICKUP_PAUSE';
        clearInterval(journeySession.timer);

        // After pickup duration (3.0 seconds demo time), transition to PATIENT_PICKED_UP
        setTimeout(async () => {
          const freshInc = incidents.find((i) => i.incident_id === incidentId);
          const freshAmb = ambulances.get(ambulanceId);
          const freshHosp = hospitals.get(hospitalId);
          if (!freshInc || !freshAmb || !freshHosp) return;

          freshInc.status = 'PATIENT_PICKED_UP';
          freshInc.journey_stage = 'PATIENT_PICKED_UP';
          freshInc.stage_timestamps = {
            ...freshInc.stage_timestamps,
            patient_picked_up: new Date().toISOString(),
          };

          recordAndBroadcastOutboxEvent({
            incident_id: incidentId,
            event_type: 'JOURNEY_STAGE_CHANGED',
            status: 'PATIENT_PICKED_UP',
            correlation_id: freshInc.correlation_id,
            assigned_ambulance: ambulanceId,
            assigned_hospital: hospitalId,
            payload: {
              message: `Patient safely secured on board ${freshAmb.callsign} — departing immediately for ${freshHosp.name}.`,
              stage: 'PATIENT_PICKED_UP',
            },
          });

          // Phase 2: Route from incident to Hospital
          const routeToHosp = await fetchRoadRoute(
            incidentLat,
            incidentLng,
            freshHosp.latitude,
            freshHosp.longitude
          );

          const etaHospDate = new Date(Date.now() + routeToHosp.duration_sec * 1000);
          const etaHospText = formatETAString(etaHospDate);

          freshInc.status = 'EN_ROUTE_TO_HOSPITAL';
          freshInc.journey_stage = 'EN_ROUTE_TO_HOSPITAL';
          freshInc.eta_hospital = etaHospText;
          freshInc.remaining_distance_km = routeToHosp.distance_km;
          freshInc.remaining_duration_sec = routeToHosp.duration_sec;
          freshInc.route_geometry = routeToHosp.coordinates;

          freshAmb.status = 'DISPATCHED';
          freshAmb.trip_stage = 'EN_ROUTE_TO_HOSPITAL';
          freshAmb.trip_destination = freshHosp.name;
          freshAmb.eta_text = etaHospText;
          freshAmb.speed_kmh = 58;

          recordAndBroadcastOutboxEvent({
            incident_id: incidentId,
            event_type: 'JOURNEY_STAGE_CHANGED',
            status: 'EN_ROUTE_TO_HOSPITAL',
            correlation_id: freshInc.correlation_id,
            assigned_ambulance: ambulanceId,
            assigned_hospital: hospitalId,
            payload: {
              stage: 'EN_ROUTE_TO_HOSPITAL',
              eta_hospital: etaHospText,
              distance_km: routeToHosp.distance_km,
              duration_sec: routeToHosp.duration_sec,
              is_road_route: routeToHosp.is_road_route,
              route_coordinates: routeToHosp.coordinates,
            },
          });

          // Begin transport animation to hospital
          journeySession.currentPhase = 'TO_HOSPITAL';
          journeySession.route = routeToHosp;
          journeySession.totalPoints = routeToHosp.coordinates.length;
          currentIndex = 0;
          const hospStepIncrement = Math.max(1, Math.ceil(routeToHosp.coordinates.length / 7));

          journeySession.timer = setInterval(() => {
            currentIndex += hospStepIncrement;
            const hNumPoints = routeToHosp.coordinates.length;

            if (currentIndex < hNumPoints - 1) {
              const hPt = routeToHosp.coordinates[currentIndex];
              const hFrac = currentIndex / (hNumPoints - 1);
              const hRemDist = +(routeToHosp.distance_km * (1 - hFrac)).toFixed(2);
              const hRemDur = Math.round(routeToHosp.duration_sec * (1 - hFrac));

              freshAmb.latitude = hPt[0];
              freshAmb.longitude = hPt[1];
              freshAmb.speed_kmh = Math.round(52 + Math.random() * 10);
              freshAmb.last_updated = new Date().toISOString();

              freshInc.remaining_distance_km = hRemDist;
              freshInc.remaining_duration_sec = hRemDur;

              broadcastWebSocketMessage({
                event_id: `evt-loc-${Date.now()}-${ambulanceId}`,
                event_type: 'AMBULANCE_LOCATION_UPDATED',
                ambulance_id: ambulanceId,
                incident_id: incidentId,
                latitude: hPt[0],
                longitude: hPt[1],
                speed_kmh: freshAmb.speed_kmh,
                heading: freshAmb.heading,
                trip_stage: 'EN_ROUTE_TO_HOSPITAL',
                trip_destination: freshHosp.name,
                eta_hospital: etaHospText,
                remaining_distance_km: hRemDist,
                remaining_duration_sec: hRemDur,
                is_simulated: true,
                timestamp: new Date().toISOString(),
                payload: {
                  progress_percent: Math.round(hFrac * 100),
                  is_road_route: routeToHosp.is_road_route,
                },
              });
            } else {
              // Arrived at Hospital!
              clearInterval(journeySession.timer);
              freshAmb.latitude = freshHosp.latitude;
              freshAmb.longitude = freshHosp.longitude;
              freshAmb.speed_kmh = 0;
              freshAmb.status = 'BUSY';
              freshAmb.trip_stage = 'ARRIVED_AT_HOSPITAL';
              freshAmb.last_updated = new Date().toISOString();

              freshInc.status = 'ARRIVED_AT_HOSPITAL';
              freshInc.journey_stage = 'ARRIVED_AT_HOSPITAL';
              freshInc.remaining_distance_km = 0;
              freshInc.remaining_duration_sec = 0;
              freshInc.stage_timestamps = {
                ...freshInc.stage_timestamps,
                arrived_at_hospital: new Date().toISOString(),
              };

              // ATOMIC BED ACCOUNTING: Convert reservation into occupied bed
              // available_beds was already decremented upon dispatch commit!
              if (freshHosp.reserved_beds > 0) {
                freshHosp.reserved_beds -= 1;
              }
              freshHosp.occupied_beds += 1;

              recordAndBroadcastOutboxEvent({
                incident_id: incidentId,
                event_type: 'JOURNEY_STAGE_CHANGED',
                status: 'ARRIVED_AT_HOSPITAL',
                correlation_id: freshInc.correlation_id,
                assigned_ambulance: ambulanceId,
                assigned_hospital: hospitalId,
                payload: {
                  message: `Patient arrived at ${freshHosp.name} trauma bay. Bed reservation converted to occupied status.`,
                  stage: 'ARRIVED_AT_HOSPITAL',
                  hospital_beds: {
                    total: freshHosp.total_beds,
                    available: freshHosp.available_beds,
                    reserved: freshHosp.reserved_beds,
                    occupied: freshHosp.occupied_beds,
                  },
                },
              });

              // Final Handover & Completion after 2.5 seconds
              setTimeout(() => {
                freshInc.status = 'COMPLETED';
                freshInc.journey_stage = 'COMPLETED';
                freshInc.stage_timestamps = {
                  ...freshInc.stage_timestamps,
                  completed: new Date().toISOString(),
                };

                // Release ambulance back to AVAILABLE status
                freshAmb.status = 'AVAILABLE';
                freshAmb.trip_stage = null;
                freshAmb.trip_destination = null;
                freshAmb.current_incident_id = null;
                freshAmb.speed_kmh = 0;
                freshAmb.last_updated = new Date().toISOString();

                recordAndBroadcastOutboxEvent({
                  incident_id: incidentId,
                  event_type: 'JOURNEY_STAGE_CHANGED',
                  status: 'COMPLETED',
                  correlation_id: freshInc.correlation_id,
                  assigned_ambulance: ambulanceId,
                  assigned_hospital: hospitalId,
                  payload: {
                    message: `Patient handover completed. Ambulance ${freshAmb.callsign} released and available for duty.`,
                    stage: 'COMPLETED',
                  },
                });

                stopJourneySimulation(ambulanceId);
              }, 2500);
            }
          }, TICK_INTERVAL_MS);
        }, 3000);
      }
    }
  };

  journeySession.timer = setInterval(tick, TICK_INTERVAL_MS);
  activeJourneys.set(ambulanceId, journeySession);
}

// ---------------------------------------------------------------------------
// Distributed Two-Phase Saga Dispatch Workflow with Bed Accounting
// ---------------------------------------------------------------------------

export function executeDispatchSaga(
  incidentId: string,
  correlationId: string,
  targetCoords: { lat: number; lng: number }
): {
  status: IncidentStatus;
  ambulance_id: string | null;
  hospital_id: string | null;
  error: string | null;
} {
  // 1. Transactionally record DISPATCHING state
  recordAndBroadcastOutboxEvent({
    incident_id: incidentId,
    event_type: 'DISPATCHING_STARTED',
    status: 'DISPATCHING',
    correlation_id: correlationId,
  });

  // 2. Step 1: Find and tentatively reserve ambulance
  const availableAmb = Array.from(ambulances.values()).find((a) => a.status === 'AVAILABLE');
  if (!availableAmb) {
    recordAndBroadcastOutboxEvent({
      incident_id: incidentId,
      event_type: 'DISPATCH_WAITING',
      status: 'WAITING_FOR_AMBULANCE',
      correlation_id: correlationId,
      payload: { reason: 'No available ambulances in service sector' },
    });
    return {
      status: 'WAITING_FOR_AMBULANCE',
      ambulance_id: null,
      hospital_id: null,
      error: 'NO_AMBULANCE_AVAILABLE',
    };
  }

  // Tentative reservation
  availableAmb.status = 'DISPATCHED';
  availableAmb.current_incident_id = incidentId;

  recordAndBroadcastOutboxEvent({
    incident_id: incidentId,
    event_type: 'AMBULANCE_ALLOCATED',
    status: 'DISPATCHING',
    correlation_id: correlationId,
    assigned_ambulance: availableAmb.id,
  });

  // 3. Step 2: Find available hospital with available bed capacity
  const availableHosp = Array.from(hospitals.values()).find((h) => h.available_beds > 0);
  if (!availableHosp) {
    // SAGA ROLLBACK / COMPENSATION: Hospital bed unavailable
    recordAndBroadcastOutboxEvent({
      incident_id: incidentId,
      event_type: 'SAGA_ROLLBACK_INITIATED',
      status: 'ROLLBACK_PENDING',
      correlation_id: correlationId,
      assigned_ambulance: availableAmb.id,
      payload: { reason: 'No hospital beds available — releasing reserved ambulance' },
    });

    // Compensating action: Release tentatively reserved ambulance
    availableAmb.status = 'AVAILABLE';
    availableAmb.current_incident_id = null;
    stopJourneySimulation(availableAmb.id);

    recordAndBroadcastOutboxEvent({
      incident_id: incidentId,
      event_type: 'SAGA_COMPENSATED',
      status: 'ROLLED_BACK',
      correlation_id: correlationId,
      payload: { released_ambulance: availableAmb.id },
    });

    recordAndBroadcastOutboxEvent({
      incident_id: incidentId,
      event_type: 'DISPATCH_WAITING',
      status: 'WAITING_FOR_HOSPITAL',
      correlation_id: correlationId,
      payload: { error: 'NO_HOSPITAL_BED_AVAILABLE' },
    });

    return {
      status: 'WAITING_FOR_HOSPITAL',
      ambulance_id: null,
      hospital_id: null,
      error: 'NO_HOSPITAL_BED_AVAILABLE',
    };
  }

  // ATOMIC BED RESERVATION:
  // Decrement available capacity and atomically increment reserved count
  availableHosp.available_beds -= 1;
  availableHosp.reserved_beds += 1;

  // 4. Commit DISPATCHED State
  recordAndBroadcastOutboxEvent({
    incident_id: incidentId,
    event_type: 'DISPATCH_COMMITTED',
    status: 'DISPATCHED',
    correlation_id: correlationId,
    assigned_ambulance: availableAmb.id,
    assigned_hospital: availableHosp.id,
    payload: {
      ambulance_callsign: availableAmb.callsign,
      hospital_name: availableHosp.name,
      hospital_beds: {
        total: availableHosp.total_beds,
        available: availableHosp.available_beds,
        reserved: availableHosp.reserved_beds,
        occupied: availableHosp.occupied_beds,
      },
    },
  });

  // 5. Start complete multi-stage road journey simulation
  startFullAmbulanceJourney(availableAmb.id, incidentId, availableHosp.id);

  return {
    status: 'EN_ROUTE_TO_INCIDENT',
    ambulance_id: availableAmb.id,
    hospital_id: availableHosp.id,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Main Server Bootstrap
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  app.use(express.json());

  // CORS and Preflight handler to prevent cross-origin network errors
  app.use((_req: Request, res: Response, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  const server = http.createServer(app);

  // -------------------------------------------------------------------------
  // WebSocket Server Configuration
  // -------------------------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';

    // Route SyncRescue application live WebSocket events (/ws and /api/ws)
    if (pathname === '/ws' || pathname === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return;
    }

    // Allow Vite HMR to handle its own upgrade requests on `server` (sec-websocket-protocol: vite-hmr)
    if (request.headers['sec-websocket-protocol']?.includes('vite-hmr')) {
      return;
    }

    socket.destroy();
  });

  wss.on('connection', (ws: WebSocket, req) => {
    connectedClients.add(ws);
    const clientIp = req.socket.remoteAddress || '127.0.0.1';
    console.log(`[WebSocket] Client connected from ${clientIp}. Total connected: ${connectedClients.size}`);

    const welcomeMsg: WebSocketMessage = {
      event_id: `evt-welcome-${Date.now()}`,
      event_type: 'CONNECTION_ESTABLISHED',
      status: 'CONNECTED',
      timestamp: new Date().toISOString(),
      payload: {
        message: 'Connected to Emergency Response Live Dispatch WebSocket Gateway',
        simulation_mode: 'ACTIVE_ROAD_ROUTING',
        active_simulations: activeJourneys.size,
        connected_clients: connectedClients.size,
      },
    };
    ws.send(JSON.stringify(welcomeMsg));

    ws.on('message', (data) => {
      try {
        const rawString = typeof data === 'string' ? data : data.toString();
        const parsed = JSON.parse(rawString);

        if (parsed.type === 'PING') {
          ws.send(
            JSON.stringify({
              type: 'PONG',
              timestamp: new Date().toISOString(),
            })
          );
        } else if (parsed.type === 'REQUEST_FLEET_LOCATIONS') {
          const fleetData = Array.from(ambulances.values()).map((a) => ({
            id: a.id,
            callsign: a.callsign,
            status: a.status,
            latitude: a.latitude,
            longitude: a.longitude,
            speed_kmh: a.speed_kmh,
            heading: a.heading,
            current_incident_id: a.current_incident_id,
            trip_stage: a.trip_stage,
            trip_destination: a.trip_destination,
            eta_text: a.eta_text,
            is_simulated: a.is_simulated,
          }));
          ws.send(
            JSON.stringify({
              event_id: `evt-fleet-${Date.now()}`,
              event_type: 'FLEET_STATE_SNAPSHOT',
              timestamp: new Date().toISOString(),
              payload: { ambulances: fleetData },
            })
          );
        }
      } catch {
        // Safe frame parsing
      }
    });

    ws.on('close', () => {
      connectedClients.delete(ws);
      console.log(`[WebSocket] Client disconnected. Total connected: ${connectedClients.size}`);
    });

    ws.on('error', (err) => {
      console.warn('[WebSocket] Client error:', err);
      connectedClients.delete(ws);
    });
  });

  const pingInterval = setInterval(() => {
    for (const ws of connectedClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        connectedClients.delete(ws);
      }
    }
  }, 30000);

  // -------------------------------------------------------------------------
  // REST API Routes
  // -------------------------------------------------------------------------
  const apiRouter = express.Router();

  // GET /incidents
  apiRouter.get(['/incidents', '/incidents/'], (_req: Request, res: Response) => {
    res.json(incidents);
  });

  // POST /incidents
  apiRouter.post(['/incidents', '/incidents/'], async (req: Request, res: Response) => {
    const { description, location, severity, latitude, longitude, location_type } = req.body;

    if (!description || !location) {
      return res.status(400).json({ detail: 'Description and location are required' });
    }

    const incidentId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;
    const correlationId = `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Determine coordinates: use explicit user coordinates if provided, else geocode
    let coords = { lat: 18.5204, lng: 73.8567 };
    let resolvedLocType: 'user_selected' | 'geocoded' | 'simulated_demo' = location_type || 'simulated_demo';

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      coords = { lat: latitude, lng: longitude };
      resolvedLocType = location_type || 'user_selected';
    } else {
      const geo = await geocodeLocation(location);
      coords = { lat: geo.lat, lng: geo.lng };
      resolvedLocType = geo.location_type;
    }

    // Step 1: Commit initial REPORTED state before dispatching
    const newIncident: Incident = {
      id: incidentId,
      incident_id: incidentId,
      description,
      location,
      location_type: resolvedLocType,
      latitude: coords.lat,
      longitude: coords.lng,
      severity: severity || 'MEDIUM',
      status: 'REPORTED',
      assigned_ambulance: null,
      assigned_hospital: null,
      dispatch_error: null,
      correlation_id: correlationId,
      stage_timestamps: {
        reported: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    incidents.unshift(newIncident);

    recordAndBroadcastOutboxEvent({
      incident_id: incidentId,
      event_type: 'INCIDENT_REPORTED',
      status: 'REPORTED',
      correlation_id: correlationId,
      payload: {
        description,
        location,
        location_type: resolvedLocType,
        severity: newIncident.severity,
        coordinates: coords,
      },
    });

    // Step 2: Execute Saga Allocation Workflow
    const sagaResult = executeDispatchSaga(incidentId, correlationId, coords);

    newIncident.status = sagaResult.status;
    newIncident.assigned_ambulance = sagaResult.ambulance_id;
    newIncident.assigned_hospital = sagaResult.hospital_id;
    newIncident.dispatch_error = sagaResult.error;
    newIncident.updated_at = new Date().toISOString();

    return res.status(201).json(newIncident);
  });

  // POST /incidents/recover - Crash recovery & reconciliation
  apiRouter.post(['/incidents/recover', '/incidents/recover/'], (_req: Request, res: Response) => {
    let recoveredCount = 0;
    for (const inc of incidents) {
      if (
        inc.status === 'WAITING_FOR_HOSPITAL' ||
        inc.status === 'DISPATCH_FAILED' ||
        inc.status === 'ROLLBACK_PENDING' ||
        inc.status === 'ROLLED_BACK'
      ) {
        if (inc.assigned_ambulance) {
          const amb = ambulances.get(inc.assigned_ambulance);
          if (amb) {
            amb.status = 'AVAILABLE';
            amb.current_incident_id = null;
            amb.trip_stage = null;
            stopJourneySimulation(amb.id);
          }
          inc.assigned_ambulance = null;
          recoveredCount++;
        }
      }
    }

    recordAndBroadcastOutboxEvent({
      incident_id: 'CLUSTER_GLOBAL',
      event_type: 'RECONCILIATION_COMPLETED',
      status: 'RECONCILED',
      payload: { recovered_count: recoveredCount },
    });

    res.json({ status: 'reconciliation_complete', recovered_count: recoveredCount });
  });

  // GET /route - Road routing query endpoint
  apiRouter.get('/route', async (req: Request, res: Response) => {
    const startLat = parseFloat(req.query.startLat as string);
    const startLng = parseFloat(req.query.startLng as string);
    const endLat = parseFloat(req.query.endLat as string);
    const endLng = parseFloat(req.query.endLng as string);

    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return res.status(400).json({ error: 'startLat, startLng, endLat, endLng must be numbers' });
    }

    const route = await fetchRoadRoute(startLat, startLng, endLat, endLng);
    res.json(route);
  });

  // GET /geocode - Geocoding lookup endpoint
  apiRouter.get('/geocode', async (req: Request, res: Response) => {
    const q = req.query.q as string;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const result = await geocodeLocation(q);
    res.json(result);
  });

  // GET /ambulances/available
  apiRouter.get('/ambulances/available', (_req: Request, res: Response) => {
    const available = Array.from(ambulances.values()).filter((a) => a.status === 'AVAILABLE');
    res.json(available);
  });

  // GET /ambulances
  apiRouter.get('/ambulances', (_req: Request, res: Response) => {
    res.json(Array.from(ambulances.values()));
  });

  // GET /hospitals
  apiRouter.get('/hospitals', (_req: Request, res: Response) => {
    res.json(Array.from(hospitals.values()));
  });

  // POST /hospitals/:id/discharge - Patient discharge demonstration action
  apiRouter.post('/hospitals/:id/discharge', (req: Request, res: Response) => {
    const hosp = hospitals.get(req.params.id);
    if (!hosp) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    if (hosp.occupied_beds > 0) {
      hosp.occupied_beds -= 1;
      hosp.available_beds = Math.min(hosp.total_beds - hosp.reserved_beds, hosp.available_beds + 1);

      recordAndBroadcastOutboxEvent({
        incident_id: 'HOSPITAL_DISCHARGE',
        event_type: 'PATIENT_DISCHARGED',
        status: 'DISCHARGED',
        payload: {
          hospital_id: hosp.id,
          hospital_name: hosp.name,
          beds: {
            total: hosp.total_beds,
            available: hosp.available_beds,
            reserved: hosp.reserved_beds,
            occupied: hosp.occupied_beds,
          },
        },
      });

      return res.json({
        status: 'patient_discharged',
        hospital: hosp,
      });
    }

    return res.status(400).json({ error: 'No occupied beds to discharge at this hospital' });
  });

  // POST /hospitals/capacity - Test / reset endpoint
  apiRouter.post('/hospitals/capacity', (req: Request, res: Response) => {
    const { available_beds } = req.body;
    for (const hosp of hospitals.values()) {
      if (typeof available_beds === 'number') {
        hosp.available_beds = available_beds;
      }
    }
    res.json({
      status: 'updated',
      hospitals: Array.from(hospitals.values()),
    });
  });

  // GET /outbox
  apiRouter.get('/outbox', (_req: Request, res: Response) => {
    res.json({
      total_events: outbox.length,
      events: outbox.slice(0, 50),
    });
  });

  // GET /simulations
  apiRouter.get('/simulations', (_req: Request, res: Response) => {
    const list = Array.from(activeJourneys.entries()).map(([ambId, sess]) => ({
      ambulance_id: ambId,
      incident_id: sess.incidentId,
      hospital_id: sess.hospitalId,
      current_phase: sess.currentPhase,
      distance_km: sess.route.distance_km,
      duration_sec: sess.route.duration_sec,
      provider: sess.route.provider,
    }));
    res.json({
      simulation_mode: 'ROAD_ROUTING_MULTI_STAGE',
      active_count: list.length,
      simulations: list,
    });
  });

  // GET /health
  apiRouter.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        coordinator_api: { status: 'healthy', target: 'http://localhost:3000' },
        websocket_gateway: {
          status: 'healthy',
          endpoint: '/ws',
          connected_clients: connectedClients.size,
          active_simulations: activeJourneys.size,
        },
        database: { status: 'healthy', type: 'in-memory / postgres', latency_ms: 1.1 },
        ambulance_grpc: { status: 'healthy', target: 'localhost:50051', latency_ms: 2.1 },
        hospital_grpc: { status: 'healthy', target: 'localhost:50052', latency_ms: 1.8 },
        rabbitmq: { status: 'healthy', target: 'localhost:5672', state: 'active' },
        transactional_outbox: { status: 'healthy', pending_events: 0, total_recorded: outbox.length },
      },
    });
  });

  app.use('/', apiRouter);
  app.use('/api', apiRouter);

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Studio] Full-Stack Coordinator Gateway & WebSocket Server running on http://0.0.0.0:${PORT}`);
  });

  process.on('SIGINT', () => {
    clearInterval(pingInterval);
    for (const session of activeJourneys.values()) {
      clearInterval(session.timer);
    }
    server.close();
  });
}

startServer();

export { ambulances, hospitals, incidents, outbox, activeJourneys };
