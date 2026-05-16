import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? "";

type PlaceDetail = {
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: {
    open_now: boolean;
    weekday_text: string[];
  };
  geometry: { location: { lat: number; lng: number } };
  types: string[];
};

export default function OrteDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { placeId, placeName, placeAddr, katColor, katBg, katIcon } = useLocalSearchParams<{
    placeId: string;
    placeName: string;
    placeAddr: string;
    katColor: string;
    katBg: string;
    katIcon: string;
  }>();

  const [detail, setDetail] = useState<PlaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,opening_hours,geometry,types&language=de&key=${GOOGLE_PLACES_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        setDetail(data.result ?? null);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [placeId]);

  const handleCopy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCall = () => {
    if (detail?.formatted_phone_number) {
      const phone = detail.formatted_phone_number.replace(/\s/g, "");
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleMaps = () => {
    const lat = detail?.geometry.location.lat;
    const lng = detail?.geometry.location.lng;
    const name = encodeURIComponent(detail?.name ?? "");
    const googleUrl = `comgooglemaps://?daddr=${lat},${lng}&q=${name}`;
    const appleUrl = `maps://maps.apple.com/?daddr=${lat},${lng}&q=${name}`;
    const googleWeb = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Abbrechen", "Google Maps", "Apple Maps"], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) Linking.openURL(googleUrl).catch(() => Linking.openURL(googleWeb));
          if (idx === 2) Linking.openURL(appleUrl);
        }
      );
    } else {
      Linking.openURL(googleWeb);
    }
  };

  const handleTaxi = () => {
    const addr = detail?.formatted_address ?? placeAddr;
    router.push(`/?dest=${encodeURIComponent(addr)}` as any);
  };

  const isOpen = detail?.opening_hours?.open_now;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{placeName}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#EF1D26" style={{ marginTop: 40 }} />
      ) : !detail ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>Keine Details gefunden.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: rs(16), gap: rs(12), paddingBottom: 40 }}>

          {/* Status Badge */}
          {detail.opening_hours && (
            <View style={[styles.statusBadge, { backgroundColor: isOpen ? "#E1F5EE" : "#FCEBEB" }]}>
              <View style={[styles.statusDot, { backgroundColor: isOpen ? "#0F6E56" : "#A32D2D" }]} />
              <Text style={[styles.statusText, { color: isOpen ? "#0F6E56" : "#A32D2D" }]}>
                {isOpen ? "Jetzt geöffnet" : "Geschlossen"}
              </Text>
            </View>
          )}

          {/* Info Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Adresse */}
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={16} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>{detail.formatted_address}</Text>
              <Pressable onPress={() => handleCopy(detail.formatted_address, "addr")} hitSlop={8}>
                <Feather name={copiedKey === "addr" ? "check" : "copy"} size={15} color={copiedKey === "addr" ? "#0F6E56" : colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Telefon */}
            {detail.formatted_phone_number && (
              <View style={[styles.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: rs(10), marginTop: rs(10) }]}>
                <Feather name="phone" size={16} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: "#185FA5" }]}>{detail.formatted_phone_number}</Text>
                <Pressable onPress={() => handleCopy(detail.formatted_phone_number!, "phone")} hitSlop={8}>
                  <Feather name={copiedKey === "phone" ? "check" : "copy"} size={15} color={copiedKey === "phone" ? "#0F6E56" : colors.mutedForeground} />
                </Pressable>
              </View>
            )}

            {/* Website */}
            {detail.website && (
              <View style={[styles.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: rs(10), marginTop: rs(10) }]}>
                <Feather name="globe" size={16} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: "#185FA5" }, { flex: 1 }]} numberOfLines={1}>{detail.website}</Text>
                <Pressable onPress={() => Linking.openURL(detail.website!)} hitSlop={8}>
                  <Feather name="external-link" size={15} color={colors.mutedForeground} />
                </Pressable>
              </View>
            )}
          </View>

          {/* Öffnungszeiten */}
          {detail.opening_hours?.weekday_text && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Öffnungszeiten</Text>
              {detail.opening_hours.weekday_text.map((line, i) => (
                <Text key={i} style={[styles.hoursLine, { color: colors.mutedForeground }]}>{line}</Text>
              ))}
            </View>
          )}

          {/* Aktionen */}
          <View style={styles.actionsRow}>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={handleMaps}>
              <Feather name="navigation" size={18} color="#185FA5" />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Navi</Text>
            </Pressable>
            {detail.formatted_phone_number && (
              <Pressable style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={handleCall}>
                <Feather name="phone" size={18} color="#0F6E56" />
                <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Anrufen</Text>
              </Pressable>
            )}
          </View>

          {/* Taxi bestellen */}
          <Pressable style={styles.taxiBtn} onPress={handleTaxi}>
            <Feather name="navigation-2" size={18} color="#fff" />
            <Text style={styles.taxiBtnText}>Taxi hierhin bestellen</Text>
          </Pressable>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: rs(16), paddingBottom: rs(12), borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: rf(16), fontFamily: "Inter_600SemiBold", textAlign: "center", marginHorizontal: rs(8) },
  empty: { textAlign: "center", marginTop: rs(40), fontSize: rf(14), fontFamily: "Inter_400Regular" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: rs(8), paddingHorizontal: rs(14), paddingVertical: rs(8), borderRadius: rs(20), alignSelf: "flex-start" },
  statusDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  statusText: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: rs(12), borderWidth: StyleSheet.hairlineWidth, padding: rs(14) },
  cardTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold", marginBottom: rs(8) },
  infoRow: { flexDirection: "row", alignItems: "center", gap: rs(10) },
  infoText: { flex: 1, fontSize: rf(14), fontFamily: "Inter_400Regular" },
  hoursLine: { fontSize: rf(13), fontFamily: "Inter_400Regular", paddingVertical: rs(2) },
  actionsRow: { flexDirection: "row", gap: rs(10) },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), padding: rs(14), borderRadius: rs(12), borderWidth: StyleSheet.hairlineWidth },
  actionBtnText: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  taxiBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(10), backgroundColor: "#EF1D26", borderRadius: rs(12), padding: rs(16) },
  taxiBtnText: { color: "#fff", fontSize: rf(15), fontFamily: "Inter_600SemiBold" },
});
