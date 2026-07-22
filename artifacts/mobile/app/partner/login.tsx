import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePartner } from "@/context/PartnerContext";
import { useColors } from "@/hooks/useColors";
import { partnerRequestPasswordReset } from "@/utils/partnerApi";
import { loginActionButtonStyle, loginActionLabelStyle } from "@/src/screens/LoginScreen";

const PARTNER_GREEN = "#15803D";
const ONRODA_WEB = "https://onroda.de/";
const ONRODA_PARTNER = "https://onroda.de/#partner";

export default function PartnerLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, token, booting } = usePartner();
  const loginInFlightRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showResetForm, setShowResetForm] = useState(false);
  const [resetIdentity, setResetIdentity] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  React.useEffect(() => {
    if (!booting && token) {
      router.replace("/partner/home");
    }
  }, [booting, token]);

  const handleLogin = async () => {
    if (loginInFlightRef.current) return;
    if (!email.trim() || !password.trim()) {
      Alert.alert("Fehler", "Bitte E-Mail und Passwort eingeben.");
      return;
    }
    loginInFlightRef.current = true;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(email, password);
    setLoading(false);
    loginInFlightRef.current = false;
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/partner/home");
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Anmeldung fehlgeschlagen", result.message ?? "Bitte erneut versuchen.");
    }
  };

  const handlePasswordReset = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await partnerRequestPasswordReset(resetIdentity || email);
    setResetBusy(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("E-Mail gesendet", result.message, [
        {
          text: "OK",
          onPress: () => {
            setShowResetForm(false);
          },
        },
      ]);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Anfrage fehlgeschlagen", result.message);
    }
  };

  if (booting) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={PARTNER_GREEN} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => router.replace("/")}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>

        <View style={styles.header}>
          <View style={[styles.iconBg, { backgroundColor: PARTNER_GREEN }]}>
            <MaterialCommunityIcons name="office-building" size={36} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Willkommen im Partnerportal</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Verwalten Sie Buchungen schnell, sicher und zentral.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {showResetForm ? (
            <>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
                onPress={() => setShowResetForm(false)}
                hitSlop={8}
              >
                <Feather name="arrow-left" size={16} color={colors.foreground} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                  Zurück zum Login
                </Text>
              </Pressable>
              <Text style={[styles.resetLead, { color: colors.mutedForeground }]}>
                Geben Sie die E-Mail oder den Benutzernamen Ihres Partner-Zugangs ein. Bei Treffer senden wir
                eine E-Mail mit dem Link zum neuen Passwort.
              </Text>
              <View style={[styles.inputRow, { borderColor: colors.border }]}>
                <Feather name="mail" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="E-Mail oder Benutzername"
                  placeholderTextColor={colors.mutedForeground}
                  value={resetIdentity}
                  onChangeText={setResetIdentity}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!resetBusy}
                  onSubmitEditing={() => void handlePasswordReset()}
                />
              </View>
              <Pressable
                style={loginActionButtonStyle({
                  backgroundColor: PARTNER_GREEN,
                  paddingVertical: 16,
                  borderRadius: 14,
                  opacity: resetBusy ? 0.72 : 1,
                })}
                onPress={() => void handlePasswordReset()}
                disabled={resetBusy}
              >
                {resetBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={loginActionLabelStyle({ color: "#fff" })}>Anweisungen per E-Mail senden</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <View style={[styles.inputRow, { borderColor: colors.border }]}>
                <Feather name="mail" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="E-Mail"
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
              <View style={[styles.inputRow, { borderColor: colors.border }]}>
                <Feather name="lock" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="Passwort"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Pressable
                style={{ alignSelf: "flex-start", paddingVertical: 2 }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setResetIdentity(email.trim());
                  setShowResetForm(true);
                }}
                hitSlop={8}
              >
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: PARTNER_GREEN }}>
                  Passwort vergessen?
                </Text>
              </Pressable>

              <Pressable
                style={loginActionButtonStyle({
                  backgroundColor: PARTNER_GREEN,
                  paddingVertical: 16,
                  borderRadius: 14,
                  opacity: loading ? 0.72 : 1,
                })}
                onPress={() => void handleLogin()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={loginActionLabelStyle({ color: "#fff" })}>Anmelden</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <View style={[styles.guestHint, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>
            Interesse an einer Zusammenarbeit?
          </Text>
          <Text style={[styles.guestText, { color: colors.mutedForeground }]}>
            Verbinden Sie Ihr Hotel, Unternehmen oder Ihre Praxis mit ONRODA und buchen Sie Fahrten
            schnell und unkompliziert.
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void Linking.openURL(ONRODA_WEB);
            }}
            hitSlop={8}
          >
            <Text style={styles.guestLink}>Zur Webseite</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void Linking.openURL(ONRODA_PARTNER);
            }}
            hitSlop={8}
          >
            <Text style={styles.guestLink}>Partner werden</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, flexGrow: 1 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  header: { alignItems: "center", gap: 10, marginBottom: 24 },
  iconBg: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", padding: 0 },
  resetLead: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  guestHint: {
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  guestTitle: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 21 },
  guestText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  guestLink: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: PARTNER_GREEN, marginTop: 2 },
});
