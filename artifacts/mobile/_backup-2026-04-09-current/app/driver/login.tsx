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
import { useColors } from "@/hooks/useColors";

export default function DriverLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const { login } = useDriver();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Fehler", "Bitte E-Mail und Passwort eingeben.");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await new Promise((r) => setTimeout(r, 600));
    const success = await login(email, password);
    setLoading(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/driver/dashboard");
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Anmeldung fehlgeschlagen", "E-Mail oder Passwort ist falsch.");
    }
  };

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
        {/* Back button */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.driverIconBg, { backgroundColor: "#111" }]}>
            <MaterialCommunityIcons name="steering" size={36} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Fahrer-Login</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Melde dich mit deinen Fahrer-Zugangsdaten an
          </Text>
        </View>

        {/* Login card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Email */}
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
              />
            </View>
          </View>

          {/* Password */}
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
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          {/* Login button */}
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
        </View>

        {/* Register section */}
        <View style={styles.registerSection}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.registerLabel, { color: colors.mutedForeground }]}>
            Noch kein Fahrerkonto?
          </Text>
          <Pressable
            style={[styles.registerBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert(
                "Fahrer-Registrierung",
                "Um dich als Fahrer zu registrieren, wende dich bitte direkt an die Onroda-Zentrale:\n\n📞 0711 / 123 456\n✉ fahrer@onroda.de\n\nWir melden uns innerhalb von 24 Stunden.",
                [{ text: "OK" }]
              );
            }}
          >
            <Feather name="user-plus" size={17} color={colors.foreground} />
            <Text style={[styles.registerBtnText, { color: colors.foreground }]}>Als Fahrer registrieren</Text>
          </Pressable>
        </View>
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
    width: 72, height: 72, borderRadius: 36,
    justifyContent: "center", alignItems: "center",
    marginBottom: 4,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: {
    borderRadius: 20, borderWidth: 1,
    padding: 24, gap: 18,
  },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  loginBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 14, paddingVertical: 16, marginTop: 4,
  },
  loginBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  registerSection: { marginTop: 28, gap: 16, alignItems: "center" },
  divider: { width: "100%", height: 1 },
  registerLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  registerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderWidth: 1, borderRadius: 14,
    paddingVertical: 15, width: "100%",
  },
  registerBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
