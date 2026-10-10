import React from 'react';
import { getSeverityDetails, getStatusDetails } from '../utils/formatters';

export function StatusBadge({ status }) {
  const details = getStatusDetails(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${details.bgClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${details.dotClass}`} />
      <span>{details.label}</span>
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const details = getSeverityDetails(severity);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${details.bgClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${details.dotClass}`} />
      <span>{details.label}</span>
    </span>
  );
}
