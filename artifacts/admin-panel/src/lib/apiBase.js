/**
 * Produktions-Basis: https://api.onroda.de/api
 * Lokal: in .env VITE_API_BASE_URL=http://localhost:3000/api
 */
const raw = import.meta.env.VITE_API_BASE_URL;
const trimmed = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
export const API_BASE = trimmed || "https://api.onroda.de/api";
