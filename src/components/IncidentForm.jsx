import React, { useState } from 'react';
import { X, AlertCircle, Send, CheckCircle2, ShieldAlert, Building2, Truck, RefreshCw } from 'lucide-react';
import { createIncident } from '../services/api';
import { StatusBadge, SeverityBadge } from './StatusBadge';
import { DispatchTimeline } from './DispatchTimeline';
import { getErrorMessage } from '../utils/formatters';

const SEVERITY_OPTIONS = [
  {
    value: 'LOW',
    label: 'Low',
    desc: 'Minor non-urgent condition',
    color: 'border-slate-300 hover:border-slate-400 peer-checked:border-slate-600 peer-checked:bg-slate-50',
    dot: 'bg-slate-400',
  },
  {
    value: 'MEDIUM',
    label: 'Medium',
    desc: 'Prompt care required',
    color: 'border-blue-200 hover:border-blue-300 peer-checked:border-blue-600 peer-checked:bg-blue-50',
    dot: 'bg-blue-600',
  },
  {
    value: 'HIGH',
    label: 'High',
    desc: 'Severe, urgent response',
    color: 'border-amber-200 hover:border-amber-300 peer-checked:border-amber-600 peer-checked:bg-amber-50',
    dot: 'bg-amber-600',
  },
  {
    value: 'CRITICAL',
    label: 'Critical',
    desc: 'Immediate life threat',
    color: 'border-red-200 hover:border-red-300 peer-checked:border-red-600 peer-checked:bg-red-50',
    dot: 'bg-red-600',
  },
];

export function IncidentForm({ isOpen, onClose, onSuccess }) {
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdIncidentResult, setCreatedIncidentResult] = useState(null);

  if (!isOpen) return null;

  const validate = () => {
    const errs = {};
    if (!description.trim()) {
      errs.description = 'Incident description is required';
    } else if (description.trim().length < 5) {
      errs.description = 'Description should be at least 5 characters';
    }

    if (!location.trim()) {
      errs.location = 'Incident location or cross-streets are required';
    } else if (location.trim().length < 3) {
      errs.location = 'Location should be at least 3 characters';
    }

    if (!severity) {
      errs.severity = 'Please select a severity level';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitError(null);
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const payload = {
        description: description.trim(),
        location: location.trim(),
        severity,
      };

      const result = await createIncident(payload);

      if (result && result.data) {
        setCreatedIncidentResult(result.data);
        if (onSuccess) {
          onSuccess(result.data);
        }
      } else {
        throw new Error('Invalid response received from Coordinator service');
      }
    } catch (err) {
      console.error('Failed to create incident:', err);
      setSubmitError(
        err.response?.data?.detail ||
          err.message ||
          'Failed to dispatch emergency incident. Check coordinator backend connection.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setDescription('');
    setLocation('');
    setSeverity('HIGH');
    setErrors({});
    setSubmitError(null);
    setCreatedIncidentResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="incident-form-modal"
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/75">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Log Emergency Call & Dispatch
              </h3>
              <p className="text-[11px] text-slate-500">
                Triggers distributed 2-phase coordination & fleet assignment
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* If created successfully, show confirmation & timeline */}
        {createdIncidentResult ? (
          <div className="p-6 space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-emerald-950">
                Incident Registered: {createdIncidentResult.incident_id}
              </h4>
              <p className="text-xs text-emerald-700 mt-1">
                Coordinator completed saga execution. Status:{' '}
                <span className="font-semibold">{createdIncidentResult.status}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Ambulance</span>
                <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                  {createdIncidentResult.assigned_ambulance || 'None (Rolled back/waiting)'}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Hospital</span>
                <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                  {createdIncidentResult.assigned_hospital || 'None (Bed shortage)'}
                </p>
              </div>
            </div>

            <DispatchTimeline incident={createdIncidentResult} />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close & Return to Dashboard
              </button>
            </div>
          </div>
        ) : (
          /* Form Content */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Severity Radio Grid */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Triage Severity Level
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SEVERITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`relative flex flex-col p-2.5 rounded-lg border cursor-pointer transition-all ${
                      severity === opt.value
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="severity"
                      value={opt.value}
                      checked={severity === opt.value}
                      onChange={() => setSeverity(opt.value)}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                      <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">{opt.desc}</span>
                  </label>
                ))}
              </div>
              {errors.severity && (
                <p className="text-[11px] text-red-600 mt-1">{errors.severity}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="incident-desc"
                className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider"
              >
                Incident Description & Medical Chief Complaint
              </label>
              <textarea
                id="incident-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Pedestrian struck by vehicle, unresponsive with visible head trauma"
                className="w-full text-xs p-3 rounded-lg border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors"
              />
              {errors.description && (
                <p className="text-[11px] text-red-600 mt-1">{errors.description}</p>
              )}
            </div>

            {/* Location */}
            <div>
              <label
                htmlFor="incident-location"
                className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider"
              >
                Incident Location & Landmarks
              </label>
              <input
                id="incident-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Shivaji Nagar Bus Station, Sector 2"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors"
              />
              {errors.location && (
                <p className="text-[11px] text-red-600 mt-1">{errors.location}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing Coordinator Dispatch...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Dispatch Emergency</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
