import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDriver } from "@/context/DriverContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useColors } from "@/hooks/useColors";
import { FahrerRegistrierenFooter } from "@/src/screens/LoginScreen";
import { getApiBaseUrl } from "@/utils/apiBase";
import { openInAppBrowser } from "@/utils/customerLegalConsent";

const PARTNER_REGISTER_URL = "https://onroda.de/#partner";
const API_BASE = getApiBaseUrl() || "https://api.onroda.de/api";

type AuthMode = "login" | "reset-email" | "reset-code";

function safeHaptic(fn: () => Promise<unknown>) {
  void fn().catch(() => {});
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resetApiErrorMessage(code: unknown, fallback: string): string {
  const k = typeof code === "string" ? code : "";
  if (k === "email_required") return "Bitte eine gültige E-Mail eingeben.";
  if (k === "rate_limited") return "Zu viele Versuche — bitte kurz warten.";
  if (k === "mail_send_failed") return "E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen oder den Betrieb kontaktieren.";
  if (k === "smtp_not_configured" || k === "fleet_jwt_not_configured") {
    return "Passwort-Reset ist auf dem Server noch nicht eingerichtet. Bitte den Betrieb kontaktieren.";
  }
  if (k === "invalid_or_expired_reset_code") return "Code ungültig oder abgelaufen — bitte neu anfordern.";
  if (k === "reset_payload_invalid") return "Bitte Code (6 Ziffern) und neues Passwort (mind. 10 Zeichen) prüfen.";
  if (k === "database_not_configured") return "Server noch nicht bereit.";
  return fallback;
}

export default function DriverLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const { login } = useDriver();
  const { refreshDriverMarketHard } = useRideRequests();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Fehler", "Bitte E-Mail und Passwort eingeben.");
      return;
    }
    setLoading(true);
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    try {
      const result = await login(email, password);
      if (result.ok) {
        safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        if (result.meSyncFailed) {
          Alert.alert(
            "Profil konnte nicht geladen werden",
            result.meSyncError ??
              "Die Anmeldung war erfolgreich, aber der Server hat das Fahrerprofil nicht geliefert. Das ist kein Freigabe-Hinweis — bitte erneut anmelden oder den Support informieren.",
          );
        }
        const target = result.mustChangePassword ? "/driver/change-password" : "/driver/dashboard";
        try {
          router.replace(target as never);
        } catch {
          Alert.alert(
            "Hinweis",
            "Anmeldung erfolgreich, aber die Weiterleitung ist fehlgeschlagen. Bitte die App neu öffnen oder erneut „Als Fahrer anmelden“.",
          );
        }
        void refreshDriverMarketHard().catch(() => {});
      } else {
        safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
        Alert.alert("Anmeldung fehlgeschlagen", result.error || "E-Mail oder Passwort ist falsch.");
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.includes("NSLocalizedDescription")
        ? "Verbindung zum Server fehlgeschlagen. Bitte Internet prüfen und erneut versuchen."
        : raw || "Anmeldung fehlgeschlagen.";
      Alert.alert("Anmeldung fehlgeschlagen", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    const em = email.trim().toLowerCase();
    if (!em.includes("@")) {
      Alert.alert("Fehler", "Bitte eine gültige E-Mail eingeben.");
      return;
    }
    setLoading(true);
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    try {
      const res = await fetch(`${API_BASE}/fleet-auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      const data = await readJson(res);
      if (res.status === 429) {
        Alert.alert("Bitte warten", resetApiErrorMessage("rate_limited", "Zu viele Versuche."));
        return;
      }
      if (!res.ok) {
        Alert.alert(
          "Fehler",
          resetApiErrorMessage(data?.error, typeof data?.message === "string" ? data.message : "Anfrage fehlgeschlagen."),
        );
        return;
      }
      safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      setResetCode("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setMode("reset-code");
      Alert.alert(
        "E-Mail prüfen",
        typeof data?.message === "string"
          ? data.message
          : "Wenn ein Zugang existiert, erhältst du einen Code per E-Mail.",
      );
    } catch {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async () => {
    const em = email.trim().toLowerCase();
    const code = resetCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      Alert.alert("Fehler", "Bitte den 6-stelligen Code aus der E-Mail eingeben.");
      return;
    }
    if (newPassword.length < 10) {
      Alert.alert("Fehler", "Neues Passwort: mindestens 10 Zeichen.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      Alert.alert("Fehler", "Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    try {
      const res = await fetch(`${API_BASE}/fleet-auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, code, newPassword }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        Alert.alert(
          "Fehler",
          resetApiErrorMessage(data?.error, "Passwort konnte nicht gesetzt werden."),
        );
        return;
      }
      safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setMode("login");
      Alert.alert("Fertig", "Passwort wurde geändert. Du kannst dich jetzt anmelden.");
    } catch {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "login" ? "Fahrer-Login" : mode === "reset-email" ? "Passwort vergessen" : "Neues Passwort";
  const subtitle =
    mode === "login"
      ? "Melde dich mit deinen Fahrer-Zugangsdaten an"
      : mode === "reset-email"
        ? "Wir senden dir einen Code an deine Fahrer-E-Mail"
        : "Code aus der E-Mail und neues Passwort eingeben";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            if (mode === "reset-code") {
              setMode("reset-email");
              return;
            }
            if (mode === "reset-email") {
              setMode("login");
              return;
            }
            router.back();
          }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>

        <View style={styles.header}>
          <View style={[styles.driverIconBg, { backgroundColor: "#111" }]}>
            <MaterialCommunityIcons name="steering" size={36} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(mode === "login" || mode === "reset-email") && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>E-Mail Adresse</Text>
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Feather name="mail" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="fahrer@Onroda.de"
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
            </View>
          )}

          {mode === "login" && (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Passwort</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Feather name="lock" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, flex: 1 }]}
                    placeholder="••••••••"
                    placeholderTextColor={colors.mutedForeground}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={styles.forgotLink}
                onPress={() => {
                  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
                  setMode("reset-email");
                }}
                disabled={loading}
              >
                <Text style={[styles.forgotLinkText, { color: colors.primary }]}>Passwort vergessen?</Text>
              </Pressable>

              <Pressable
                style={[styles.loginBtn, { backgroundColor: "#111", opacity: loading ? 0.7 : 1 }]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <Text style={styles.loginBtnText}>Anmelden...</Text>
                ) : (
                  <>
                    <MaterialCommunityIcons name="steering" size={18} color="#fff" />
                    <Text style={styles.loginBtnText}>Als Fahrer anmelden</Text>
                  </>
                )}
              </Pressable>
            </>
          )}

          {mode === "reset-email" && (
            <Pressable
              style={[styles.loginBtn, { backgroundColor: "#111", opacity: loading ? 0.7 : 1 }]}
              onPress={handleResetRequest}
              disabled={loading}
            >
              <Text style={styles.loginBtnText}>{loading ? "Sende…" : "Code per E-Mail senden"}</Text>
            </Pressable>
          )}

          {mode === "reset-code" && (
            <>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Code an {email.trim().toLowerCase() || "deine E-Mail"}
              </Text>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Code (6 Ziffern)</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Feather name="hash" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="123456"
                    placeholderTextColor={colors.mutedForeground}
                    value={resetCode}
                    onChangeText={(t) => setResetCode(t.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Neues Passwort</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Feather name="lock" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, flex: 1 }]}
                    placeholder="mind. 10 Zeichen"
                    placeholderTextColor={colors.mutedForeground}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Pressable onPress={() => setShowNewPassword(!showNewPassword)}>
                    <Feather name={showNewPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Passwort wiederholen</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Feather name="lock" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="••••••••"
                    placeholderTextColor={colors.mutedForeground}
                    value={newPasswordConfirm}
                    onChangeText={setNewPasswordConfirm}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                </View>
              </View>
              <Pressable
                style={[styles.loginBtn, { backgroundColor: "#111", opacity: loading ? 0.7 : 1 }]}
                onPress={handleResetConfirm}
                disabled={loading}
              >
                <Text style={styles.loginBtnText}>{loading ? "Speichere…" : "Passwort speichern"}</Text>
              </Pressable>
              <Pressable
                style={styles.forgotLink}
                onPress={() => {
                  if (!loading) void handleResetRequest();
                }}
                disabled={loading}
              >
                <Text style={[styles.forgotLinkText, { color: colors.mutedForeground }]}>Code erneut senden</Text>
              </Pressable>
            </>
          )}
        </View>

        {mode === "login" && (
          <View style={styles.registerSection}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.registerLabel, { color: colors.mutedForeground }]}>Noch kein Fahrerkonto?</Text>
            <Pressable
              style={[styles.registerBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => {
                safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
                Alert.alert(
                  "Als Fahrer bewerben",
                  "Interesse als Fahrer bei ONRODA zu arbeiten?\n\n✉ info@onroda.de\n🌐 www.onroda.de\n\nSchreib uns oder besuche unsere Website — wir melden uns zeitnah bei dir.",
                  [{ text: "OK" }],
                );
              }}
            >
              <Feather name="user-plus" size={17} color={colors.foreground} />
              <Text style={[styles.registerBtnText, { color: colors.foreground }]}>Als Fahrer registrieren</Text>
            </Pressable>

            <FahrerRegistrierenFooter
              colors={{
                foreground: colors.foreground,
                mutedForeground: colors.mutedForeground,
                muted: colors.muted,
                border: colors.border,
              }}
              padding={16}
              onPartnerRegisterPress={() => {
                safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
                try {
                  openInAppBrowser(PARTNER_REGISTER_URL);
                } catch {
                  Alert.alert(
                    "Hinweis",
                    "Partner-Registrierung konnte nicht geöffnet werden. Bitte onroda.de in der App unter Partner-Login öffnen.",
                  );
                }
              }}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  backBtn: { marginBottom: 24, width: 40, height: 40, justifyContent: "center" },
  header: { alignItems: "center", gap: 12, marginBottom: 32 },
  driverIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 18,
  },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: -6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  forgotLink: { alignSelf: "flex-end", marginTop: -8 },
  forgotLinkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  loginBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  registerSection: { marginTop: 28, gap: 16, alignItems: "center" },
  divider: { width: "100%", height: 1 },
  registerLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    width: "100%",
  },
  registerBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
