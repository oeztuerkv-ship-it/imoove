import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { getApiBaseUrl } from "@/utils/apiBase";

export type RequestStatus =
  | "draft"
  | "requested"
  | "searching_driver"
  | "offered"
  | "pending"
  | "accepted"
  | "driver_arriving"
  | "driver_waiting"
  | "passenger_onboard"
  | "arrived"
  | "in_progress"
  | "cancelled_by_customer"
  | "cancelled_by_driver"
  | "cancelled_by_system"
  | "expired"
  | "rejected"
  | "cancelled"
  | "completed";

/** Entspricht API `rideKind` (camelCase). */
export type RideKind = "standard" | "medical" | "voucher" | "company";

/** Entspricht API `payerKind`. */
export type PayerKind = "passenger" | "company" | "insurance" | "voucher" | "third_party";

/** Entspricht API `authorizationSource` — Direktzahlung, Code-Freigabe oder B2B/Mandant. */
export type AuthorizationSource = "passenger_direct" | "access_code" | "partner";

export type AccessCodeSummary = { codeType: string; label: string };

export interface RideRequest {
  id: string;
  createdAt: Date;
  scheduledAt?: Date | null;
  rideKind: RideKind;
  payerKind: PayerKind;
  authorizationSource: AuthorizationSource;
  accessCodeId?: string | null;
  /** Nur API — kein Klartext-Code, nur Anzeige für Fahrer/Disposition. */
  accessCodeSummary?: AccessCodeSummary | null;
  voucherCode?: string | null;
  billingReference?: string | null;
  from: string;
  fromFull: string;
  fromLat?: number;
  fromLon?: number;
  to: string;
  toFull: string;
  toLat?: number;
  toLon?: number;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  finalFare?: number | null;
  paymentMethod: string;
  vehicle: string;
  customerName: string;
  passengerId?: string;
  driverId?: string | null;
  cancelReason?: string | null;
  rejectedBy: string[];
  status: RequestStatus;
}

interface RideRequestContextValue {
  requests: RideRequest[];
  pendingRequests: RideRequest[];
  acceptedRequest: RideRequest | null;
  completedRequest: RideRequest | null;
  passengerAcceptedRequest: RideRequest | null;
  passengerCompletedRequest: RideRequest | null;
  lastAddedRequestId: string | null;
  isConnected: boolean;
  passengerId: string;
  myActiveRequests: RideRequest[];
  myCancelledRequests: RideRequest[];
  addRequest: (
    req: Omit<
      RideRequest,
      | "id"
      | "createdAt"
      | "status"
      | "rejectedBy"
      | "rideKind"
      | "payerKind"
      | "authorizationSource"
      | "accessCodeId"
      | "accessCodeSummary"
    > & {
      rideKind?: RideKind;
      payerKind?: PayerKind;
      voucherCode?: string | null;
      billingReference?: string | null;
      accessCode?: string | null;
      accessCodeVerifyToken?: string | null;
    },
  ) => Promise<string>;
  acceptRequest: (id: string, driverId?: string) => Promise<void>;
  markDriverArriving: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  rejectByDriver: (id: string, driverId: string) => Promise<void>;
  cancelRequest: (id: string, finalFare?: number, cancelReason?: string) => Promise<void>;
  driverCancelRequest: (id: string, driverId: string) => Promise<void>;
  arriveAtCustomer: (id: string) => Promise<void>;
  startDriving: (id: string) => Promise<void>;
  completeRequest: (id: string, finalFare?: number) => Promise<void>;
  /** Manuelles Neuladen der Aufträge (z. B. „Erneut suchen“). */
  refreshRequests: () => Promise<void>;
}

