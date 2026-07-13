import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";

import { RideChatModal } from "@/components/ride-chat/RideChatModal";
import type { RequestStatus } from "@/context/RideRequestContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import {
  apiMessageToRideChatMessage,
  isRideChatSendAllowed,
  mergeRideChatMessages,
  mergeRideChatMessagesFromApi,
  rideChatMessageId,
  rideChatMessagesFromApi,
  type RideChatMessage,
} from "@/utils/rideChat";
import { fetchFleetRideChatMessages, sendFleetRideChatMessage } from "@/utils/rideChatApi";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const QUICK_REPLIES = ["Bin unterwegs", "Bin angekommen", "Bitte kurz warten", "Kann ich Sie anrufen?"];

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

type Props = {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  rideStatus: RequestStatus;
  chatEnabled?: boolean;
};

export function DriverRideChatModal({ visible, onClose, rideId, rideStatus, chatEnabled }: Props) {
  const [liveChatEnabled, setLiveChatEnabled] = useState(Boolean(chatEnabled));
  const [liveStatus, setLiveStatus] = useState<RequestStatus>(rideStatus);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<RideChatMessage[]>([]);
  const [partnerDisplayName, setPartnerDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSend = isRideChatSendAllowed(liveStatus, liveChatEnabled);

  useEffect(() => {
    setLiveChatEnabled(Boolean(chatEnabled));
    setLiveStatus(rideStatus);
  }, [chatEnabled, rideStatus, rideId]);

  const loadMessages = useCallback(async () => {
    const id = rideId.trim();
    if (!id) return;
    try {
      const headers = await fleetAuthHeadersJson();
      const { items, partnerDisplayName } = await fetchFleetRideChatMessages(id, headers);
      if (partnerDisplayName) setPartnerDisplayName(partnerDisplayName);
      setChatMsgs((prev) => mergeRideChatMessagesFromApi(prev, rideChatMessagesFromApi(items)));
    } catch {
      /* ignore */
    }
  }, [rideId]);

  useEffect(() => {
    if (!visible) return;
    setChatInput("");
    const id = rideId.trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const headers = await fleetAuthHeadersJson();
        const apiBase = getApiBaseUrl();
        const statusRes = await fetch(
          `${apiBase}/fleet-driver/v1/rides/${encodeURIComponent(id)}/live-status`,
          { cache: "no-store", headers },
        );
        if (statusRes.ok) {
          const payload = (await statusRes.json()) as { chatEnabled?: boolean; status?: string };
          if (!cancelled && typeof payload.chatEnabled === "boolean") {
            setLiveChatEnabled(payload.chatEnabled);
          }
          if (!cancelled && typeof payload.status === "string" && payload.status) {
            setLiveStatus(payload.status as RequestStatus);
          }
        }
        if (!cancelled) await loadMessages();
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const poll = setInterval(() => {
      if (!cancelled) void loadMessages();
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [loadMessages, visible, rideId]);

  const sendMessage = useCallback(async () => {
    const msg = chatInput.trim();
    const id = rideId.trim();
    if (!msg || !id || !canSend) return;
    const pendingId = rideChatMessageId(`pending-${Date.now()}`, "driver", msg);
    setChatMsgs((prev) =>
      mergeRideChatMessages(prev, {
        id: pendingId,
        from: "driver",
        text: msg,
        pending: true,
      }),
    );
    setChatInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const headers = await fleetAuthHeadersJson();
      const result = await sendFleetRideChatMessage(id, msg, headers, `dm-${Date.now()}`);
      if (result.ok) {
        setChatMsgs((prev) => mergeRideChatMessages(prev, apiMessageToRideChatMessage(result.message)));
      }
    } catch {
      /* pending bleibt bis Reload */
    }
  }, [canSend, chatInput, rideId]);

  if (!liveChatEnabled) return null;

  return (
    <RideChatModal
      visible={visible}
      onClose={onClose}
      viewerRole="driver"
      partnerDisplayName={partnerDisplayName}
      messages={chatMsgs}
      loading={loading}
      canSend={canSend}
      input={chatInput}
      onInputChange={setChatInput}
      onSend={sendMessage}
      quickReplies={QUICK_REPLIES}
      onQuickReply={(q) => setChatInput(q)}
      emptyHint="Noch keine Nachrichten. Schreiben Sie dem Kunden."
    />
  );
}
