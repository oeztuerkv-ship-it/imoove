import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { usePaymentSheet } from "@stripe/stripe-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { BottomTabBar, BOTTOM_TAB_BAR_HOME_OFFSET_Y, tabMainScreenScrollPaddingBottom } from "@/components/BottomTabBar";
import { SectionHeadingPill } from "@/components/SectionHeadingPill";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { accountSheetPrimaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { STRIPE_CARD_TOKEN_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_SETUP_EXPLAINER_DE } from "@/constants/stripe";
import { useColors } from "@/hooks/useColors";
import { useTranslation } from "@/context/LanguageContext";
import { useUser } from "@/context/UserContext";
import { resolveCustomerBearerToken } from "@/utils/customerSessionToken";
import {
  fetchCustomerRides,
  listCustomerOutstandingFailedPayments,
  type CustomerOutstandingPayment,
} from "@/utils/customerRidesApi";
import {
  fetchCustomerSavedCard,
  postCustomerCreateSetupIntent,
  postCustomerRetryFailedRidePayment,
} from "@/utils/stripePaymentApi";
import { presentStripeSetupSheet } from "@/utils/stripePaymentSheet";
import { rs, rf } from "@/utils/scale";

function formatSavedCardSublabel(brand: string | null, last4: string | null): string {
  const label = brand?.trim() ? brand.trim().toUpperCase() : "Karte";
  return last4?.trim() ? `${label} •••• ${last4.trim()} · Stripe` : `${label} · Stripe`;
}

function formatEuroAmount(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

function retryPaymentErrorMessage(error: string): string {
  switch (error) {
    case "payment_method_required_for_final_charge":
      return "Bitte zuerst eine gültige Karte hinterlegen oder aktualisieren.";
    case "stripe_not_configured":
      return "Kartenzahlung ist derzeit nicht verfügbar.";
    case "capture_skipped":
      return "Diese Fahrt kann nicht per Karte abgerechnet werden.";
    case "not_found":
      return "Fahrt nicht gefunden.";
    case "payment_not_failed":
      return "Für diese Fahrt liegt keine offene Zahlung vor.";
    default:
      return "Die Zahlung konnte nicht eingezogen werden. Bitte Karte prüfen und erneut versuchen.";
  }
}

const isWeb = Platform.OS === "web";

/** Wie Konto: Vollton-Kachel + weiße Glyphe */
const WALLET_TILE = {
  green: "#34C759",
  blue: "#007AFF",
  purple: "#AF52DE",
  indigo: "#5856D6",
} as const;
const WALLET_TILE_ICON = 16;

/* ── Card wrapper ── */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
      {children}
    </View>
  );
}

