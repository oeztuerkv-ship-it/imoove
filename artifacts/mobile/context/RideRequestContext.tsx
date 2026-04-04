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
  | "pending"
  | "accepted"
  | "arrived"
  | "in_progress"
  | "rejected"
  | "cancelled"
  | "completed";

export interface RideRequest {
  id: string;
  createdAt: Date;
  scheduledAt?: Date | null;
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
  rejectedBy: string[];
  status: RequestStatus;
}

interface RideRequestContextValue {
  requests: RideRequest[];
  pendingRequests: RideRequest[];
  acceptedRequest: RideRequest | null;
  completedRequest: RideRequest | null;
  lastAddedRequestId: string | null;
  isConnected: boolean;
  passengerId: string;
  myActiveRequests: RideRequest[];
  myCancelledRequests: RideRequest[];
  addRequest: (req: Omit<RideRequest, "id" | "createdAt" | "status" | "rejectedBy">) => Promise<string>;
  acceptRequest: (id: string, driverId?: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  rejectByDriver: (id: string, driverId: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  driverCancelRequest: (id: string, driverId: string) => Promise<void>;
  arriveAtCustomer: (id: string) => Promise<void>;
  startDriving: (id: string) => Promise<void>;
  completeRequest: (id: string, finalFare?: number) => Promise<void>;
}

const RideRequestContext = createContext<RideRequestContextValue>({
  requests: [],
  pendingRequests: [],
  acceptedRequest: null,
  completedRequest: null,
  lastAddedRequestId: null,
  isConnected: false,
  passengerId: "",
  myActiveRequests: [],
  myCancelledRequests: [],
  addRequest: async () => "",
  acceptRequest: async () => {},
  rejectRequest: async () => {},
  rejectByDriver: async () => {},
  cancelRequest: async () => {},
  driverCancelRequest: async () => {},
  arriveAtCustomer: async () => {},
  startDriving: async () => {},
  completeRequest: async () => {},
});

const API_BASE = getApiBaseUrl();
const PASSENGER_ID_KEY = "@imoove_passenger_id";

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
  return {
    ...r,
    createdAt: toDate(r.createdAt) ?? new Date(),
    scheduledAt: r.scheduledAt ? toDate(r.scheduledAt) : null,
    rejectedBy: r.rejectedBy ?? [],
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
      setPassengerId(uuid());
    });
  }, []);

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
        if (newest?.status === "pending" && lastCountRef.current > 0) {
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
    async (id: string, status: RequestStatus, finalFare?: number, driverId?: string) => {
      if (!API_BASE) return;
      await fetch(`${API_BASE}/rides/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(finalFare != null ? { finalFare } : {}),
          ...(driverId != null ? { driverId } : {}),
        }),
      });
      await fetchAll();
    },
    [fetchAll],
  );

  const addRequest = useCallback(
    async (req: Omit<RideRequest, "id" | "createdAt" | "status" | "rejectedBy">): Promise<string> => {
      if (!API_BASE) {
        const id = `REQ-${Date.now()}`;
        const newReq: RideRequest = { ...req, id, createdAt: new Date(), status: "pending", rejectedBy: [] };
        setRequests((prev) => [newReq, ...prev]);
        setLastAddedRequestId(id);
        return id;
      }
      const res = await fetch(`${API_BASE}/rides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const created = await res.json();
      const id = created.id as string;
      setLastAddedRequestId(id);
      await fetchAll();
      return id;
    },
    [fetchAll],
  );

  const acceptRequest = useCallback(
    (id: string, driverId?: string) => patchStatus(id, "accepted", undefined, driverId),
    [patchStatus],
  );
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

  const cancelRequest = useCallback((id: string) => patchStatus(id, "cancelled"), [patchStatus]);

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

  const arriveAtCustomer = useCallback((id: string) => patchStatus(id, "arrived"), [patchStatus]);
  const startDriving = useCallback((id: string) => patchStatus(id, "in_progress"), [patchStatus]);
  const completeRequest = useCallback(
    (id: string, finalFare?: number) => patchStatus(id, "completed", finalFare),
    [patchStatus],
  );

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const acceptedRequest =
    requests.find((r) =>
      r.status === "accepted" || r.status === "arrived" || r.status === "in_progress"
    ) ?? null;
  const completedRequest =
    requests.filter((r) => r.status === "completed").slice(-1)[0] ?? null;

  const myActiveRequests = passengerId
    ? requests.filter(
        (r) =>
          r.passengerId === passengerId &&
          (r.status === "pending" || r.status === "accepted" || r.status === "arrived" || r.status === "in_progress"),
      )
    : [];

  const myCancelledRequests = passengerId
    ? requests.filter(
        (r) =>
          r.passengerId === passengerId &&
          (r.status === "cancelled" || r.status === "rejected"),
      )
    : [];

  return (
    <RideRequestContext.Provider
      value={{
        requests,
        pendingRequests,
        acceptedRequest,
        completedRequest,
        lastAddedRequestId,
        isConnected,
        passengerId,
        myActiveRequests,
        myCancelledRequests,
        addRequest,
        acceptRequest,
        rejectRequest,
        rejectByDriver,
        cancelRequest,
        driverCancelRequest,
        arriveAtCustomer,
        startDriving,
        completeRequest,
      }}
    >
      {children}
    </RideRequestContext.Provider>
  );
}

export function useRideRequests() {
  return useContext(RideRequestContext);
}
