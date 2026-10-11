import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, Send, CheckCircle2, ShieldAlert, Building2, Truck, RefreshCw, MapPin, Search, Navigation } from 'lucide-react';
import L from 'leaflet';
import { createIncident, geocodeAddress } from '../services/api';
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

const QUICK_PUNE_LANDMARKS = [
  { name: 'Fergusson College Rd, Deccan Gymkhana', lat: 18.5186, lng: 73.8423 },
  { name: 'Mumbai-Pune Bypass, Warje Flyover', lat: 18.4820, lng: 73.7990 },
  { name: 'Kothrud Bus Stand, Sector 4', lat: 18.5074, lng: 73.8077 },
  { name: 'Bhosari MIDC Industrial Zone', lat: 18.6298, lng: 73.8485 },
  { name: 'Camp Cantonment Area, MG Road', lat: 18.5142, lng: 73.8789 },
  { name: 'Shivaji Nagar Bus Station, Sector 2', lat: 18.5314, lng: 73.8446 },
  { name: 'Baner High Street', lat: 18.5590, lng: 73.7868 },
  { name: 'Aundh Parihar Chowk', lat: 18.5626, lng: 73.8087 },
];

export function IncidentForm({ isOpen, onClose, onSuccess }) {
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [locationType, setLocationType] = useState('simulated_demo');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdIncidentResult, setCreatedIncidentResult] = useState(null);

  const mapPickerRef = useRef(null);
  const mapPickerInstanceRef = useRef(null);
  const pickerMarkerRef = useRef(null);

  // Initialize mini map picker when toggled
  useEffect(() => {
    if (!showMapPicker || !mapPickerRef.current) return;

    if (!mapPickerInstanceRef.current) {
      const initialLat = selectedCoords?.lat || 18.5204;
      const initialLng = selectedCoords?.lng || 73.8567;

      const map = L.map(mapPickerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setSelectedCoords({ lat: +pos.lat.toFixed(4), lng: +pos.lng.toFixed(4) });
        setLocationType('user_selected');
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setSelectedCoords({ lat: +e.latlng.lat.toFixed(4), lng: +e.latlng.lng.toFixed(4) });
        setLocationType('user_selected');
      });

      mapPickerInstanceRef.current = map;
      pickerMarkerRef.current = marker;
    }

    return () => {
      if (mapPickerInstanceRef.current) {
        mapPickerInstanceRef.current.remove();
        mapPickerInstanceRef.current = null;
        pickerMarkerRef.current = null;
      }
    };
  }, [showMapPicker]);

  if (!isOpen) return null;

  const handleGeocode = async () => {
    if (!location.trim()) return;
    setIsGeocoding(true);
    try {
      const resp = await geocodeAddress(location.trim());
      if (resp && resp.data) {
        setSelectedCoords({ lat: resp.data.lat, lng: resp.data.lng });
        setLocationType(resp.data.location_type || 'geocoded');
        if (resp.data.display_name && !location.includes(',')) {
          setLocation(resp.data.display_name.split(',')[0]);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSelectQuickLandmark = (item) => {
    setLocation(item.name);
    setSelectedCoords({ lat: item.lat, lng: item.lng });
    setLocationType('simulated_demo');
    if (mapPickerInstanceRef.current && pickerMarkerRef.current) {
      mapPickerInstanceRef.current.setView([item.lat, item.lng], 14);
      pickerMarkerRef.current.setLatLng([item.lat, item.lng]);
    }
  };

  const validate = () => {
    const errs = {};
    if (!description.trim()) {
      errs.description = 'Incident description is required';
    } else if (description.trim().length < 5) {
      errs.description = 'Description should be at least 5 characters';
    }

    if (!location.trim()) {
      errs.location = 'Incident location or landmark is required';
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
        latitude: selectedCoords?.lat,
        longitude: selectedCoords?.lng,
        location_type: locationType,
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
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        (err.message === 'Network Error'
          ? 'Network Error: Unable to reach the dispatch coordinator service. Please check your connection or gateway status.'
          : err.message) ||
        'Failed to dispatch emergency incident. Check coordinator backend connection.';
      setSubmitError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setDescription('');
    setLocation('');
    setSeverity('HIGH');
    setSelectedCoords(null);
    setLocationType('simulated_demo');
    setShowMapPicker(false);
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
                Triggers road-route calculation, patient pickup, and trauma bay allocation
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
                Coordinator completed saga execution. Journey Stage:{' '}
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
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Hospital (Bed Reserved)</span>
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
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Pedestrian struck by vehicle, unresponsive with visible head trauma"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors"
              />
              {errors.description && (
                <p className="text-[11px] text-red-600 mt-1">{errors.description}</p>
              )}
            </div>

            {/* Location & Geocoding Input */}
            <div>
              <label
                htmlFor="incident-location"
                className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider"
              >
                Incident Location & Landmarks (Pune Sector)
              </label>
              <div className="flex gap-2">
                <input
                  id="incident-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Fergusson College Rd, Deccan Gymkhana"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={isGeocoding || !location.trim()}
                  className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Geocode address with OpenStreetMap Nominatim"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{isGeocoding ? 'Locating...' : 'Geocode'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(!showMapPicker)}
                  className={`px-3 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors flex items-center gap-1 border ${
                    showMapPicker
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                  title="Click to pick coordinates directly on map"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{showMapPicker ? 'Hide Map' : 'Map Pin'}</span>
                </button>
              </div>
              {errors.location && (
                <p className="text-[11px] text-red-600 mt-1">{errors.location}</p>
              )}
            </div>

            {/* Interactive Coordinate Picker Map (if toggled) */}
            {showMapPicker && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600 px-1">
                  <span className="font-medium">Click on the street map or drag pin to pick coordinates:</span>
                  {selectedCoords && (
                    <span className="font-mono font-bold text-blue-700">
                      {selectedCoords.lat}, {selectedCoords.lng}
                    </span>
                  )}
                </div>
                <div ref={mapPickerRef} className="w-full h-44 rounded border border-slate-200 z-10" />
              </div>
            )}

            {/* Selected Coordinates Status Badge */}
            {selectedCoords && (
              <div className="text-[11px] bg-blue-50 border border-blue-200 p-2 rounded-lg flex items-center justify-between font-mono">
                <div className="flex items-center gap-1.5 text-blue-900">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Coords: {selectedCoords.lat.toFixed(4)}, {selectedCoords.lng.toFixed(4)}</span>
                </div>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-sans px-2 py-0.5 rounded font-semibold uppercase">
                  {locationType === 'user_selected'
                    ? 'User Selected'
                    : locationType === 'geocoded'
                    ? 'Geocoded (OSM)'
                    : 'Demo Landmark'}
                </span>
              </div>
            )}

            {/* Quick Pune Landmarks Grid */}
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Quick Pune Demo Landmarks:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PUNE_LANDMARKS.slice(0, 6).map((lm) => (
                  <button
                    key={lm.name}
                    type="button"
                    onClick={() => handleSelectQuickLandmark(lm)}
                    className="text-[10px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer transition-colors"
                  >
                    {lm.name.split(',')[0]}
                  </button>
                ))}
              </div>
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
