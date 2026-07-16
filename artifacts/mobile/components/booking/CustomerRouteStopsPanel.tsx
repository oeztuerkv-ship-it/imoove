import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { rs, rf } from "@/utils/scale";

const ROUTE_PANEL_BORDER = "rgba(26, 26, 26, 0.14)";
const ROUTE_LINE_COLOR = "#B8B8B8";
const ROUTE_DOT_SIZE = rs(12);

/** Gleiche Fläche wie Zahlungs-Chip (z. B. Barzahlung) in der Live-Suche. */
export const CUSTOMER_ROUTE_MUTED_BG = "#F9FAFB";
/** @deprecated Alias — bitte CUSTOMER_ROUTE_MUTED_BG nutzen */
export const CUSTOMER_ROUTE_DEST_MUTED_BG = CUSTOMER_ROUTE_MUTED_BG;

export function formatCustomerReservationPickupInRahmen(
  st: Date | string | null | undefined,
): string | null {
  if (st == null) return null;
  const d = st instanceof Date ? st : new Date(st);
  if (!Number.isFinite(d.getTime())) return null;
  const datePart = d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" });
  const timePart = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} · ${timePart} Uhr`;
}

export function splitCustomerRouteAddress(displayName: string | undefined): { street: string; city: string } {
  const raw = (displayName ?? "").trim();
  if (!raw || raw === "–") return { street: raw || "–", city: "" };
  const comma = raw.indexOf(",");
  if (comma > 0) {
    return { street: raw.slice(0, comma).trim(), city: raw.slice(comma + 1).trim() };
  }
  return { street: raw, city: "" };
}

function CustomerRouteStopTexts({
  kind,
  displayName,
}: {
  kind: "origin" | "destination";
  displayName: string;
}) {
  const isOrigin = kind === "origin";
  const { street, city } = splitCustomerRouteAddress(displayName);
  const labelColor = isOrigin ? "#16A34A" : "#DC2626";

  return (
    <View style={styles.stopTexts}>
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
  );
}

function CustomerRouteStopsPanelInner({
  originName,
  destName,
  mutedBackgroundColor,
}: {
  originName: string;
  destName: string;
  mutedBackgroundColor?: string;
}) {
  const panelRef = useRef<View>(null);
  const originDotRef = useRef<View>(null);
  const destDotRef = useRef<View>(null);
  const [connector, setConnector] = useState<{ left: number; top: number; height: number } | null>(null);

  const updateConnector = useCallback(() => {
    const panel = panelRef.current;
    const originDot = originDotRef.current;
    const destDot = destDotRef.current;
    if (!panel || !originDot || !destDot) return;

    originDot.measureLayout(
      panel,
      (ox, oy, ow, oh) => {
        destDot.measureLayout(
          panel,
          (_dx, dy, _dw, dh) => {
            const originCenterY = oy + oh / 2;
            const destCenterY = dy + dh / 2;
            const centerX = ox + ow / 2;
            const height = destCenterY - originCenterY;
            if (height >= rs(2)) {
              setConnector({
                left: centerX - StyleSheet.hairlineWidth,
                top: originCenterY,
                height,
              });
            }
          },
          () => {},
        );
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    updateConnector();
  }, [originName, destName, updateConnector]);

  return (
    <View
      ref={panelRef}
      style={[
        styles.panel,
        mutedBackgroundColor ? styles.panelMuted : styles.panelDefault,
        mutedBackgroundColor ? { backgroundColor: mutedBackgroundColor } : null,
      ]}
      onLayout={updateConnector}
    >
      {connector ? (
        <View
          pointerEvents="none"
          style={[
            styles.routeLineAbs,
            {
              left: connector.left,
              top: connector.top,
              height: connector.height,
            },
          ]}
        />
      ) : null}

      <View style={styles.stopRow}>
        <View style={styles.gutterCol}>
          <View
            ref={originDotRef}
            onLayout={updateConnector}
            style={[styles.routeDot, { backgroundColor: "#22C55E" }]}
          />
        </View>
        <View style={styles.stopContent} onLayout={updateConnector}>
          <CustomerRouteStopTexts kind="origin" displayName={originName} />
        </View>
      </View>

      <View style={styles.stopRow}>
        <View style={styles.gutterCol}>
          <View
            ref={destDotRef}
            onLayout={updateConnector}
            style={[styles.routeDot, { backgroundColor: "#DC2626" }]}
          />
        </View>
        <View style={styles.stopContent} onLayout={updateConnector}>
          <CustomerRouteStopTexts kind="destination" displayName={destName} />
        </View>
      </View>
    </View>
  );
}

export function CustomerRouteStopsPanel({
  originName,
  destName,
  destinationBackgroundColor,
}: {
  originName: string;
  destName: string;
  /** Von + Ziel auf grauer Fläche (Live-Suche, wie Barzahlungs-Chip). */
  destinationBackgroundColor?: string;
}) {
  return (
    <CustomerRouteStopsPanelInner
      originName={originName}
      destName={destName}
      mutedBackgroundColor={destinationBackgroundColor}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ROUTE_PANEL_BORDER,
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    backgroundColor: "#FFFFFF",
  },
  panelDefault: {
    paddingVertical: rs(8),
    gap: rs(8),
  },
  panelMuted: {
    paddingVertical: rs(10),
    gap: rs(10),
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(12),
  },
  gutterCol: {
    width: ROUTE_DOT_SIZE,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: rs(3),
  },
  stopContent: {
    flex: 1,
    minWidth: 0,
    paddingVertical: rs(2),
  },
  routeLineAbs: {
    position: "absolute",
    width: 1,
    backgroundColor: ROUTE_LINE_COLOR,
  },
  stopTexts: { flex: 1, minWidth: 0 },
  routeDot: {
    width: ROUTE_DOT_SIZE,
    height: ROUTE_DOT_SIZE,
    borderRadius: ROUTE_DOT_SIZE / 2,
    flexShrink: 0,
  },
  routeKindLabel: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", marginBottom: 3, letterSpacing: 0.2 },
  routeStreet: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#111111" },
  routeCity: { fontSize: rf(14), fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: 2 },
});
