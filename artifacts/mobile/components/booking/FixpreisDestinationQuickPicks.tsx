import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { liveSearchRouteStyles as liveStyles } from "@/components/booking/liveSearchRouteStyles";
import { useColors } from "@/hooks/useColors";
import type { SearchFavorite } from "@/utils/searchFavorites";
import { rs } from "@/utils/scale";

export function FixpreisDestinationQuickPicks({
  presets,
  userFavorites,
  activeDisplayName,
  onPick,
  onAddFavorite,
  maxFavorites,
}: {
  presets: SearchFavorite[];
  userFavorites: SearchFavorite[];
  activeDisplayName?: string;
  onPick: (fav: SearchFavorite) => void;
  onAddFavorite: () => void;
  maxFavorites: number;
}) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Häufige Ziele</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {presets.map((fav) => {
          const active = activeDisplayName === fav.location.displayName;
          return (
            <Pressable
              key={fav.id}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? `${colors.primary}14` : colors.background,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
              onPress={() => onPick(fav)}
            >
              <Feather name="map-pin" size={13} color={active ? colors.primary : colors.mutedForeground} />
              <Text
                style={[
                  styles.chipText,
                  { color: active ? colors.primary : colors.foreground },
                  active && { fontFamily: "Inter_700Bold" },
                ]}
                numberOfLines={1}
              >
                {fav.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.headerRow}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: rs(8) }]}>MEINE ZIELE</Text>
        {userFavorites.length < maxFavorites ? (
          <Pressable onPress={onAddFavorite} hitSlop={8}>
            <Text style={[styles.addLink, { color: colors.primary }]}>+ Neu</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[liveStyles.resultGroup, { borderColor: colors.border }]}>
        {userFavorites.length === 0 ? (
          <Pressable
            style={({ pressed }) => [liveStyles.resultRow, pressed && { backgroundColor: colors.muted }]}
            onPress={onAddFavorite}
          >
            <View style={[liveStyles.resultIcon, { backgroundColor: "#F0F9FF" }]}>
              <Feather name="bookmark" size={15} color={colors.primary} />
            </View>
            <View style={liveStyles.resultText}>
              <Text style={[liveStyles.resultTitle, { color: colors.foreground }]}>Favorit anlegen</Text>
              <Text style={[liveStyles.resultSub, { color: colors.mutedForeground }]}>
                z. B. Zuhause — Vorschlag aus der Liste wählen
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          userFavorites.map((fav, i) => (
            <React.Fragment key={fav.id}>
              {i > 0 ? <View style={[liveStyles.resultDivider, { backgroundColor: colors.border }]} /> : null}
              <Pressable
                style={({ pressed }) => [liveStyles.resultRow, pressed && { backgroundColor: colors.muted }]}
                onPress={() => onPick(fav)}
              >
                <View style={[liveStyles.resultIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="map-pin" size={15} color={colors.primary} />
                </View>
                <View style={liveStyles.resultText}>
                  <Text style={[liveStyles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {fav.label}
                  </Text>
                  <Text style={[liveStyles.resultSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {fav.location.displayName}
                  </Text>
                </View>
              </Pressable>
            </React.Fragment>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: rs(6) },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  chipRow: { flexDirection: "row", gap: rs(8), paddingHorizontal: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: rs(999),
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: rs(160),
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  addLink: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
