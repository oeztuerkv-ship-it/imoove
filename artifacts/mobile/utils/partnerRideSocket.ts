import { connectToRide, disconnectSocket } from "@/utils/socket";

/** Partner-Panel-JWT: Live-Position des Fahrers (WS-Room der Fahrt). */
export function connectPartnerRideSocket(
  rideId: string,
  token: string,
  onMessage: (msg: Record<string, unknown>) => void,
  onWsError?: (code: string) => void,
): void {
  connectToRide(
    rideId,
    onMessage,
    async () => token,
    onWsError,
  );
}

export function disconnectPartnerRideSocket(): void {
  disconnectSocket();
}