const RideRequestContext = createContext<RideRequestContextValue>({
  requests: [],
  pendingRequests: [],
  acceptedRequest: null,
  completedRequest: null,
  passengerAcceptedRequest: null,
  passengerCompletedRequest: null,
  lastAddedRequestId: null,
  isConnected: false,
  passengerId: "",
  myActiveRequests: [],
  myCancelledRequests: [],
  addRequest: async () => "",
  acceptRequest: async () => {},
  markDriverArriving: async () => {},
  rejectRequest: async () => {},
  rejectByDriver: async () => {},
  cancelRequest: async () => {},
  driverCancelRequest: async () => {},
  arriveAtCustomer: async () => {},
  startDriving: async () => {},
  completeRequest: async () => {},
  refreshRequests: async () => {},
});

const API_BASE = getApiBaseUrl();
const PASSENGER_ID_KEY = "@Onroda_passenger_id";

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toDate(val: string | Date | undefined | null): Date | undefined | null {
  if (val == null) return val as null | undefined;
  if (val instanceof Date) return val;
  return new Date(val as string);
}

function normalizeRequest(r: any): RideRequest {
  const customerName =
    r.customerName ??
    r.customer_name ??
    r.customer ??
    "Unbekannt";
  const fromFull =
    r.fromFull ??
    r.from_full ??
    r.from_location ??
    r.from ??
    "—";
  const toFull =
    r.toFull ??
    r.to_full ??
    r.to_location ??
    r.to ??
    "—";
  const paymentMethod =
    r.paymentMethod ??
    r.payment_method ??
    r.paymentType ??
    r.payment_type ??
    "Bar";
  const vehicle =
    r.vehicle ??
    r.vehicle_type ??
    "Standard";

  const rideKindRaw = r.rideKind ?? r.ride_kind;
  const payerKindRaw = r.payerKind ?? r.payer_kind;
  const rideKind: RideKind =
    rideKindRaw === "medical" || rideKindRaw === "voucher" || rideKindRaw === "company"
      ? rideKindRaw
      : "standard";
  const payerKind: PayerKind =
    payerKindRaw === "company" ||
    payerKindRaw === "insurance" ||
    payerKindRaw === "voucher" ||
    payerKindRaw === "third_party"
      ? payerKindRaw
      : "passenger";

  const authRaw = r.authorizationSource ?? r.authorization_source;
  const authorizationSource: AuthorizationSource =
    authRaw === "access_code"
      ? "access_code"
      : authRaw === "partner"
        ? "partner"
        : "passenger_direct";

  const summaryRaw = r.accessCodeSummary ?? r.access_code_summary;
  let accessCodeSummary: AccessCodeSummary | null = null;
  if (summaryRaw && typeof summaryRaw === "object") {
    const ct = (summaryRaw as { codeType?: string; code_type?: string }).codeType
      ?? (summaryRaw as { code_type?: string }).code_type;
    const lb = (summaryRaw as { label?: string }).label;
    if (typeof ct === "string" && typeof lb === "string") {
      accessCodeSummary = { codeType: ct, label: lb };
    }
  }

  return {
    ...r,
    id: String(r.id ?? r.ride_id ?? `REQ-${Date.now()}`),
    createdAt: toDate(r.createdAt ?? r.created_at) ?? new Date(),
    scheduledAt: (r.scheduledAt ?? r.scheduled_at) ? toDate(r.scheduledAt ?? r.scheduled_at) : null,
    rideKind,
    payerKind,
    authorizationSource,
    accessCodeId: (r.accessCodeId ?? r.access_code_id) != null ? String(r.accessCodeId ?? r.access_code_id) : null,
    accessCodeSummary,
    voucherCode: (r.voucherCode ?? r.voucher_code) != null ? String(r.voucherCode ?? r.voucher_code) : null,
    billingReference:
      (r.billingReference ?? r.billing_reference) != null
        ? String(r.billingReference ?? r.billing_reference)
        : null,
    from: r.from ?? r.from_location ?? fromFull,
    fromFull,
    fromLat: r.fromLat ?? r.from_lat ?? undefined,
    fromLon: r.fromLon ?? r.from_lon ?? undefined,
    to: r.to ?? r.to_location ?? toFull,
    toFull,
    toLat: r.toLat ?? r.to_lat ?? undefined,
    toLon: r.toLon ?? r.to_lon ?? undefined,
    distanceKm: Number(r.distanceKm ?? r.distance_km ?? 0),
    durationMinutes: Number(r.durationMinutes ?? r.duration_minutes ?? 0),
    estimatedFare: Number(r.estimatedFare ?? r.estimated_fare ?? r.totalFare ?? r.total_fare ?? 0),
    finalFare:
      r.finalFare != null || r.final_fare != null
        ? Number(r.finalFare ?? r.final_fare)
        : null,
    paymentMethod,
    vehicle,
    customerName: String(customerName),
    passengerId: r.passengerId ?? r.passenger_id,
    driverId: r.driverId ?? r.driver_id ?? null,
    status: (r.status ?? "requested") as RequestStatus,
    rejectedBy: Array.isArray(r.rejectedBy)
      ? r.rejectedBy
      : Array.isArray(r.rejected_by)
        ? r.rejected_by
        : [],
  } as RideRequest;
}

