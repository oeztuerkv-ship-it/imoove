import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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

import { OnrodaOrMark } from "@/components/OnrodaOrMark";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useDriver } from "@/context/DriverContext";
import { useColors } from "@/hooks/useColors";
import { rs, rf } from "@/utils/scale";

/**
 * Eigenständiger Fahrer-Login (Root-Stack) — zuverlässig auf dem Gerät,
 * ohne Kunden-Onboarding und ohne verschachtelten Driver-Stack.
 */
export default function FahrerLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 44 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  const { loading, isLoggedIn, login } = useDriver();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Fehler", "Bitte E-Mail und Passwort eingeben.");
      return;
    }
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const ok = await login(email, password);
    setBusy(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/driver/dashboard");
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Anmeldung fehlgeschlagen", "E-Mail oder Passwort ist falsch.");
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  if (isLoggedIn) {
    return <Redirect href="/driver/dashboard" />;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 8, paddingBottom: bottomPad + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={goBack} style={styles.backRow} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Zurück</Text>
        </Pressable>

        <View style={styles.brandRow}>
          <OnrodaOrMark size={64} />
          <Text style={[styles.title, { color: colors.foreground }]}>Fahrer-Login</Text>
          <View style={[styles.accentBar, { backgroundColor: ONRODA_MARK_RED }]} />
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Melde dich mit deiner Fahrer-E-Mail an.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>E-Mail</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <MaterialCommunityIcons name="email-outline" size={20} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="name@beispiel.de"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Passwort</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <MaterialCommunityIcons name="lock-outline" size={20} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <Pressable
            style={[styles.cta, { backgroundColor: "#111111", opacity: busy ? 0.75 : 1 }]}
            onPress={submit}
            disabled={busy}
          >
            <MaterialCommunityIcons name="car-side" size={22} color="#FFFFFF" />
            <Text style={styles.ctaText}>{busy ? "Bitte warten…" : "Als Fahrer anmelden"}</Text>
          </Pressable>

          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Demo: oeztuerkv@mail.de · Zidane87
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingHorizontal: rs(24), gap: rs(20) },
  backRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  backText: { fontSize: rf(16), fontFamily: "Inter_600SemiBold" },
  brandRow: { alignItems: "center", gap: rs(10) },
  title: { fontSize: rf(28), fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  accentBar: { width: 44, height: 3, borderRadius: 2 },
  sub: { fontSize: rf(15), fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 16 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: rs(20),
    gap: rs(12),
  },
  label: { fontSize: rf(13), fontFamily: "Inter_600SemiBold", marginBottom: -4 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  input: { flex: 1, fontSize: rf(17), fontFamily: "Inter_400Regular", paddingVertical: 0 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  ctaText: { color: "#FFFFFF", fontSize: rf(16), fontFamily: "Inter_700Bold" },
  hint: { marginTop: 8, fontSize: rf(12), fontFamily: "Inter_400Regular", textAlign: "center" },
});
