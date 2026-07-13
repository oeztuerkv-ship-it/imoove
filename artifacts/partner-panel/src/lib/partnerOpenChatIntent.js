const STORAGE_KEY = "onroda_panel_open_chat_ride_id";

/** Nach Partner-Buchung: Fahrt-Chat auf der Fahrtenliste automatisch öffnen. */
export function setPartnerOpenChatRideIntent(rideId) {
  const id = String(rideId ?? "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function peekPartnerOpenChatRideIntent() {
  try {
    return sessionStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function clearPartnerOpenChatRideIntent() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function consumePartnerOpenChatRideIntent() {
  const id = peekPartnerOpenChatRideIntent();
  if (id) clearPartnerOpenChatRideIntent();
  return id;
}
