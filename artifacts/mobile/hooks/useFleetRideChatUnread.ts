import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RideChatApiMessage } from "@/utils/rideChatApi";
import { fetchFleetRideChatMessages } from "@/utils/rideChatApi";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const CHAT_UNREAD_POLL_MS = 10_000;

async function fleetAuthHeadersJson(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { authToken?: string };
      const tok = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
      if (tok) h.Authorization = `Bearer ${tok}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}

function isIncomingForDriver(m: RideChatApiMessage): boolean {
  return m.senderKind !== "driver";
}

export function useFleetRideChatUnread(rideId: string, chatEnabled: boolean, chatOpen: boolean) {
  const [unread, setUnread] = useState(false);
  const lastSeenIdRef = useRef("");
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  const markReadFromMessages = useCallback((items: RideChatApiMessage[]) => {
    const last = items[items.length - 1];
    if (last?.id) {
      lastSeenIdRef.current = last.id;
      setUnread(false);
    }
  }, []);

  const notifyIncoming = useCallback(() => {
    if (!chatOpenRef.current) setUnread(true);
  }, []);

  const clearUnread = useCallback(() => setUnread(false), []);

  const evaluateUnread = useCallback((items: RideChatApiMessage[]) => {
    if (!items.length) return;
    if (chatOpenRef.current) {
      markReadFromMessages(items);
      return;
    }
    const lastSeen = lastSeenIdRef.current;
    if (!lastSeen) {
      const lastIncoming = [...items].reverse().find(isIncomingForDriver);
      if (lastIncoming) lastSeenIdRef.current = lastIncoming.id;
      return;
    }
    const seenIdx = items.findIndex((m) => m.id === lastSeen);
    const newer = seenIdx >= 0 ? items.slice(seenIdx + 1) : items;
    if (newer.some(isIncomingForDriver)) setUnread(true);
  }, [markReadFromMessages]);

  useEffect(() => {
    const id = rideId.trim();
    if (!id || !chatEnabled) {
      setUnread(false);
      lastSeenIdRef.current = "";
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const headers = await fleetAuthHeadersJson();
        const { items } = await fetchFleetRideChatMessages(id, headers);
        if (!cancelled) evaluateUnread(items);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), CHAT_UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [chatEnabled, evaluateUnread, rideId]);

  useEffect(() => {
    if (chatOpen) setUnread(false);
  }, [chatOpen]);

  return { unread, clearUnread, markReadFromMessages, notifyIncoming };
}
