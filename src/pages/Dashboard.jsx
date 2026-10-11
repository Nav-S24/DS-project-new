import React from 'react';
import { Plus, ArrowRight } from 'lucide-react';
import { SummaryCards } from '../components/SummaryCards';
import { IncidentTable } from '../components/IncidentTable';
import { RecentActivity } from '../components/RecentActivity';
import { LiveFleetMap } from '../components/LiveFleetMap';

export function Dashboard({
  incidents = [],
  ambulances = [],
  hospitals = [],
  isLoading = false,
  onOpenNewIncident,
  onSelectIncident,
  onViewAllIncidents,
  activities = [],
  onSelectIncidentId,
  lastEventTime,
  onRequestFleetRefresh,
  onDischargePatient,
}) {
  // Filter active incidents that require attention
  const activeIncidents = incidents.filter(
    (i) =>
      i.status === 'WAITING_FOR_AMBULANCE' ||
      i.status === 'WAITING_FOR_HOSPITAL' ||
      i.status === 'CREATED' ||
      i.status === 'REPORTED' ||
      i.status === 'DISPATCHING' ||
      i.status === 'ROLLBACK_PENDING' ||
      i.status === 'ROLLED_BACK' ||
      i.status === 'DISPATCH_FAILED' ||
      i.severity === 'CRITICAL'
  );

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Emergency Dispatch Center
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time coordinator monitoring for emergency calls, OpenStreetMap live ambulance routing, and hospital bed allocation.
          </p>
        </div>

        <button
          id="new-emergency-btn"
          type="button"
          onClick={onOpenNewIncident}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer shrink-0 active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>New Emergency</span>
        </button>
      </div>

      {/* Top Summary Cards with Real Computed Metrics & Bed Capacity */}
      <SummaryCards incidents={incidents} hospitals={hospitals} />

      {/* Real-World Street Map & Ambulance Routing */}
      <LiveFleetMap
        ambulances={ambulances}
        hospitals={hospitals}
        incidents={incidents}
        lastEventTime={lastEventTime}
        onRequestFleetRefresh={onRequestFleetRefresh}
        onDischargePatient={onDischargePatient}
      />

      {/* Main Grid: Active Incidents Table & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Incidents requiring Attention */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Priority Incidents Requiring Attention
              </h3>
              <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                {activeIncidents.length}
              </span>
            </div>
            {onViewAllIncidents && (
              <button
                type="button"
                onClick={onViewAllIncidents}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
              >
                <span>View all ({incidents.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <IncidentTable
            incidents={activeIncidents}
            isLoading={isLoading}
            onSelectIncident={onSelectIncident}
            emptyMessage="No urgent incidents currently pending or rolled back."
          />
        </div>

        {/* Right 1 Col: Recent Saga / Coordinator Activity */}
        <div className="space-y-3">
          <RecentActivity
            activities={activities}
            onSelectIncidentId={onSelectIncidentId}
          />
        </div>
      </div>
    </div>
  );
}
