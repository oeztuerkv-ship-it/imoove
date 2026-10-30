import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { nativeMapViewProps } from "@/utils/nativeMapProvider";

type Position = { lat: number; lon: number };

/** Presentation only: no route requests, location subscriptions or offer state. */
export function DriverInstantOfferMap({ driverPos, pickup }: { driverPos?: Position | null; pickup?: Position | null }) {
  const points = [driverPos, pickup].filter(
    (p): p is Position => Boolean(p && Number.isFinite(p.lat) && Number.isFinite(p.lon)),
  );
  const latitudes = points.map((p) => p.lat);
  const longitudes = points.map((p) => p.lon);
  const region = points.length ? {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    latitudeDelta: Math.max(0.012, (Math.max(...latitudes) - Math.min(...latitudes)) * 1.8),
    longitudeDelta: Math.max(0.012, (Math.max(...longitudes) - Math.min(...longitudes)) * 1.8),
  } : null;

  return (
    <View style={s.map} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Platform.OS !== "web" && region ? (
        <MapView
          style={StyleSheet.absoluteFillObject}
          {...nativeMapViewProps()}
          region={region}
          showsCompass={false}
          showsMyLocationButton={false}
          showsPointsOfInterest={false}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
        >
          {driverPos && Number.isFinite(driverPos.lat) && Number.isFinite(driverPos.lon) ? (
            <Marker coordinate={{ latitude: driverPos.lat, longitude: driverPos.lon }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={s.driverMarker}><Feather name="navigation" size={22} color="#2563EB" /></View>
            </Marker>
          ) : null}
          {pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lon) ? (
            <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lon }} pinColor="#DC2626" />
          ) : null}
        </MapView>
      ) : (
        <View style={s.mapFallback}><Feather name="map-pin" size={28} color="#6B7280" /><Text style={s.mapFallbackText}>Neue Fahrtanfrage</Text></View>
      )}
    </View>
  );
}

type OfferViewProps = {
  secondsLeft: number;
  countdownSeconds: number;
  reach: { minLabel: string; kmLabel: string } | null;
  reachPendingLabel: string;
  passengerLabel: string;
  premiumRoute: boolean;
  fromLine: string;
  toLine: string;
  distanceKm: number;
  estimatedFare: number;
  paymentUi: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; label: string; iconColor: string };
  acceptLabel: string;
  rejectLabel: string;
  secondsLabel: string;
  onAccept: () => void;
  onReject: () => void;
  showReleaseButton?: boolean;
  onRelease?: () => void;
  releaseBusy?: boolean;
  focused?: boolean;
  bottomInset?: number;
  followUpLabel?: string;
  moreOffersLabel?: string;
};

