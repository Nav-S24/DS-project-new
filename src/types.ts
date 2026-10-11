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

export interface Incident {
  id?: string;
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
  created_at?: string;
  updated_at?: string;
}

export interface Ambulance {
  id: string;
  callsign: string;
  status: 'AVAILABLE' | 'DISPATCHED' | 'BUSY';
  latitude: number;
  longitude: number;
  base_latitude?: number;
  base_longitude?: number;
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

export interface CreateIncidentPayload {
  description: string;
  location: string;
  severity: Severity;
  latitude?: number;
  longitude?: number;
  location_type?: 'user_selected' | 'geocoded' | 'simulated_demo';
}

export interface ActivityEvent {
  id: string;
  incident_id: string;
  description: string;
  timestamp: string;
  type: 'creation' | 'ambulance' | 'hospital' | 'dispatched' | 'error' | 'rollback' | 'location' | 'pickup' | 'arrival' | 'completed';
  correlation_id?: string;
  metadata?: Record<string, unknown>;
}

export interface WebSocketEventMessage {
  event_id: string;
  event_type: string;
  incident_id?: string;
  status?: IncidentStatus | string;
  correlation_id?: string;
  ambulance_id?: string;
  hospital_id?: string;
  latitude?: number;
  longitude?: number;
  speed_kmh?: number;
  heading?: number;
  trip_stage?: string;
  trip_destination?: string;
  eta_incident?: string | null;
  eta_hospital?: string | null;
  remaining_distance_km?: number | null;
  remaining_duration_sec?: number | null;
  is_simulated?: boolean;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface OutboxEvent {
  event_id: string;
  incident_id: string;
  event_type: string;
  status: string;
  correlation_id?: string;
  assigned_ambulance?: string | null;
  assigned_hospital?: string | null;
  timestamp: string;
  dispatched_to_rabbitmq: boolean;
  dispatched_to_ws: boolean;
  payload?: Record<string, unknown>;
}

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng] array
  distance_km: number;
  duration_sec: number;
  is_road_route: boolean;
  provider: string;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

// Runtime object exports so that JavaScript (.jsx) value imports never fail
export const Incident = {
  create: (data: Partial<Incident>): Incident => ({
    id: data.id || data.incident_id || '',
    incident_id: data.incident_id || data.id || '',
    description: data.description || '',
    location: data.location || '',
    location_type: data.location_type || 'simulated_demo',
    latitude: data.latitude,
    longitude: data.longitude,
    severity: data.severity || 'MEDIUM',
    status: data.status || 'REPORTED',
    assigned_ambulance: data.assigned_ambulance || null,
    assigned_hospital: data.assigned_hospital || null,
    dispatch_error: data.dispatch_error || null,
    correlation_id: data.correlation_id,
    journey_stage: data.journey_stage || null,
    eta_incident: data.eta_incident || null,
    eta_hospital: data.eta_hospital || null,
    stage_timestamps: data.stage_timestamps || {},
    created_at: data.created_at || new Date().toISOString(),
    updated_at: data.updated_at || new Date().toISOString(),
  })
};

export const ActivityEvent = {
  create: (data: Partial<ActivityEvent>): ActivityEvent => ({
    id: data.id || '',
    incident_id: data.incident_id || '',
    description: data.description || '',
    timestamp: data.timestamp || new Date().toISOString(),
    type: data.type || 'creation',
  })
};
