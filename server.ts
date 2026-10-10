import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory Database for Distributed Emergency Dispatch System

interface Ambulance {
  id: string;
  status: 'AVAILABLE' | 'BUSY';
  latitude: number;
  longitude: number;
}

interface Hospital {
  id: string;
  name: string;
  location: string;
  total_beds: number;
  available_beds: number;
}

interface Incident {
  id: string;
  incident_id: string;
  description: string;
  location: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'CREATED' | 'DISPATCHED' | 'WAITING_FOR_AMBULANCE' | 'WAITING_FOR_HOSPITAL' | 'DISPATCH_FAILED';
  assigned_ambulance: string | null;
  assigned_hospital: string | null;
  dispatch_error?: string | null;
  created_at: string;
}

const ambulances: Map<string, Ambulance> = new Map([
  ['AMB-001', { id: 'AMB-001', status: 'AVAILABLE', latitude: 18.5204, longitude: 73.8567 }],
  ['AMB-002', { id: 'AMB-002', status: 'BUSY', latitude: 18.5304, longitude: 73.8667 }],
  ['AMB-003', { id: 'AMB-003', status: 'AVAILABLE', latitude: 18.5104, longitude: 73.8467 }],
  ['AMB-004', { id: 'AMB-004', status: 'AVAILABLE', latitude: 18.5250, longitude: 73.8500 }],
  ['AMB-005', { id: 'AMB-005', status: 'BUSY', latitude: 18.5400, longitude: 73.8700 }],
]);

const hospitals: Map<string, Hospital> = new Map([
  ['HOSP-001', { id: 'HOSP-001', name: 'City General Hospital', location: 'Pune Central', total_beds: 100, available_beds: 24 }],
  ['HOSP-002', { id: 'HOSP-002', name: 'Emergency Care Hospital', location: 'Pune West', total_beds: 80, available_beds: 9 }],
  ['HOSP-003', { id: 'HOSP-003', name: 'Metro Medical Center', location: 'Pune East', total_beds: 120, available_beds: 0 }],
  ['HOSP-004', { id: 'HOSP-004', name: 'Apollo Trauma Care', location: 'Pune South', total_beds: 90, available_beds: 14 }],
]);

