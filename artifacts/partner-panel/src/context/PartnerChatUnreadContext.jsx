import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "./PanelAuthContext.jsx";
import {
  fetchPartnerChatUnreadSummary,
  getAllPartnerChatReadCursors,
  setPartnerChatReadCursor,
} from "../lib/partnerRideChat.js";

const CHAT_UNREAD_POLL_MS = 8_000;

const PartnerChatUnreadContext = createContext(null);

export function PartnerChatUnreadProvider({ children }) {
  const { token, user } = usePanelAuth();
  const userId = user?.id ?? "";
  const [chatUnreadByRide, setChatUnreadByRide] = useState({});

  const refreshChatUnread = useCallback(async () => {
    if (!token || !userId) {
      setChatUnreadByRide({});
      return;
    }
    const cursors = getAllPartnerChatReadCursors(userId);
    const result = await fetchPartnerChatUnreadSummary(token, cursors);
    if (!result.ok) return;
    const next = {};
    for (const row of result.rides) {
      if (row?.rideId && row.unreadCount > 0) next[row.rideId] = row.unreadCount;
    }
    setChatUnreadByRide(next);
  }, [token, userId]);

  useEffect(() => {
    void refreshChatUnread();
  }, [refreshChatUnread]);

  useEffect(() => {
    if (!token || !userId) return;
    const id = setInterval(() => void refreshChatUnread(), CHAT_UNREAD_POLL_MS);
    return () => clearInterval(id);
  }, [refreshChatUnread, token, userId]);

  const markChatRead = useCallback(
    (rideId, isoTimestamp) => {
      if (!userId || !rideId || !isoTimestamp) return;
      setPartnerChatReadCursor(userId, rideId, isoTimestamp);
      setChatUnreadByRide((prev) => {
        if (!prev[rideId]) return prev;
        const next = { ...prev };
        delete next[rideId];
        return next;
      });
      void refreshChatUnread();
    },
    [refreshChatUnread, userId],
  );

  const clearRideUnread = useCallback((rideId) => {
    if (!rideId) return;
    setChatUnreadByRide((prev) => {
      if (!prev[rideId]) return prev;
      const next = { ...prev };
      delete next[rideId];
      return next;
    });
  }, []);

  const totalUnread = useMemo(
    () => Object.values(chatUnreadByRide).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [chatUnreadByRide],
  );

  const value = useMemo(
    () => ({
      chatUnreadByRide,
      totalUnread,
      refreshChatUnread,
      markChatRead,
      clearRideUnread,
    }),
    [chatUnreadByRide, clearRideUnread, markChatRead, refreshChatUnread, totalUnread],
  );

  return <PartnerChatUnreadContext.Provider value={value}>{children}</PartnerChatUnreadContext.Provider>;
}

export function usePartnerChatUnread() {
  const ctx = useContext(PartnerChatUnreadContext);
  if (!ctx) {
    return {
      chatUnreadByRide: {},
      totalUnread: 0,
      refreshChatUnread: async () => {},
      markChatRead: () => {},
      clearRideUnread: () => {},
    };
  }
  return ctx;
}