/* ── List row ── */
function ListRow({
  icon,
  iconBg,
  label,
  sublabel,
  badge,
  isActive,
  onPress,
  isLast = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  badge?: string;
  isActive?: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.payRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        { backgroundColor: pressed ? colors.muted : "transparent" },
      ]}
      onPress={onPress}
    >
      <View style={[styles.payIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.payLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel ? <Text style={[styles.paySub, { color: colors.mutedForeground }]} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.payBadge}>
          <Text style={styles.payBadgeText}>{badge}</Text>
        </View>
      ) : null}
      {isActive ? (
        <Feather name="check-circle" size={18} color="#22C55E" />
      ) : (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

/* ── Billing Address Modal ── */
function BillingModal({
  visible,
  onClose,
  initialName,
}: {
  visible: boolean;
  onClose: (data: { name: string; strasse: string; hausnr: string; plz: string; ort: string } | null) => void;
  initialName: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [strasse, setStrasse] = useState("");
  const [hausnr, setHausnr] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");

  const handleSave = () => {
    if (!name.trim() || !strasse.trim() || !plz.trim() || !ort.trim()) {
      Alert.alert(t("wallet.billingMissing"), t("wallet.billingMissingMessage"));
      return;
    }
    onClose({ name, strasse, hausnr, plz, ort });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        {/* Modal Header */}
        <View style={[styles.modalHeader, { borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
          <Pressable hitSlop={12} onPress={() => onClose(null)} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rechnungsadresse</Text>
          <View style={{ width: 36 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Form Card */}
            <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, marginBottom: 16 }]}>
              {/* Name */}
              <View style={[styles.formRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Name / Firma</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.foreground }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Max Mustermann"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="next"
                />
              </View>

              {/* Straße + Nr */}
              <View style={[styles.rowDouble, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={{ flex: 3 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>Straße</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={strasse}
                    onChangeText={setStrasse}
                    placeholder="Musterstraße"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.dividerV, { backgroundColor: colors.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>Nr.</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={hausnr}
                    onChangeText={setHausnr}
                    placeholder="12"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* PLZ + Ort */}
              <View style={styles.rowDouble}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>PLZ</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={plz}
                    onChangeText={setPlz}
                    placeholder="73728"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.dividerV, { backgroundColor: colors.border }]} />
                <View style={{ flex: 2 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>Ort</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={ort}
                    onChangeText={setOrt}
                    placeholder="Esslingen am Neckar"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>

            {/* Save Button */}
            <Pressable
              style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleSave}
            >
              <Feather name="save" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Speichern</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ══════════════════════════════════════════ */
export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 44 : insets.top;
  const { t } = useTranslation();

  const { profile, updateProfile } = useUser();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const [billingOpen, setBillingOpen] = useState(false);
  const [cardLinked, setCardLinked] = useState(false);
  const [cardSublabel, setCardSublabel] = useState("Karte hinterlegen · Stripe");
  const [cardLinkBusy, setCardLinkBusy] = useState(false);
  const [outstandingPayments, setOutstandingPayments] = useState<CustomerOutstandingPayment[]>([]);
  const [retryBusyRideId, setRetryBusyRideId] = useState<string | null>(null);

  const refreshOutstandingPayments = useCallback(async () => {
    const authToken = await resolveCustomerBearerToken(profile.sessionToken);
    if (!authToken) {
      setOutstandingPayments([]);
      return;
    }
    const rides = await fetchCustomerRides(authToken);
    setOutstandingPayments(listCustomerOutstandingFailedPayments(rides));
  }, [profile.sessionToken]);

  const refreshSavedCard = useCallback(async () => {
    const authToken = await resolveCustomerBearerToken(profile.sessionToken);
    if (!authToken) {
      setCardLinked(false);
      setCardSublabel("Anmelden, um Karte zu hinterlegen");
      return;
    }
    const saved = await fetchCustomerSavedCard(authToken);
    if (saved.ok && saved.saved) {
      setCardLinked(true);
      setCardSublabel(formatSavedCardSublabel(saved.brand, saved.last4));
      await AsyncStorage.setItem(STRIPE_CARD_TOKEN_KEY, "stripe_linked").catch(() => undefined);
      return;
    }
    const local = await AsyncStorage.getItem(STRIPE_CARD_TOKEN_KEY).catch(() => null);
    setCardLinked(!!local?.trim());
    setCardSublabel(local?.trim() ? "Hinterlegt · Stripe" : "Karte hinterlegen · Stripe");
  }, [profile.sessionToken]);

  useFocusEffect(
    useCallback(() => {
      void refreshSavedCard();
      void refreshOutstandingPayments();
    }, [refreshSavedCard, refreshOutstandingPayments]),
  );

  const handleLinkCard = useCallback(async () => {
    if (cardLinkBusy) return;
    if (!STRIPE_PUBLISHABLE_KEY) {
      Alert.alert(t("wallet.card"), "Stripe ist in der App noch nicht konfiguriert (Publishable Key fehlt).");
      return;
    }
    const authToken = await resolveCustomerBearerToken(profile.sessionToken);
    if (!authToken) {
      Alert.alert(t("wallet.card"), "Bitte zuerst anmelden, um eine Karte zu hinterlegen.");
      return;
    }
    setCardLinkBusy(true);
    try {
      const setup = await postCustomerCreateSetupIntent({ authToken });
      if (!setup.ok) {
        const msg =
          setup.error === "stripe_not_configured"
            ? "Kartenzahlung ist auf dem Server noch nicht freigeschaltet."
            : setup.error === "unauthorized" || setup.error === "invalid_token"
              ? "Bitte erneut anmelden und es nochmal versuchen."
              : "Die Karte konnte nicht vorbereitet werden. Bitte später erneut versuchen.";
        Alert.alert(t("wallet.card"), msg);
        return;
      }
      const sheet = await presentStripeSetupSheet(
        { initPaymentSheet, presentPaymentSheet },
        setup.clientSecret,
      );
      if (!sheet.ok) {
        if (sheet.message !== "Zahlung abgebrochen.") {
          Alert.alert(t("wallet.card"), sheet.message);
        }
        return;
      }
      await AsyncStorage.setItem(STRIPE_CARD_TOKEN_KEY, "stripe_linked").catch(() => undefined);
      await refreshSavedCard();
      await refreshOutstandingPayments();
      Alert.alert(t("alerts.saved"), "Kreditkarte wurde hinterlegt. Buchungen mit Karte werden automatisch belastet.");
    } finally {
      setCardLinkBusy(false);
    }
  }, [
    cardLinkBusy,
    initPaymentSheet,
    presentPaymentSheet,
    profile.sessionToken,
    refreshOutstandingPayments,
    refreshSavedCard,
    t,
  ]);

  const handleRetryPayment = useCallback(
    async (rideId: string) => {
      if (retryBusyRideId) return;
      const authToken = await resolveCustomerBearerToken(profile.sessionToken);
      if (!authToken) {
        Alert.alert("Offene Zahlung", "Bitte anmelden, um die Zahlung zu begleichen.");
        return;
      }
      setRetryBusyRideId(rideId);
      try {
        const outcome = await postCustomerRetryFailedRidePayment({ rideId, authToken });
        if (outcome.ok) {
          await refreshOutstandingPayments();
          Alert.alert("Zahlung erfolgreich", "Die offene Fahrt wurde bezahlt. Sie können wieder normal buchen.");
          return;
        }
        Alert.alert("Zahlung fehlgeschlagen", retryPaymentErrorMessage(outcome.error), [
          { text: "Abbrechen", style: "cancel" },
          {
            text: "Karte aktualisieren",
            onPress: () => {
              void handleLinkCard();
            },
          },
          {
            text: "Erneut versuchen",
            onPress: () => {
              void handleRetryPayment(rideId);
            },
          },
        ]);
      } finally {
        setRetryBusyRideId(null);
      }
    },
    [handleLinkCard, profile.sessionToken, refreshOutstandingPayments, retryBusyRideId],
  );





  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("wallet.title")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) }]}
        showsVerticalScrollIndicator={false}
      >
        {outstandingPayments.length > 0 ? (
          <View style={styles.section}>
            <SectionHeadingPill label="Offene Zahlung" />
            {outstandingPayments.map((item) => {
              const amount = item.finalFare ?? item.estimatedFare;
              const busy = retryBusyRideId === item.rideId;
              return (
                <Card key={item.rideId}>
                  <View style={styles.outstandingBox}>
                    <View style={[styles.infoIcon, { backgroundColor: "#DC2626" }]}>
                      <Feather name="alert-circle" size={16} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={[styles.infoTitle, { color: colors.foreground }]}>
                        Zahlung fehlgeschlagen
                      </Text>
                      <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                        Für eine abgeschlossene Fahrt ({formatEuroAmount(amount)}) konnte die Karte nicht belastet
                        werden. Bitte Zahlungsmethode prüfen und die Zahlung erneut auslösen — sonst sind neue
                        Buchungen vorübergehend nicht möglich.
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.retryBtn,
                          { opacity: pressed || busy ? 0.85 : 1 },
                        ]}
                        disabled={busy}
                        onPress={() => {
                          void handleRetryPayment(item.rideId);
                        }}
                      >
                        <Feather name="refresh-cw" size={15} color="#fff" />
                        <Text style={styles.retryBtnText}>
                          {busy ? "Wird eingezogen…" : "Zahlung erneut versuchen"}
                        </Text>
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          void handleLinkCard();
                        }}
                      >
                        <Text style={[styles.outstandingLink, { color: colors.primary }]}>
                          Karte aktualisieren
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        ) : null}

        {/* ── Zahlungsmethoden ── */}
        <View style={styles.section}>
          <SectionHeadingPill label={t("wallet.paymentMethods")} />
          <Card>
            <ListRow
              icon={<MaterialCommunityIcons name="cash" size={WALLET_TILE_ICON} color="#FFFFFF" />}
              iconBg={WALLET_TILE.green}
              label={t("wallet.cash")}
              sublabel={t("wallet.cashSublabel")}
              isActive
              onPress={() => Alert.alert(t("wallet.cashAlertTitle"), t("wallet.cashAlertMessage"))}
            />
            <ListRow
              icon={<Text style={{ fontSize: rf(14), fontFamily: "Inter_700Bold", color: "#FFFFFF" }}>P</Text>}
              iconBg={WALLET_TILE.blue}
              label={t("wallet.paypal")}
              sublabel={t("wallet.paypalSublabel")}
              badge={t("wallet.paypalSoon")}
              onPress={() => Alert.alert(t("wallet.paypal"), t("wallet.paypalAlertMessage"))}
            />
            <ListRow
              icon={<MaterialCommunityIcons name="credit-card" size={WALLET_TILE_ICON} color="#FFFFFF" />}
              iconBg={WALLET_TILE.indigo}
              label={t("wallet.card")}
              sublabel={cardLinkBusy ? "Karte wird hinterlegt…" : cardSublabel}
              isActive={cardLinked}
              onPress={() => {
                void handleLinkCard();
              }}
            />
            <ListRow
              icon={<MaterialCommunityIcons name="ticket-percent" size={WALLET_TILE_ICON} color="#FFFFFF" />}
              iconBg={WALLET_TILE.purple}
              label={t("wallet.voucher")}
              sublabel={t("wallet.voucherSublabel")}
              onPress={() =>
                Alert.alert(t("wallet.voucherAlertTitle"), t("wallet.voucherAlertMessage"))
              }
            />
            <ListRow
              icon={<MaterialCommunityIcons name="file-document-outline" size={WALLET_TILE_ICON} color="#FFFFFF" />}
              iconBg={WALLET_TILE.blue}
              label={t("wallet.transport")}
              sublabel={t("wallet.transportSublabel")}
              isLast
              onPress={() => Alert.alert(t("wallet.transport"), t("wallet.transportAlertMessage"))}
            />
          </Card>
          <Text style={[styles.stripeSetupHint, { color: colors.mutedForeground }]}>
            {STRIPE_SETUP_EXPLAINER_DE}
          </Text>
        </View>



        {/* ── Sicherheit ── */}
        <View style={styles.section}>
          <SectionHeadingPill label={t("wallet.security")} />
          <Card>
            <View style={styles.infoBox}>
              <View style={[styles.infoIcon, { backgroundColor: WALLET_TILE.green }]}>
                <Feather name="shield" size={16} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.infoTitle, { color: colors.foreground }]}>{t("wallet.secureTitle")}</Text>
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                  {t("wallet.secureBody")}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ── Modal ── */}
      <BillingModal
        visible={billingOpen}
        initialName={profile.name || ""}
        onClose={(data) => {
          if (data) {
            updateProfile({ billingType: "private", companyName: data.name ?? "", companyAddress: data.strasse ?? "", companyCity: (data.plz ?? "") + " " + (data.ort ?? ""), billingEmail: "" });
            Alert.alert(t("alerts.saved"), t("alerts.savedBilling"));
          }
          setBillingOpen(false);
        }}
      />
      <BottomTabBar active="account" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
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
  backBtn: { width: rs(36), height: rs(36), justifyContent: "center" },
  headerTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },

  scroll: { paddingHorizontal: rs(8), paddingTop: rs(24), gap: rs(10) },
  section: { gap: rs(10), marginBottom: rs(20) },
  stripeSetupHint: {
    fontSize: rf(12),
    lineHeight: rf(17),
    fontFamily: "Inter_500Medium",
    paddingHorizontal: rs(4),
  },
  card: { borderRadius: rs(16), borderWidth: 1, overflow: "hidden" },

  payRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(8),
    paddingVertical: rs(10),
    gap: rs(10),
  },
  payIcon: { width: rs(28), height: rs(28), borderRadius: rs(7), justifyContent: "center", alignItems: "center" },
  payLabel: { ...accountSheetPrimaryLabel },
  paySub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 1 },
  payBadge: { backgroundColor: "#FEF3C7", borderRadius: rs(8), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  payBadgeText: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", color: "#D97706" },

  infoBox: { flexDirection: "row", gap: rs(10), paddingVertical: rs(12), paddingHorizontal: rs(8), alignItems: "flex-start" },
  infoIcon: { width: rs(28), height: rs(28), borderRadius: rs(7), justifyContent: "center", alignItems: "center" },
  infoTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  infoText: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },
  outstandingBox: {
    flexDirection: "row",
    gap: rs(10),
    paddingVertical: rs(12),
    paddingHorizontal: rs(8),
    alignItems: "flex-start",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    alignSelf: "flex-start",
    backgroundColor: "#DC2626",
    borderRadius: rs(12),
    paddingVertical: rs(10),
    paddingHorizontal: rs(14),
    marginTop: rs(4),
  },
  retryBtnText: { fontSize: rf(14), fontFamily: "Inter_600SemiBold", color: "#fff" },
  outstandingLink: { fontSize: rf(13), fontFamily: "Inter_600SemiBold", marginTop: rs(2) },

  /* Modal */
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingTop: rs(16),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalClose: { width: rs(36), height: rs(36), justifyContent: "center", alignItems: "center" },
  modalTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },
  modalScroll: { paddingHorizontal: rs(16), paddingTop: rs(24) },

  /* Form */
  formRow: { paddingHorizontal: rs(16), paddingVertical: rs(12) },
  formLabel: { fontSize: rf(11), fontFamily: "Inter_500Medium", letterSpacing: 0.3, marginBottom: rs(4) },
  formInput: { fontSize: rf(15), fontFamily: "Inter_400Regular" },
  formInputInner: { fontSize: rf(15), fontFamily: "Inter_400Regular", paddingHorizontal: rs(16), paddingBottom: rs(12) },
  rowDouble: { flexDirection: "row" },
  dividerV: { width: StyleSheet.hairlineWidth },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    backgroundColor: "#DC2626",
    borderRadius: rs(14),
    paddingVertical: rs(14),
  },
  saveBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff" },
});
