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
      return {
        label: 'Dispatched',
        bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500',
      };
    case 'WAITING_FOR_AMBULANCE':
      return {
        label: 'Waiting for Ambulance',
        bgClass: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500 animate-pulse',
      };
    case 'WAITING_FOR_HOSPITAL':
      return {
        label: 'Waiting for Hospital',
        bgClass: 'bg-orange-50 text-orange-700 border-orange-200',
        dotClass: 'bg-orange-500 animate-pulse',
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
      return 'No emergency trauma or inpatient hospital beds available. Unit assignment rolled back.';
    case 'HOSPITAL_SERVICE_UNAVAILABLE':
      return 'Hospital service unresponsive. Tentative ambulance reservation was safely rolled back.';
    case 'BED_RESERVATION_FAILED':
      return 'Hospital bed reservation could not be fulfilled. Allocated ambulance was released.';
    default:
      return `Dispatch error: ${errorCode}`;
  }
}
