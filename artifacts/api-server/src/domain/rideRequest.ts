export interface RideRequest {
  id: string;
  /** Mandant; optional bis Zuordnung / Mobile-Integration. */
  companyId?: string | null;
  /** Gesetzt, wenn die Fahrt über das Partner-Panel angelegt wurde. */
  createdByPanelUserId?: string | null;
  createdAt: string;
  scheduledAt?: string | null;
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
  status:
    | "pending"
    | "accepted"
    | "arrived"
    | "in_progress"
    | "rejected"
    | "cancelled"
    | "completed";
}
