import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams, usePathname, useSegments, type Href } from "expo-router";
import React, { useEffect } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabBar, BOTTOM_TAB_BAR_HOME_OFFSET_Y, tabMainScreenScrollPaddingBottom } from "@/components/BottomTabBar";
import {
  accountSheetHeaderTitle,
  accountSheetPrimaryLabel,
  accountSheetSecondaryLabel,
} from "@/constants/accountSheetTypography";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { rs } from "@/utils/scale";

type BookingCard = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
};

export default function BookingCenterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;

  const pathname = usePathname();
  const segments = useSegments();
  const params = useLocalSearchParams();

  useEffect(() => {
    console.log(
      `[NAV TRACE] MOUNT ${pathname}`,
      JSON.stringify(
        {
          screen: "booking-center",
          pathname,
          segments,
          params,
        },
        null,
        2,
      ),
    );
    return () => {
      console.log(`[NAV TRACE] UNMOUNT ${pathname}`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- NAV trace: einmaliger Mount-Log
  }, []);

  useEffect(() => {
    console.log(
      `[NAV TRACE] UPDATE ${pathname}`,
      JSON.stringify(
        {
          screen: "booking-center",
          pathname,
          segments,
          params,
        },
        null,
        2,
      ),
    );
  }, [pathname, JSON.stringify(params), JSON.stringify(segments)]);

  const cards: BookingCard[] = [
    {
      key: "instant",
      title: "Jetzt fahren",
      subtitle: "Start & Ziel eingeben – Fahrer kommt sofort.",
      icon: "navigation",
      onPress: () => router.replace("/?openBooking=instant"),
    },
    {
      key: "reserve",
      title: "Reservierung",
      subtitle: "Fahrt für später planen – Datum & Uhrzeit wählen.",
      icon: "calendar",
      onPress: () => router.replace("/new-booking"),
    },
    {
      key: "fixed",
      title: "Festpreis",
      subtitle: "Außerhalb Stuttgart/Esslingen — verbindlicher Preis vor der Buchung.",
      icon: "tag",
      onPress: () => router.replace("/booking-fixed-price"),
    },
    {
      key: "medical",
      title: "Krankenfahrt",
      subtitle: "Fahrtrelevante Angaben ohne Diagnose speichern.",
      icon: "heart",
      onPress: () => router.replace("/booking-medical"),
    },
    {
      key: "series",
      title: "Serienfahrt",
      subtitle: "Wiederkehrende Krankenfahrten über Zeitraum anlegen.",
      icon: "repeat",
      onPress: () => router.replace("/booking-medical?mode=series"),
    },
    {
      key: "qr",
      title: "QR-Code / Code einlösen",
      subtitle: "Genehmigung/Buchung aufrufen und später automatisch prüfen.",
      icon: "maximize",
      onPress: () => router.replace("/booking-qr"),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Buchungszentrale</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) }]}
      >
        <View style={[styles.cardGroup, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
          {cards.map((c, index) => (
            <Pressable
              key={c.key}
              onPress={c.onPress}
              style={({ pressed }) => [
                styles.cardRow,
                pressed && { backgroundColor: HOME_SHEET_INNER },
                index < cards.length - 1 && styles.cardRowDivider,
                index < cards.length - 1 && { borderBottomColor: HOME_SHEET_RIM },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
                <Feather name={c.icon} size={16} color={colors.foreground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.title}</Text>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{c.subtitle}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
        <View style={[styles.notice, { backgroundColor: "#ECFDF5", borderColor: "#BBF7D0" }]}>
          <View style={styles.noticeIconWrap}>
            <MaterialCommunityIcons name="shield-check-outline" size={16} color="#16A34A" />
          </View>
          <Text style={[styles.noticeText, { color: colors.foreground }]}>
            ONRODA speichert nur fahrtrelevante Daten für Disposition, Nachweis und Abrechnung.
          </Text>
        </View>
      </ScrollView>
      <BottomTabBar active="buchen" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: accountSheetHeaderTitle,
  scroll: {
    paddingHorizontal: rs(8),
    paddingTop: rs(24),
    gap: rs(16),
  },
  cardGroup: {
    borderRadius: rs(16),
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardRow: {
    paddingVertical: rs(14),
    paddingHorizontal: rs(16),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
  },
  cardRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(9),
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: accountSheetPrimaryLabel,
  cardSub: { ...accountSheetSecondaryLabel, marginTop: rs(2) },
  notice: {
    borderRadius: rs(16),
    borderWidth: StyleSheet.hairlineWidth,
    padding: rs(16),
    flexDirection: "row",
    gap: rs(10),
    alignItems: "center",
  },
  noticeIconWrap: {
    alignSelf: "center",
    paddingTop: rs(1),
  },
  noticeText: { flex: 1, ...accountSheetSecondaryLabel },
});

