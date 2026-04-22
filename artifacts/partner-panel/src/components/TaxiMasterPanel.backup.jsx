import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";

const STORAGE_KEY = "onrodaPanelJwt";

function getPanelHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function money(value) {
  const n = Number(value || 0);
  return `${n.toFixed(2)} €`;
}

export default function TaxiMasterPanel({ company, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [companyData, setCompanyData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  // 🔥 NEU (Fahrer erstellen State)
  const [showCreateDriver, setShowCreateDriver] = useState(false);
  const [newDriver, setNewDriver] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const [companyRes, metricsRes, driversRes, vehiclesRes] = await Promise.all([
          fetch(`${API_BASE}/panel/v1/company`, { headers: getPanelHeaders() }),
          fetch(`${API_BASE}/panel/v1/overview/metrics`, { headers: getPanelHeaders() }),
          fetch(`${API_BASE}/panel/v1/fleet/drivers`, { headers: getPanelHeaders() }),
          fetch(`${API_BASE}/panel/v1/fleet/vehicles`, { headers: getPanelHeaders() }),
