import React from 'react';
import { ChevronRight, Truck, Building2, MapPin, AlertCircle, ArrowUpDown } from 'lucide-react';
import { StatusBadge, SeverityBadge } from './StatusBadge';
import { formatIncidentTime, getSeverityDetails } from '../utils/formatters';

export function IncidentTable({
  incidents = [],
  onSelectIncident,
  isLoading = false,
  emptyMessage = 'No incidents matching criteria.',
}) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-8 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">
            Syncing coordinator incidents...
          </p>
        </div>
      </div>
    );
  }

  if (!incidents || incidents.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 text-center space-y-2 shadow-2xs">
        <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
        <p className="text-sm font-semibold text-slate-700">{emptyMessage}</p>
        <p className="text-xs text-slate-400">
          New dispatch requests logged into the system will populate here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Incident ID</th>
              <th className="py-3 px-3">Severity</th>
              <th className="py-3 px-4">Description & Location</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Ambulance</th>
              <th className="py-3 px-3">Hospital</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {incidents.map((incident) => {
              const isUrgent = incident.severity === 'CRITICAL' || incident.severity === 'HIGH';
              const sev = getSeverityDetails(incident.severity);

              return (
                <tr
                  key={incident.incident_id}
                  id={`incident-row-${incident.incident_id}`}
                  onClick={() => onSelectIncident(incident)}
                  className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                    incident.severity === 'CRITICAL' ? 'bg-red-50/20' : ''
                  }`}
                >
                  {/* Incident ID */}
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${sev.dotClass}`} />
                      <span>{incident.incident_id}</span>
                    </div>
                  </td>

                  {/* Severity */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <SeverityBadge severity={incident.severity} />
                  </td>

                  {/* Description & Location */}
                  <td className="py-3.5 px-4 max-w-xs sm:max-w-sm">
                    <p className="font-semibold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
                      {incident.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 truncate">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{incident.location}</span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <StatusBadge status={incident.status} />
                  </td>

                  {/* Assigned Ambulance */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    {incident.assigned_ambulance && incident.assigned_ambulance !== 'Released' ? (
                      <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Truck className="w-3 h-3 text-blue-600" />
                        {incident.assigned_ambulance}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">None</span>
                    )}
                  </td>

                  {/* Assigned Hospital */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    {incident.assigned_hospital ? (
                      <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Building2 className="w-3 h-3 text-emerald-600" />
                        {incident.assigned_hospital}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">None</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="text-slate-400 group-hover:text-blue-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                      aria-label="View incident details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
