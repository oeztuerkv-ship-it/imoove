import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { rs, rf } from "@/utils/scale";

const ROUTE_PANEL_BORDER = "rgba(26, 26, 26, 0.14)";

export function splitCustomerRouteAddress(displayName: string | undefined): { street: string; city: string } {
  const raw = (displayName ?? "").trim();
  if (!raw || raw === "–") return { street: raw || "–", city: "" };
  const comma = raw.indexOf(",");
  if (comma > 0) {
    return { street: raw.slice(0, comma).trim(), city: raw.slice(comma + 1).trim() };
  }
  return { street: raw, city: "" };
}

function CustomerRouteStop({ kind, displayName }: { kind: "origin" | "destination"; displayName: string }) {
  const isOrigin = kind === "origin";
  const { street, city } = splitCustomerRouteAddress(displayName);
  const dotColor = isOrigin ? "#22C55E" : "#DC2626";
  const labelColor = isOrigin ? "#16A34A" : "#DC2626";

  return (
    <View style={styles.routeRow}>
      <View style={[styles.routeDot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.routeKindLabel, { color: labelColor }]}>{isOrigin ? "Von" : "Ziel"}</Text>
        <Text style={styles.routeStreet} numberOfLines={1}>
          {street}
        </Text>
        {city ? (
          <Text style={styles.routeCity} numberOfLines={1}>
            {city}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function CustomerRouteStopsPanel({
  originName,
  destName,
}: {
  originName: string;
  destName: string;
}) {
  return (
    <View style={styles.panel}>
      <CustomerRouteStop kind="origin" displayName={originName} />
      <View style={styles.routeLine} />
      <CustomerRouteStop kind="destination" displayName={destName} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ROUTE_PANEL_BORDER,
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    backgroundColor: "#FFFFFF",
  },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: rs(12), paddingVertical: rs(3) },
  routeDot: { width: rs(12), height: rs(12), borderRadius: rs(6), flexShrink: 0, marginTop: rs(4) },
  routeLine: {
    width: 1,
    height: rs(30),
    marginLeft: rs(5.5),
    marginVertical: -rs(1),
    backgroundColor: "#B8B8B8",
  },
  routeKindLabel: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", marginBottom: 3, letterSpacing: 0.2 },
  routeStreet: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#111111" },
  routeCity: { fontSize: rf(14), fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: 2 },
});
