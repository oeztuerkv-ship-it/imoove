import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BottomTabBar, BOTTOM_TAB_BAR_HOME_OFFSET_Y, tabMainScreenScrollPaddingBottom } from "@/components/BottomTabBar";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CustomerPasswordFields, isCustomerPasswordFormValid } from "@/components/CustomerPasswordFields";
import {
  CustomerLegalConsentCheckbox,
  CustomerLegalConsentModal,
  CustomerLegalLinksFooter,
} from "@/components/CustomerLegalConsent";
import { OnrodaOrMark } from "@/components/OnrodaOrMark";
import { accountSheetPrimaryLabel, accountSheetInputText, ACCOUNT_SHEET_FIELD_BORDER, ACCOUNT_SHEET_FIELD_BORDER_FOCUS, ACCOUNT_SHEET_FIELD_BORDER_WIDTH, ACCOUNT_SHEET_FIELD_BORDER_WIDTH_FOCUS } from "@/constants/accountSheetTypography";
import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import {
  LOGIN_ACTION_ICON_SIZE,
  LoginActionIcon,
  LoginActionLabel,
  NeuBeiOnrodaRegisterRow,
  emailLoginSubmitButtonStyle,
  loginActionButtonStyle,
  loginActionLabelStyle,
  socialLoginButtonStyle,
} from "@/src/screens/LoginScreen";
import { useTranslation } from "@/context/LanguageContext";
import { type UserProfile, useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import {
  confirmCustomerPasswordReset,
  mapCustomerAuthApiError,
  resendEmailVerification,
  startEmailVerification,
  verifyEmailVerificationCode,
} from "@/utils/customerAuthApi";
import {
  CUSTOMER_PASSWORD_RESET_PURPOSE,
  EMAIL_VERIFICATION_PURPOSE,
  isEmailStartAccountExistsResponse,
  mapEmailVerificationApiError,
} from "@/utils/emailVerificationErrors";
import { runCustomerGoogleSignIn } from "@/utils/customerGoogleSignIn";
import { isGoogleOAuthProfile } from "@/utils/customerAuthProvider";
import { navigateToCustomerStartScreen } from "@/utils/navigateToCustomerStart";
import { runNativeAppleSignIn } from "@/utils/customerAppleSignIn";
import {
  gateCustomerOAuthSession,
  type PendingOAuthSession,
} from "@/utils/completeCustomerOAuthSession";
import { deleteCustomerAccount } from "@/utils/customerAccountApi";
import { mapCustomerLegalError, openOnrodaLegalPage } from "@/utils/customerLegalConsent";
import { prepareCustomerOAuthLogin } from "@/utils/prepareCustomerOAuthLogin";
import {
  clearPendingOAuthSession,
  loadPendingOAuthSession,
  savePendingOAuthSession,
} from "@/utils/pendingOAuthSessionStorage";
import { rs, rf } from "@/utils/scale";

WebBrowser.maybeCompleteAuthSession();

/* ── Google G logo (4-color) ── */
function GoogleGLogo({ size = 22 }: { size?: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      {/* Blue top-right */}
      <View style={{ position: "absolute", top: 0, right: 0, width: r, height: r, backgroundColor: "#4285F4" }} />
      {/* Red top-left */}
      <View style={{ position: "absolute", top: 0, left: 0, width: r, height: r, backgroundColor: "#EA4335" }} />
      {/* Yellow bottom-left */}
      <View style={{ position: "absolute", bottom: 0, left: 0, width: r, height: r, backgroundColor: "#FBBC05" }} />
      {/* Green bottom-right */}
      <View style={{ position: "absolute", bottom: 0, right: 0, width: r, height: r, backgroundColor: "#34A853" }} />
      {/* White circle to carve out the G shape */}
      <View style={{
        position: "absolute",
        top: size * 0.18, left: size * 0.18,
        width: size * 0.64, height: size * 0.64,
        borderRadius: size * 0.32,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
      }}>
        {/* G letter inner fill */}
        <View style={{
          width: size * 0.28, height: size * 0.28,
          borderRadius: size * 0.14,
          backgroundColor: "#4285F4",
        }} />
      </View>
    </View>
  );
}

const API_URL = getApiBaseUrl();

/** Kachel-Glyphe in Konto-Listenzeilen (Profil … Abmelden) */
const ACCOUNT_TILE_ICON = 16;
const ACCOUNT_VALUE_ACCENT = "#C2186B";

function isPlausibleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/* ── Konto-Liste: neutrale Icon-Kacheln, Wert rechts ── */
function AccountRow({
  icon,
  iconBg,
  label,
  sublabel,
  valueText,
  valueTint,
  onPress,
  danger,
  isFirst,
  isLast,
  hideChevron,
  trailingReorder,
  readOnly,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  sublabel?: string;
  valueText?: string;
  valueTint?: "default" | "accent" | "success";
  onPress?: () => void;
  danger?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  hideChevron?: boolean;
  trailingReorder?: boolean;
  readOnly?: boolean;
}) {
  const colors = useColors();
  const valueColor =
    valueTint === "accent"
      ? ACCOUNT_VALUE_ACCENT
      : valueTint === "success"
        ? "#16A34A"
        : colors.mutedForeground;
  const tileBg = iconBg ?? (danger ? "#FEF2F2" : colors.muted);
  return (
    <Pressable
      disabled={readOnly}
      style={({ pressed }) => [
        styles.accountRow,
        { backgroundColor: !readOnly && pressed ? colors.muted : "transparent" },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={readOnly ? undefined : onPress}
    >
      <View style={[styles.accountRowIconWrap, { backgroundColor: tileBg }]}>
        {icon}
      </View>
      <View style={styles.accountRowText}>
        <Text style={[styles.accountRowLabel, { color: danger ? "#DC2626" : colors.foreground }]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.accountRowSub, { color: colors.mutedForeground }]} numberOfLines={2}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {valueText ? (
        <Text style={[styles.accountRowValue, { color: valueColor }]} numberOfLines={1}>
          {valueText}
        </Text>
      ) : null}
      {trailingReorder ? (
        <MaterialCommunityIcons name="swap-vertical" size={rs(17)} color={colors.mutedForeground} />
      ) : !hideChevron ? (
        <Feather name="chevron-right" size={rs(17)} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

function SectionCard({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <View
      style={[
        styles.sectionCard,
        compact && styles.sectionCardCompact,
        { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM },
      ]}
    >
      {children}
    </View>
  );
}

/** Konto: kleine Großbuchstaben-Überschrift wie im Referenz-Layout (ABRECHNUNG, PRÄFERENZEN) */
function AccountSectionTitle({ title, comfortable }: { title: string; comfortable?: boolean }) {
  const colors = useColors();
  return (
    <Text
      style={{
        marginLeft: rs(4),
        marginBottom: comfortable ? rs(9) : rs(8),
        fontSize: comfortable ? rf(12) : rf(11),
        fontFamily: "Inter_600SemiBold",
        letterSpacing: 0.8,
        color: colors.mutedForeground,
      }}
    >
      {title.toUpperCase()}
    </Text>
  );
}

/** Vorbild Rechnungsadresse: weiße Karten, Rand, Scroll-Padding, Feld-Typografie (Persönliche Daten + Patienten-Profil gleich). */
const BILLING_FIELD_CARD = "#FFFFFF";
const BILLING_CARD_INSET = rs(8);
/** Notfallkontakt im Patienten-Profil: etwas breiter als Standard-Karten */
const PATIENT_NOTFALL_CARD_INSET = rs(4);
const notfallFieldPad = { paddingHorizontal: rs(8), paddingVertical: rs(11) };
const BILLING_SCROLL_H_PAD = rs(8);
const billingCardShell = { marginHorizontal: BILLING_CARD_INSET, alignSelf: "stretch" as const };
const billingFieldPad = { paddingHorizontal: rs(11), paddingVertical: rs(12) };
const billingModalBlockMargin = { marginHorizontal: BILLING_SCROLL_H_PAD + BILLING_CARD_INSET };
const billingLabel = (muted: string) => [styles.modalFieldLabel, { color: muted, fontSize: rf(13), marginBottom: rs(5) }];
const billingInput = (fg: string) => [styles.modalFieldInput, { color: fg, backgroundColor: "#FFFFFF", fontSize: rf(17) }];

function formatKontoBalanceEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

/** Obere Profilkarte: Avatar mit Häkchen-Badge bei Verifizierung, Name, E-Mail */
function AccountProfileHeroCard({
  name,
  email,
  isVerified,
  photoUri,
  onPress,
}: {
  name: string;
  email: string;
  isVerified: boolean;
  photoUri?: string | null;
  onPress: () => void;
}) {
  const colors = useColors();
  const hasPhoto = typeof photoUri === "string" && photoUri.trim().length > 0;
  const glyphColor = colors.foreground;
  return (
    <SectionCard compact>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.accountRow,
          {
            alignItems: "center",
            backgroundColor: pressed ? colors.muted : "transparent",
            paddingVertical: rs(16),
            minHeight: rs(64),
          },
        ]}
      >
        <View style={{ position: "relative" }}>
          <View
            style={{
              width: rs(48),
              height: rs(48),
              borderRadius: rs(24),
              backgroundColor: colors.muted,
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            {hasPhoto ? (
              <Image source={{ uri: photoUri!.trim() }} style={{ width: rs(48), height: rs(48) }} resizeMode="cover" />
            ) : (
              <MaterialCommunityIcons name="account" size={26} color={glyphColor} />
            )}
          </View>
          {isVerified ? (
            <View
              style={{
                position: "absolute",
                right: -rs(2),
                bottom: -rs(2),
                width: rs(20),
                height: rs(20),
                borderRadius: rs(10),
                backgroundColor: "#FFFFFF",
                borderWidth: 2,
                borderColor: HOME_SHEET_PANEL,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Feather name="check" size={11} color={glyphColor} />
            </View>
          ) : null}
        </View>
        <View style={[styles.accountRowText, { flex: 1, gap: rs(2) }]}>
          <Text style={[styles.accountHeroName, { color: colors.foreground }]} numberOfLines={2}>
            {(name || "").trim() || "—"}
          </Text>
          <Text style={[styles.accountRowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {email.trim() || "—"}
          </Text>
        </View>
        <Feather name="chevron-right" size={rs(17)} color={colors.mutedForeground} />
      </Pressable>
    </SectionCard>
  );
}

/* ── Personal Data Modal ── */
function PersonalDataModal({
  visible,
  initialName,
  initialEmail,
  initialPhone,
  initialAddress,
  initialCity,
  isGoogleUser,
  onClose,
}: {
  visible: boolean;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  initialAddress: string;
  initialCity: string;
  isGoogleUser: boolean;
  onClose: (data: { name: string; email: string; phone: string; address: string; city: string } | null) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [city, setCity] = useState(initialCity ?? "");

  const divider = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border };
  /** Eingegebene Werte kräftiger als Standard-Input */
  const personalAnswerInput = [
    styles.modalFieldInput,
    {
      color: colors.foreground,
      backgroundColor: "#FFFFFF",
      fontSize: rf(17),
      fontFamily: "Inter_500Medium" as const,
    },
  ];
  const readonlyValue = (c: string) => ({ fontSize: rf(17), fontFamily: "Inter_400Regular" as const, color: c });

  const handleSave = () => {
    onClose({ name: initialName ?? "", email: initialEmail ?? "", phone: (phone ?? "").trim(), address: (address ?? "").trim(), city: (city ?? "").trim() });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
          <Pressable hitSlop={12} onPress={() => onClose(null)} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Persönliche Daten</Text>
          <View style={{ width: 36 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: BILLING_SCROLL_H_PAD, paddingTop: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Karte 1: Name + E-Mail (von Google, read-only) */}
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
              <View style={[styles.modalField, billingFieldPad, divider]}>
                <Text style={billingLabel(colors.mutedForeground)}>Name</Text>
                <Text style={readonlyValue(colors.foreground)}>{initialName || "—"}</Text>
              </View>
              <View style={[styles.modalField, billingFieldPad]}>
                <Text style={billingLabel(colors.mutedForeground)}>E-Mail</Text>
                <Text style={readonlyValue(colors.foreground)}>{initialEmail || "—"}</Text>
              </View>
            </View>

            {/* Karte 2: Telefon + Adresse (optional, editierbar) */}
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
              <View style={[styles.modalField, billingFieldPad, divider]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: rs(5) }}>
                  <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontSize: rf(13) }]}>Telefon</Text>
                  <View style={styles.optionalBadge}><Text style={styles.optionalText}>optional</Text></View>
                </View>
                <TextInput
                  style={personalAnswerInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+49 711 000000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.modalField, billingFieldPad, divider]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: rs(5) }}>
                  <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontSize: rf(13) }]}>Straße / Nr.</Text>
                  <View style={styles.optionalBadge}><Text style={styles.optionalText}>optional</Text></View>
                </View>
                <TextInput
                  style={personalAnswerInput}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Musterstraße 12"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.modalField, billingFieldPad]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: rs(5) }}>
                  <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontSize: rf(13) }]}>PLZ / Ort</Text>
                  <View style={styles.optionalBadge}><Text style={styles.optionalText}>optional</Text></View>
                </View>
                <TextInput
                  style={personalAnswerInput}
                  value={city}
                  onChangeText={setCity}
                  placeholder="73728 Esslingen"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>
            </View>

            {isGoogleUser && (
              <View style={[styles.googleInfoBox, billingModalBlockMargin, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                <Image
                  source={require("../assets/images/google-icon.png")}
                  style={{ width: 16, height: 16 }}
                  resizeMode="contain"
                />
                <Text style={styles.googleInfoText}>
                  Von Google übernommen — Name und E-Mail hier nicht änderbar.
                </Text>
              </View>
            )}

            <View style={[{ flexDirection: "row", alignItems: "flex-start", gap: 8 }, billingModalBlockMargin]}>
              <Feather name="shield" size={14} color="#6B7280" style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 18 }}>
                Die Angaben zu Telefon und Adresse sind <Text style={{ fontFamily: "Inter_500Medium" }}>freiwillig</Text>. Sie können diese Daten jederzeit ändern oder löschen (DSGVO Art. 17).
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                billingModalBlockMargin,
                { backgroundColor: "#EF1D26", borderRadius: 14, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: pressed ? 0.88 : 1 },
              ]}
              onPress={handleSave}
            >
              <Feather name="save" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>Speichern</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ── Patient Profile Modal ── */
