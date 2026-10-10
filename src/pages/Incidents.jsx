import React, { useState, useMemo } from 'react';
import { Plus, Search, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import { IncidentTable } from '../components/IncidentTable';

export function Incidents({
  incidents = [],
  isLoading = false,
  onRefresh,
  onOpenNewIncident,
  onSelectIncident,
}) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      // Search text match
      const query = search.toLowerCase();
      const matchSearch =
        !query ||
        inc.incident_id.toLowerCase().includes(query) ||
        inc.description.toLowerCase().includes(query) ||
        inc.location.toLowerCase().includes(query) ||
        (inc.assigned_ambulance && inc.assigned_ambulance.toLowerCase().includes(query)) ||
        (inc.assigned_hospital && inc.assigned_hospital.toLowerCase().includes(query));

      // Severity match
      const matchSeverity = severityFilter === 'ALL' || inc.severity === severityFilter;

      // Status match
      const matchStatus = statusFilter === 'ALL' || inc.status === statusFilter;

      return matchSearch && matchSeverity && matchStatus;
    });
  }, [incidents, search, severityFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            All Emergency Incidents
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full record of all dispatched, queued, and rolled back emergency calls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          )}

          <button
            id="all-incidents-new-btn"
            type="button"
            onClick={onOpenNewIncident}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Emergency</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by incident ID, description, location, ambulance, hospital..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Severity Dropdown */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs py-2 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 outline-none cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-2 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="WAITING_FOR_AMBULANCE">Waiting for Ambulance</option>
            <option value="WAITING_FOR_HOSPITAL">Waiting for Hospital</option>
            <option value="DISPATCH_FAILED">Dispatch Failed</option>
          </select>

          {(search || severityFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setSeverityFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <IncidentTable
        incidents={filteredIncidents}
        isLoading={isLoading}
        onSelectIncident={onSelectIncident}
        emptyMessage={
          search || severityFilter !== 'ALL' || statusFilter !== 'ALL'
            ? 'No incidents matching the active filter criteria.'
            : 'No emergency incidents registered in system.'
        }
      />
    </div>
  );
}
