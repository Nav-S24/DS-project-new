import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight, ShieldCheck, RefreshCw, Clock } from 'lucide-react';

export function DispatchTimeline({ incident }) {
  if (!incident) return null;

  const isDispatched = incident.status === 'DISPATCHED';
  const isAmbWait = incident.status === 'WAITING_FOR_AMBULANCE';
  const isHospWait = incident.status === 'WAITING_FOR_HOSPITAL';
  const isFailed = incident.status === 'DISPATCH_FAILED';

  const steps = [
    {
      title: 'Incident Logged',
      desc: `${incident.severity} priority recorded at coordinator`,
      status: 'complete',
    },
    {
      title: 'Ambulance Unit Allocation',
      desc: incident.assigned_ambulance
        ? `Unit ${incident.assigned_ambulance} assigned`
        : isAmbWait
        ? 'No units available in sector - Queued'
        : isHospWait
        ? 'Tentatively assigned, then rolled back'
        : 'Unit assignment pending',
      status: incident.assigned_ambulance
        ? 'complete'
        : isAmbWait
        ? 'error'
        : isHospWait
        ? 'rollback'
        : 'pending',
    },
    {
      title: 'Hospital Capacity Check',
      desc: isDispatched
        ? `Hospital found with emergency beds available`
        : isHospWait
        ? 'No emergency beds available in nearest facilities'
        : isAmbWait
        ? 'Awaiting ambulance assignment'
        : 'Pending verification',
      status: isDispatched
        ? 'complete'
        : isHospWait
        ? 'error'
        : 'pending',
    },
    {
      title: 'Two-Phase Bed Reservation',
      desc: incident.assigned_hospital
        ? `Bed reserved at ${incident.assigned_hospital}`
        : isHospWait
        ? 'Reservation aborted — Triggered ambulance rollback'
        : 'Pending reservation',
      status: incident.assigned_hospital
        ? 'complete'
        : isHospWait
        ? 'rollback'
        : 'pending',
    },
    {
      title: 'Final Dispatch State',
      desc: isDispatched
        ? 'Emergency response team dispatched'
        : isHospWait
        ? 'Waiting for hospital bed — Ambulance freed'
        : isAmbWait
        ? 'Waiting for ambulance'
        : 'Dispatch halted',
      status: isDispatched
        ? 'complete'
        : isHospWait || isAmbWait
        ? 'warning'
        : 'error',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Coordination & Saga Lifecycle
        </h4>
        <span className="text-[11px] font-mono text-slate-500">
          ID: {incident.incident_id}
        </span>
      </div>

      <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 my-2">
        {steps.map((step, idx) => {
          let dot = <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />;
          let lineBg = 'text-slate-500';

          if (step.status === 'complete') {
            dot = <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />;
            lineBg = 'text-slate-800 font-semibold';
          } else if (step.status === 'rollback') {
            dot = <div className="w-3 h-3 rounded-full bg-orange-500 ring-4 ring-orange-50" />;
            lineBg = 'text-orange-900 font-semibold';
          } else if (step.status === 'error') {
            dot = <div className="w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-50" />;
            lineBg = 'text-red-900 font-semibold';
          } else if (step.status === 'warning') {
            dot = <div className="w-3 h-3 rounded-full bg-amber-500 ring-4 ring-amber-50" />;
            lineBg = 'text-amber-900 font-semibold';
          }

          return (
            <div key={idx} className="relative">
              <div className="absolute -left-[31px] top-1 flex items-center justify-center">
                {dot}
              </div>
              <div>
                <p className={`text-xs ${lineBg}`}>{step.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
