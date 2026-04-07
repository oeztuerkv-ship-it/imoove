import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { BottomTabBar } from "@/components/BottomTabBar";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnrodaOrMark } from "@/components/OnrodaOrMark";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { FahrerRegistrierenFooter, NeuBeiOnrodaRegisterRow } from "@/src/screens/LoginScreen";
import { type UserProfile, useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
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
const DEV_SMS_CODE = process.env.EXPO_PUBLIC_DEV_SMS_CODE ?? "123456";

function isPlausibleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/* ── Menu row ── */
function Row({
  iconName,
  iconBg,
  iconColor,
  label,
  sublabel,
  onPress,
  danger,
  isLast,
}: {
  iconName: string;
  iconBg?: string;
  iconColor?: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
  isLast?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.muted : "transparent" },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg ?? (danger ? "#FEE2E2" : colors.muted) }]}>
        <Feather name={iconName as any} size={17} color={iconColor ?? (danger ? "#DC2626" : colors.foreground)} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? "#DC2626" : colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>}
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
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

  const handleSave = () => {
    onClose({ name: initialName ?? "", email: initialEmail ?? "", phone: (phone ?? "").trim(), address: (address ?? "").trim(), city: (city ?? "").trim() });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable hitSlop={12} onPress={() => onClose(null)} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Persönliche Daten</Text>
          <View style={{ width: 36 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Karte 1: Name + E-Mail (von Google, read-only) */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.modalField, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>Name</Text>
                <Text style={[styles.modalFieldInput, { color: isGoogleUser ? colors.mutedForeground : colors.foreground }]}>
                  {initialName || "—"}
                </Text>
              </View>
              <View style={styles.modalField}>
                <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>E-Mail</Text>
                <Text style={[styles.modalFieldInput, { color: isGoogleUser ? colors.mutedForeground : colors.foreground }]}>
                  {initialEmail || "—"}
                </Text>
              </View>
            </View>

            {/* Karte 2: Telefon + Adresse (optional, editierbar) */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Telefon */}
              <View style={[styles.modalField, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>Telefon</Text>
                  <View style={styles.optionalBadge}><Text style={styles.optionalText}>optional</Text></View>
                </View>
                <TextInput
                  style={[styles.modalFieldInput, { color: colors.foreground }]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+49 711 000000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>
              {/* Straße / Hausnummer */}
              <View style={[styles.modalField, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>Straße / Nr.</Text>
                  <View style={styles.optionalBadge}><Text style={styles.optionalText}>optional</Text></View>
                </View>
                <TextInput
                  style={[styles.modalFieldInput, { color: colors.foreground }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Musterstraße 12"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              {/* PLZ / Ort */}
              <View style={styles.modalField}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>PLZ / Ort</Text>
                  <View style={styles.optionalBadge}><Text style={styles.optionalText}>optional</Text></View>
                </View>
                <TextInput
                  style={[styles.modalFieldInput, { color: colors.foreground }]}
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
              <View style={[styles.googleInfoBox, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                <Image
                  source={require("../assets/images/google-icon.png")}
                  style={{ width: 20, height: 20 }}
                  resizeMode="contain"
                />
                <Text style={styles.googleInfoText}>
                  Name und E-Mail werden von deinem Google-Konto übernommen und können hier nicht geändert werden.
                </Text>
              </View>
            )}

            {/* DSGVO Hinweis */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 }}>
              <Feather name="shield" size={14} color="#6B7280" style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 18 }}>
                Die Angaben zu Telefon und Adresse sind <Text style={{ fontFamily: "Inter_500Medium" }}>freiwillig</Text>. Sie können diese Daten jederzeit ändern oder löschen (DSGVO Art. 17).
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.modalSaveBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleSave}
            >
              <Feather name="save" size={16} color="#fff" />
              <Text style={styles.modalSaveBtnText}>Speichern</Text>
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
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14 }}>
      <Text style={{ fontSize: 17, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: "#22C55E" }}
        thumbColor="#fff"
      />
    </View>
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable hitSlop={12} onPress={() => onClose(null)} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Patienten-Profil</Text>
          <View style={{ width: 36 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Krankenversicherung */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.8, marginLeft: 4 }}>KRANKENVERSICHERUNG</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.modalField, divider]}>
                <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>Krankenkasse</Text>
                <TextInput
                  style={[styles.modalFieldInput, { color: colors.foreground }]}
                  value={krankenkasse}
                  onChangeText={setKrankenkasse}
                  placeholder="z.B. AOK Baden-Württemberg"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="next"
                />
              </View>
              <View style={styles.modalField}>
                <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>Versichertennummer</Text>
                <TextInput
                  style={[styles.modalFieldInput, { color: colors.foreground }]}
                  value={versichertennummer}
                  onChangeText={setVersichertennummer}
                  placeholder="A000000000"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Mobilitätsbedarf */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.8, marginLeft: 4 }}>MOBILITÄTSBEDARF</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={divider}><ToggleSwitchRow label="Rollstuhl" value={rollstuhl} onToggle={setRollstuhl} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Gehilfe / Rollator" value={rollator} onToggle={setRollator} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Blindenhund / Assistenzhund" value={blindenhund} onToggle={setBlindhund} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Sauerstoffgerät wird mitgenommen" value={sauerstoff} onToggle={setSauerstoff} colors={colors} /></View>
              <ToggleSwitchRow label="Begleitperson" value={begleitperson} onToggle={setBegleitperson} colors={colors} />
            </View>

            {/* Service-Optionen */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.8, marginLeft: 4 }}>SERVICE-OPTIONEN</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={divider}>
                <ToggleSwitchRow label="Abholung an der Wohnungstür" value={abholungTuer} onToggle={setAbholungTuer} colors={colors} />
                {abholungTuer && (
                  <View style={[styles.modalField, { paddingTop: 0 }]}>
                    <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground }]}>Stockwerk</Text>
                    <TextInput
                      style={[styles.modalFieldInput, { color: colors.foreground }]}
                      value={abholungStockwerk}
                      onChangeText={setAbholungStockwerk}
                      placeholder="z.B. 3. OG"
                      placeholderTextColor={colors.mutedForeground}
                      returnKeyType="done"
                    />
                  </View>
                )}
              </View>
              <View style={divider}><ToggleSwitchRow label="Dialyse-Transport" value={dialyse} onToggle={setDialyse} colors={colors} /></View>
              <View style={divider}><ToggleSwitchRow label="Begleitung bis zur Anmeldung" value={begleitungAnmeldung} onToggle={setBegleitungAnmeldung} colors={colors} /></View>
              <ToggleSwitchRow label="Tragehilfe (2. Fahrer erforderlich)" value={tragehilfe} onToggle={setTragehilfe} colors={colors} />
            </View>

            {/* Notfallkontakt */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginLeft: 4 }}>
              <Feather name="bell" size={17} color="#DC2626" />
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#DC2626", letterSpacing: 0.6 }}>NOTFALLKONTAKT</Text>
            </View>
            <View style={[styles.sectionCard, { backgroundColor: "#FFF5F5", borderColor: "#FCA5A5", borderWidth: 1.5 }]}>
              <View style={[styles.modalField, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#FCA5A5" }]}>
                <Text style={[styles.modalFieldLabel, { color: "#B91C1C" }]}>Name</Text>
                <TextInput
                  style={[styles.modalFieldInput, { color: colors.foreground }]}
                  value={notfallName}
                  onChangeText={setNotfallName}
                  placeholder="Vertrauensperson"
                  placeholderTextColor="#FCA5A5"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.modalField}>
                <Text style={[styles.modalFieldLabel, { color: "#B91C1C" }]}>Telefon</Text>
                <TextInput
                  style={[styles.modalFieldInput, { color: colors.foreground }]}
                  value={notfallTelefon}
                  onChangeText={setNotfallTelefon}
                  placeholder="+49 711 000000"
                  placeholderTextColor="#FCA5A5"
                  keyboardType="phone-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Notiz für den Fahrer */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginLeft: 4 }}>
              <Feather name="file-text" size={15} color={colors.mutedForeground} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.8 }}>NOTIZ FÜR DEN FAHRER</Text>
            </View>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginLeft: 4, marginTop: -8 }}>
              Freiwillig — alle Angaben sind optional. Nur für den Fahrer sichtbar.
            </Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
                <TextInput
                  style={{
                    fontSize: 16, fontFamily: "Inter_400Regular", color: colors.foreground,
                    minHeight: 90, textAlignVertical: "top",
                  }}
                  value={patientNotiz}
                  onChangeText={setPatientNotiz}
                  placeholder="z.B. Bitte klingeln, 3. OG links. Hund im Haus – keine Angst. Fahre regelmäßig zur Dialyse Di/Do/Sa."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={300}
                  returnKeyType="default"
                />
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "right", marginTop: 6 }}>
                  {patientNotiz.length}/300
                </Text>
              </View>
            </View>

            {/* Einwilligung */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 }}>
              <Feather name="shield" size={14} color="#6B7280" style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 18 }}>
                Alle Angaben sind <Text style={{ fontFamily: "Inter_500Medium" }}>freiwillig</Text> und werden nur zur Fahrtoptimierung gespeichert. Du kannst sie jederzeit ändern oder löschen (DSGVO Art. 17).
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.modalSaveBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleSave}
            >
              <Feather name="save" size={16} color="#fff" />
              <Text style={styles.modalSaveBtnText}>Speichern</Text>
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
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const bottomPad = isWeb ? 20 : insets.bottom;

  const { profile, loginWithGoogle, updateProfile, logout, registerLocalCustomer } = useUser();

  const [profileStep, setProfileStep] = useState<"social" | "register">("social");
  const [regSubStep, setRegSubStep] = useState<"form" | "verify">("form");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regSms, setRegSms] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [personalDataOpen, setPersonalDataOpen] = useState(false);
  const [patientProfileOpen, setPatientProfileOpen] = useState(false);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const returnUrl = Linking.createURL("google-auth");
      const startRes = await fetch(
        `${API_URL}/auth/google/start?returnUrl=${encodeURIComponent(returnUrl)}`,
      );
      if (!startRes.ok) throw new Error("OAuth-Start fehlgeschlagen");
      const { authUrl } = (await startRes.json()) as { authUrl: string; state: string };
      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
      if (result.type !== "success") return;
      const rawUrl = result.url.includes("://")
        ? result.url.replace(/^[a-z][a-z0-9+\-.]*:\/\//, "https://")
        : result.url;
      const returnedUrl = new URL(rawUrl);
      const errorParam = returnedUrl.searchParams.get("error");
      if (errorParam) throw new Error(`Google-Fehler: ${errorParam}`);
      const resultState = returnedUrl.searchParams.get("result");
      if (!resultState) throw new Error("Kein Ergebnis-Token empfangen.");
      const profileRes = await fetch(`${API_URL}/auth/google/profile?result=${resultState}`);
      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Profil konnte nicht geladen werden.");
      }
      const data = (await profileRes.json()) as {
        googleId: string; name: string; email: string; photoUri: string | null;
      };
      loginWithGoogle({ name: data.name, email: data.email, photoUri: data.photoUri, googleId: data.googleId });
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? "Google-Anmeldung fehlgeschlagen.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const goRegister = () => {
    setRegName("");
    setRegEmail("");
    setRegPhone("");
    setRegSms("");
    setRegSubStep("form");
    setProfileStep("register");
  };

  const handleRegisterRequestSms = () => {
    const name = regName.trim();
    const email = regEmail.trim();
    const phone = regPhone.trim();
    if (!name || !phone || !isPlausibleEmail(email)) {
      Alert.alert("Hinweis", "Bitte gültigen Namen, E-Mail und Telefonnummer eingeben.");
      return;
    }
    setRegSms("");
    setRegSubStep("verify");
  };

  const handleRegisterComplete = () => {
    if (regSms.trim() !== DEV_SMS_CODE) {
      Alert.alert("Falscher Code", "Der eingegebene Code ist ungültig.");
      return;
    }
    registerLocalCustomer({
      name: regName.trim(),
      email: regEmail.trim(),
      phone: regPhone.trim(),
    });
    setProfileStep("social");
    setRegSubStep("form");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, {
        paddingTop: topPad + 12,
        backgroundColor: colors.background,
        borderBottomColor: colors.border,
      }]}>
        <View style={{ width: 40 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mein Konto</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 40 }]}
      >
        {profile.isLoggedIn ? (
          /* ══ LOGGED IN ══ */
          <>
            {/* Profile card */}
            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {profile.photoUri ? (
                <Image source={{ uri: profile.photoUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarInitial}>
                    {profile.name ? profile.name[0].toUpperCase() : "?"}
                  </Text>
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.foreground }]}>
                  {profile.name || "Kein Name"}
                </Text>
                <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>
                  {profile.email || "Keine E-Mail"}
                </Text>
                {profile.googleId && (
                  <View style={styles.googleBadge}>
                    <Image source={require("../assets/images/google-icon.png")} style={{ width: 13, height: 13 }} resizeMode="contain" />
                    <Text style={[styles.googleBadgeText, { color: "#1D4ED8" }]}>
                      Anmeldung via Google
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Fahrten */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FAHRTEN</Text>
              <SectionCard>
                <Row
                  iconName="clock"
                  iconBg="#EFF6FF"
                  iconColor="#3B82F6"
                  label="Meine Fahrten"
                  sublabel="Historie & Quittungen"
                  onPress={() => router.push("/my-rides")}
                  isLast
                />
              </SectionCard>
            </View>

            {/* Zahlung */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ZAHLUNG</Text>
              <SectionCard>
                <Row
                  iconName="credit-card"
                  iconBg="#F0FDF4"
                  iconColor="#16A34A"
                  label="Zahlungsmittel"
                  sublabel="Kreditkarte, PayPal verwalten"
                  onPress={() => router.push("/wallet")}
                  isLast
                />
              </SectionCard>
            </View>

            {/* Profil */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROFIL</Text>
              <SectionCard>
                <Row
                  iconName="user"
                  iconBg="#F5F3FF"
                  iconColor="#7C3AED"
                  label="Persönliche Daten"
                  sublabel="Name, Telefon, E-Mail bearbeiten"
                  onPress={() => setPersonalDataOpen(true)}
                />
                <Row
                  iconName="heart"
                  iconBg="#FFF1F2"
                  iconColor="#E11D48"
                  label="Patienten-Profil"
                  sublabel="Rollstuhl, Tragehilfe, Besonderheiten"
                  onPress={() => setPatientProfileOpen(true)}
                  isLast
                />
              </SectionCard>
            </View>

            {/* Abmelden */}
            <View style={[styles.section, { marginTop: 8 }]}>
              <SectionCard>
                <Row
                  iconName="log-out"
                  label="Abmelden"
                  danger
                  isLast
                  onPress={() => {
                    Alert.alert("Abmelden", "Möchtest du dich wirklich abmelden?", [
                      { text: "Abbrechen", style: "cancel" },
                      { text: "Abmelden", style: "destructive", onPress: logout },
                    ]);
                  }}
                />
              </SectionCard>
            </View>

            {/* Personal Data Modal */}
            <PersonalDataModal
              visible={personalDataOpen}
              initialName={profile.name}
              initialEmail={profile.email}
              initialPhone={profile.phone ?? ""}
              initialAddress={profile.address ?? ""}
              initialCity={profile.city ?? ""}
              isGoogleUser={!!profile.googleId}
              onClose={(data) => {
                if (data) {
                  updateProfile(data);
                  Alert.alert("Gespeichert", "Deine Daten wurden aktualisiert.");
                }
                setPersonalDataOpen(false);
              }}
            />

            {/* Patient Profile Modal */}
            <PatientProfileModal
              visible={patientProfileOpen}
              profile={profile}
              onClose={(data) => {
                if (data) {
                  updateProfile(data);
                  Alert.alert("Gespeichert", "Patienten-Profil wurde aktualisiert.");
                }
                setPatientProfileOpen(false);
              }}
            />
          </>
        ) : (
          /* ══ NOT LOGGED IN ══ */
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.loginSection}>
              {/* App branding */}
              <View style={styles.brandBlock}>
                <OnrodaOrMark size={rs(72)} />
                <Text style={[styles.brandTitle, { color: colors.foreground }]}>Onroda</Text>
                <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>
                  Mobilität ohne Grenzen
                </Text>
              </View>

              {profileStep === "social" ? (
                <>
                  <View style={[styles.loginCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <NeuBeiOnrodaRegisterRow
                      mutedColor={colors.mutedForeground}
                      marginBottom={rs(10)}
                      fontSize={rf(14)}
                      onRegisterPress={goRegister}
                    />
                    <View style={{ gap: 10 }}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.socialBtn,
                          {
                            backgroundColor: "#FFFFFF",
                            borderColor: colors.border,
                            opacity: (pressed || googleLoading) ? 0.9 : 1,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 4,
                            elevation: 1,
                          },
                        ]}
                        onPress={handleGoogleLogin}
                        disabled={googleLoading}
                      >
                        {googleLoading
                          ? <ActivityIndicator size="small" color={colors.mutedForeground} style={{ width: 22, height: 22 }} />
                          : <Image source={require("../assets/images/google-icon.png")} style={{ width: 22, height: 22 }} resizeMode="contain" />}
                        <Text style={[styles.socialBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                          {googleLoading ? "Anmeldung läuft…" : "Weiter mit Google"}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={({ pressed }) => [
                          styles.socialBtn,
                          {
                            backgroundColor: "#FFFFFF",
                            borderColor: colors.border,
                            opacity: pressed ? 0.9 : 1,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 4,
                            elevation: 1,
                          },
                        ]}
                        onPress={() => Alert.alert("Apple Login", "Apple-Anmeldung ist in Kürze verfügbar.")}
                      >
                        <MaterialCommunityIcons name="apple" size={22} color={colors.foreground} />
                        <Text style={[styles.socialBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Weiter mit Apple</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.loginOrDividerRow}>
                    <View style={[styles.loginOrLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.loginOrLabel, { color: colors.mutedForeground }]}>oder</Text>
                    <View style={[styles.loginOrLine, { backgroundColor: colors.border }]} />
                  </View>

                  <View style={[styles.loginCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.socialBtn,
                        {
                          backgroundColor: "#111111",
                          borderColor: "#111111",
                          opacity: pressed ? 0.92 : 1,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.08,
                          shadowRadius: 4,
                          elevation: 2,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push("/driver/login");
                      }}
                    >
                      <MaterialCommunityIcons name="steering" size={22} color="#FFFFFF" />
                      <Text style={[styles.socialBtnText, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }]}>
                        Fahrer-Login
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : regSubStep === "form" ? (
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setProfileStep("social")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>

                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>Konto erstellen</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 8 }}>
                    Name, E-Mail und Telefon – anschließend bestätigst du per SMS-Code (Testphase).
                  </Text>

                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Feather name="user" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="Vor- und Nachname"
                      placeholderTextColor={colors.mutedForeground}
                      value={regName}
                      onChangeText={setRegName}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>

                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
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
                      returnKeyType="next"
                    />
                  </View>

                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Feather name="phone" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground }]}
                      placeholder="Telefonnummer"
                      placeholderTextColor={colors.mutedForeground}
                      value={regPhone}
                      onChangeText={setRegPhone}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                    />
                  </View>

                  <Pressable
                    style={[styles.registerBtn, {
                      backgroundColor:
                        regName.trim() && regPhone.trim() && isPlausibleEmail(regEmail) ? "#111111" : colors.muted,
                    }]}
                    onPress={handleRegisterRequestSms}
                    disabled={!regName.trim() || !regPhone.trim() || !isPlausibleEmail(regEmail)}
                  >
                    <Feather
                      name="message-circle"
                      size={18}
                      color={regName.trim() && regPhone.trim() && isPlausibleEmail(regEmail) ? "#fff" : colors.mutedForeground}
                    />
                    <Text style={[styles.registerBtnText, {
                      color: regName.trim() && regPhone.trim() && isPlausibleEmail(regEmail) ? "#fff" : colors.mutedForeground,
                    }]}
                    >
                      SMS-Code anfordern
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.signInBlock}>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }} onPress={() => setRegSubStep("form")}>
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>

                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>SMS-Bestätigung</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 8 }}>
                    Echte SMS folgt mit Backend (Twilio / Firebase Phone Auth). Testcode: {DEV_SMS_CODE}
                  </Text>

                  <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Feather name="hash" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.inputField, { color: colors.foreground, letterSpacing: 3 }]}
                      placeholder="6-stelliger Code"
                      placeholderTextColor={colors.mutedForeground}
                      value={regSms}
                      onChangeText={(t) => setRegSms(t.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                    />
                  </View>

                  <Pressable
                    style={[styles.registerBtn, { backgroundColor: regSms.trim().length === 6 ? "#111111" : colors.muted }]}
                    onPress={handleRegisterComplete}
                    disabled={regSms.trim().length !== 6}
                  >
                    <Feather name="check" size={18} color={regSms.trim().length === 6 ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.registerBtnText, { color: regSms.trim().length === 6 ? "#fff" : colors.mutedForeground }]}>
                      Registrierung abschließen
                    </Text>
                  </Pressable>
                </View>
              )}

              {profileStep === "register" && (
                <FahrerRegistrierenFooter
                  colors={{
                    foreground: colors.foreground,
                    mutedForeground: colors.mutedForeground,
                    muted: colors.muted,
                    border: colors.border,
                  }}
                  padding={rs(14)}
                  gap={rs(10)}
                  onAnmeldenPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/driver/login");
                  }}
                />
              )}
            </View>
          </KeyboardAvoidingView>
        )}

        {/* ── Horizontal footer links ── */}
        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push("/help")} style={styles.footerLinkBtn}>
            <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Hilfe & FAQ</Text>
          </Pressable>
          <Text style={[styles.footerSep, { color: colors.border }]}>|</Text>
          <Pressable onPress={() => router.push("/impressum")} style={styles.footerLinkBtn}>
            <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Impressum</Text>
          </Pressable>
          <Text style={[styles.footerSep, { color: colors.border }]}>|</Text>
          <Pressable onPress={() => Alert.alert("Datenschutz", "Datenschutzerklärung folgt in Kürze.")} style={styles.footerLinkBtn}>
            <Text style={[styles.footerLinkText, { color: colors.mutedForeground }]}>Datenschutz</Text>
          </Pressable>
        </View>

      </ScrollView>
      {profile.isLoggedIn ? <BottomTabBar active="account" /> : null}
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
    paddingHorizontal: rs(20),
    paddingBottom: rs(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: rs(40), height: rs(40), justifyContent: "center" },
  headerTitle: { fontSize: rf(18), fontFamily: "Inter_600SemiBold" },

  scroll: { paddingTop: rs(20), gap: 0 },

  /* Login section */
  loginSection: { paddingHorizontal: rs(24), marginBottom: rs(8), gap: rs(28) },
  brandBlock: { alignItems: "center", gap: rs(10), paddingTop: rs(16) },
  brandTitle: { fontSize: rf(28), fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  brandSub: { fontSize: rf(14), fontFamily: "Inter_400Regular", textAlign: "center" },

  signInBlock: { gap: rs(10) },

  loginCard: {
    borderRadius: rs(16),
    borderWidth: 1,
    padding: rs(16),
    gap: rs(14),
  },
  loginOrDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: rs(4),
  },
  loginOrLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  loginOrLabel: {
    paddingHorizontal: rs(14),
    fontSize: rf(13),
    fontFamily: "Inter_400Regular",
  },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(12),
    paddingVertical: rs(16),
    borderRadius: rs(14),
    borderWidth: 1,
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
    borderRadius: rs(16), borderWidth: 1, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center",
    gap: rs(12), paddingHorizontal: rs(16), paddingVertical: rs(14),
  },
  rowIcon: {
    width: rs(38), height: rs(38), borderRadius: rs(11),
    justifyContent: "center", alignItems: "center",
  },
  rowText: { flex: 1, gap: rs(2) },
  rowLabel: { fontSize: rf(15), fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: rf(12), fontFamily: "Inter_400Regular" },

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
  googleInfoText: { flex: 1, fontSize: rf(15), fontFamily: "Inter_400Regular", color: "#1D4ED8", lineHeight: rf(22) },

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
