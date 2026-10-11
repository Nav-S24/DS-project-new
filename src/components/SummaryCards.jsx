import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Truck, ShieldAlert, Building2, UserCheck } from 'lucide-react';

export function SummaryCards({ incidents = [], hospitals = [] }) {
  const total = incidents.length;
  const criticalCount = incidents.filter((i) => i.severity === 'CRITICAL').length;
  
  const enRouteOrActive = incidents.filter(
    (i) =>
      i.status === 'DISPATCHED' ||
      i.status === 'EN_ROUTE_TO_INCIDENT' ||
      i.status === 'ARRIVED_AT_INCIDENT' ||
      i.status === 'PATIENT_PICKED_UP' ||
      i.status === 'EN_ROUTE_TO_HOSPITAL' ||
      i.status === 'ARRIVED_AT_HOSPITAL'
  ).length;

  const completedCount = incidents.filter((i) => i.status === 'COMPLETED').length;

  const totalBeds = hospitals.reduce((acc, h) => acc + (h.total_beds || 0), 0);
  const availableBeds = hospitals.reduce((acc, h) => acc + (h.available_beds || 0), 0);
  const reservedBeds = hospitals.reduce((acc, h) => acc + (h.reserved_beds || 0), 0);
  const occupiedBeds = hospitals.reduce((acc, h) => acc + (h.occupied_beds || 0), 0);

  const waitingCount = incidents.filter(
    (i) => i.status === 'WAITING_FOR_AMBULANCE' || i.status === 'WAITING_FOR_HOSPITAL'
  ).length;

  const cards = [
    {
      title: 'Active Incidents',
      value: total,
      sub: `${criticalCount} critical priorities`,
      icon: ShieldAlert,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50/60',
      borderColor: 'border-blue-100',
    },
    {
      title: 'Active Patient Journeys',
      value: enRouteOrActive,
      sub: `${completedCount} completed deliveries`,
      icon: Truck,
      iconColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50/60',
      borderColor: 'border-indigo-100',
    },
    {
      title: 'Hospital Available Beds',
      value: availableBeds,
      sub: `${reservedBeds} reserved &bull; ${occupiedBeds} occupied`,
      icon: Building2,
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50/60',
      borderColor: 'border-emerald-100',
    },
    {
      title: 'Sector Queue / Waiting',
      value: waitingCount,
      sub: 'Awaiting units or bed slot',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
      bgColor: 'bg-amber-50/60',
      borderColor: 'border-amber-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`bg-white rounded-xl border ${card.borderColor} p-4 shadow-2xs flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-150`}
          >
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.title}</p>
              <h3 className="text-2xl font-bold font-mono text-slate-900 mt-1">{card.value}</h3>
              <p
                className="text-[11px] text-slate-500 mt-0.5"
                dangerouslySetInnerHTML={{ __html: card.sub }}
              />
            </div>
            <div className={`w-11 h-11 rounded-lg ${card.bgColor} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
