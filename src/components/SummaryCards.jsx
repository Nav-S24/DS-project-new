import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Truck, ShieldAlert, Building2 } from 'lucide-react';

export function SummaryCards({ incidents = [] }) {
  const total = incidents.length;
  const criticalCount = incidents.filter((i) => i.severity === 'CRITICAL').length;
  const dispatchedCount = incidents.filter((i) => i.status === 'DISPATCHED').length;
  const waitingAmbCount = incidents.filter((i) => i.status === 'WAITING_FOR_AMBULANCE').length;
  const waitingHospCount = incidents.filter((i) => i.status === 'WAITING_FOR_HOSPITAL').length;
  const failedCount = incidents.filter((i) => i.status === 'DISPATCH_FAILED').length;
  const pendingOrRolledBack = waitingAmbCount + waitingHospCount + failedCount;

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
      title: 'Dispatched & En Route',
      value: dispatchedCount,
      sub: 'Ambulance & bed confirmed',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50/60',
      borderColor: 'border-emerald-100',
    },
    {
      title: 'Waiting for Units',
      value: waitingAmbCount,
      sub: 'Awaiting available ambulance',
      icon: Truck,
      iconColor: 'text-amber-600',
      bgColor: 'bg-amber-50/60',
      borderColor: 'border-amber-100',
    },
    {
      title: 'Hospital Capacity Rollback',
      value: waitingHospCount,
      sub: 'Unit freed, awaiting bed slot',
      icon: Building2,
      iconColor: 'text-orange-600',
      bgColor: 'bg-orange-50/60',
      borderColor: 'border-orange-100',
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
              <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
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
