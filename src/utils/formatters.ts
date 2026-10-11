import type { Severity, IncidentStatus } from '../types';

export function formatIncidentTime(timestamp?: string): string {
  if (!timestamp) return 'Just now';
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Recently';
    
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Recently';
  }
}

export function formatClockTime(timestamp?: string): string {
  if (!timestamp) return '--:--:--';
  try {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? '--:--:--' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--:--:--';
  }
}

/**
 * Formats a timestamp into consistent HH:MM AM/PM for estimated arrival time.
 */
export function formatETA(timestamp?: string | number | Date | null): string {
  if (!timestamp) return '--:--';
  try {
    const d = typeof timestamp === 'object' ? timestamp : new Date(timestamp);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '--:--';
  }
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || isNaN(seconds) || seconds <= 0) return '0 min';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins} min`;
  return `${mins}m ${secs}s`;
}

export function getSeverityDetails(severity: Severity | string) {
  switch (severity) {
    case 'CRITICAL':
      return {
        label: 'Critical',
        bgClass: 'bg-red-50 text-red-700 border-red-200',
        badgeBg: 'bg-red-600',
        textClass: 'text-red-600',
        dotClass: 'bg-red-500 animate-pulse',
      };
    case 'HIGH':
      return {
        label: 'High',
        bgClass: 'bg-amber-50 text-amber-700 border-amber-200',
        badgeBg: 'bg-amber-500',
        textClass: 'text-amber-600',
        dotClass: 'bg-amber-500',
      };
    case 'MEDIUM':
      return {
        label: 'Medium',
        bgClass: 'bg-blue-50 text-blue-700 border-blue-200',
        badgeBg: 'bg-blue-500',
        textClass: 'text-blue-600',
        dotClass: 'bg-blue-500',
      };
    case 'LOW':
    default:
      return {
        label: 'Low',
        bgClass: 'bg-slate-50 text-slate-700 border-slate-200',
        badgeBg: 'bg-slate-400',
        textClass: 'text-slate-600',
        dotClass: 'bg-slate-400',
      };
  }
}

export function getStatusDetails(status: IncidentStatus | string) {
  switch (status) {
    case 'DISPATCHED':
    case 'EN_ROUTE_TO_INCIDENT':
      return {
        label: 'En Route to Scene',
        bgClass: 'bg-blue-50 text-blue-700 border-blue-200',
        dotClass: 'bg-blue-500 animate-pulse',
      };
    case 'ARRIVED_AT_INCIDENT':
      return {
        label: 'At Incident Scene',
        bgClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        dotClass: 'bg-indigo-500 animate-pulse',
      };
    case 'PATIENT_PICKED_UP':
    case 'EN_ROUTE_TO_HOSPITAL':
      return {
        label: 'En Route to Hospital',
        bgClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
        dotClass: 'bg-cyan-600 animate-pulse',
      };
    case 'ARRIVED_AT_HOSPITAL':
      return {
        label: 'At Hospital Trauma Bay',
        bgClass: 'bg-teal-50 text-teal-700 border-teal-200',
        dotClass: 'bg-teal-500',
      };
    case 'COMPLETED':
      return {
        label: 'Patient Delivered / Completed',
        bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500',
      };
    case 'DISPATCHING':
      return {
        label: 'Dispatching...',
        bgClass: 'bg-blue-50 text-blue-700 border-blue-200',
        dotClass: 'bg-blue-500 animate-pulse',
      };
    case 'REPORTED':
      return {
        label: 'Reported',
        bgClass: 'bg-slate-100 text-slate-800 border-slate-300',
        dotClass: 'bg-slate-500',
      };
    case 'WAITING_FOR_AMBULANCE':
      return {
        label: 'Waiting for Ambulance',
        bgClass: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500 animate-pulse',
      };
    case 'WAITING_FOR_HOSPITAL':
      return {
        label: 'Waiting for Hospital Bed',
        bgClass: 'bg-orange-50 text-orange-700 border-orange-200',
        dotClass: 'bg-orange-500 animate-pulse',
      };
    case 'ROLLBACK_PENDING':
      return {
        label: 'Rollback Pending',
        bgClass: 'bg-rose-50 text-rose-700 border-rose-200',
        dotClass: 'bg-rose-500 animate-pulse',
      };
    case 'ROLLED_BACK':
      return {
        label: 'Rolled Back',
        bgClass: 'bg-purple-50 text-purple-700 border-purple-200',
        dotClass: 'bg-purple-500',
      };
    case 'DISPATCH_FAILED':
      return {
        label: 'Dispatch Failed',
        bgClass: 'bg-red-50 text-red-700 border-red-200',
        dotClass: 'bg-red-500',
      };
    case 'CREATED':
    default:
      return {
        label: 'Pending Dispatch',
        bgClass: 'bg-slate-50 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
      };
  }
}

export function getErrorMessage(errorCode?: string | null): string {
  if (!errorCode) return 'Unknown error occurred during coordination dispatch';
  switch (errorCode) {
    case 'NO_AMBULANCE_AVAILABLE':
      return 'All ambulance fleet units are currently dispatched or out of service sector.';
    case 'AMBULANCE_SERVICE_UNAVAILABLE':
      return 'Ambulance service connection timed out or is unavailable.';
    case 'NO_HOSPITAL_BED_AVAILABLE':
      return 'No emergency trauma or inpatient hospital beds available. Tentative ambulance reservation was safely rolled back.';
    case 'HOSPITAL_SERVICE_UNAVAILABLE':
      return 'Hospital service unresponsive. Tentative ambulance reservation was safely rolled back.';
    case 'BED_RESERVATION_FAILED':
      return 'Hospital bed reservation could not be fulfilled. Allocated ambulance was released.';
    default:
      return `Dispatch error: ${errorCode}`;
  }
}
