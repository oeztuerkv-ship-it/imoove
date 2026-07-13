import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useRide } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { rf, rs } from "@/utils/scale";

type SupportCategory =
  | "driver_not_arrived"
  | "wrong_price"
  | "wrong_address"
  | "cancel_or_issue"
  | "payment_receipt"
  | "other";

const QUICK_CATEGORIES: { id: SupportCategory; label: string }[] = [
  { id: "driver_not_arrived", label: "Fahrer fehlt" },
  { id: "wrong_price", label: "Preis" },
  { id: "wrong_address", label: "Adresse" },
  { id: "cancel_or_issue", label: "Problem" },
  { id: "payment_receipt", label: "Zahlung" },
  { id: "other", label: "Sonstiges" },
];

type RidePick = {
  id: string;
  label: string;
  sub: string;
  active: boolean;
};

function formatRideSub(from: string, to: string) {
  const f = from.split(",")[0]?.trim() || from;
  const t = to.split(",")[0]?.trim() || to;
  return `${f} → ${t}`;
}

export default function CustomerRideSupportQuick({ onTicketCreated }: { onTicketCreated?: () => void }) {
  const colors = useColors();
  const { profile } = useUser();
  const { history } = useRide();
  const { myActiveRequests, myCancelledRequests } = useRideRequests();
  const sessionToken = profile.sessionToken?.trim() || "";
  const isLoggedIn = profile.isLoggedIn && sessionToken.length > 0;

  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [category, setCategory] = useState<SupportCategory>("other");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);

  const rides = useMemo<RidePick[]>(() => {
    const seen = new Set<string>();
    const out: RidePick[] = [];
    const push = (id: string, label: string, sub: string, active: boolean) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, label, sub, active });
    };
    for (const r of myActiveRequests) {
      push(r.id, "Aktive Fahrt", formatRideSub(r.from || "—", r.to || "—"), true);
    }
    for (const r of history.slice(0, 8)) {
      const label = r.status === "completed" ? "Abgeschlossen" : "Storniert";
      push(r.id, label, formatRideSub(r.origin || "—", r.destination || "—"), false);
    }
    for (const r of myCancelledRequests.slice(0, 3)) {
      push(r.id, "Storniert", formatRideSub(r.from || "—", r.to || "—"), false);
    }
    return out.slice(0, 10);
  }, [myActiveRequests, history, myCancelledRequests]);

  const selectedRide = rides.find((r) => r.id === selectedRideId) ?? null;

  async function submitRideTicket() {
    if (!selectedRideId) {
      Alert.alert("Fahrt wählen", "Bitte zuerst die betroffene Fahrt auswählen.");
      return;
    }
    if (!isLoggedIn) {
      Alert.alert("Anmeldung nötig", "Bitte melden Sie sich an.", [
        { text: "Abbrechen", style: "cancel" },
        { text: "Zum Konto", onPress: () => router.replace("/profile") },
      ]);
      return;
    }
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      Alert.alert("Verbindung", "API ist nicht konfiguriert.");
      return;
    }
    setSubmitting(true);
    setSentId(null);
    try {
      const text = message.trim();
      const res = await fetch(`${apiBase}/rides/${encodeURIComponent(selectedRideId)}/support`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          category,
          ...(text.length > 0 ? { message: text } : {}),
          source: "mobile_help_ride_quick",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; ticketId?: string; error?: string };
      if (res.status === 401 || res.status === 403) {
        Alert.alert("Nicht möglich", "Diese Fahrt konnte nicht zugeordnet werden.");
        return;
      }
      if (!res.ok || !data?.ok) {
        Alert.alert("Senden fehlgeschlagen", typeof data?.error === "string" ? data.error : "Bitte später erneut.");
        return;
      }
      setSentId(data.ticketId ?? "ok");
      setMessage("");
      onTicketCreated?.();
      if (data.ticketId) {
        router.push(`/support-ticket?id=${encodeURIComponent(data.ticketId)}`);
      }
    } catch {
      Alert.alert("Netzwerk", "Verbindung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Problem mit einer Fahrt?</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Bitte anmelden, um fahrtbezogenen Support zu nutzen.
        </Text>
        <Pressable onPress={() => router.replace("/profile")} style={styles.loginBtn}>
          <Text style={styles.loginBtnText}>Zum Konto / Anmelden</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
      <View style={styles.head}>
        <View style={[styles.iconTile, { backgroundColor: "#0F766E" }]}>
          <MaterialCommunityIcons name="car-connected" size={rs(20)} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Problem mit einer Fahrt?</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Fahrt wählen, kurz schildern — landet direkt im Support mit Fahrtbezug.
          </Text>
        </View>
      </View>

      {rides.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Noch keine Fahrten — nach der ersten Buchung können Sie hier Hilfe anfragen.
        </Text>
      ) : (
        <View style={styles.rideList}>
          {rides.map((r) => {
            const on = selectedRideId === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  setSelectedRideId(r.id);
                  setSentId(null);
                }}
                style={[
                  styles.rideChip,
                  {
                    borderColor: on ? "#0F766E" : HOME_SHEET_RIM,
                    backgroundColor: on ? "rgba(15,118,110,0.08)" : HOME_SHEET_INNER,
                  },
                ]}
              >
                <Text style={[styles.rideChipLabel, { color: on ? "#0F766E" : colors.foreground }]}>
                  {r.active ? "● " : ""}
                  {r.label}
                </Text>
                <Text style={[styles.rideChipSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {r.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedRide ? (
        <View style={styles.compose}>
          <Text style={[styles.composeLabel, { color: colors.mutedForeground }]}>
            Meldung zu: {selectedRide.sub}
          </Text>
          <View style={styles.catRow}>
            {QUICK_CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[
                    styles.catChip,
                    {
                      borderColor: on ? "#0F766E" : HOME_SHEET_RIM,
                      backgroundColor: on ? "#0F766E" : HOME_SHEET_INNER,
                    },
                  ]}
                >
                  <Text style={{ color: on ? "#fff" : colors.mutedForeground, fontSize: rf(12), fontFamily: "Inter_600SemiBold" }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Was ist passiert? (optional bei Kategorie)"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[
              styles.input,
              { color: colors.foreground, borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER },
            ]}
          />
          {sentId ? (
            <View style={styles.success}>
              <Feather name="check-circle" size={rs(16)} color="#16A34A" />
              <Text style={styles.successText}>
                Ticket eingegangen · Ref. {(sentId || "").slice(0, 10)}…
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => void submitRideTicket()}
            disabled={submitting}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: "#0F766E", opacity: submitting || pressed ? 0.8 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="send" size={rs(15)} color="#fff" />
            )}
            <Text style={styles.sendBtnText}>{submitting ? "Wird gesendet …" : "Fahrt-Problem melden"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: rs(16), borderWidth: 1, padding: rs(16), gap: rs(12) },
  head: { flexDirection: "row", gap: rs(12), alignItems: "flex-start" },
  iconTile: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(14),
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: rf(16), fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },
  empty: { fontSize: rf(13), fontFamily: "Inter_400Regular" },
  rideList: { gap: rs(8) },
  rideChip: { borderWidth: 1, borderRadius: rs(12), padding: rs(12) },
  rideChipLabel: { fontSize: rf(13), fontFamily: "Inter_600SemiBold" },
  rideChipSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: rs(2) },
  compose: { gap: rs(10) },
  composeLabel: { fontSize: rf(12), fontFamily: "Inter_500Medium" },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  catChip: { paddingVertical: rs(7), paddingHorizontal: rs(11), borderRadius: rs(20), borderWidth: 1 },
  input: {
    minHeight: rs(88),
    borderWidth: 1,
    borderRadius: rs(12),
    padding: rs(12),
    fontSize: rf(14),
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
  success: { flexDirection: "row", alignItems: "center", gap: rs(8) },
  successText: { fontSize: rf(13), fontFamily: "Inter_600SemiBold", color: "#166534" },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    paddingVertical: rs(14),
    borderRadius: rs(14),
  },
  sendBtnText: { color: "#fff", fontSize: rf(15), fontFamily: "Inter_600SemiBold" },
  loginBtn: {
    marginTop: rs(4),
    paddingVertical: rs(12),
    borderRadius: rs(12),
    backgroundColor: "#0F766E",
    alignItems: "center",
  },
  loginBtnText: { color: "#fff", fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
});
