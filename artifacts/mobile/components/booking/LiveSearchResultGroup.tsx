import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { liveSearchRouteStyles as styles } from "@/components/booking/liveSearchRouteStyles";
import { useColors } from "@/hooks/useColors";
import type { GeoLocation } from "@/utils/routing";

export function LiveSearchResultGroup({
  locations,
  isDestination = false,
  loading,
  onPick,
}: {
  locations: GeoLocation[];
  isDestination?: boolean;
  loading?: boolean;
  onPick: (loc: GeoLocation) => void;
}) {
  const colors = useColors();

  return (
    <View style={[styles.resultGroup, { borderColor: colors.border }]}>
      {loading && locations.length === 0 ? (
        <View style={styles.searchingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.searchingText, { color: colors.mutedForeground }]}>Suche läuft...</Text>
        </View>
      ) : (
        locations.map((loc, i) => (
          <React.Fragment key={`${loc.lat}-${loc.lon}-${i}`}>
            {i > 0 ? <View style={[styles.resultDivider, { backgroundColor: colors.border }]} /> : null}
            <Pressable
              style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.muted }]}
              onPress={() => onPick(loc)}
            >
              <View
                style={[
                  styles.resultIcon,
                  { backgroundColor: isDestination ? colors.muted : "#F0F9FF" },
                ]}
              >
                <Feather name="map-pin" size={15} color={isDestination ? colors.primary : "#3B82F6"} />
              </View>
              <View style={styles.resultText}>
                <Text style={[styles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {loc.displayName.split(",")[0]}
                </Text>
                <Text style={[styles.resultSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {loc.displayName.split(",").slice(1, 3).join(",").trim() ||
                    [loc.postcode, loc.city].filter(Boolean).join(" ")}
                </Text>
              </View>
            </Pressable>
          </React.Fragment>
        ))
      )}
    </View>
  );
}
