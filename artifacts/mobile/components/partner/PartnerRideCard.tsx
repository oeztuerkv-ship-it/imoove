import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import type { PartnerRideRow } from "@/utils/partnerApi";
import {
  isPartnerRideCancellable,
  isPartnerSearchTimeout,
  partnerSearchPhaseLabel,
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
  onRetrySearch: (ride: PartnerRideRow) => void;
  onRemoveFromList: (ride: PartnerRideRow) => void;
  acceptedInfo?: { driverName?: string | null; plate?: string | null; etaLabel?: string };
};

export function PartnerRideCard({ ride, onDetails, onCancel, onRetrySearch, onRemoveFromList, acceptedInfo }: Props) {
  const shortId = partnerRideShortId(ride.id);
  const cancellable = isPartnerRideCancellable(ride.status);
  const note = partnerRideDriverNote(ride);
  const timedOut = isPartnerSearchTimeout(ride);
  const showAcceptedInfo = ride.status === "accepted";
  const statusVisual = partnerRideStatusVisual(ride);
  const searchPhaseText = statusVisual.loading ? partnerSearchPhaseLabel(ride) : null;

  return (
    <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
      <View style={styles.topRow}>
        <Text style={styles.rideId}>Fahrt #{shortId}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusVisual.bg }]}>
          {statusVisual.loading ? <ActivityIndicator size="small" color={statusVisual.accent} /> : null}
          <Text style={[styles.statusText, { color: statusVisual.text }]}>{partnerRideStatusHumanLabel(ride)}</Text>
        </View>
      </View>
      {searchPhaseText ? (
        <Text style={styles.searchHint}>{searchPhaseText}</Text>
      ) : null}
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
          <Text style={styles.acceptedInfoLine}>Fahrer: {acceptedInfo?.driverName?.trim() || "wird zugewiesen"}</Text>
          <Text style={styles.acceptedInfoLine}>Kennzeichen: {acceptedInfo?.plate?.trim() || "folgt"}</Text>
          <Text style={styles.acceptedInfoLine}>ETA: {acceptedInfo?.etaLabel || "wird berechnet"}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {timedOut ? (
          <>
            <Pressable style={styles.secondaryBtn} onPress={() => onRetrySearch(ride)}>
              <Text style={styles.secondaryBtnText}>Erneut versuchen</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => onRemoveFromList(ride)}>
              <Text style={styles.secondaryBtnText}>Aus Liste entfernen</Text>
            </Pressable>
          </>
        ) : null}
        {!timedOut && cancellable ? (
          <Pressable style={styles.secondaryBtn} onPress={() => onCancel(ride)}>
            <Text style={styles.secondaryBtnText}>Stornieren</Text>
          </Pressable>
        ) : null}
        {!timedOut ? (
          <Pressable style={styles.primaryBtn} onPress={() => onDetails(ride.id)}>
            <Feather name="map" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Details</Text>
          </Pressable>
        ) : null}
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
  rideId: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#111" },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  searchHint: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#B45309", marginBottom: 6 },
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
  acceptedInfoLine: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151" },
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#374151" },
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
