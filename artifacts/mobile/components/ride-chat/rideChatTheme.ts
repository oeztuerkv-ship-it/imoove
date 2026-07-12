import type { RideChatUiSender } from "@/utils/rideChat";

export type RideChatViewerRole = "customer" | "driver" | "partner";

export type RideChatBubbleVariant = "out" | "in-peer" | "system";

export function rideChatBubbleVariant(
  viewer: RideChatViewerRole,
  from: RideChatUiSender,
): RideChatBubbleVariant {
  if (from === "booking_note") return "system";
  if (from === viewer) return "out";
  return "in-peer";
}

export const RIDE_CHAT_THEME = {
  threadBg: "#ECEFF1",
  panelBg: "#FFFFFF",
  out: {
    bg: "#DCFCE7",
    border: "#86EFAC",
    text: "#14532D",
    meta: "#166534",
    align: "flex-end" as const,
    radius: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 4 },
  },
  inPeer: {
    bg: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E3A8A",
    meta: "#1D4ED8",
    align: "flex-start" as const,
    radius: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 4, borderBottomRightRadius: 18 },
  },
  system: {
    bg: "#F3F4F6",
    border: "#E5E7EB",
    text: "#4B5563",
    meta: "#6B7280",
    align: "center" as const,
    radius: { borderRadius: 12 },
  },
  timestamp: "#9CA3AF",
  composerBg: "#FFFFFF",
  sendBtn: "#16A34A",
} as const;

export function formatRideChatTimestamp(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
