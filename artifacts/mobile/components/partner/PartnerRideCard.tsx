import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import type { PartnerRideRow } from "@/utils/partnerApi";
import {
  isPartnerRideCancellable,
  isPartnerSearchTimeout,
  partnerRideShortId,
  partnerRideStatusHumanLabel,
  partnerRideStatusVisual,
  partnerRideDriverNote,
  partnerRideRouteLabel,
  partnerRideTimeLabel,
} from "@/utils/partnerRides";

const PARTNER_GREEN = "#15803D";

type Props = {
  ride: PartnerRideRow;
  onDetails: (rideId: string) => void;
  onCancel: (ride: PartnerRideRow) => void;
  onRemoveFromList: (ride: PartnerRideRow) => void;
  acceptedInfo?: { driverName?: string | null; plate?: string | null; etaLabel?: string };
  /** Live clock for search timeout / phase labels without leaving the screen. */
  nowMs?: number;
};

export function PartnerRideCard({
  ride,
  onDetails,
  onCancel,
  onRemoveFromList,
  acceptedInfo,
  nowMs = Date.now(),
}: Props) {
  const shortId = partnerRideShortId(ride.id);
  const cancellable = isPartnerRideCancellable(ride.status);
  const note = partnerRideDriverNote(ride);
  const timedOut = isPartnerSearchTimeout(ride, nowMs);
  const showAcceptedInfo = ride.status === "accepted";
  const statusVisual = partnerRideStatusVisual(ride, nowMs);

  const handleRemovePress = () => {
    console.log("[PartnerRideCard] hide pressed", ride.id);
    onRemoveFromList(ride);
  };

  return (
    <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
      <View style={styles.topRow}>
        <View style={[styles.statusPill, { backgroundColor: statusVisual.bg }]}>
          {statusVisual.loading ? (
            <MaterialCommunityIcons name="taxi" size={15} color={statusVisual.accent} />
          ) : timedOut ? (
            <Feather name="alert-circle" size={14} color={statusVisual.accent} />
          ) : null}
          <Text style={[styles.statusText, { color: statusVisual.text }]}>
            {partnerRideStatusHumanLabel(ride, nowMs)}
          </Text>
        </View>
      </View>
      <Text style={styles.route} numberOfLines={2}>
        {partnerRideRouteLabel(ride)}
      </Text>
      <Text style={styles.time}>{partnerRideTimeLabel(ride)}</Text>
      {note ? (
        <Text style={styles.note} numberOfLines={2}>
          Notiz: {note}
        </Text>
      ) : null}
      {showAcceptedInfo ? (
        <View style={styles.acceptedInfoBox}>
          <View style={styles.acceptedInfoLineRow}>
            <MaterialCommunityIcons name="taxi" size={16} color={PARTNER_GREEN} />
            <Text style={styles.acceptedInfoLine}>
              Fahrer: {acceptedInfo?.driverName?.trim() || "wird zugewiesen"}
            </Text>
          </View>
          <Text style={styles.acceptedInfoLine}>Kennzeichen: {acceptedInfo?.plate?.trim() || "folgt"}</Text>
          <Text style={styles.acceptedInfoLine}>ETA: {acceptedInfo?.etaLabel || "wird berechnet"}</Text>
        </View>
      ) : null}
      <View style={styles.actionFooter}>
        <View style={styles.rideIdBadge}>
          <Text style={styles.rideIdBadgeText}>{shortId}</Text>
        </View>
        {timedOut ? (
          <Pressable
            style={[styles.removeBtn, styles.timeoutRemoveBtn]}
            onPress={handleRemovePress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Aus Liste entfernen"
          >
            <Text style={styles.removeBtnText}>Aus Liste entfernen</Text>
          </Pressable>
        ) : (
          <View style={styles.actions}>
            {cancellable ? (
              <Pressable style={styles.secondaryBtn} onPress={() => onCancel(ride)}>
                <Text style={styles.secondaryBtnText}>Stornieren</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.primaryBtn} onPress={() => onDetails(ride.id)}>
              <Feather name="map" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Details</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  route: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#374151", lineHeight: 21 },
  time: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", marginTop: 6, marginBottom: 4 },
  note: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151", marginBottom: 10, fontStyle: "italic" },
  acceptedInfoBox: {
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 4,
  },
  acceptedInfoLineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  acceptedInfoLine: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151", flex: 1 },
  actionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  rideIdBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexShrink: 0,
  },
  rideIdBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#4B5563",
    letterSpacing: 0.3,
  },
  timeoutRemoveBtn: {
    flexShrink: 0,
    alignSelf: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    flex: 1,
    minWidth: 0,
    zIndex: 2,
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    backgroundColor: HOME_SHEET_PANEL,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#374151" },
  removeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EF4444",
    backgroundColor: "#EF4444",
  },
  removeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: PARTNER_GREEN,
  },
  primaryBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
