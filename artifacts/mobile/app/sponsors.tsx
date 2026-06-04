import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useDriver } from "@/context/DriverContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import { rf, rs } from "@/utils/scale";

const API_URL = getApiBaseUrl();

type SponsorItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  logoUrl: string | null;
  externalUrl: string | null;
  buttonText: string | null;
  qrCodeUrl: string | null;
  qrFromLink?: boolean;
  qrEnabled?: boolean;
  targetType?: string;
  targetValue?: string | null;
  category: string;
};
type OfferTab = "coupon" | "angebot" | "partnervorteile";

const TAB_LABELS: Record<OfferTab, string> = {
  coupon: "Coupons",
  angebot: "Angebote",
  partnervorteile: "Partner",
};

export default function SponsorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isLoggedIn: isDriverLoggedIn } = useDriver();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SponsorItem[]>([]);
  const [selected, setSelected] = useState<SponsorItem | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<OfferTab>("coupon");
  /** Nur beim ersten Laden: leeren Tab vermeiden — nicht bei manuellem Tab-Wechsel zurückspringen. */
  const didPickDefaultTabRef = useRef(false);

  const qrUrlFor = useCallback((it: SponsorItem | null): string | null => {
    if (!it) return null;
    if (it.qrEnabled === false) return null;
    const qr = it.qrCodeUrl?.trim();
    if (qr) return qr;
    const link = it.targetValue?.trim() || it.externalUrl?.trim() || "";
    if (it.qrFromLink && /^https:\/\//i.test(link)) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(link)}`;
    }
    return null;
  }, []);

  const classifyOfferTab = useCallback(
    (it: SponsorItem): OfferTab => {
      if (qrUrlFor(it)) return "coupon";
      const category = String(it.category ?? "").toLowerCase();
      if (category === "angebot" || category === "event") return "angebot";
      return "partnervorteile";
    },
    [qrUrlFor],
  );

  const filteredItems = useMemo(() => {
    return items.filter((it) => classifyOfferTab(it) === activeTab);
  }, [items, classifyOfferTab, activeTab]);

  const tabCounts = useMemo(
    () => ({
      coupon: items.filter((it) => classifyOfferTab(it) === "coupon").length,
      angebot: items.filter((it) => classifyOfferTab(it) === "angebot").length,
      partnervorteile: items.filter((it) => classifyOfferTab(it) === "partnervorteile").length,
    }),
    [items, classifyOfferTab],
  );

  useEffect(() => {
    if (loading || items.length === 0) {
      if (items.length === 0) didPickDefaultTabRef.current = false;
      return;
    }
    if (didPickDefaultTabRef.current) return;
    didPickDefaultTabRef.current = true;
    if (tabCounts.coupon > 0) {
      setActiveTab("coupon");
      return;
    }
    if (tabCounts.angebot > 0) {
      setActiveTab("angebot");
      return;
    }
    if (tabCounts.partnervorteile > 0) {
      setActiveTab("partnervorteile");
    }
  }, [loading, items.length, tabCounts]);

  const handleBack = useCallback(() => {
    if (qrOpen) {
      setQrOpen(false);
      return;
    }
    if (selected) {
      setSelected(null);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(isDriverLoggedIn ? "/driver/dashboard" : "/");
  }, [selected, qrOpen, isDriverLoggedIn]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack]),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        setLoading(true);
        try {
          const audience = isDriverLoggedIn ? "driver" : "customer";
          const res = await fetch(`${API_URL}/app/sponsors?audience=${encodeURIComponent(audience)}&limit=10`);
          if (!res.ok || cancelled) return;
          const data = await res.json().catch(() => null);
          if (!data?.ok || !Array.isArray(data.items) || cancelled) return;
          setItems(data.items as SponsorItem[]);
        } catch {
          if (!cancelled) setItems([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [isDriverLoggedIn]),
  );

  const tabKeys: OfferTab[] = ["coupon", "angebot", "partnervorteile"];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.muted }]}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {selected ? "Angebotsdetails" : "Exklusive Angebote"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : selected ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {selected.imageUrl ? (
              <Image source={{ uri: selected.imageUrl }} style={styles.heroLarge} resizeMode="cover" />
            ) : null}
            <View style={styles.body}>
              {selected.logoUrl ? (
                <Image source={{ uri: selected.logoUrl }} style={styles.logo} resizeMode="contain" />
              ) : null}
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{selected.title}</Text>
              <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>{selected.description}</Text>
              <View style={styles.actionsRow}>
                {(() => {
                  const link = selected.targetValue?.trim() || selected.externalUrl?.trim() || "";
                  const hasExternalLink = /^https:\/\//i.test(link);
                  return (
                    <>
                      {qrUrlFor(selected) ? (
                        <Pressable
                          style={[styles.actionBtnFull, { backgroundColor: colors.primary }]}
                          onPress={() => setQrOpen(true)}
                        >
                          <Text style={styles.actionText}>Rabatt nutzen</Text>
                        </Pressable>
                      ) : null}
                      {hasExternalLink ? (
                        <Pressable
                          style={[styles.actionBtnFull, { backgroundColor: colors.primary }]}
                          onPress={() => {
                            void WebBrowser.openBrowserAsync(link);
                          }}
                        >
                          <Text style={styles.actionText}>Mehr erfahren</Text>
                        </Pressable>
                      ) : null}
                    </>
                  );
                })()}
              </View>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.listHeading, { color: colors.foreground }]}>Rabatte & Partnervorteile</Text>
          <Text style={[styles.listLead, { color: colors.mutedForeground }]}>
            Coupons, Aktionen und Vorteile von Partnern in deiner Region.
          </Text>

          <View style={[styles.tabsShell, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            {tabKeys.map((tab) => {
              const active = activeTab === tab;
              const count = tabCounts[tab];
              return (
                <Pressable
                  key={tab}
                  style={[
                    styles.tabBtn,
                    active && { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text
                    style={[
                      styles.tabBtnText,
                      { color: active ? colors.foreground : colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {TAB_LABELS[tab]}
                  </Text>
                  {tab !== "partnervorteile" && count > 0 ? (
                    <Text
                      style={[
                        styles.tabCount,
                        { color: active ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {count}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {filteredItems.map((it) => (
            <Pressable
              key={it.id}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => setSelected(it)}
            >
              {it.imageUrl ? (
                <Image source={{ uri: it.imageUrl }} style={styles.hero} resizeMode="cover" />
              ) : null}
              <View style={styles.body}>
                {it.logoUrl ? (
                  <Image source={{ uri: it.logoUrl }} style={styles.logo} resizeMode="contain" />
                ) : null}
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{it.title}</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={3}>
                  {it.description}
                </Text>
                <View style={styles.cardChevronRow}>
                  <Text style={[styles.cardLink, { color: colors.primary }]}>Details ansehen</Text>
                  <Feather name="chevron-right" size={16} color={colors.primary} />
                </View>
              </View>
            </Pressable>
          ))}
          {filteredItems.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Für diesen Bereich sind aktuell keine Einträge verfügbar.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
      <Modal visible={qrOpen} animationType="slide" transparent onRequestClose={() => setQrOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQrOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rabatt nutzen</Text>
            {qrUrlFor(selected) ? (
              <Image source={{ uri: qrUrlFor(selected) ?? "" }} style={styles.qrBig} resizeMode="contain" />
            ) : (
              <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>Kein QR-Code verfügbar.</Text>
            )}
            <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>An der Kasse vorzeigen</Text>
            <Pressable style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]} onPress={() => setQrOpen(false)}>
              <Text style={styles.actionText}>Schließen</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: rf(18), fontFamily: "Inter_600SemiBold", flex: 1 },
  listHeading: {
    fontSize: rf(22),
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
    marginBottom: rs(6),
  },
  listLead: {
    fontSize: rf(14),
    fontFamily: "Inter_400Regular",
    lineHeight: rf(20),
    marginBottom: rs(16),
  },
  tabsShell: {
    flexDirection: "row",
    gap: rs(4),
    padding: rs(4),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: rs(14),
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: rs(36),
    paddingHorizontal: rs(6),
    paddingVertical: rs(6),
    borderRadius: rs(9),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    gap: rs(2),
  },
  tabBtnText: { fontSize: rf(13), fontFamily: "Inter_500Medium" },
  tabCount: { fontSize: rf(11), fontFamily: "Inter_500Medium" },
  content: { paddingHorizontal: 16, paddingBottom: rs(24), gap: 14 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: rs(14), overflow: "hidden" },
  hero: { width: "100%", height: rs(140), backgroundColor: "#f1f5f9" },
  heroLarge: { width: "100%", height: rs(210), backgroundColor: "#f1f5f9" },
  body: { padding: rs(14) },
  logo: { width: 80, height: 40, marginBottom: rs(8) },
  cardTitle: { fontSize: rf(16), fontFamily: "Inter_600SemiBold", marginBottom: rs(4) },
  cardDesc: { fontSize: rf(14), fontFamily: "Inter_400Regular", lineHeight: rf(20) },
  cardChevronRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: rs(10) },
  cardLink: { fontSize: rf(13), fontFamily: "Inter_500Medium" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  actionBtnFull: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flex: 1, alignItems: "center" },
  actionText: { color: "#fff", fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, alignItems: "center" },
  modalTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  modalHint: { fontSize: rf(13), fontFamily: "Inter_400Regular", marginTop: 8, marginBottom: 10 },
  qrBig: { width: rs(220), height: rs(220), marginTop: 6 },
  modalCloseBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, alignSelf: "stretch", alignItems: "center" },
  emptyBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: rs(12), padding: rs(14), alignItems: "center" },
  emptyText: { fontSize: rf(13), fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: rf(19) },
});
