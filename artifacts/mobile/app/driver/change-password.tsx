import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDriver } from "@/context/DriverContext";
import { useColors } from "@/hooks/useColors";

export default function DriverChangePasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { changePassword } = useDriver();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Fehler", "Bitte alle Felder ausfüllen.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Fehler", "Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    setSaving(true);
    const result = await changePassword(currentPassword, newPassword);
    setSaving(false);
    if (!result.ok) {
      Alert.alert("Passwort ändern fehlgeschlagen", result.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Erfolg", "Passwort geändert. Du bist jetzt eingeloggt.", [
      { text: "Weiter", onPress: () => router.replace("/driver/dashboard") },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.iconWrap}>
          <Feather name="lock" size={24} color="#fff" />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Passwort ändern</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Beim ersten Login musst du dein Initialpasswort ändern.
        </Text>

        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
          placeholder="Aktuelles Passwort"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
          placeholder="Neues Passwort (min. 10 Zeichen)"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
          placeholder="Neues Passwort wiederholen"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
        />

        <Pressable
          onPress={onSubmit}
          disabled={saving}
          style={[styles.submit, { opacity: saving ? 0.7 : 1 }]}
        >
          <Text style={styles.submitText}>{saving ? "Speichern..." : "Passwort speichern"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, justifyContent: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    marginBottom: 4,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  submit: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  submitText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
