import React from 'react';
import { Truck, Building2, AlertTriangle, ArrowRight, CheckCircle2, RotateCcw, Clock } from 'lucide-react';
import { formatIncidentTime } from '../utils/formatters';

export function RecentActivity({
  activities = [],
  onSelectIncidentId,
}) {
  const getEventIcon = (type) => {
    switch (type) {
      case 'dispatched':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      case 'rollback':
        return <RotateCcw className="w-3.5 h-3.5 text-orange-600" />;
      case 'error':
        return <AlertTriangle className="w-3.5 h-3.5 text-red-600" />;
      case 'ambulance':
        return <Truck className="w-3.5 h-3.5 text-blue-600" />;
      case 'hospital':
        return <Building2 className="w-3.5 h-3.5 text-indigo-600" />;
      case 'creation':
      default:
        return <Clock className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const getEventBg = (type) => {
    switch (type) {
      case 'dispatched':
        return 'bg-emerald-50 border-emerald-100';
      case 'rollback':
        return 'bg-orange-50 border-orange-100';
      case 'error':
        return 'bg-red-50 border-red-100';
      case 'ambulance':
        return 'bg-blue-50 border-blue-100';
      case 'hospital':
        return 'bg-indigo-50 border-indigo-100';
      case 'creation':
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Coordinator Event Log
        </h3>
        <span className="text-[11px] font-semibold text-slate-400">
          Live Audit Stream
        </span>
      </div>

      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
        {activities.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            No recent dispatch events recorded.
          </p>
        ) : (
          activities.map((act) => (
            <div
              key={act.id}
              className={`p-3 rounded-lg border text-xs transition-colors ${getEventBg(act.type)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-white shadow-2xs">
                    {getEventIcon(act.type)}
                  </div>
                  {onSelectIncidentId ? (
                    <button
                      type="button"
                      onClick={() => onSelectIncidentId(act.incident_id)}
                      className="font-mono font-bold text-slate-900 hover:text-blue-600 cursor-pointer underline decoration-dotted"
                    >
                      {act.incident_id}
                    </button>
                  ) : (
                    <span className="font-mono font-bold text-slate-900">
                      {act.incident_id}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  {formatIncidentTime(act.timestamp)}
                </span>
              </div>
              <p className="text-slate-700 mt-1.5 leading-relaxed text-[11px]">
                {act.description}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