/** All values, visibility rules and actions are supplied by the existing InstantCard. */
export function DriverInstantOfferView(props: OfferViewProps) {
  const { reach, paymentUi } = props;
  return (
    <View style={[s.card, props.focused ? s.focusedCard : s.listCard]}>
      {props.focused ? <View style={s.handle} /> : null}
      <View style={s.header}>
        <Text style={s.title}>Neue Anfrage</Text>
        <Text style={s.countdown} accessibilityLabel={`${props.secondsLeft} ${props.secondsLabel}`}>
          {props.secondsLeft} {props.secondsLabel}
        </Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${Math.min(100, Math.max(0, props.secondsLeft / props.countdownSeconds * 100))}%` }]} />
      </View>
      <ScrollView style={s.detailsScroll} contentContainerStyle={s.details} showsVerticalScrollIndicator nestedScrollEnabled>
        {props.followUpLabel ? <View style={s.followUp}><Feather name="navigation" size={14} color="#166534" /><Text style={s.followUpText}>{props.followUpLabel}</Text></View> : null}
        <Text style={reach ? s.reachTime : s.reachPending}>{reach ? reach.minLabel : props.reachPendingLabel}</Text>
        {reach ? <Text style={s.reachDistance}>{reach.kmLabel} zur Abholung</Text> : null}
        {props.passengerLabel ? <Text style={s.passenger}>{props.passengerLabel}</Text> : null}
        {props.premiumRoute ? (
          <View style={s.route}>
            <View style={s.routeMarkers}><View style={s.pickupDot} /><View style={s.routeConnector} /><View style={s.destinationDot} /></View>
            <View style={s.addresses}>
              <View><Text style={s.addressLabel}>ABHOLUNG</Text><Text style={s.address}>{props.fromLine}</Text></View>
              <View><Text style={s.addressLabel}>ZIEL</Text><Text style={s.address}>{props.toLine}</Text></View>
            </View>
          </View>
        ) : (
          <Text style={s.hiddenRoute}>Route und Adressen werden nach Annahme sichtbar.</Text>
        )}
        <View style={s.summary}>
          <View style={s.summaryValues}>
            {props.premiumRoute && props.distanceKm > 0 ? <Text style={s.tripDistance}>Fahrt {props.distanceKm.toFixed(1).replace(".", ",")} km</Text> : null}
            {props.estimatedFare > 0 ? <Text style={s.price}>ca. {props.estimatedFare.toFixed(2).replace(".", ",")} €</Text> : null}
          </View>
          <View style={s.summaryMeta}>
            {props.estimatedFare > 0 ? <Text style={s.summaryText}>Geschätzter Fahrpreis</Text> : null}
            {props.premiumRoute ? <View style={s.payment}><MaterialCommunityIcons name={paymentUi.icon} size={16} color="#4B5563" /><Text style={s.summaryText}>{paymentUi.label}</Text></View> : null}
          </View>
        </View>
        {props.moreOffersLabel ? <Text style={s.moreOffers}>{props.moreOffersLabel}</Text> : null}
      </ScrollView>
      <View style={[s.footer, props.focused && { paddingBottom: Math.max(props.bottomInset ?? 0, 16) }]}>
        {props.showReleaseButton && props.onRelease ? (
          <Pressable accessibilityRole="button" onPress={props.onRelease} disabled={props.releaseBusy} style={({ pressed }) => [s.release, (pressed || props.releaseBusy) && s.pressed]}>
            <Text style={s.releaseText}>{props.releaseBusy ? "Freigabe …" : "Freigeben"}</Text>
          </Pressable>
        ) : null}
        <View style={s.actions}>
          <Pressable accessibilityRole="button" onPress={props.onReject} accessibilityLabel={props.rejectLabel} style={({ pressed }) => [s.reject, pressed && s.pressed]}>
            <Text style={s.rejectText}>{props.rejectLabel}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={props.onAccept} style={({ pressed }) => [s.accept, pressed && s.pressed]}>
            <Feather name="check" size={22} color="#FFFFFF" /><Text style={s.acceptText}>{props.acceptLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  map: { flex: 1, minHeight: 90, backgroundColor: "#E5E7EB" },
  mapFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  mapFallbackText: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#4B5563" },
  driverMarker: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#DBEAFE", borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#FFFFFF", overflow: "hidden", flexShrink: 1 },
  focusedCard: { maxHeight: "74%", borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -20 },
  listCard: { marginHorizontal: 14, marginBottom: 14, borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginTop: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { flex: 1, fontSize: 21, fontFamily: "Inter_700Bold", color: "#111827" },
  countdown: { flexShrink: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: "#374151", fontVariant: ["tabular-nums"] },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", marginHorizontal: 20, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: "#DC2626", borderRadius: 2 },
  detailsScroll: { flexShrink: 1, minHeight: 0 },
  details: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  reachTime: { fontFamily: "Inter_700Bold", fontSize: 38, lineHeight: 46, letterSpacing: -1.2, color: "#111827" },
  reachPending: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: "#374151" },
  reachDistance: { fontFamily: "Inter_500Medium", fontSize: 16, color: "#4B5563", marginTop: 2 },
  passenger: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#4B5563", marginTop: 12 },
  route: { flexDirection: "row", gap: 14, marginTop: 18 },
  routeMarkers: { width: 16, alignItems: "center", paddingTop: 5, paddingBottom: 25 },
  pickupDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 4, borderColor: "#DC2626", backgroundColor: "#FFFFFF" },
  routeConnector: { width: 1, flex: 1, minHeight: 24, backgroundColor: "#9CA3AF", marginVertical: 5 },
  destinationDot: { width: 13, height: 13, borderRadius: 3, backgroundColor: "#111827" },
  addresses: { flex: 1, minWidth: 0, gap: 16 },
  addressLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.6, color: "#4B5563", marginBottom: 4 },
  address: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 23, color: "#111827" },
  hiddenRoute: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 21, color: "#4B5563", marginTop: 18 },
  summary: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#D1D5DB", marginTop: 18, paddingTop: 14, gap: 7 },
  summaryValues: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  tripDistance: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#111827" },
  price: { fontFamily: "Inter_700Bold", fontSize: 21, color: "#111827", marginLeft: "auto" },
  summaryMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  summaryText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#4B5563" },
  payment: { flexDirection: "row", alignItems: "center", gap: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB", backgroundColor: "#FFFFFF" },
  actions: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  reject: { flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: "#6B7280", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 12 },
  rejectText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#111827", textAlign: "center" },
  accept: { flex: 1.4, minHeight: 56, flexDirection: "row", gap: 8, borderRadius: 14, backgroundColor: "#0B5038", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 12 },
  acceptText: { flexShrink: 1, fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF", textAlign: "center" },
  release: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 10, paddingVertical: 10 },
  releaseText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#1D4ED8" },
  pressed: { opacity: 0.75 },
  followUp: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#DCFCE7", padding: 10, borderRadius: 10, marginBottom: 12 },
  followUpText: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#166534" },
  moreOffers: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#4B5563", marginTop: 12 },
});