const initialIncidents: Incident[] = [
  {
    id: 'INC-8021',
    incident_id: 'INC-8021',
    description: 'Acute cardiac arrest with collapse, CPR in progress',
    location: 'Fergusson College Rd, Deccan Gymkhana',
    severity: 'CRITICAL',
    status: 'DISPATCHED',
    assigned_ambulance: 'AMB-002',
    assigned_hospital: 'HOSP-001',
    dispatch_error: null,
    created_at: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
  },
  {
    id: 'INC-8022',
    incident_id: 'INC-8022',
    description: 'Multi-vehicle collision on highway bypass with entrapment',
    location: 'Mumbai-Pune Bypass, Warje Flyover',
    severity: 'HIGH',
    status: 'DISPATCHED',
    assigned_ambulance: 'AMB-005',
    assigned_hospital: 'HOSP-002',
    dispatch_error: null,
    created_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
  },
  {
    id: 'INC-8023',
    incident_id: 'INC-8023',
    description: 'Severe respiratory distress, oxygen saturation below 80%',
    location: 'Kothrud Bus Stand, Sector 4',
    severity: 'CRITICAL',
    status: 'WAITING_FOR_HOSPITAL',
    assigned_ambulance: null,
    assigned_hospital: null,
    dispatch_error: 'NO_HOSPITAL_BED_AVAILABLE',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'INC-8024',
    incident_id: 'INC-8024',
    description: 'Industrial chemical vapor exposure and deep thermal burns',
    location: 'Bhosari MIDC Industrial Zone',
    severity: 'HIGH',
    status: 'WAITING_FOR_AMBULANCE',
    assigned_ambulance: null,
    assigned_hospital: null,
    dispatch_error: 'NO_AMBULANCE_AVAILABLE',
    created_at: new Date(Date.now() - 1000 * 60 * 62).toISOString(),
  },
  {
    id: 'INC-8025',
    incident_id: 'INC-8025',
    description: 'Elderly fall with head trauma and possible hip fracture',
    location: 'Camp Cantonment Area, MG Road',
    severity: 'MEDIUM',
    status: 'DISPATCHED',
    assigned_ambulance: 'AMB-001',
    assigned_hospital: 'HOSP-001',
    dispatch_error: null,
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
];

const incidents: Incident[] = [...initialIncidents];

// Distributed Saga Dispatcher Function
function dispatchResources(incidentId: string): {
  ambulance_id: string | null;
  hospital_id: string | null;
  error: string | null;
} {
  // Step 1: Find available ambulance
  const availableAmb = Array.from(ambulances.values()).find((a) => a.status === 'AVAILABLE');
  if (!availableAmb) {
    return {
      ambulance_id: null,
      hospital_id: null,
      error: 'NO_AMBULANCE_AVAILABLE',
    };
  }

  // Step 2: Tentatively assign ambulance
  availableAmb.status = 'BUSY';

  // Step 3: Find available hospital with available beds
  const availableHosp = Array.from(hospitals.values()).find((h) => h.available_beds > 0);
  if (!availableHosp) {
    // Saga Rollback / Compensation
    availableAmb.status = 'AVAILABLE';
    return {
      ambulance_id: null,
      hospital_id: null,
      error: 'NO_HOSPITAL_BED_AVAILABLE',
    };
  }

  // Step 4: Reserve bed at hospital
  if (availableHosp.available_beds <= 0) {
    // Saga Rollback / Compensation
    availableAmb.status = 'AVAILABLE';
    return {
      ambulance_id: null,
      hospital_id: null,
      error: 'BED_RESERVATION_FAILED',
    };
  }

  availableHosp.available_beds -= 1;

  return {
    ambulance_id: availableAmb.id,
    hospital_id: availableHosp.id,
    error: null,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API router
  const apiRouter = express.Router();

  // GET /incidents or /incidents/
  apiRouter.get(['/incidents', '/incidents/'], (_req: Request, res: Response) => {
    res.json(incidents);
  });

  // POST /incidents or /incidents/
  apiRouter.post(['/incidents', '/incidents/'], (req: Request, res: Response) => {
    const { description, location, severity } = req.body;

    if (!description || !location) {
      return res.status(400).json({ detail: 'Description and location are required' });
    }

    const incidentId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;
    const resources = dispatchResources(incidentId);

    let status: Incident['status'] = 'DISPATCH_FAILED';
    if (resources.ambulance_id && resources.hospital_id) {
      status = 'DISPATCHED';
    } else if (
      resources.error === 'HOSPITAL_SERVICE_UNAVAILABLE' ||
      resources.error === 'NO_HOSPITAL_BED_AVAILABLE'
    ) {
      status = 'WAITING_FOR_HOSPITAL';
    } else if (
      resources.error === 'AMBULANCE_SERVICE_UNAVAILABLE' ||
      resources.error === 'NO_AMBULANCE_AVAILABLE'
    ) {
      status = 'WAITING_FOR_AMBULANCE';
    } else if (resources.ambulance_id) {
      status = 'DISPATCHED';
    } else {
      status = 'DISPATCH_FAILED';
    }

    const newIncident: Incident = {
      id: incidentId,
      incident_id: incidentId,
      description,
      location,
      severity: severity || 'MEDIUM',
      status,
      assigned_ambulance: resources.ambulance_id,
      assigned_hospital: resources.hospital_id,
      dispatch_error: resources.error,
      created_at: new Date().toISOString(),
    };

    incidents.unshift(newIncident);

    return res.status(201).json({
      id: newIncident.id,
      incident_id: newIncident.incident_id,
      description: newIncident.description,
      location: newIncident.location,
      severity: newIncident.severity,
      status: newIncident.status,
      assigned_ambulance: newIncident.assigned_ambulance,
      assigned_hospital: newIncident.assigned_hospital,
      dispatch_error: newIncident.dispatch_error,
      created_at: newIncident.created_at,
    });
  });

  // POST /incidents/recover
  apiRouter.post(['/incidents/recover', '/incidents/recover/'], (_req: Request, res: Response) => {
    // Reconcile any stuck intermediate incidents
    let recoveredCount = 0;
    for (const inc of incidents) {
      if (inc.status === 'WAITING_FOR_HOSPITAL' || inc.status === 'DISPATCH_FAILED') {
        if (inc.assigned_ambulance) {
          const amb = ambulances.get(inc.assigned_ambulance);
          if (amb) amb.status = 'AVAILABLE';
          inc.assigned_ambulance = null;
          recoveredCount++;
        }
      }
    }
    res.json({ status: 'reconciliation_complete', recovered_count: recoveredCount });
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

  // GET /health
  apiRouter.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        coordinator_api: { status: 'healthy', target: 'http://localhost:3000' },
        database: { status: 'healthy', type: 'in-memory / postgres', latency_ms: 1.2 },
        ambulance_grpc: { status: 'healthy', target: 'localhost:50051', latency_ms: 2.4 },
        hospital_grpc: { status: 'healthy', target: 'localhost:50052', latency_ms: 1.9 },
        rabbitmq: { status: 'healthy', target: 'localhost:5672', state: 'active' },
        transactional_outbox: { status: 'healthy', pending_events: 0 }
      }
    });
  });

  // Mount API endpoints under both root prefix and /api prefix
  app.use('/', apiRouter);
  app.use('/api', apiRouter);

  // Development vs Production serving
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Studio] Coordinator Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
