import React from 'react';
import { X, MapPin, Truck, Building2, AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { StatusBadge, SeverityBadge } from './StatusBadge';
import { DispatchTimeline } from './DispatchTimeline';
import { formatIncidentTime, getErrorMessage } from '../utils/formatters';

export function IncidentDetails({
  incident,
  isOpen,
  onClose,
}) {
  if (!isOpen || !incident) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/75">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-sm text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
              {incident.incident_id}
            </span>
            <StatusBadge status={incident.status} />
            <SeverityBadge severity={incident.severity} />
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Description & Location */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Incident Description</h3>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {incident.description}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-2">
              <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="font-medium">{incident.location}</span>
              <span className="text-slate-300 mx-1">&bull;</span>
              <span className="text-slate-400">{formatIncidentTime(incident.created_at)}</span>
            </div>
          </div>

          {/* Allocation Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 mb-1">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>Assigned Ambulance</span>
              </div>
              <p className="font-mono font-bold text-sm text-blue-950">
                {incident.assigned_ambulance || 'None allocated'}
              </p>
              <p className="text-[11px] text-blue-600/80 mt-0.5">
                {incident.assigned_ambulance ? 'Unit dispatched to scene' : 'Waiting or rolled back'}
              </p>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 mb-1">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>Assigned Hospital</span>
              </div>
              <p className="font-mono font-bold text-sm text-emerald-950">
                {incident.assigned_hospital || 'None allocated'}
              </p>
              <p className="text-[11px] text-emerald-600/80 mt-0.5">
                {incident.assigned_hospital ? 'Trauma / ER bed confirmed' : 'Awaiting available bed'}
              </p>
            </div>
          </div>

          {/* Error Banner if any */}
          {incident.dispatch_error && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900">Coordinator Notice</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  {getErrorMessage(incident.dispatch_error)}
                </p>
              </div>
            </div>
          )}

          {/* Dispatch Saga Timeline */}
          <div className="border-t border-slate-100 pt-4">
            <DispatchTimeline incident={incident} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