const POLL_INTERVAL_MS = 2500;

export function RideRequestProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [lastAddedRequestId, setLastAddedRequestId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [passengerId, setPassengerId] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(PASSENGER_ID_KEY).then((stored) => {
      if (stored) {
        setPassengerId(stored);
      } else {
        const newId = uuid();
        AsyncStorage.setItem(PASSENGER_ID_KEY, newId).catch(() => {});
        setPassengerId(newId);
      }
    }).catch(() => {
      const fallback = uuid();
      AsyncStorage.setItem(PASSENGER_ID_KEY, fallback).catch(() => {});
      setPassengerId(fallback);
    });
  }, []);

  const ensurePassengerId = useCallback(async (): Promise<string> => {
    if (passengerId && passengerId.trim().length > 0) return passengerId.trim();
    try {
      const stored = await AsyncStorage.getItem(PASSENGER_ID_KEY);
      if (stored && stored.trim().length > 0) {
        const resolved = stored.trim();
        setPassengerId(resolved);
        return resolved;
      }
    } catch {
      /* ignore */
    }
    const created = uuid();
    try {
      await AsyncStorage.setItem(PASSENGER_ID_KEY, created);
    } catch {
      /* ignore */
    }
    setPassengerId(created);
    return created;
  }, [passengerId]);

  const fetchAll = useCallback(async () => {
    if (!API_BASE) return;
    try {
      const res = await fetch(`${API_BASE}/rides`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data: any[] = await res.json();
      const normalized = data.map(normalizeRequest);
      setRequests(normalized);
      setIsConnected(true);
      if (normalized.length > lastCountRef.current) {
        const newReqs = normalized.slice(0, normalized.length - lastCountRef.current);
        const newest = newReqs[0];
        if (
          newest &&
          (newest.status === "requested" || newest.status === "searching_driver" || newest.status === "offered" || newest.status === "pending") &&
          lastCountRef.current > 0
        ) {
          setLastAddedRequestId(newest.id);
        }
      }
      lastCountRef.current = normalized.length;
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAll]);

  const patchStatus = useCallback(
    async (id: string, status: RequestStatus, finalFare?: number, driverId?: string, cancelReason?: string) => {
      if (!API_BASE) return;
      const normalizedCancelReason =
        status === "cancelled_by_customer"
          ? (typeof cancelReason === "string" && cancelReason.trim().length > 0
              ? cancelReason.trim()
              : "Storno durch Kunden-App")
          : undefined;
      const res = await fetch(`${API_BASE}/rides/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(finalFare != null ? { finalFare } : {}),
          ...(driverId != null ? { driverId } : {}),
          ...(normalizedCancelReason ? { cancelReason: normalizedCancelReason } : {}),
        }),
      });
      if (!res.ok) {
        let errorCode = "status_update_failed";
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body.error === "string" && body.error.trim()) {
            errorCode = body.error.trim();
          }
        } catch {
          // keep default errorCode
        }
        throw new Error(errorCode);
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const addRequest = useCallback(
    async (
      req: Omit<
        RideRequest,
        | "id"
        | "createdAt"
        | "status"
        | "rejectedBy"
        | "rideKind"
        | "payerKind"
        | "authorizationSource"
        | "accessCodeId"
        | "accessCodeSummary"
      > & {
        rideKind?: RideKind;
        payerKind?: PayerKind;
        voucherCode?: string | null;
        billingReference?: string | null;
        accessCode?: string | null;
        accessCodeVerifyToken?: string | null;
      },
    ): Promise<string> => {
      const resolvedPassengerId = await ensurePassengerId();
      const rideKind = req.rideKind ?? "standard";
      const payerKind = req.payerKind ?? "passenger";
      const accessTrim = typeof req.accessCode === "string" ? req.accessCode.trim() : "";
      const verifyToken =
        typeof req.accessCodeVerifyToken === "string" ? req.accessCodeVerifyToken.trim() : "";
      const { accessCode: _unused, accessCodeVerifyToken: _uv, ...reqForBody } = req as typeof req & {
        accessCode?: string | null;
        accessCodeVerifyToken?: string | null;
      };
      void _unused;
      void _uv;
      const payload = {
        ...reqForBody,
        passengerId:
          typeof reqForBody.passengerId === "string" && reqForBody.passengerId.trim().length > 0
            ? reqForBody.passengerId.trim()
            : resolvedPassengerId,
        rideKind,
        payerKind,
        voucherCode: req.voucherCode ?? undefined,
        billingReference: req.billingReference ?? undefined,
        ...(accessTrim ? { accessCode: accessTrim } : {}),
        ...(verifyToken ? { accessCodeVerifyToken: verifyToken } : {}),
      };
      if (!API_BASE) {
        const id = `REQ-${Date.now()}`;
        const { accessCode: _oc, accessCodeVerifyToken: _ov, ...reqSansCode } = req as typeof req & {
          accessCode?: string | null;
          accessCodeVerifyToken?: string | null;
        };
        void _oc;
        void _ov;
        const newReq: RideRequest = {
          ...reqSansCode,
          passengerId:
            typeof reqSansCode.passengerId === "string" && reqSansCode.passengerId.trim().length > 0
              ? reqSansCode.passengerId.trim()
              : resolvedPassengerId,
          rideKind,
          payerKind,
          voucherCode: req.voucherCode ?? null,
          billingReference: req.billingReference ?? null,
          authorizationSource: accessTrim ? "access_code" : "passenger_direct",
          accessCodeId: accessTrim ? "local" : null,
          accessCodeSummary: accessTrim ? { codeType: "general", label: "Offline (nicht geprüft)" } : null,
          id,
          createdAt: new Date(),
          status: "requested",
          rejectedBy: [],
        };
        setRequests((prev) => [newReq, ...prev]);
        setLastAddedRequestId(id);
        return id;
      }
      const res = await fetch(`${API_BASE}/rides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof (created as { error?: string }).error === "string"
          ? (created as { error: string }).error
          : "request_failed";
        throw new Error(code);
      }
      const id = (created as { id?: string }).id as string;
      setLastAddedRequestId(id);
      await fetchAll();
      return id;
    },
    [ensurePassengerId, fetchAll],
  );

  const acceptRequest = useCallback(
    (id: string, driverId?: string) => patchStatus(id, "accepted", undefined, driverId),
    [patchStatus],
  );
  const markDriverArriving = useCallback((id: string) => patchStatus(id, "driver_arriving"), [patchStatus]);
  const rejectRequest = useCallback((id: string) => patchStatus(id, "rejected"), [patchStatus]);

  const rejectByDriver = useCallback(
    async (id: string, driverId: string) => {
      if (!API_BASE) return;
      await fetch(`${API_BASE}/rides/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      await fetchAll();
    },
    [fetchAll],
  );

  const cancelRequest = useCallback(
    (id: string, finalFare?: number, cancelReason?: string) =>
      patchStatus(id, "cancelled_by_customer", finalFare, undefined, cancelReason),
    [patchStatus],
  );

  const driverCancelRequest = useCallback(
    async (id: string, driverId: string) => {
      if (!API_BASE) return;
      await fetch(`${API_BASE}/rides/${id}/driver-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      await fetchAll();
    },
    [fetchAll],
  );

  const arriveAtCustomer = useCallback((id: string) => patchStatus(id, "driver_waiting"), [patchStatus]);
  const startDriving = useCallback((id: string) => patchStatus(id, "passenger_onboard"), [patchStatus]);
  const completeRequest = useCallback(
    (id: string, finalFare?: number) => patchStatus(id, "completed", finalFare),
    [patchStatus],
  );

  const pendingRequests = requests.filter(
    (r) => r.status === "pending" || r.status === "requested" || r.status === "searching_driver" || r.status === "offered",
  );
  const acceptedRequest =
    requests.find((r) =>
      r.status === "accepted" ||
      r.status === "driver_arriving" ||
      r.status === "driver_waiting" ||
      r.status === "passenger_onboard" ||
      r.status === "arrived" ||
      r.status === "in_progress"
    ) ?? null;
  const completedRequest =
    requests.filter((r) => r.status === "completed").slice(-1)[0] ?? null;

  const passengerAcceptedRequest = passengerId
    ? requests
        .filter(
          (r) =>
            r.passengerId === passengerId &&
            (r.status === "accepted" ||
              r.status === "driver_arriving" ||
              r.status === "driver_waiting" ||
              r.status === "passenger_onboard" ||
              r.status === "arrived" ||
              r.status === "in_progress"),
        )
        .slice(-1)[0] ?? null
    : null;

  const passengerCompletedRequest = passengerId
    ? requests
        .filter((r) => r.passengerId === passengerId && r.status === "completed")
        .slice(-1)[0] ?? null
    : null;

  const myActiveRequests = passengerId
    ? requests.filter(
        (r) =>
          r.passengerId === passengerId &&
          (r.status === "pending" ||
            r.status === "requested" ||
            r.status === "searching_driver" ||
            r.status === "offered" ||
            r.status === "accepted" ||
            r.status === "driver_arriving" ||
            r.status === "driver_waiting" ||
            r.status === "passenger_onboard" ||
            r.status === "arrived" ||
            r.status === "in_progress"),
      )
    : [];

  const myCancelledRequests = passengerId
    ? requests.filter(
        (r) =>
          r.passengerId === passengerId &&
          (r.status === "cancelled" ||
            r.status === "cancelled_by_customer" ||
            r.status === "cancelled_by_driver" ||
            r.status === "cancelled_by_system" ||
            r.status === "expired" ||
            r.status === "rejected"),
      )
    : [];

  return (
    <RideRequestContext.Provider
      value={{
        requests,
        pendingRequests,
        acceptedRequest,
        completedRequest,
        passengerAcceptedRequest,
        passengerCompletedRequest,
        lastAddedRequestId,
        isConnected,
        passengerId,
        myActiveRequests,
        myCancelledRequests,
        addRequest,
        acceptRequest,
        markDriverArriving,
        rejectRequest,
        rejectByDriver,
        cancelRequest,
        driverCancelRequest,
        arriveAtCustomer,
        startDriving,
        completeRequest,
        refreshRequests: fetchAll,
      }}
    >
      {children}
    </RideRequestContext.Provider>
  );
}

export function useRideRequests() {
  return useContext(RideRequestContext);
}
