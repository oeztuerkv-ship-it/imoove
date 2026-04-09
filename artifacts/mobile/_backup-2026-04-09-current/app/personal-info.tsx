import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          {
            backgroundColor: colors.card,
            borderColor: focused ? colors.primary : colors.border,
            color: colors.foreground,
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? "default"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
      />
    </View>
  );
}

export default function PersonalInfoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const { profile, updateProfile } = useUser();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);

  const handleSave = () => {
    updateProfile({ name, email, phone, isLoggedIn: true });
    Alert.alert("Gespeichert", "Ihre Daten wurden gespeichert.");
    router.back();
  };

  const handlePickPhoto = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Berechtigung erforderlich", "Bitte erlauben Sie den Zugriff auf Ihre Fotos.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateProfile({ photoUri: result.assets[0].uri });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Persönliche Informationen</Text>
        <Pressable onPress={handleSave} style={styles.saveBtn}>
          <Text style={[styles.saveBtnText, { color: colors.primary }]}>Speichern</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Photo */}
        <View style={styles.photoSection}>
          <Pressable onPress={handlePickPhoto} style={styles.avatarWrap}>
            {profile.photoUri ? (
              <Image source={{ uri: profile.photoUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitial}>
                  {name ? name[0].toUpperCase() : "?"}
                </Text>
              </View>
            )}
            <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={handlePickPhoto}>
            <Text style={[styles.changePhotoText, { color: colors.primary }]}>
              Foto ändern
            </Text>
          </Pressable>
        </View>

        {/* Fields */}
        <View style={styles.fieldsSection}>
          <Field
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Ihr vollständiger Name"
          />
          <Field
            label="E-Mail"
            value={email}
            onChange={setEmail}
            placeholder="ihre@email.de"
            keyboardType="email-address"
          />
          <Field
            label="Telefonnummer"
            value={phone}
            onChange={setPhone}
            placeholder="+49 ..."
            keyboardType="phone-pad"
          />
        </View>

        <Pressable
          style={[styles.saveFullBtn, { backgroundColor: colors.success }]}
          onPress={handleSave}
        >
          <Text style={styles.saveFullBtnText}>Änderungen speichern</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  saveBtn: { paddingHorizontal: 4 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  photoSection: { alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative" },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: "center", alignItems: "center",
  },
  avatarInitial: { fontSize: 38, color: "#fff", fontFamily: "Inter_700Bold" },
  cameraBtn: {
    position: "absolute", bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  changePhotoText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fieldsSection: { gap: 16 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  fieldInput: {
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  saveFullBtn: {
    borderRadius: 14, paddingVertical: 16,
    alignItems: "center", marginTop: 8,
  },
  saveFullBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
