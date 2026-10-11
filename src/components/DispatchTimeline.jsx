import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight, ShieldCheck, RefreshCw, Clock, Navigation, Truck, Building2 } from 'lucide-react';
import { formatClockTime } from '../utils/formatters';

export function DispatchTimeline({ incident }) {
  if (!incident) return null;

  const status = incident.status;
  const timestamps = incident.stage_timestamps || {};

  const isDispatched =
    status === 'DISPATCHED' ||
    status === 'EN_ROUTE_TO_INCIDENT' ||
    status === 'ARRIVED_AT_INCIDENT' ||
    status === 'PATIENT_PICKED_UP' ||
    status === 'EN_ROUTE_TO_HOSPITAL' ||
    status === 'ARRIVED_AT_HOSPITAL' ||
    status === 'COMPLETED';

  const isArrivedIncident =
    status === 'ARRIVED_AT_INCIDENT' ||
    status === 'PATIENT_PICKED_UP' ||
    status === 'EN_ROUTE_TO_HOSPITAL' ||
    status === 'ARRIVED_AT_HOSPITAL' ||
    status === 'COMPLETED';

  const isPickedUp =
    status === 'PATIENT_PICKED_UP' ||
    status === 'EN_ROUTE_TO_HOSPITAL' ||
    status === 'ARRIVED_AT_HOSPITAL' ||
    status === 'COMPLETED';

  const isArrivedHospital =
    status === 'ARRIVED_AT_HOSPITAL' ||
    status === 'COMPLETED';

  const isCompleted = status === 'COMPLETED';

  const isAmbWait = status === 'WAITING_FOR_AMBULANCE';
  const isHospWait = status === 'WAITING_FOR_HOSPITAL';
  const isFailed = status === 'DISPATCH_FAILED';

  const steps = [
    {
      title: 'Incident Logged & Triage',
      desc: `${incident.severity} priority recorded at coordinator`,
      time: timestamps.reported || incident.created_at,
      status: 'complete',
    },
    {
      title: 'Two-Phase Dispatch & Bed Reservation',
      desc: incident.assigned_ambulance && incident.assigned_hospital
        ? `Assigned ${incident.assigned_ambulance} & reserved bed at ${incident.assigned_hospital}`
        : isAmbWait
        ? 'No units available in sector - Queued'
        : isHospWait
        ? 'Tentatively reserved, then rolled back due to hospital capacity'
        : 'Allocation pending',
      time: timestamps.dispatched,
      status: isDispatched
        ? 'complete'
        : isAmbWait
        ? 'error'
        : isHospWait
        ? 'rollback'
        : 'pending',
    },
    {
      title: 'Ambulance En Route to Scene',
      desc: isArrivedIncident
        ? `Arrived at incident scene`
        : isDispatched
        ? `En route along road network (${incident.eta_incident ? `ETA: ${incident.eta_incident}` : 'Calculating'})`
        : 'Awaiting dispatch',
      time: timestamps.arrived_at_incident,
      status: isArrivedIncident
        ? 'complete'
        : isDispatched
        ? 'active'
        : 'pending',
    },
    {
      title: 'Emergency Scene Care & Patient Pickup',
      desc: isPickedUp
        ? 'Patient secured on board ambulance'
        : status === 'ARRIVED_AT_INCIDENT'
        ? 'Emergency paramedics administering on-scene care'
        : 'Pending arrival',
      time: timestamps.patient_picked_up,
      status: isPickedUp
        ? 'complete'
        : status === 'ARRIVED_AT_INCIDENT'
        ? 'active'
        : 'pending',
    },
    {
      title: 'Transport to Hospital Trauma Bay',
      desc: isArrivedHospital
        ? `Delivered to ${incident.assigned_hospital || 'hospital'}`
        : isPickedUp
        ? `Transporting patient (${incident.eta_hospital ? `ETA: ${incident.eta_hospital}` : 'Calculating'})`
        : 'Pending patient pickup',
      time: timestamps.arrived_at_hospital,
      status: isArrivedHospital
        ? 'complete'
        : isPickedUp
        ? 'active'
        : 'pending',
    },
    {
      title: 'Patient Delivered & Ambulance Released',
      desc: isCompleted
        ? 'Trauma bed occupied. Unit returned to AVAILABLE status.'
        : isArrivedHospital
        ? 'Handover in progress at hospital trauma bay'
        : 'Journey in progress',
      time: timestamps.completed,
      status: isCompleted
        ? 'complete'
        : isArrivedHospital
        ? 'active'
        : 'pending',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Patient Journey & Coordination Lifecycle
        </h4>
        <span className="text-[11px] font-mono text-slate-500">
          ID: {incident.incident_id}
        </span>
      </div>

      <div className="relative pl-6 border-l-2 border-slate-200 space-y-5 my-2">
        {steps.map((step, idx) => {
          let dot = <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />;
          let lineBg = 'text-slate-500';

          if (step.status === 'complete') {
            dot = <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />;
            lineBg = 'text-slate-800 font-semibold';
          } else if (step.status === 'active') {
            dot = <div className="w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-100 animate-pulse" />;
            lineBg = 'text-blue-900 font-bold';
          } else if (step.status === 'rollback') {
            dot = <div className="w-3 h-3 rounded-full bg-orange-500 ring-4 ring-orange-50" />;
            lineBg = 'text-orange-900 font-semibold';
          } else if (step.status === 'error') {
            dot = <div className="w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-50" />;
            lineBg = 'text-red-900 font-semibold';
          }

          return (
            <div key={idx} className="relative">
              <div className="absolute -left-[31px] top-1 flex items-center justify-center">
                {dot}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                <div>
                  <p className={`text-xs ${lineBg}`}>{step.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{step.desc}</p>
                </div>
                {step.time && (
                  <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                    {formatClockTime(step.time)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
