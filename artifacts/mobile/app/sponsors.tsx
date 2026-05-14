import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

export default function SponsorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();
  const autoOpenTop = useMemo(() => params.open === "top", [params.open]);
  const { isLoggedIn: isDriverLoggedIn } = useDriver();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SponsorItem[]>([]);
  const [selected, setSelected] = useState<SponsorItem | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<OfferTab>("coupon");

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
    if (tabCounts[activeTab] > 0) return;
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
  }, [tabCounts, activeTab]);

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

  useEffect(() => {
    if (!autoOpenTop) return;
    if (selected) return;
    if (!filteredItems.length) return;
    setSelected(filteredItems[0]);
  }, [autoOpenTop, filteredItems, selected]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => (selected ? router.replace("/") : router.back())} hitSlop={10} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {selected ? "Angebotsdetails" : "Exklusive Angebote"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        selected ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {selected.imageUrl ? <Image source={{ uri: selected.imageUrl }} style={styles.heroLarge} resizeMode="cover" /> : null}
              <View style={styles.body}>
                {selected.logoUrl ? <Image source={{ uri: selected.logoUrl }} style={styles.logo} resizeMode="contain" /> : null}
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
            <Text style={[styles.subHeading, { color: colors.foreground }]}>Rabatte & Partnervorteile</Text>
            <View style={styles.tabsRow}>
              <Pressable
                style={[
                  styles.tabBtn,
                  activeTab === "coupon" && { backgroundColor: colors.primary, borderColor: colors.primary },
                  activeTab !== "coupon" && { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => setActiveTab("coupon")}
              >
                <Text style={[styles.tabBtnText, { color: activeTab === "coupon" ? "#fff" : colors.foreground }]}>
                  Coupons
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tabBtn,
                  activeTab === "angebot" && { backgroundColor: colors.primary, borderColor: colors.primary },
                  activeTab !== "angebot" && { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => setActiveTab("angebot")}
              >
                <Text style={[styles.tabBtnText, { color: activeTab === "angebot" ? "#fff" : colors.foreground }]}>
                  Angebote
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tabBtn,
                  activeTab === "partnervorteile" && { backgroundColor: colors.primary, borderColor: colors.primary },
                  activeTab !== "partnervorteile" && { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => setActiveTab("partnervorteile")}
              >
                <Text style={[styles.tabBtnText, { color: activeTab === "partnervorteile" ? "#fff" : colors.foreground }]}>
                  Partnervorteile
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.tabHint, { color: colors.mutedForeground }]}>
              {tabCounts[activeTab]} Eintrag{tabCounts[activeTab] === 1 ? "" : "e"}
            </Text>
            {filteredItems.map((it) => (
              <Pressable key={it.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={() => setSelected(it)}>
                {it.imageUrl ? <Image source={{ uri: it.imageUrl }} style={styles.hero} resizeMode="cover" /> : null}
                <View style={styles.body}>
                  {it.logoUrl ? <Image source={{ uri: it.logoUrl }} style={styles.logo} resizeMode="contain" /> : null}
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{it.title}</Text>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={3}>{it.description}</Text>
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
        )
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
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  title: { fontSize: rf(20), fontFamily: "Inter_700Bold" },
  subHeading: { fontSize: rf(28), fontFamily: "Inter_700Bold", marginBottom: rs(2) },
  tabsRow: { flexDirection: "row", gap: rs(8), marginBottom: rs(4) },
  tabBtn: { flex: 1, borderWidth: 1, borderRadius: rs(10), alignItems: "center", justifyContent: "center", minHeight: rs(40), paddingHorizontal: rs(8) },
  tabBtnText: { fontSize: rf(13), fontFamily: "Inter_600SemiBold" },
  tabHint: { fontSize: rf(12), fontFamily: "Inter_500Medium", marginBottom: rs(2) },
  content: { paddingHorizontal: 16, paddingBottom: rs(24), gap: 14 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  hero: { width: "100%", height: rs(150), backgroundColor: "#f1f5f9" },
  heroLarge: { width: "100%", height: rs(210), backgroundColor: "#f1f5f9" },
  body: { padding: 12 },
  logo: { width: 88, height: 44, marginBottom: 8 },
  cardTitle: { fontSize: rf(17), fontFamily: "Inter_700Bold", marginBottom: 6 },
  cardDesc: { fontSize: rf(14), fontFamily: "Inter_400Regular", lineHeight: rf(20), marginBottom: 10 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  actionBtnFull: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flex: 1, alignItems: "center" },
  actionText: { color: "#fff", fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, alignItems: "center" },
  modalTitle: { fontSize: rf(18), fontFamily: "Inter_700Bold", marginBottom: 8 },
  modalHint: { fontSize: rf(13), fontFamily: "Inter_500Medium", marginTop: 8, marginBottom: 10 },
  qrBig: { width: rs(220), height: rs(220), marginTop: 6 },
  modalCloseBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, alignSelf: "stretch", alignItems: "center" },
  emptyBox: { borderWidth: 1, borderRadius: rs(12), padding: rs(14), alignItems: "center" },
  emptyText: { fontSize: rf(13), fontFamily: "Inter_500Medium", textAlign: "center" },
});