function ToggleSwitchRow({
  label, value, onToggle, colors,
}: { label: string; value: boolean; onToggle: (v: boolean) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: rs(11), paddingVertical: rs(12) }}>
      <Text style={{ fontSize: rf(16), fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: "#22C55E" }}
        thumbColor="#fff"
      />
    </View>
  );
}

function BillingModal({ visible, profile, onClose }: { visible: boolean; profile: any; onClose: (data: any | null) => void; }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [billingType, setBillingType] = useState<"private" | "company" | "insurance">(profile.billingType ?? "private");
  const [companyName, setCompanyName] = useState(profile.companyName ?? "");
  const [companyAddress, setCompanyAddress] = useState(profile.companyAddress ?? "");
  const [companyCity, setCompanyCity] = useState(profile.companyCity ?? "");
  const [vatNumber, setVatNumber] = useState(profile.vatNumber ?? "");
  const [costCenter, setCostCenter] = useState(profile.costCenter ?? "");
  const [billingEmail, setBillingEmail] = useState(profile.billingEmail ?? "");

  const divider = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border };
  const fieldInputOnWhite = billingInput(colors.foreground);
  const fieldInputMuted = [styles.modalFieldInput, { color: colors.mutedForeground, backgroundColor: "#FFFFFF", fontSize: rf(17) }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
          <Pressable hitSlop={12} onPress={() => onClose(null)} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rechnungsadresse</Text>
          <View style={{ width: 36 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: BILLING_SCROLL_H_PAD, paddingTop: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
              <View style={[styles.modalField, billingFieldPad, { paddingBottom: rs(12) }]}>
                <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontSize: rf(14), marginBottom: rs(5), fontFamily: "Inter_600SemiBold" }]}>
                  Abrechnung
                </Text>
                <View style={{ flexDirection: "row", backgroundColor: "#E5E5EA", borderRadius: 12, padding: 3, marginTop: rs(4) }}>
                  {(["private", "company", "insurance"] as const).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setBillingType(t)}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: billingType === t ? "#FFFFFF" : "transparent" }}
                    >
                      <Text style={{ fontSize: rf(13), fontFamily: billingType === t ? "Inter_700Bold" : "Inter_600SemiBold", color: billingType === t ? "#EF1D26" : "#8E8E93" }}>
                        {t === "private" ? "Privat" : t === "company" ? "Firma" : "Kasse"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {billingType === "company" && (
              <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Firmenname</Text>
                  <TextInput placeholder="Firmenname" value={companyName} onChangeText={setCompanyName} style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} returnKeyType="next" />
                </View>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Straße & Hausnummer</Text>
                  <TextInput placeholder="Musterstraße 12" value={companyAddress} onChangeText={setCompanyAddress} style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} autoCapitalize="words" returnKeyType="next" />
                </View>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>PLZ & Ort</Text>
                  <TextInput placeholder="73728 Esslingen" value={companyCity} onChangeText={setCompanyCity} style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} autoCapitalize="words" returnKeyType="next" />
                </View>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>USt-ID (optional)</Text>
                  <TextInput placeholder="DE123456789" value={vatNumber} onChangeText={setVatNumber} style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} returnKeyType="next" />
                </View>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Kostenstelle (optional)</Text>
                  <TextInput placeholder="Kostenstelle" value={costCenter} onChangeText={setCostCenter} style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} returnKeyType="next" />
                </View>
                <View style={[styles.modalField, billingFieldPad]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Rechnungs-E-Mail</Text>
                  <TextInput placeholder="rechnung@firma.de" value={billingEmail} onChangeText={setBillingEmail} keyboardType="email-address" style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} returnKeyType="done" />
                </View>
              </View>
            )}

            {billingType === "insurance" && (
              <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Krankenkasse</Text>
                  <TextInput placeholder="Krankenkasse" value={profile.krankenkasse} editable={false} style={fieldInputMuted} />
                </View>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Versichertennummer</Text>
                  <TextInput placeholder="Versichertennummer" value={profile.versichertennummer} editable={false} style={fieldInputMuted} />
                </View>
                <View style={[styles.modalField, billingFieldPad, divider]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Kostenstelle (optional)</Text>
                  <TextInput placeholder="Kostenstelle" value={costCenter} onChangeText={setCostCenter} style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} returnKeyType="next" />
                </View>
                <View style={[styles.modalField, billingFieldPad]}>
                  <Text style={billingLabel(colors.mutedForeground)}>Rechnungs-E-Mail</Text>
                  <TextInput placeholder="rechnung@…" value={billingEmail} onChangeText={setBillingEmail} keyboardType="email-address" style={fieldInputOnWhite} placeholderTextColor={colors.mutedForeground} returnKeyType="done" />
                </View>
              </View>
            )}

            {billingType === "private" && (
              <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
                <View style={[styles.modalField, billingFieldPad, { paddingVertical: rs(20) }]}>
                  <Text style={{ fontSize: rf(14), fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
                    Privatabrechnung – keine weiteren Angaben nötig.
                  </Text>
                </View>
              </View>
            )}

            <View
              style={[
                {
                  marginTop: rs(8),
                  marginBottom: rs(14),
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: rs(10),
                  padding: rs(14),
                  borderRadius: rs(12),
                  backgroundColor: "#F0FDFA",
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: "#99F6E4",
                },
                billingModalBlockMargin,
                Platform.select({
                  ios: {
                    shadowColor: "#0F766E",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 8,
                  },
                  android: { elevation: 4 },
                  default: {},
                }),
              ]}
            >
              <MaterialCommunityIcons name="information-outline" size={22} color="#EF1D26" style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: rs(6) }}>
                <Text style={{ fontSize: rf(12) }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: "#EF1D26" }}>Hinweis</Text>
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>:</Text>
                </Text>
                <Text style={{ fontSize: rf(12), fontFamily: "Inter_400Regular", lineHeight: rf(17), color: colors.foreground }}>
                  Die Rechnungsadresse wird auf allen Belegen und Rechnungen angezeigt.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => onClose({ billingType, companyName, companyAddress, companyCity, vatNumber, costCenter, billingEmail })}
              style={({ pressed }) => [
                billingModalBlockMargin,
                { backgroundColor: "#EF1D26", borderRadius: 14, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>Speichern</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function PatientProfileModal({
  visible,
  profile,
  onClose,
}: {
  visible: boolean;
  profile: UserProfile;
  onClose: (data: Partial<UserProfile> | null) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [krankenkasse, setKrankenkasse] = useState(profile.krankenkasse ?? "");
  const [versichertennummer, setVersichertennummer] = useState(profile.versichertennummer ?? "");
  const [rollstuhl, setRollstuhl] = useState(profile.rollstuhl ?? false);
  const [rollator, setRollator] = useState(profile.rollator ?? false);
  const [blindenhund, setBlindhund] = useState(profile.blindenhund ?? false);
  const [sauerstoff, setSauerstoff] = useState(profile.sauerstoff ?? false);
  const [begleitperson, setBegleitperson] = useState(profile.begleitperson ?? false);
  const [abholungTuer, setAbholungTuer] = useState(profile.abholungTuer ?? false);
  const [abholungStockwerk, setAbholungStockwerk] = useState(profile.abholungStockwerk ?? "");
  const [begleitungAnmeldung, setBegleitungAnmeldung] = useState(profile.begleitungAnmeldung ?? false);
  const [tragehilfe, setTragehilfe] = useState(profile.tragehilfe ?? false);
  const [dialyse, setDialyse] = useState(profile.dialyse ?? false);
  const [notfallName, setNotfallName] = useState(profile.notfallName ?? "");
  const [notfallTelefon, setNotfallTelefon] = useState(profile.notfallTelefon ?? "");
  const [notfallNameFocused, setNotfallNameFocused] = useState(false);
  const [notfallTelefonFocused, setNotfallTelefonFocused] = useState(false);
  const [patientNotiz, setPatientNotiz] = useState(profile.patientNotiz ?? "");

  const handleSave = () => {
    onClose({
      krankenkasse: krankenkasse.trim(), versichertennummer: versichertennummer.trim(),
      rollstuhl, rollator, blindenhund, sauerstoff, begleitperson,
      abholungTuer, abholungStockwerk: abholungStockwerk.trim(),
      begleitungAnmeldung, tragehilfe, dialyse,
      notfallName: notfallName.trim(), notfallTelefon: notfallTelefon.trim(),
      patientNotiz: patientNotiz.trim(),
    });
  };

  const divider = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border };
  const fieldOnWhite = billingInput(colors.foreground);
  const notfallLabel = [styles.modalFieldLabel, { color: "#B91C1C", fontSize: rf(13), marginBottom: rs(5) }];
  const notfallInputBox = (focused: boolean) => [
    accountSheetInputText,
    {
      color: colors.foreground,
      backgroundColor: "#FFFFFF",
      alignSelf: "stretch" as const,
      borderRadius: rs(12),
      borderWidth: focused ? ACCOUNT_SHEET_FIELD_BORDER_WIDTH_FOCUS : ACCOUNT_SHEET_FIELD_BORDER_WIDTH,
      borderColor: focused ? ACCOUNT_SHEET_FIELD_BORDER_FOCUS : ACCOUNT_SHEET_FIELD_BORDER,
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
          <Pressable hitSlop={12} onPress={() => onClose(null)} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Patienten-Profil</Text>
          <View style={{ width: 36 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: BILLING_SCROLL_H_PAD, paddingTop: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ paddingHorizontal: 0 }}>
              <AccountSectionTitle title="Krankenversicherung" />
            </View>
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
              <View style={[styles.modalField, billingFieldPad, divider]}>
                <Text style={billingLabel(colors.mutedForeground)}>Krankenkasse</Text>
                <TextInput
                  style={fieldOnWhite}
                  value={krankenkasse}
                  onChangeText={setKrankenkasse}
                  placeholder="z.B. AOK Baden-Württemberg"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.modalField, billingFieldPad]}>
                <Text style={billingLabel(colors.mutedForeground)}>Versichertennummer</Text>
                <TextInput
                  style={fieldOnWhite}
                  value={versichertennummer}
                  onChangeText={setVersichertennummer}
                  placeholder="A000000000"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={{ paddingHorizontal: 0 }}>
              <AccountSectionTitle title="Mobilitätsbedarf" />
            </View>
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
              <View style={divider}><ToggleSwitchRow label="Rollstuhl" value={rollstuhl} onToggle={setRollstuhl} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Gehilfe / Rollator" value={rollator} onToggle={setRollator} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Blindenhund / Assistenzhund" value={blindenhund} onToggle={setBlindhund} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Sauerstoffgerät wird mitgenommen" value={sauerstoff} onToggle={setSauerstoff} colors={colors} /></View>
              <ToggleSwitchRow label="Begleitperson" value={begleitperson} onToggle={setBegleitperson} colors={colors} />
            </View>

            <View style={{ paddingHorizontal: 0 }}>
              <AccountSectionTitle title="Service-Optionen" />
            </View>
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
              <View style={divider}>
                <ToggleSwitchRow label="Abholung an der Wohnungstür" value={abholungTuer} onToggle={setAbholungTuer} colors={colors} />
                {abholungTuer ? (
                  <View style={[styles.modalField, billingFieldPad, { paddingTop: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <Text style={billingLabel(colors.mutedForeground)}>Stockwerk</Text>
                    <TextInput
                      style={fieldOnWhite}
                      value={abholungStockwerk}
                      onChangeText={setAbholungStockwerk}
                      placeholder="z.B. 3. OG"
                      placeholderTextColor={colors.mutedForeground}
                      returnKeyType="done"
                    />
                  </View>
                ) : null}
              </View>
              <View style={divider}><ToggleSwitchRow label="Dialyse-Transport" value={dialyse} onToggle={setDialyse} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Begleitung bis zur Anmeldung" value={begleitungAnmeldung} onToggle={setBegleitungAnmeldung} colors={colors} /></View>
              <ToggleSwitchRow label="Tragehilfe (2. Fahrer erforderlich)" value={tragehilfe} onToggle={setTragehilfe} colors={colors} />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginLeft: PATIENT_NOTFALL_CARD_INSET }}>
              <Feather name="bell" size={17} color="#DC2626" />
              <Text style={{ fontSize: rf(11), fontFamily: "Inter_600SemiBold", color: "#DC2626", letterSpacing: 0.8 }}>NOTFALLKONTAKT</Text>
            </View>
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: "#FFF5F5", borderColor: "#FCA5A5", borderWidth: StyleSheet.hairlineWidth, marginHorizontal: PATIENT_NOTFALL_CARD_INSET }]}>
              <View style={[notfallFieldPad, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#FCA5A5" }]}>
                <Text style={notfallLabel}>Name</Text>
                <TextInput
                  style={notfallInputBox(notfallNameFocused)}
                  value={notfallName}
                  onChangeText={setNotfallName}
                  placeholder="Vertrauensperson"
                  placeholderTextColor="#FCA5A5"
                  autoCapitalize="words"
                  returnKeyType="next"
                  onFocus={() => setNotfallNameFocused(true)}
                  onBlur={() => setNotfallNameFocused(false)}
                />
              </View>
              <View style={notfallFieldPad}>
                <Text style={notfallLabel}>Telefon</Text>
                <TextInput
                  style={notfallInputBox(notfallTelefonFocused)}
                  value={notfallTelefon}
                  onChangeText={setNotfallTelefon}
                  placeholder="+49 711 000000"
                  placeholderTextColor="#FCA5A5"
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onFocus={() => setNotfallTelefonFocused(true)}
                  onBlur={() => setNotfallTelefonFocused(false)}
                />
              </View>
            </View>

            <View style={{ paddingHorizontal: 0 }}>
              <AccountSectionTitle title="Notiz für den Fahrer" />
            </View>
            <Text style={{ fontSize: rf(12), fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginLeft: BILLING_CARD_INSET, marginTop: -rs(4) }}>
              Freiwillig — alle Angaben sind optional. Nur für den Fahrer sichtbar.
            </Text>
            <View style={[styles.sectionCard, styles.sectionCardCompact, billingCardShell, { backgroundColor: BILLING_FIELD_CARD, borderColor: HOME_SHEET_RIM }]}>
              <View style={[styles.modalField, billingFieldPad]}>
                <TextInput
                  style={{
                    fontSize: rf(17), fontFamily: "Inter_400Regular", color: colors.foreground,
                    backgroundColor: "#FFFFFF", minHeight: 90, textAlignVertical: "top",
                  }}
                  value={patientNotiz}
                  onChangeText={setPatientNotiz}
                  placeholder="z.B. Bitte klingeln, 3. OG links. Hund im Haus – keine Angst. Fahre regelmäßig zur Dialyse Di/Do/Sa."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={300}
                  returnKeyType="default"
                />
                <Text style={{ fontSize: rf(11), fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "right", marginTop: rs(6) }}>
                  {patientNotiz.length}/300
                </Text>
              </View>
            </View>

            <View style={[{ flexDirection: "row", alignItems: "flex-start", gap: 8 }, billingModalBlockMargin]}>
              <Feather name="shield" size={14} color="#6B7280" style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 18 }}>
                Alle Angaben sind <Text style={{ fontFamily: "Inter_500Medium" }}>freiwillig</Text> und werden nur zur Fahrtoptimierung gespeichert. Du kannst sie jederzeit ändern oder löschen (DSGVO Art. 17).
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                billingModalBlockMargin,
                { backgroundColor: "#EF1D26", borderRadius: 14, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: pressed ? 0.88 : 1 },
              ]}
              onPress={handleSave}
            >
              <Feather name="save" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>Speichern</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const loginPadH = Math.max(rs(16), Math.min(rs(24), Math.round(screenWidth * 0.055)));
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const { t } = useTranslation();

  const { profile, loginWithGoogle, loginWithEmailAccount, updateProfile, logout, registerCustomerAccount } = useUser();

  const [profileStep, setProfileStep] = useState<
    | "social"
    | "register"
    | "email_login"
    | "pwd_reset_email"
    | "pwd_reset_verify"
    | "pwd_reset_new"
  >("social");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [pwdResetEmail, setPwdResetEmail] = useState("");
  const [pwdResetOtp, setPwdResetOtp] = useState("");
  const [pendingPwdResetProof, setPendingPwdResetProof] = useState<string | undefined>(undefined);
  const [pwdResetPassword, setPwdResetPassword] = useState("");
  const [pwdResetPasswordConfirm, setPwdResetPasswordConfirm] = useState("");
  const [pwdResetSubmitLoading, setPwdResetSubmitLoading] = useState(false);
  const [pwdResetCooldown, setPwdResetCooldown] = useState(0);
  const [accountPwdFlow, setAccountPwdFlow] = useState(false);
  const [regSubStep, setRegSubStep] = useState<"email" | "verify" | "profile" | "password">("email");

  const pathname = usePathname();
  const logoutInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resetLoginUiState = useCallback(() => {
    setProfileStep("social");
    setAccountPwdFlow(false);
    setRegSubStep("email");
    setLoginEmail("");
    setLoginPassword("");
    setShowLoginPassword(false);
    setPwdResetEmail("");
    setPwdResetOtp("");
    setPendingPwdResetProof(undefined);
    setPwdResetPassword("");
    setPwdResetPasswordConfirm("");
  }, []);

  const handleLogout = useCallback(async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    try {
      resetLoginUiState();
      await logout();
      if (isMountedRef.current) {
        navigateToCustomerStartScreen(pathname);
      }
    } finally {
      logoutInFlightRef.current = false;
    }
  }, [logout, resetLoginUiState, pathname]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      "Konto wirklich löschen?",
      "Dein Konto und deine persönlichen Daten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.\n\nHinweis: Abgeschlossene Fahrten und Rechnungsdaten müssen aus gesetzlichen Gründen (Aufbewahrungspflicht, 10 Jahre) weiterhin gespeichert bleiben, werden aber von deinem Namen getrennt (anonymisiert).",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Endgültig löschen",
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (deleteAccountLoading) return;
              setDeleteAccountLoading(true);
              try {
                const result = await deleteCustomerAccount(profile.sessionToken);
                if (!result.ok) {
                  Alert.alert(
                    "Löschen fehlgeschlagen",
                    result.message ??
                      "Dein Konto konnte nicht gelöscht werden. Bitte versuche es erneut oder kontaktiere den Support.",
                  );
                  return;
                }
                resetLoginUiState();
                await logout();
                if (isMountedRef.current) {
                  Alert.alert(
                    "Konto gelöscht",
                    result.message ??
                      "Dein Konto wurde gelöscht. Deine persönlichen Daten wurden anonymisiert.",
                    [{ text: "OK", onPress: () => navigateToCustomerStartScreen(pathname) }],
                  );
                }
              } finally {
                if (isMountedRef.current) setDeleteAccountLoading(false);
              }
            })();
          },
        },
      ],
    );
  }, [deleteAccountLoading, logout, pathname, profile.sessionToken, resetLoginUiState]);

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regOtpDigits, setRegOtpDigits] = useState("");
  const [pendingEmailProofToken, setPendingEmailProofToken] = useState<string | undefined>(undefined);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [emailStartLoading, setEmailStartLoading] = useState(false);
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [registerSubmitLoading, setRegisterSubmitLoading] = useState(false);
  const [registerLegalConsentChecked, setRegisterLegalConsentChecked] = useState(false);
  const [socialRegisterLegalChecked, setSocialRegisterLegalChecked] = useState(false);
  const [pendingOAuthSession, setPendingOAuthSession] = useState<PendingOAuthSession | null>(null);
  const [legalConsentModalVisible, setLegalConsentModalVisible] = useState(false);
  const regNameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldownSecs <= 0) return undefined;
    const id = setTimeout(() => setCooldownSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldownSecs]);

  useEffect(() => {
    if (pwdResetCooldown <= 0) return undefined;
    const id = setTimeout(() => setPwdResetCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [pwdResetCooldown]);

  useEffect(() => {
    if (regSubStep !== "profile") return undefined;
    const id = requestAnimationFrame(() => {
      Keyboard.dismiss();
      regNameRef.current?.blur();
    });
    return () => cancelAnimationFrame(id);
  }, [regSubStep]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const oauthAttemptRef = useRef(false);
  const oauthLegalParams = useLocalSearchParams<{ oauthLegal?: string | string[] }>();
  const oauthLegalPending =
    (typeof oauthLegalParams.oauthLegal === "string"
      ? oauthLegalParams.oauthLegal
      : oauthLegalParams.oauthLegal?.[0]) === "1";

  useEffect(() => {
    if (!oauthLegalPending) return;
    void loadPendingOAuthSession().then((session) => {
      if (!session) return;
      setPendingOAuthSession(session);
      setLegalConsentModalVisible(true);
      setProfileStep("social");
    });
  }, [oauthLegalPending]);

  const [personalDataOpen, setPersonalDataOpen] = useState(false);
  const [patientProfileOpen, setPatientProfileOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);

  const handleGoogleLogin = async () => {
    if (oauthAttemptRef.current || googleLoading) return;
    oauthAttemptRef.current = true;
    setGoogleLoading(true);
    try {
      await prepareCustomerOAuthLogin(profile.isLoggedIn);
      const session = await runCustomerGoogleSignIn(API_URL);
      if (!session) return;
      const gate = await gateCustomerOAuthSession(session.sessionToken, {
        googleId: session.googleId,
        name: session.name,
        email: session.email,
        photoUri: session.photoUri,
        authProvider: session.authProvider,
      });
      if (gate.kind === "error") {
        Alert.alert("Hinweis", gate.message);
        return;
      }
      if (gate.kind === "ready") {
        await loginWithGoogle({
          ...gate.session.profile,
          sessionToken: gate.session.sessionToken,
        });
        await clearPendingOAuthSession();
        return;
      }
      setPendingOAuthSession(gate.session);
      await savePendingOAuthSession(gate.session);
      setLegalConsentModalVisible(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Google-Anmeldung fehlgeschlagen.";
      Alert.alert("Fehler", message);
    } finally {
      oauthAttemptRef.current = false;
      setGoogleLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    if (Platform.OS !== "ios") {
      Alert.alert(t("common.comingSoon"), t("profile.appleLoginSoon"));
      return;
    }
    if (oauthAttemptRef.current || appleLoading) return;
    oauthAttemptRef.current = true;
    setAppleLoading(true);
    try {
      if (!API_URL) {
        throw new Error("API-Adresse fehlt. Bitte EXPO_PUBLIC_API_URL in .env setzen und neu starten.");
      }
      await prepareCustomerOAuthLogin(profile.isLoggedIn);
      const session = await runNativeAppleSignIn(API_URL);
      if (!session) return;
      const gate = await gateCustomerOAuthSession(session.sessionToken, {
        name: session.name,
        email: session.email,
        photoUri: session.photoUri,
        googleId: session.googleId,
        authProvider: "apple",
      });
      if (gate.kind === "error") {
        Alert.alert("Hinweis", gate.message);
        return;
      }
      if (gate.kind === "ready") {
        await loginWithGoogle({
          ...gate.session.profile,
          sessionToken: gate.session.sessionToken,
        });
        await clearPendingOAuthSession();
        return;
      }
      setPendingOAuthSession(gate.session);
      await savePendingOAuthSession(gate.session);
      setLegalConsentModalVisible(true);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      const message = e instanceof Error ? e.message : "Apple-Anmeldung fehlgeschlagen.";
      Alert.alert("Fehler", message);
    } finally {
      oauthAttemptRef.current = false;
      setAppleLoading(false);
    }
  };

  const goRegister = () => {
    if (!socialRegisterLegalChecked) {
      Alert.alert("Hinweis", mapCustomerLegalError("legal_acceptance_required"));
      return;
    }
    setRegName("");
    setRegEmail("");
    setRegOtpDigits("");
    setPendingEmailProofToken(undefined);
    setCooldownSecs(0);
    setRegSubStep("email");
    setProfileStep("register");
  };

  const submitEmailStart = useCallback(async () => {
    const email = regEmail.trim().toLowerCase();
    if (!isPlausibleEmail(email)) {
      Alert.alert("Hinweis", mapEmailVerificationApiError("invalid_email"));
      return;
    }
    if (!API_URL?.trim()) {
      Alert.alert("Hinweis", "Keine API-URL (EXPO_PUBLIC_API_URL).");
      return;
    }
    setEmailStartLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/email/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: EMAIL_VERIFICATION_PURPOSE }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!res.ok || data?.ok === false) {
        if (isEmailStartAccountExistsResponse(res.status, data?.error)) {
          Alert.alert("Bereits registriert", mapEmailVerificationApiError("account_exists"));
          return;
        }
        Alert.alert(
          res.status === 429 ? "Bitte warten" : "Hinweis",
          typeof data?.retryAfterSeconds === "number" && data.retryAfterSeconds > 30
            ? `${mapEmailVerificationApiError(data?.error)}\n\nIn ca. ${Math.ceil(data.retryAfterSeconds / 60)} Min. erneut.`
            : mapEmailVerificationApiError(data?.error),
        );
        return;
      }
      setRegOtpDigits("");
      setPendingEmailProofToken(undefined);
      setCooldownSecs(60);
      setRegSubStep("verify");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler — bitte API-Adresse prüfen.");
    } finally {
      setEmailStartLoading(false);
    }
  }, [regEmail]);

  const submitEmailResend = useCallback(async () => {
    const email = regEmail.trim().toLowerCase();
    if (!isPlausibleEmail(email) || cooldownSecs > 0 || !API_URL?.trim()) return;
    setEmailStartLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/email/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: EMAIL_VERIFICATION_PURPOSE }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data?.ok === false) {
        Alert.alert(res.status === 429 ? "Bitte warten" : "Hinweis", mapEmailVerificationApiError(data?.error));
        return;
      }
      setCooldownSecs(60);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler.");
    } finally {
      setEmailStartLoading(false);
    }
  }, [API_URL, cooldownSecs, regEmail]);

  const submitEmailVerifyContinue = useCallback(async () => {
    const email = regEmail.trim().toLowerCase();
    const digits = regOtpDigits.replace(/\D/g, "").slice(0, 6);
    if (!isPlausibleEmail(email) || digits.length !== 6) {
      Alert.alert("Hinweis", mapEmailVerificationApiError("invalid_params"));
      return;
    }
    setEmailVerifyLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: digits, purpose: EMAIL_VERIFICATION_PURPOSE }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        proofToken?: string;
      };
      if (!res.ok || data?.ok === false) {
        if (isEmailStartAccountExistsResponse(res.status, data?.error)) {
          Alert.alert("Bereits registriert", mapEmailVerificationApiError("account_exists"));
          return;
        }
        Alert.alert(
          data?.error === "too_many_attempts" ? "Gesperrt" : "Hinweis",
          mapEmailVerificationApiError(data?.error),
        );
        return;
      }
      const proofToken = typeof data.proofToken === "string" ? data.proofToken.trim() : "";
      if (!proofToken) {
        Alert.alert("Hinweis", mapEmailVerificationApiError("proof_token_failed"));
        return;
      }
      setPendingEmailProofToken(proofToken);
      setRegEmail(email);
      Keyboard.dismiss();
      setRegSubStep("profile");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler.");
    } finally {
      setEmailVerifyLoading(false);
    }
  }, [API_URL, regEmail, regOtpDigits]);

  const focusRegNameInput = useCallback(() => {
    regNameRef.current?.blur();
    setTimeout(() => regNameRef.current?.focus(), 50);
  }, []);

  const continueToRegisterPassword = () => {
    const email = regEmail.trim().toLowerCase();
    const name = regName.trim();
    if (!name || !isPlausibleEmail(email)) {
      Alert.alert("Hinweis", "Bitte deinen Namen eintragen.");
      return;
    }
    setRegPassword("");
    setRegPasswordConfirm("");
    setRegisterLegalConsentChecked(false);
    setRegSubStep("password");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const submitProfileEmailLogin = async () => {
    const email = loginEmail.trim().toLowerCase();
    if (!isPlausibleEmail(email) || !loginPassword) {
      Alert.alert("Hinweis", "Bitte E-Mail und Passwort eingeben.");
      return;
    }
    setLoginLoading(true);
    try {
      const outcome = await loginWithEmailAccount({ email, password: loginPassword });
      if (!outcome.ok) {
        Alert.alert("Anmeldung fehlgeschlagen", outcome.error);
        return;
      }
      setProfileStep("social");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler.");
    } finally {
      setLoginLoading(false);
    }
  };

  const startProfilePasswordReset = async () => {
    const email = pwdResetEmail.trim().toLowerCase();
    if (!isPlausibleEmail(email)) {
      Alert.alert("Hinweis", mapEmailVerificationApiError("invalid_email"));
      return;
    }
    setEmailStartLoading(true);
    try {
      const outcome = await startEmailVerification({
        email,
        purpose: CUSTOMER_PASSWORD_RESET_PURPOSE,
      });
      if (!outcome.ok) {
        Alert.alert(
          outcome.status === 429 ? "Bitte warten" : "Hinweis",
          mapEmailVerificationApiError(outcome.error),
        );
        return;
      }
      setPwdResetOtp("");
      setPendingPwdResetProof(undefined);
      setPwdResetCooldown(60);
      setProfileStep("pwd_reset_verify");
      if (profile.isLoggedIn) {
        setAccountPwdFlow(true);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler.");
    } finally {
      setEmailStartLoading(false);
    }
  };

  const verifyProfilePasswordReset = async () => {
    const email = pwdResetEmail.trim().toLowerCase();
    const digits = pwdResetOtp.replace(/\D/g, "").slice(0, 6);
    if (!isPlausibleEmail(email) || digits.length !== 6) {
      Alert.alert("Hinweis", mapEmailVerificationApiError("invalid_params"));
      return;
    }
    setEmailVerifyLoading(true);
    try {
      const outcome = await verifyEmailVerificationCode({
        email,
        code: digits,
        purpose: CUSTOMER_PASSWORD_RESET_PURPOSE,
      });
      if (!outcome.ok) {
        Alert.alert("Hinweis", mapEmailVerificationApiError(outcome.error));
        return;
      }
      if (!outcome.proofToken?.trim()) {
        Alert.alert("Hinweis", "Code ungültig — bitte erneut anfordern.");
        return;
      }
      setPendingPwdResetProof(outcome.proofToken);
      setPwdResetPassword("");
      setPwdResetPasswordConfirm("");
      if (profile.isLoggedIn) {
        setAccountPwdFlow(true);
      }
      setProfileStep("pwd_reset_new");
      Keyboard.dismiss();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler.");
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const confirmProfilePasswordReset = async () => {
    const email = pwdResetEmail.trim().toLowerCase();
    const proof = pendingPwdResetProof?.trim() ?? "";
    if (!isPlausibleEmail(email) || !proof) {
      Alert.alert("Hinweis", "Bitte Passwort-Reset von vorne starten.");
      return;
    }
    setPwdResetSubmitLoading(true);
    try {
      const outcome = await confirmCustomerPasswordReset({
        email,
        proofToken: proof,
        password: pwdResetPassword,
        passwordConfirm: pwdResetPasswordConfirm,
      });
      if (!outcome.ok) {
        Alert.alert("Hinweis", mapCustomerAuthApiError(outcome.error));
        return;
      }
      setAccountPwdFlow(false);
      setProfileStep("social");
      if (profile.isLoggedIn) {
        Alert.alert("Passwort geändert", "Dein Passwort wurde aktualisiert.");
      } else {
        Alert.alert("Passwort gespeichert", "Du kannst dich jetzt anmelden.", [{
          text: "Zum Login",
          onPress: () => {
            setLoginEmail(email);
            setLoginPassword("");
            setProfileStep("email_login");
          },
        }]);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler.");
    } finally {
      setPwdResetSubmitLoading(false);
    }
  };

  const openAccountPasswordChange = () => {
    const email = profile.email?.trim().toLowerCase() ?? "";
    setPwdResetEmail(email);
    setPwdResetOtp("");
    setPendingPwdResetProof(undefined);
    setPwdResetPassword("");
    setPwdResetPasswordConfirm("");
    setProfileStep("pwd_reset_email");
    setAccountPwdFlow(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRegisterComplete = async () => {
    const email = regEmail.trim().toLowerCase();
    const name = regName.trim();
    const proof = pendingEmailProofToken?.trim() ?? "";
    if (!name || !isPlausibleEmail(email) || !proof) {
      Alert.alert("Hinweis", "Bitte Registrierung von vorne starten.");
      return;
    }
    if (!registerLegalConsentChecked) {
      Alert.alert("Hinweis", mapCustomerLegalError("legal_acceptance_required"));
      return;
    }
    setRegisterSubmitLoading(true);
    try {
      const outcome = await registerCustomerAccount({
        name,
        email,
        password: regPassword,
        passwordConfirm: regPasswordConfirm,
        emailVerificationProofToken: proof,
        acceptLegal: true,
      });
      if (!outcome.ok) {
        Alert.alert("Hinweis", outcome.error);
        return;
      }
      setProfileStep("social");
      setRegSubStep("email");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler.");
    } finally {
      setRegisterSubmitLoading(false);
    }
  };

  const kontoBalanceEuro = 0;
  const kontoBalanceLabel = formatKontoBalanceEur(kontoBalanceEuro);
  const isAccountVerified =
    !!profile.googleId ||
    !!(typeof profile.sessionToken === "string" && profile.sessionToken.trim()) ||
    !!(typeof profile.emailVerificationProofToken === "string" && profile.emailVerificationProofToken.trim());

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {profile.isLoggedIn ? (
        <View
          style={[
            styles.header,
            {
              paddingTop: topPad + 8,
              backgroundColor: HOME_SHEET_PANEL,
              borderBottomColor: HOME_SHEET_RIM,
            },
          ]}
        >
          <View style={{ width: 36 }} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Konto</Text>
          <View style={{ width: 36 }} />
        </View>
      ) : (
        <View
          style={[
            styles.header,
            {
              paddingTop: topPad + 8,
              backgroundColor: HOME_SHEET_PANEL,
              borderBottomColor: HOME_SHEET_RIM,
            },
          ]}
        >
          <View style={{ width: 36 }} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("profile.myAccount")}</Text>
          <View style={{ width: 36 }} />
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          profile.isLoggedIn && styles.scrollAccountLoggedIn,
          { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) },
        ]}
      >
        {profile.isLoggedIn ? (
          /* ══ LOGGED IN ══ */
          <>
              {accountPwdFlow ? (
                <View style={[styles.loginCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, marginHorizontal: rs(24) }]}>
                  {profileStep === "pwd_reset_email" ? (
                    <View style={styles.signInBlock}>
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
                        onPress={() => {
                          setAccountPwdFlow(false);
                          setProfileStep("social");
                        }}
                      >
                        <Feather name="arrow-left" size={16} color={colors.foreground} />
                        <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                      </Pressable>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Passwort ändern</Text>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        Code an deine E-Mail — danach neues Passwort setzen.
                      </Text>
                      <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                        <Feather name="mail" size={16} color={colors.mutedForeground} />
                        <TextInput
                          style={[styles.inputField, { color: colors.foreground }]}
                          placeholder="E-Mail"
                          placeholderTextColor={colors.mutedForeground}
                          value={pwdResetEmail}
                          onChangeText={setPwdResetEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          editable={!emailStartLoading}
                        />
                      </View>
                      <Pressable
                        style={loginActionButtonStyle({
                          backgroundColor: "#111111",
                          paddingVertical: rs(16),
                          borderRadius: rs(14),
                          marginTop: rs(4),
                          opacity: emailStartLoading ? 0.72 : 1,
                        })}
                        onPress={() => void startProfilePasswordReset()}
                        disabled={emailStartLoading}
                      >
                        {emailStartLoading ? (
                          <Text style={loginActionLabelStyle({ color: "#fff" })}>Code senden…</Text>
                        ) : (
                          <>
                            <Feather name="send" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
                            <Text style={loginActionLabelStyle({ color: "#fff" })}>Code senden</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ) : profileStep === "pwd_reset_verify" ? (
                    <View style={styles.signInBlock}>
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
                        onPress={() => setProfileStep("pwd_reset_email")}
                      >
                        <Feather name="arrow-left" size={16} color={colors.foreground} />
                        <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                      </Pressable>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Code eingeben</Text>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        6-stelliger Code aus der E-Mail.
                      </Text>
                      <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                        <Feather name="hash" size={16} color={colors.mutedForeground} />
                        <TextInput
                          style={[styles.inputField, { color: colors.foreground, letterSpacing: 4 }]}
                          placeholder="6-stelliger Code"
                          placeholderTextColor={colors.mutedForeground}
                          value={pwdResetOtp}
                          onChangeText={(t) => setPwdResetOtp(t.replace(/\D/g, "").slice(0, 6))}
                          keyboardType="number-pad"
                          maxLength={6}
                          editable={!emailVerifyLoading}
                        />
                      </View>
                      <Pressable
                        style={loginActionButtonStyle({
                          backgroundColor: pwdResetOtp.length === 6 ? "#111111" : colors.muted,
                          paddingVertical: rs(16),
                          borderRadius: rs(14),
                          marginTop: rs(4),
                          opacity: emailVerifyLoading ? 0.72 : 1,
                        })}
                        onPress={() => void verifyProfilePasswordReset()}
                        disabled={pwdResetOtp.length !== 6 || emailVerifyLoading}
                      >
                        {emailVerifyLoading ? (
                          <LoginActionLabel color="#fff">Wird geprüft…</LoginActionLabel>
                        ) : (
                          <>
                            <LoginActionIcon>
                              <Feather name="check" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
                            </LoginActionIcon>
                            <LoginActionLabel color="#fff">Absenden</LoginActionLabel>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.signInBlock}>
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
                        onPress={() => setProfileStep("pwd_reset_verify")}
                      >
                        <Feather name="arrow-left" size={16} color={colors.foreground} />
                        <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                      </Pressable>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Neues Passwort</Text>
                      <CustomerPasswordFields
                        password={pwdResetPassword}
                        confirm={pwdResetPasswordConfirm}
                        onChangePassword={setPwdResetPassword}
                        onChangeConfirm={setPwdResetPasswordConfirm}
                        colors={{
                          foreground: colors.foreground,
                          mutedForeground: colors.mutedForeground,
                          border: HOME_SHEET_RIM,
                          surface: HOME_SHEET_PANEL,
                        }}
                        inputWrapStyle={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}
                        inputFieldStyle={styles.inputField}
                        onSubmitPassword={() => void confirmProfilePasswordReset()}
                      />
                      <Pressable
                        style={loginActionButtonStyle({
                          backgroundColor: isCustomerPasswordFormValid(pwdResetPassword, pwdResetPasswordConfirm)
                            ? "#111111"
                            : colors.muted,
                          paddingVertical: rs(16),
                          borderRadius: rs(14),
                          marginTop: rs(4),
                          opacity: pwdResetSubmitLoading ? 0.72 : 1,
                        })}
                        onPress={() => void confirmProfilePasswordReset()}
                        disabled={
                          !isCustomerPasswordFormValid(pwdResetPassword, pwdResetPasswordConfirm)
                          || pwdResetSubmitLoading
                        }
                      >
                        {pwdResetSubmitLoading ? (
                          <LoginActionLabel color="#fff">Speichern…</LoginActionLabel>
                        ) : (
                          <>
                            <LoginActionIcon>
                              <Feather name="check" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
                            </LoginActionIcon>
                            <LoginActionLabel color="#fff">Passwort speichern</LoginActionLabel>
                          </>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : (
              <>
              <View style={styles.accountSection}>
                <AccountProfileHeroCard
                  name={profile.name ?? ""}
                  email={profile.email ?? ""}
                  isVerified={isAccountVerified}
                  photoUri={profile.photoUri}
                  onPress={() => setPersonalDataOpen(true)}
                />

                <View style={{ marginTop: rs(12) }}>
                  <SectionCard compact>
                    <AccountRow
                      icon={<MaterialCommunityIcons name="account" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                      label={t("profile.profile")}
                      isFirst
                      onPress={() => setPersonalDataOpen(true)}
                    />
                    <AccountRow
                      icon={<MaterialCommunityIcons name="hospital-box" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                      label={t("profile.patientProfile")}
                      onPress={() => setPatientProfileOpen(true)}
                      isLast
                    />
                  </SectionCard>
                </View>
              </View>

              <View style={styles.accountSection}>
                <SectionCard compact>
                  <AccountRow
                    icon={<MaterialCommunityIcons name="wallet" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label={t("profile.paymentMethods")}
                    isFirst
                    onPress={() => router.push("/wallet")}
                  />
                  <AccountRow
                    icon={<MaterialCommunityIcons name="history" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label={t("profile.transactionHistory")}
                    onPress={() => router.push("/wallet")}
                  />
                  <AccountRow
                    icon={<MaterialCommunityIcons name="file-document-outline" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label={t("profile.billingAddress")}
                    onPress={() => setBillingOpen(true)}
                    isLast
                  />
                </SectionCard>
              </View>

              <View style={styles.accountSection}>
                <SectionCard compact>
                  <AccountRow
                    icon={<MaterialCommunityIcons name="file-document-outline" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label="AGB"
                    isFirst
                    onPress={() => {
                      Haptics.selectionAsync();
                      openOnrodaLegalPage("agb");
                    }}
                  />
                  <AccountRow
                    icon={<MaterialCommunityIcons name="shield-lock-outline" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label="Datenschutz"
                    isLast
                    onPress={() => {
                      Haptics.selectionAsync();
                      openOnrodaLegalPage("datenschutz");
                    }}
                  />
                </SectionCard>
              </View>

              <View style={styles.accountSection}>
                <SectionCard compact>
                  <AccountRow
                    icon={<MaterialCommunityIcons name="web" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label={t("profile.language")}
                    valueText={t("language.names.de")}
                    hideChevron
                    readOnly
                    isFirst
                  />
                  <AccountRow
                    icon={<MaterialCommunityIcons name="lock-outline" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label="Passwort ändern"
                    onPress={openAccountPasswordChange}
                  />
                  <AccountRow
                    icon={<MaterialCommunityIcons name="help-circle-outline" size={ACCOUNT_TILE_ICON} color={colors.foreground} />}
                    label={t("profile.helpSupport")}
                    isLast
                    onPress={() => {
                      Haptics.selectionAsync();
                      router.replace("/help");
                    }}
                  />
                </SectionCard>
              </View>

              <View style={styles.accountSection}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    Alert.alert(t("profile.logoutConfirmTitle"), t("profile.logoutConfirmMessage"), [
                      { text: t("common.cancel"), style: "cancel" },
                      { text: t("profile.logout"), style: "destructive", onPress: () => void handleLogout() },
                    ]);
                  }}
                  style={({ pressed }) => [
                    styles.accountActionBtn,
                    styles.logoutAccountBtn,
                    { backgroundColor: pressed ? "#EFF6FF" : "#FFFFFF" },
                  ]}
                >
                  <View style={styles.accountActionBtnContent}>
                    <Feather name="log-out" size={rs(18)} color="#2563EB" />
                    <Text style={styles.logoutAccountBtnText}>{t("profile.logout")}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={deleteAccountLoading}
                  onPress={handleDeleteAccount}
                  style={({ pressed }) => [
                    styles.accountActionBtn,
                    styles.deleteAccountBtn,
                    {
                      backgroundColor: pressed ? "#FEE2E2" : "#FFFFFF",
                      opacity: deleteAccountLoading ? 0.6 : 1,
                    },
                  ]}
                >
                  {deleteAccountLoading ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <View style={styles.accountActionBtnContent}>
                      <MaterialCommunityIcons name="account-remove-outline" size={rs(18)} color="#DC2626" />
                      <Text style={styles.deleteAccountBtnText}>Konto löschen</Text>
                    </View>
                  )}
                </Pressable>
              </View>
              </>
              )}

            {/* Personal Data Modal */}
            <PersonalDataModal
              visible={personalDataOpen}
              initialName={profile.name}
              initialEmail={profile.email}
              initialPhone={profile.phone ?? ""}
              initialAddress={profile.address ?? ""}
              initialCity={profile.city ?? ""}
              isGoogleUser={isGoogleOAuthProfile(profile)}
              onClose={(data) => {
                if (data) {
                  updateProfile(data);
                  Alert.alert(t("alerts.saved"), t("alerts.savedProfile"));
                }
                setPersonalDataOpen(false);
              }}
            />

            {/* Patient Profile Modal */}
            <BillingModal
              visible={billingOpen}
              profile={profile}
              onClose={(data) => {
                if (data) { updateProfile(data); Alert.alert(t("alerts.saved"), t("alerts.savedBilling")); }
                setBillingOpen(false);
              }}
            />
            <PatientProfileModal
              visible={patientProfileOpen}
              profile={profile}
              onClose={(data) => {
                if (data) {
                  updateProfile(data);
                  Alert.alert(t("alerts.saved"), t("alerts.savedPatient"));
                }
                setPatientProfileOpen(false);
              }}
            />
          </>
        ) : (
          /* ══ NOT LOGGED IN ══ */
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.loginSection, { paddingHorizontal: loginPadH }]}>
              {/* App branding */}
              <View style={styles.brandBlock}>
                <View style={{ alignSelf: "center", marginLeft: rs(22) }}>
                  <OnrodaOrMark size={rs(42)} />
                </View>
                <Text style={[styles.brandTitle, { color: colors.foreground }]}>Onroda</Text>
                <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>
                  Mobilität ohne Grenzen
                </Text>
              </View>

              {profileStep === "social" ? (
                <>
                <View style={[styles.loginCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
                  <NeuBeiOnrodaRegisterRow
                    mutedColor={colors.mutedForeground}
                    marginBottom={rs(10)}
                    fontSize={rf(14)}
                    onRegisterPress={goRegister}
                  />
                  <CustomerLegalConsentCheckbox
                    checked={socialRegisterLegalChecked}
                    onCheckedChange={setSocialRegisterLegalChecked}
                    mutedColor={colors.mutedForeground}
                    fontSize={rf(11)}
                  />
                  <View style={{ gap: 10 }}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.socialBtn,
                        socialLoginButtonStyle({
                          backgroundColor: HOME_SHEET_PANEL,
                          borderColor: HOME_SHEET_RIM,
                          paddingVertical: rs(16),
                          opacity: (pressed || googleLoading) ? 0.9 : 1,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 4,
                          elevation: 1,
                        }),
                      ]}
                      onPress={handleGoogleLogin}
                      disabled={googleLoading}
                    >
                      <LoginActionIcon>
                        {googleLoading
                          ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                          : (
                            <Image
                              source={require("../assets/images/google-icon.png")}
                              style={{ width: LOGIN_ACTION_ICON_SIZE, height: LOGIN_ACTION_ICON_SIZE }}
                              resizeMode="contain"
                            />
                          )}
                      </LoginActionIcon>
                      <Text style={loginActionLabelStyle({ color: colors.foreground })}>
                        {googleLoading ? "Anmeldung läuft…" : "Weiter mit Google"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.socialBtn,
                        socialLoginButtonStyle({
                          backgroundColor: HOME_SHEET_PANEL,
                          borderColor: HOME_SHEET_RIM,
                          paddingVertical: rs(16),
                          opacity: pressed ? 0.9 : 1,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 4,
                          elevation: 1,
                        }),
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setLoginEmail("");
                        setLoginPassword("");
                        setProfileStep("email_login");
                      }}
                    >
                      <LoginActionIcon>
                        <Feather name="mail" size={LOGIN_ACTION_ICON_SIZE} color={colors.foreground} />
                      </LoginActionIcon>
                      <LoginActionLabel color={colors.foreground}>
                        Mit E-Mail anmelden
                      </LoginActionLabel>
                    </Pressable>

                    {Platform.OS === "ios" ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.socialBtn,
                          socialLoginButtonStyle({
                            backgroundColor: HOME_SHEET_PANEL,
                            borderColor: HOME_SHEET_RIM,
                            paddingVertical: rs(16),
                            opacity: pressed || appleLoading ? 0.9 : 1,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 4,
                            elevation: 1,
                          }),
                        ]}
                        onPress={handleAppleLogin}
                        disabled={appleLoading}
                      >
                        <LoginActionIcon>
                          {appleLoading
                            ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                            : <MaterialCommunityIcons name="apple" size={LOGIN_ACTION_ICON_SIZE} color={colors.foreground} />}
                        </LoginActionIcon>
                        <LoginActionLabel color={colors.foreground}>
                          {appleLoading ? "Anmeldung läuft…" : "Weiter mit Apple"}
                        </LoginActionLabel>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginVertical: rs(4),
                    paddingHorizontal: rs(8),
                  }}
                >
                  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <Text
                    style={{
                      marginHorizontal: rs(14),
                      fontSize: rf(13),
                      fontFamily: "Inter_500Medium",
                      color: colors.mutedForeground,
                    }}
                  >
                    oder
                  </Text>
                  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                </View>

                <View style={[styles.loginCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
                  <Pressable
                    style={({ pressed }) => loginActionButtonStyle({
                      paddingVertical: rs(16),
                      borderRadius: rs(14),
                      backgroundColor: "#111111",
                      opacity: pressed ? 0.88 : 1,
                    })}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/driver/login");
                    }}
                  >
                    <View style={{ flexShrink: 0 }}>
                      <MaterialCommunityIcons name="steering" size={LOGIN_ACTION_ICON_SIZE} color="#FFFFFF" />
                    </View>
                    <LoginActionLabel color="#FFFFFF">
                      Fahrer-Login
                    </LoginActionLabel>
                  </Pressable>
                </View>
                <CustomerLegalLinksFooter mutedColor={colors.mutedForeground} fontSize={rf(10)} />
                </>
              ) : profileStep === "email_login" ? (
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setProfileStep("social")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Mit E-Mail anmelden</Text>
                  <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                    <Feather name="mail" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="E-Mail"
                      placeholderTextColor={colors.mutedForeground}
                      value={loginEmail}
                      onChangeText={setLoginEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!loginLoading}
                    />
                  </View>
                  <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                    <Feather name="lock" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground, flex: 1 }]}
                      placeholder="Passwort"
                      placeholderTextColor={colors.mutedForeground}
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                      secureTextEntry={!showLoginPassword}
                      autoCapitalize="none"
                      editable={!loginLoading}
                      onSubmitEditing={() => void submitProfileEmailLogin()}
                    />
                    <Pressable onPress={() => setShowLoginPassword((v) => !v)} hitSlop={10}>
                      <Feather name={showLoginPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <Pressable
                    style={{ alignSelf: "flex-start", paddingVertical: 4 }}
                    onPress={() => {
                      setPwdResetEmail(loginEmail.trim().toLowerCase());
                      setProfileStep("pwd_reset_email");
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.primary }}>Passwort vergessen?</Text>
                  </Pressable>
                  <Pressable
                    style={emailLoginSubmitButtonStyle({
                      backgroundColor: loginEmail.trim() && loginPassword ? "#111111" : colors.muted,
                      paddingVertical: rs(16),
                      borderRadius: rs(14),
                      marginTop: rs(4),
                      opacity: loginLoading ? 0.72 : 1,
                    })}
                    onPress={() => void submitProfileEmailLogin()}
                    disabled={loginLoading || !loginEmail.trim() || !loginPassword}
                  >
                    {loginLoading ? (
                      <Text style={loginActionLabelStyle({
                        color: loginEmail.trim() && loginPassword ? "#fff" : colors.mutedForeground,
                      })}
                      >
                        Anmelden…
                      </Text>
                    ) : (
                      <>
                        <LoginActionIcon>
                          <Feather
                            name="log-in"
                            size={LOGIN_ACTION_ICON_SIZE}
                            color={loginEmail.trim() && loginPassword ? "#fff" : colors.mutedForeground}
                          />
                        </LoginActionIcon>
                        <Text style={loginActionLabelStyle({
                          color: loginEmail.trim() && loginPassword ? "#fff" : colors.mutedForeground,
                        })}
                        >
                          Anmelden
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : profileStep === "pwd_reset_email" ? (
                <View style={[styles.loginCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
                <View style={styles.signInBlock}>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
                    onPress={() => setProfileStep(profile.isLoggedIn ? "social" : "email_login")}
                  >
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Passwort zurücksetzen</Text>
                  <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                    <Feather name="mail" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="E-Mail"
                      placeholderTextColor={colors.mutedForeground}
                      value={pwdResetEmail}
                      onChangeText={setPwdResetEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!emailStartLoading}
                    />
                  </View>
                  <Pressable
                    style={loginActionButtonStyle({
                      backgroundColor: "#111111",
                      paddingVertical: rs(16),
                      borderRadius: rs(14),
                      marginTop: rs(4),
                      opacity: emailStartLoading ? 0.72 : 1,
                    })}
                    onPress={() => void startProfilePasswordReset()}
                    disabled={emailStartLoading}
                  >
                    {emailStartLoading ? (
                      <Text style={loginActionLabelStyle({ color: "#fff" })}>Code senden…</Text>
                    ) : (
                      <>
                        <Feather name="send" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
                        <Text style={loginActionLabelStyle({ color: "#fff" })}>Code senden</Text>
                      </>
                    )}
                  </Pressable>
                </View>
                </View>
              ) : profileStep === "pwd_reset_verify" ? (
                <View style={[styles.loginCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setProfileStep("pwd_reset_email")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Code eingeben</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                    6-stelliger Code aus der E-Mail.
                  </Text>
                  <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                    <Feather name="hash" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground, letterSpacing: 4 }]}
                      placeholder="6-stelliger Code"
                      placeholderTextColor={colors.mutedForeground}
                      value={pwdResetOtp}
                      onChangeText={(t) => setPwdResetOtp(t.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!emailVerifyLoading}
                    />
                  </View>
                  <Pressable
                    style={loginActionButtonStyle({
                      backgroundColor: pwdResetOtp.length === 6 ? "#111111" : colors.muted,
                      paddingVertical: rs(16),
                      borderRadius: rs(14),
                      marginTop: rs(4),
                      opacity: emailVerifyLoading ? 0.72 : 1,
                    })}
                    onPress={() => void verifyProfilePasswordReset()}
                    disabled={pwdResetOtp.length !== 6 || emailVerifyLoading}
                  >
                    {emailVerifyLoading ? (
                      <LoginActionLabel color="#fff">Wird geprüft…</LoginActionLabel>
                    ) : (
                      <>
                        <LoginActionIcon>
                          <Feather name="check" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
                        </LoginActionIcon>
                        <LoginActionLabel color="#fff">Absenden</LoginActionLabel>
                      </>
                    )}
                  </Pressable>
                </View>
                </View>
              ) : profileStep === "pwd_reset_new" ? (
                <View style={[styles.loginCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setProfileStep("pwd_reset_verify")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>Neues Passwort</Text>
                  <CustomerPasswordFields
                    password={pwdResetPassword}
                    confirm={pwdResetPasswordConfirm}
                    onChangePassword={setPwdResetPassword}
                    onChangeConfirm={setPwdResetPasswordConfirm}
                    colors={{
                      foreground: colors.foreground,
                      mutedForeground: colors.mutedForeground,
                      border: HOME_SHEET_RIM,
                      surface: HOME_SHEET_PANEL,
                    }}
                    inputWrapStyle={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}
                    inputFieldStyle={styles.inputField}
                    onSubmitPassword={() => void confirmProfilePasswordReset()}
                  />
                  <Pressable
                    style={loginActionButtonStyle({
                      backgroundColor: isCustomerPasswordFormValid(pwdResetPassword, pwdResetPasswordConfirm)
                        ? "#111111"
                        : colors.muted,
                      paddingVertical: rs(16),
                      borderRadius: rs(14),
                      marginTop: rs(4),
                      opacity: pwdResetSubmitLoading ? 0.72 : 1,
                    })}
                    onPress={() => void confirmProfilePasswordReset()}
                    disabled={
                      !isCustomerPasswordFormValid(pwdResetPassword, pwdResetPasswordConfirm)
                      || pwdResetSubmitLoading
                    }
                  >
                    {pwdResetSubmitLoading ? (
                      <LoginActionLabel color="#fff">Speichern…</LoginActionLabel>
                    ) : (
                      <>
                        <LoginActionIcon>
                          <Feather name="check" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
                        </LoginActionIcon>
                        <LoginActionLabel color="#fff">Passwort speichern</LoginActionLabel>
                      </>
                    )}
                  </Pressable>
                </View>
                </View>
              ) : regSubStep === "email" ? (
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => { setProfileStep("social"); setRegSubStep("email"); }}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>

                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>E-Mail-Adresse</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 8 }}>
                    Bestätigungscode per E-Mail (ca. 10 Minuten gültig).
                  </Text>

                  <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                    <Feather name="mail" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="E-Mail"
                      placeholderTextColor={colors.mutedForeground}
                      value={regEmail}
                      onChangeText={setRegEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      editable={!emailStartLoading}
                    />
                  </View>

                  <Pressable
                    style={[styles.registerBtn, {
                      backgroundColor: isPlausibleEmail(regEmail) ? "#111111" : colors.muted,
                    }]}
                    onPress={() => void submitEmailStart()}
                    disabled={!isPlausibleEmail(regEmail) || emailStartLoading}
                  >
                    {emailStartLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Feather name="send" size={18} color={isPlausibleEmail(regEmail) ? "#fff" : colors.mutedForeground} />
                    )}
                    <Text style={[styles.registerBtnText, {
                      color: isPlausibleEmail(regEmail) ? "#fff" : colors.mutedForeground,
                    }]}
                    >
                      Code senden
                    </Text>
                  </Pressable>
                </View>
              ) : regSubStep === "verify" ? (
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setRegSubStep("email")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>

                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>Bestätigungscode</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 8 }}>
                    E-Mail <Text style={{ fontFamily: "Inter_600SemiBold" }}>{regEmail.trim()}</Text>
                  </Text>

                  <View style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
                    <Feather name="hash" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground, letterSpacing: 3 }]}
                      placeholder="6-stelliger Code"
                      placeholderTextColor={colors.mutedForeground}
                      value={regOtpDigits}
                      onChangeText={(t) => setRegOtpDigits(t.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      editable={!emailVerifyLoading}
                    />
                  </View>

                  <Pressable
                    style={[styles.registerBtn, {
                      backgroundColor: regOtpDigits.trim().length === 6 ? "#111111" : colors.muted,
                    }]}
                    onPress={() => void submitEmailVerifyContinue()}
                    disabled={regOtpDigits.trim().length !== 6 || emailVerifyLoading}
                  >
                    {emailVerifyLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Feather name="check" size={18} color={regOtpDigits.trim().length === 6 ? "#fff" : colors.mutedForeground} />
                    )}
                    <Text style={[styles.registerBtnText, { color: regOtpDigits.trim().length === 6 ? "#fff" : colors.mutedForeground }]}>
                      Code prüfen & weiter
                    </Text>
                  </Pressable>

                  <Pressable
                    style={{ alignSelf: "center", paddingVertical: 10 }}
                    onPress={() => void submitEmailResend()}
                    disabled={cooldownSecs > 0 || emailStartLoading}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontFamily: "Inter_500Medium",
                      color: cooldownSecs > 0 ? colors.mutedForeground : colors.primary,
                    }}
                    >
                      {cooldownSecs > 0 ? `Erneut senden in ${cooldownSecs}s` : "Code erneut senden"}
                    </Text>
                  </Pressable>
                </View>
              ) : regSubStep === "profile" ? (
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setRegSubStep("verify")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>

                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>Profil</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 8 }}>
                    E-Mail bestätigt. Bitte deinen Namen angeben.
                  </Text>

                  <Pressable
                    style={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}
                    onPress={focusRegNameInput}
                  >
                    <Feather name="user" size={16} color={colors.mutedForeground} />
                    <TextInput
                      ref={regNameRef}
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="Vor- und Nachname"
                      placeholderTextColor={colors.mutedForeground}
                      value={regName}
                      onChangeText={setRegName}
                      autoCapitalize="words"
                      returnKeyType="done"
                      editable
                      onPressIn={focusRegNameInput}
                      onSubmitEditing={continueToRegisterPassword}
                    />
                  </Pressable>

                  <Pressable
                    style={[styles.registerBtn, {
                      backgroundColor: regName.trim() ? "#111111" : colors.muted,
                    }]}
                    onPress={continueToRegisterPassword}
                    disabled={!regName.trim()}
                  >
                    <Feather
                      name="arrow-right"
                      size={18}
                      color={regName.trim() ? "#fff" : colors.mutedForeground}
                    />
                    <Text style={[styles.registerBtnText, {
                      color: regName.trim() ? "#fff" : colors.mutedForeground,
                    }]}
                    >
                      Weiter
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setRegSubStep("profile")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>Passwort setzen</Text>
                  <CustomerPasswordFields
                    password={regPassword}
                    confirm={regPasswordConfirm}
                    onChangePassword={setRegPassword}
                    onChangeConfirm={setRegPasswordConfirm}
                    colors={{
                      foreground: colors.foreground,
                      mutedForeground: colors.mutedForeground,
                      border: HOME_SHEET_RIM,
                      surface: HOME_SHEET_PANEL,
                    }}
                    inputWrapStyle={[styles.inputRow, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}
                    inputFieldStyle={styles.inputField}
                    onSubmitPassword={() => void handleRegisterComplete()}
                  />
                  <CustomerLegalConsentCheckbox
                    checked={registerLegalConsentChecked}
                    onCheckedChange={setRegisterLegalConsentChecked}
                    mutedColor={colors.mutedForeground}
                    fontSize={rf(11)}
                  />
                  <Pressable
                    style={[styles.registerBtn, {
                      backgroundColor: isCustomerPasswordFormValid(regPassword, regPasswordConfirm)
                        && registerLegalConsentChecked
                        ? "#111111"
                        : colors.muted,
                    }]}
                    onPress={() => void handleRegisterComplete()}
                    disabled={
                      !isCustomerPasswordFormValid(regPassword, regPasswordConfirm)
                      || !registerLegalConsentChecked
                      || registerSubmitLoading
                    }
                  >
                    {registerSubmitLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather
                        name="check"
                        size={18}
                        color={
                          isCustomerPasswordFormValid(regPassword, regPasswordConfirm)
                          && registerLegalConsentChecked
                            ? "#fff"
                            : colors.mutedForeground
                        }
                      />
                    )}
                    <Text style={[styles.registerBtnText, {
                      color: isCustomerPasswordFormValid(regPassword, regPasswordConfirm)
                        && registerLegalConsentChecked
                        ? "#fff"
                        : colors.mutedForeground,
                    }]}
                    >
                      Registrierung abschließen
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        )}

        {/* ── Horizontal footer links ── */}
        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.replace("/help")} style={styles.footerLinkBtn}>
            <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Hilfe</Text>
          </Pressable>
          <Text style={[styles.footerSep, { color: colors.border }]}>|</Text>
          <Pressable onPress={() => router.push("/impressum")} style={styles.footerLinkBtn}>
            <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Impressum</Text>
          </Pressable>
          <Text style={[styles.footerSep, { color: colors.border }]}>|</Text>
          <Pressable onPress={() => openOnrodaLegalPage("datenschutz")} style={styles.footerLinkBtn}>
            <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Datenschutz</Text>
          </Pressable>
        </View>

      </ScrollView>
      <CustomerLegalConsentModal
        visible={legalConsentModalVisible}
        sessionToken={pendingOAuthSession?.sessionToken ?? ""}
        mutedColor={colors.mutedForeground}
        foregroundColor={colors.foreground}
        surfaceColor={colors.surface}
        borderColor={colors.border}
        onCancel={async () => {
          setLegalConsentModalVisible(false);
          setPendingOAuthSession(null);
          await clearPendingOAuthSession();
        }}
        onAccepted={async () => {
          const pending = pendingOAuthSession;
          if (!pending) return;
          await loginWithGoogle({
            ...pending.profile,
            sessionToken: pending.sessionToken,
          });
          await clearPendingOAuthSession();
          setLegalConsentModalVisible(false);
          setPendingOAuthSession(null);
        }}
      />
      <BottomTabBar active="account" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
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

  scroll: { paddingTop: rs(20), gap: 0 },
  /** Eingeloggt-Konto: mehr Luft unter der Kopfzeile als Wallet (`scroll`), damit die Sektionsblöcke nicht zu hoch kleben. */
  scrollAccountLoggedIn: {
    paddingHorizontal: rs(8),
    paddingTop: rs(24),
    gap: rs(10),
  },

  loginSection: { marginBottom: rs(8), gap: rs(28) },
  brandBlock: { alignItems: "center", gap: rs(8), paddingTop: rs(12) },
  brandTitle: { fontSize: rf(22), fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  brandSub: { fontSize: rf(13), fontFamily: "Inter_400Regular", textAlign: "center" },

  signInBlock: { gap: rs(10) },

  loginCard: {
    borderRadius: rs(16),
    borderWidth: 1,
    padding: rs(16),
    gap: rs(14),
  },
  socialBtn: {
    borderRadius: rs(14),
    borderWidth: 1,
    alignSelf: "stretch",
    width: "100%",
  },
  socialBtnText: {
    fontSize: rf(16),
    fontFamily: "Inter_500Medium",
  },

  /* Register form */
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    borderWidth: 1,
    borderRadius: rs(12),
    paddingHorizontal: rs(14),
    paddingVertical: rs(13),
  },
  inputField: {
    flex: 1,
    fontSize: rf(15),
    fontFamily: "Inter_400Regular",
  },
  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    paddingVertical: rs(16),
    borderRadius: rs(14),
    marginTop: rs(4),
  },
  registerBtnText: {
    fontSize: rf(15),
    fontFamily: "Inter_600SemiBold",
  },

  /* Profile card (logged in) */
  profileCard: {
    marginHorizontal: rs(16),
    marginBottom: rs(4),
    borderRadius: rs(20),
    borderWidth: 1,
    padding: rs(24),
    alignItems: "center",
    gap: rs(12),
  },
  avatar: { width: rs(84), height: rs(84), borderRadius: rs(42) },
  avatarPlaceholder: {
    width: rs(84), height: rs(84), borderRadius: rs(42),
    justifyContent: "center", alignItems: "center",
  },
  avatarInitial: { fontSize: rf(34), color: "#fff", fontFamily: "Inter_700Bold" },
  profileInfo: { alignItems: "center", gap: rs(4) },
  profileName: { fontSize: rf(20), fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: rf(14), fontFamily: "Inter_400Regular" },
  googleBadge: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(5),
    marginTop: rs(4), paddingHorizontal: rs(7), paddingVertical: rs(4),
    backgroundColor: "#F1F3F4", borderRadius: rs(20), borderWidth: 1, borderColor: "#DADCE0",
    alignSelf: "center",
  },
  googleBadgeText: { fontSize: rf(12), fontFamily: "Inter_500Medium", color: "#3C4043", lineHeight: rf(16) },

  /* Section + rows */
  section: { paddingHorizontal: rs(16), marginTop: rs(20), gap: rs(8) },
  sectionLabel: {
    fontSize: rf(11), fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8, marginLeft: rs(4),
  },
  sectionCard: {
    borderRadius: rs(24),
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionCardCompact: {
    borderRadius: rs(16),
    borderWidth: StyleSheet.hairlineWidth,
  },
  accountSection: {
    gap: rs(10),
  },
  accountActionBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: rs(16),
    paddingHorizontal: rs(16),
    borderRadius: rs(16),
    borderWidth: 1,
    minHeight: rs(52),
  },
  accountActionBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
  },
  logoutAccountBtn: {
    borderColor: "#2563EB",
  },
  logoutAccountBtnText: {
    fontSize: rf(15),
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
  },
  deleteAccountBtn: {
    borderColor: "#DC2626",
  },
  deleteAccountBtnText: {
    fontSize: rf(15),
    fontFamily: "Inter_600SemiBold",
    color: "#DC2626",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    padding: rs(16),
  },
  accountHeroName: {
    fontSize: rf(14),
    fontFamily: "Inter_600SemiBold",
    lineHeight: rf(20),
  },
  accountRowIconWrap: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(7),
    justifyContent: "center",
    alignItems: "center",
  },
  accountRowText: {
    flex: 1,
    minWidth: 0,
    gap: rs(1),
  },
  accountRowLabel: {
    ...accountSheetPrimaryLabel,
  },
  accountRowSub: {
    fontSize: rf(13),
    fontFamily: "Inter_400Regular",
    lineHeight: rf(19),
  },
  accountRowValue: {
    flexShrink: 1,
    maxWidth: "40%",
    ...accountSheetPrimaryLabel,
    textAlign: "right",
    marginRight: rs(4),
  },

  /* Personal Data Modal */
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
  modalTitle: { fontSize: rf(19), fontFamily: "Inter_600SemiBold" },
  modalField: { paddingHorizontal: rs(18), paddingVertical: rs(16) },
  modalFieldLabel: { fontSize: rf(14), fontFamily: "Inter_500Medium", letterSpacing: 0.2, marginBottom: rs(7) },
  modalFieldInput: { fontSize: rf(19), fontFamily: "Inter_400Regular" },
  modalSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    backgroundColor: "#DC2626",
    borderRadius: rs(14),
    paddingVertical: rs(14),
  },
  modalSaveBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff" },

  googleLockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
    backgroundColor: "#EFF6FF",
    borderRadius: rs(8),
    paddingHorizontal: rs(8),
    paddingVertical: rs(3),
  },
  googleLockText: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", color: "#4285F4" },
  optionalBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: rs(8),
    paddingHorizontal: rs(8),
    paddingVertical: rs(3),
  },
  optionalText: { fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#6B7280" },
  googleInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    padding: rs(16),
    borderRadius: rs(14),
    borderWidth: 1,
  },
  googleInfoText: { flex: 1, fontSize: rf(12), fontFamily: "Inter_400Regular", color: "#1e40af", lineHeight: rf(17) },

  /* Logout row (simple, no card) */
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingHorizontal: rs(16),
    paddingVertical: rs(15),
    borderRadius: rs(14),
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoutText: {
    fontSize: rf(15),
    fontFamily: "Inter_500Medium",
    color: "#DC2626",
  },

  /* Horizontal footer links */
  footerLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(6),
    marginTop: rs(28),
    marginBottom: rs(4),
    paddingHorizontal: rs(16),
  },
  footerLinkBtn: { paddingVertical: rs(6), paddingHorizontal: rs(4) },
  footerLinkText: { fontSize: rf(12), fontFamily: "Inter_400Regular" },
  footerSep: { fontSize: rf(12), fontFamily: "Inter_400Regular" },
});
