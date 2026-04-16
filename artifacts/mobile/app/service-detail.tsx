import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { getServiceById } from "@/constants/services";
import { useColors } from "@/hooks/useColors";

export default function ServiceDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const service = getServiceById(type);

  if (!service) {
    return (
      <View style={[styles.centerFallback, { backgroundColor: colors.background }]}>
        <Text style={[styles.fallbackTitle, { color: colors.foreground }]}>Service nicht gefunden</Text>
        <Pressable
          style={[styles.fallbackButton, { backgroundColor: ONRODA_MARK_RED }]}
          onPress={() => router.back()}
        >
          <Text style={styles.fallbackButtonText}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{service.title}</Text>
        <View style={styles.closeButtonSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.shortDescriptionCard, { backgroundColor: "#F5F5F5", borderColor: colors.border }]}>
          <Text style={[styles.shortDescriptionLabel, { color: colors.mutedForeground }]}>Kurzbeschreibung</Text>
          <Text style={[styles.shortDescriptionText, { color: colors.foreground }]}>{service.shortDescription}</Text>
        </View>
        {service.detail.map((item, index) => (
          <Pressable
            key={`${service.id}-${index}`}
            style={[styles.detailCard, { backgroundColor: "#FAFAFA", borderColor: colors.border }]}
          >
            <View style={styles.detailLeft}>
              <View style={[styles.itemIconWrap, { backgroundColor: "#F3F4F6" }]}>
                <MaterialCommunityIcons
                  name={service.icon as any}
                  size={22}
                  color={service.id === "wheelchair" ? "#0369A1" : "#111827"}
                />
              </View>
              <View style={styles.detailTextWrap}>
                <Text style={[styles.detailTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>{item.text}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonSpacer: { width: 38, height: 38 },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  content: { paddingHorizontal: 16, paddingVertical: 18, gap: 12 },
  shortDescriptionCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  shortDescriptionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  shortDescriptionText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_500Medium",
  },
  detailCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailLeft: { flexDirection: "row", alignItems: "flex-start", gap: 12, flex: 1, paddingRight: 10 },
  itemIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  detailTextWrap: { flex: 1 },
  detailTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  detailText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  centerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 12,
  },
  fallbackTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  fallbackButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  fallbackButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
