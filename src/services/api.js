import axios from "axios";

/**
 * Dynamically resolves the API base URL.
 * - When running in browser:
 *   If VITE_API_BASE_URL points to localhost/127.0.0.1 but the browser is accessing
 *   a remote cloud domain (e.g. *.run.app in Google AI Studio), we MUST use "" (same-origin relative URL)
 *   so the browser sends requests to the current server rather than failing to reach
 *   a non-existent localhost server on the user's laptop.
 * - Same-origin relative URLs ("") avoid Mixed Content and CORS issues completely.
 */
export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  if (typeof window !== "undefined") {
    if (!envUrl) return "";

    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0";

    // If browser is remote (e.g. Google AI Studio preview) but envUrl is localhost:
    if (!isLocalhost && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      return "";
    }

    // In a same-origin full-stack architecture, relative URLs are always optimal
    if (isLocalhost && envUrl.includes(":3000")) {
      return "";
    }
  }

  return envUrl || "";
};

export const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    let friendlyMessage = "Network error: unable to reach coordinator API";
    if (error.response?.data?.detail) {
      friendlyMessage = error.response.data.detail;
    } else if (error.response?.data?.error) {
      friendlyMessage = error.response.data.error;
    } else if (error.response?.status) {
      friendlyMessage = `Coordinator returned HTTP status ${error.response.status}`;
    } else if (error.message) {
      friendlyMessage = error.message;
    }
    console.warn(`[SyncRescue API] ${error.config?.method?.toUpperCase()} ${error.config?.url} failed:`, friendlyMessage);
    return Promise.reject(error);
  }
);

export const getIncidents = () => {
  return api.get("/incidents/");
};

export const createIncident = (incidentData) => {
  return api.post("/incidents/", incidentData);
};

export const getClusterHealth = () => {
  return api.get("/health");
};

export const recoverIncidents = () => {
  return api.post("/incidents/recover");
};

export const getAmbulances = () => {
  return api.get("/ambulances");
};

export const getHospitals = () => {
  return api.get("/hospitals");
};

export const dischargePatient = (hospitalId) => {
  return api.post(`/hospitals/${hospitalId}/discharge`);
};

export const getRoute = (startLat, startLng, endLat, endLng) => {
  return api.get("/route", {
    params: { startLat, startLng, endLat, endLng },
  });
};

export const geocodeAddress = (query) => {
  return api.get("/geocode", {
    params: { q: query },
  });
};

export const getOutboxEvents = () => {
  return api.get("/outbox");
};

export const getSimulations = () => {
  return api.get("/simulations");
};

/**
 * Returns the WebSocket URL dynamically based on the current window location.
 * Adapts to wss:// in production/HTTPS and ws:// in local dev.
 */
export const getWebSocketUrl = () => {
  if (typeof window === "undefined") {
    return "ws://localhost:3000/ws";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

export default api;
