import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

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

export default api;
