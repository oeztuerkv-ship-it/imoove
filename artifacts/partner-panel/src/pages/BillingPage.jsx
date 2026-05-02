import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";
import FinanceExportTab from "./finance/FinanceExportTab.jsx";
import FinanceInvoicesTab from "./finance/FinanceInvoicesTab.jsx";
import FinanceOverviewTab from "./finance/FinanceOverviewTab.jsx";
import FinanceTabs from "./finance/FinanceTabs.jsx";
import { defaultMonthYm, deriveFinanceKpis, formatYmDe } from "./finance/financeHelpers.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function BillingPage() {
  const { token, user } = usePanelAuth();
  const canRead = hasPerm(user?.permissions, "rides.read");
  const showCodes = hasPanelModule(user?.panelModules, "access_codes");

  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [rides, setRides] = useState([]);
  const [kpiRides, setKpiRides] = useState([]);
  const [kpiMonthYm, setKpiMonthYm] = useState(() => defaultMonthYm());

  const [month, setMonth] = useState(defaultMonthYm);
  const [rideKind, setRideKind] = useState("");
  const [payerKind, setPayerKind] = useState("");
  const [billingReference, setBillingReference] = useState("");
  const [accessCodeId, setAccessCodeId] = useState("");
  const [hasAccessCode, setHasAccessCode] = useState("");
  const [partnerFlow, setPartnerFlow] = useState("");
  const [codeOptions, setCodeOptions] = useState([]);
  const initialBillingLoaded = useRef(false);

  const loadCodes = useCallback(async () => {
    if (!token || !showCodes) return;
    try {
      const res = await fetch(`${API_BASE}/panel/v1/access-codes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && Array.isArray(data.items)) {
        setCodeOptions(data.items);
      }
    } catch {
      /* ignore */
    }
  }, [token, showCodes]);

  function buildQuery(forMonth = month) {
    const p = new URLSearchParams();
    p.set("month", forMonth);
    if (rideKind) p.set("rideKind", rideKind);
    if (payerKind) p.set("payerKind", payerKind);
    if (billingReference.trim()) p.set("billingReference", billingReference.trim());
    if (accessCodeId) p.set("accessCodeId", accessCodeId);
    if (hasAccessCode === "yes") p.set("hasAccessCode", "true");
    if (hasAccessCode === "no") p.set("hasAccessCode", "false");
    if (partnerFlow) p.set("partnerFlow", partnerFlow);
    return p.toString();
  }

  const loadKpiSnapshot = useCallback(async () => {
    if (!token || !canRead) return;
    setKpiLoading(true);
    try {
      const ym = defaultMonthYm();
      const res = await fetch(`${API_BASE}/panel/v1/billing/rides?month=${encodeURIComponent(ym)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setKpiRides([]);
        setKpiMonthYm(ym);
        return;
      }
      setKpiRides(Array.isArray(data.rides) ? data.rides : []);
      setKpiMonthYm(typeof data.month === "string" ? data.month : ym);
    } catch {
      setKpiRides([]);
    } finally {
      setKpiLoading(false);
    }
  }, [token, canRead]);

  useEffect(() => {
    void loadKpiSnapshot();
  }, [loadKpiSnapshot]);

  useEffect(() => {
    if (tab === "payouts" || tab === "medical") setTab("overview");
  }, [tab]);

  const onLoad = useCallback(async () => {
    if (!token || !canRead) return;
    setMsg("");
    setLoading(true);
    try {
      await loadCodes();
      const res = await fetch(`${API_BASE}/panel/v1/billing/rides?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
        setRides([]);
        return;
      }
      setRides(Array.isArray(data.rides) ? data.rides : []);
      setMsg(`${data.rides?.length ?? 0} Fahrten im Monat ${data.month ?? month}.`);
    } catch {
      setMsg("Netzwerkfehler.");
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, [
    token,
    canRead,
    loadCodes,
    month,
    rideKind,
    payerKind,
    billingReference,
    accessCodeId,
    hasAccessCode,
    partnerFlow,
  ]);

  useEffect(() => {
    if (!token || !canRead || initialBillingLoaded.current) return;
    initialBillingLoaded.current = true;
    void onLoad();
  }, [token, canRead, onLoad]);

  async function onExportCsv() {
    if (!token || !canRead) return;
    try {
      const res = await fetch(`${API_BASE}/panel/v1/billing/rides.csv?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(typeof data?.error === "string" ? data.error : "Export fehlgeschlagen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `onroda-billing-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg("Export fehlgeschlagen.");
    }
  }

  const kpi = useMemo(() => deriveFinanceKpis(kpiRides, kpiMonthYm), [kpiRides, kpiMonthYm]);
  const kpiMonthLabel = formatYmDe(kpiMonthYm);

  if (!canRead) {
    return (
      <div className="partner-stack partner-stack--tight">
        <p className="partner-state-warn" style={{ margin: 0 }}>
          Keine Leserechte für Finanzen.
        </p>
      </div>
    );
  }

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-page-hero">
        <p className="partner-page-eyebrow">Finanzen</p>
        <h1 className="partner-page-title">Abrechnung &amp; Übersicht</h1>
        <p className="partner-page-lead">
          Taxi-Abrechnung: Übersicht, Rechnungen und CSV-Export. Krankenfahrten sind unter „Krankenfahrten“ zusammengefasst.
        </p>
      </div>

      <FinanceTabs tab={tab} onTabChange={setTab} />

      {tab === "overview" ? (
        <FinanceOverviewTab kpiLoading={kpiLoading} kpiMonthLabel={kpiMonthLabel} kpi={kpi} onRefreshKpi={() => void loadKpiSnapshot()} />
      ) : null}
      {tab === "invoices" ? <FinanceInvoicesTab rides={rides} loading={loading} /> : null}
      {tab === "export" ? (
        <FinanceExportTab
          rides={rides}
          month={month}
          setMonth={setMonth}
          rideKind={rideKind}
          setRideKind={setRideKind}
          payerKind={payerKind}
          setPayerKind={setPayerKind}
          billingReference={billingReference}
          setBillingReference={setBillingReference}
          hasAccessCode={hasAccessCode}
          setHasAccessCode={setHasAccessCode}
          accessCodeId={accessCodeId}
          setAccessCodeId={setAccessCodeId}
          partnerFlow={partnerFlow}
          setPartnerFlow={setPartnerFlow}
          codeOptions={codeOptions}
          showCodes={showCodes}
          loading={loading}
          msg={msg}
          onLoad={onLoad}
          onExportCsv={onExportCsv}
        />
      ) : null}
    </div>
  );
}
