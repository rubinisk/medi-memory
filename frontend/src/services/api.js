import axios from "axios";

const TOKEN_KEY = "medimemory_token";

export const tokenStore = {
  get: () => {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t) => {
    try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

// All calls go to /api on the same origin; Vite proxies to FastAPI in development.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || "", timeout: 120000 });

api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err.config?.url || "";
    if (err.response?.status === 401 && !url.includes("/api/auth/login") && onUnauthorized) onUnauthorized();
    return Promise.reject(err);
  }
);

/** Extract a human-readable message from any API/network error. */
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;
  if (err.code === "ERR_NETWORK") return "Can't reach the MediMemory server. Is the backend running on port 8000?";
  if (err.code === "ECONNABORTED") return "The request took too long. Please try again.";
  const d = err.response?.data;
  if (d instanceof Blob) return fallback;
  if (typeof d?.detail === "string") return d.detail;
  if (Array.isArray(d?.detail)) return d.detail.map((x) => x.msg).join(", ");
  return err.message || fallback;
}

/** Same as errorMessage but for responses requested as blobs (audio, files). */
export async function blobErrorMessage(err, fallback) {
  const d = err?.response?.data;
  if (d instanceof Blob) {
    try { const j = JSON.parse(await d.text()); if (j.detail) return j.detail; } catch { /* not json */ }
  }
  return errorMessage(err, fallback);
}

export const fmtDate = (d, opts = { day: "2-digit", month: "short", year: "numeric" }) =>
  d ? new Date(typeof d === "string" && d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", opts) : "—";
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
export const fmtDateTime = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : "—");
export const toLocalInput = (d) => {
  const x = d ? new Date(d) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};
export const todayISO = (d) => {
  const x = d || new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

export const DOC_TYPES = {
  prescription: "Prescription",
  lab_report: "Lab report",
  medical_certificate: "Medical certificate",
  consultation_note: "Consultation note",
  medical_image: "Medical image",
  other: "Other",
};
