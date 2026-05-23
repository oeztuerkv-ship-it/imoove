import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LegalDocumentView } from "@/components/LegalDocumentView";
import { useColors } from "@/hooks/useColors";
import { isOnrodaLegalDocId, ONRODA_LEGAL_BY_ID } from "@/src/content/onrodaLegal";

export default function LegalWebScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ doc?: string }>();
  const docId = typeof params.doc === "string" ? params.doc : undefined;
  const legalDoc = isOnrodaLegalDocId(docId) ? ONRODA_LEGAL_BY_ID[docId] : null;
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  if (!legalDoc) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: topPad + 24, paddingHorizontal: 24 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginBottom: 16 }}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 16, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
          Rechtstext nicht gefunden.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: topPad + 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40, height: 40, justifyContent: "center" }}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 16,
            fontFamily: "Inter_600SemiBold",
            color: colors.foreground,
          }}
          numberOfLines={1}
        >
          {legalDoc.screenTitle}
        </Text>
        <View style={{ width: 40 }} />
      </View>
      <LegalDocumentView document={legalDoc} bottomPad={insets.bottom + 24} />
    </View>
  );
}
