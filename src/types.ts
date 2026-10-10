export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 
  | 'CREATED'
  | 'REPORTED'
  | 'DISPATCHING'
  | 'DISPATCHED'
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
  severity: Severity;
  status: IncidentStatus;
  assigned_ambulance: string | null;
  assigned_hospital: string | null;
  dispatch_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateIncidentPayload {
  description: string;
  location: string;
  severity: Severity;
}

export interface ActivityEvent {
  id: string;
  incident_id: string;
  description: string;
  timestamp: string;
  type: 'creation' | 'ambulance' | 'hospital' | 'dispatched' | 'error' | 'rollback';
}

// Runtime object exports so that JavaScript (.jsx) value imports never fail
export const Incident = {
  create: (data: Partial<Incident>): Incident => ({
    id: data.id || data.incident_id || '',
    incident_id: data.incident_id || data.id || '',
    description: data.description || '',
    location: data.location || '',
    severity: data.severity || 'MEDIUM',
    status: data.status || 'REPORTED',
    assigned_ambulance: data.assigned_ambulance || null,
    assigned_hospital: data.assigned_hospital || null,
    dispatch_error: data.dispatch_error || null,
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
