import * as WebBrowser from "expo-web-browser";
import { router, type Href } from "expo-router";
import React, { memo, useMemo } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { rs, rf } from "@/utils/scale";

export type AppNewsDetailItem = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  buttonText: string | null;
  targetType: string;
  targetValue: string | null;
};

type ThemeColors = {
  card: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  border: string;
};

type Props = {
  item: AppNewsDetailItem | null;
  onClose: () => void;
  colors: ThemeColors;
  sponsorsRoute: Href;
};

export const AppNewsDetailModal = memo(function AppNewsDetailModal({
  item,
  onClose,
  colors,
  sponsorsRoute,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const sheetMaxHeight = screenHeight * 0.88;
  const scrollMaxHeight = useMemo(() => {
    const topPad = rs(20);
    const closeRow = rs(12) + rs(4) + rs(22);
    const bottomPad = Math.max(insets.bottom, rs(12));
    return Math.max(160, sheetMaxHeight - topPad - closeRow - bottomPad);
  }, [sheetMaxHeight, insets.bottom]);

  return (
    <Modal
      visible={item != null}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Schließen" />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              maxHeight: sheetMaxHeight,
              paddingBottom: Math.max(insets.bottom, rs(12)),
            },
          ]}
        >
          <ScrollView
            style={{ maxHeight: scrollMaxHeight }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            nestedScrollEnabled
          >
            {item?.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
            ) : null}
            <Text style={[styles.title, { color: colors.foreground }]}>{item?.title}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{item?.body}</Text>
            {item?.buttonText && item.targetType === "external_url" && item.targetValue ? (
              <Pressable
                style={[styles.btn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const u = item.targetValue?.trim();
                  if (u) void WebBrowser.openBrowserAsync(u);
                }}
              >
                <Text style={styles.btnText}>{item.buttonText}</Text>
              </Pressable>
            ) : null}
            {item?.buttonText && item.targetType === "internal_screen" && item.targetValue ? (
              <Pressable
                style={[styles.btn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const p = item.targetValue?.trim();
                  if (p === "/sponsors") {
                    router.push(sponsorsRoute);
                  } else if (p) {
                    router.push(p as Href);
                  }
                  onClose();
                }}
              >
                <Text style={styles.btnText}>{item.buttonText}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Pressable
            style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Schließen"
          >
            <Text style={styles.closeText}>Schließen</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

const NEWS_CLOSE_RED = "#EF233C";
const NEWS_CLOSE_BORDER = "#FECACA";
const NEWS_CLOSE_FILL = "#FEF2F2";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  card: {
    width: "100%",
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    paddingTop: rs(20),
    paddingHorizontal: rs(20),
    overflow: "hidden",
  },
  scrollContent: {
    paddingBottom: rs(8),
  },
  image: { width: "100%", height: rs(180), borderRadius: rs(12), marginBottom: rs(12) },
  title: { fontSize: rf(20), fontFamily: "Inter_700Bold", marginBottom: rs(8) },
  body: { fontSize: rf(15), fontFamily: "Inter_400Regular", lineHeight: rf(22), marginBottom: rs(16) },
  btn: {
    alignSelf: "flex-start",
    paddingVertical: rs(12),
    paddingHorizontal: rs(18),
    borderRadius: rs(12),
    marginBottom: rs(12),
  },
  btnText: { color: "#fff", fontSize: rf(15), fontFamily: "Inter_600SemiBold" },
  close: {
    marginTop: rs(8),
    minHeight: rs(44),
    paddingVertical: rs(11),
    paddingHorizontal: rs(16),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: NEWS_CLOSE_BORDER,
    backgroundColor: NEWS_CLOSE_FILL,
  },
  closePressed: {
    opacity: 0.88,
  },
  closeText: {
    fontSize: rf(15),
    fontFamily: "Inter_600SemiBold",
    color: NEWS_CLOSE_RED,
  },
});
