import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { liveSearchRouteStyles as styles } from "@/components/booking/liveSearchRouteStyles";
import { useColors } from "@/hooks/useColors";

const SEARCH_OVERLAY_BG = "#FFFFFF";

export function LiveSearchRouteCard({
  isEditingOrigin,
  originQuery,
  destQuery,
  onOriginQueryChange,
  onDestQueryChange,
  onFocusOrigin,
  onFocusDest,
  originInputRef,
  destInputRef,
  gpsLoading,
  onGpsPress,
  isSearchingDest,
  onClearDest,
}: {
  isEditingOrigin: boolean;
  originQuery: string;
  destQuery: string;
  onOriginQueryChange: (text: string) => void;
  onDestQueryChange: (text: string) => void;
  onFocusOrigin: () => void;
  onFocusDest: () => void;
  originInputRef: React.RefObject<TextInput | null>;
  destInputRef: React.RefObject<TextInput | null>;
  gpsLoading: boolean;
  onGpsPress: () => void;
  isSearchingDest: boolean;
  onClearDest: () => void;
}) {
  const colors = useColors();

  return (
    <View style={[styles.twoFieldCard, { backgroundColor: SEARCH_OVERLAY_BG, borderColor: "#E5E7EB" }]}>
      <View style={styles.dotsCol}>
        <View style={[styles.dotOrigin, isEditingOrigin && { borderColor: colors.primary }]} />
        <View style={[styles.dotLine, { backgroundColor: colors.border }]} />
        <View
          style={[
            styles.dotDestination,
            { backgroundColor: isEditingOrigin ? colors.border : colors.primary },
          ]}
        />
      </View>

      <View style={styles.fieldsCol}>
        <Pressable
          style={[styles.fieldWrap, isEditingOrigin && { borderBottomColor: colors.primary }]}
          onPress={onFocusOrigin}
        >
          <TextInput
            ref={originInputRef}
            style={[styles.fieldInput, { color: colors.foreground }]}
            value={originQuery}
            onChangeText={onOriginQueryChange}
            placeholder="Startadresse eingeben..."
            placeholderTextColor={colors.mutedForeground}
            onFocus={onFocusOrigin}
            returnKeyType="next"
            autoCorrect={false}
          />
          {gpsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Pressable onPress={onGpsPress} hitSlop={8} style={styles.gpsIconBtn}>
              <Feather name="navigation" size={15} color={colors.primary} />
            </Pressable>
          )}
        </Pressable>

        <View style={[styles.fieldSeparator, { backgroundColor: colors.border }]} />

        <View style={[styles.fieldWrap, !isEditingOrigin && { borderBottomColor: colors.primary }]}>
          <TextInput
            ref={destInputRef}
            style={[styles.fieldInput, { color: colors.foreground }]}
            value={destQuery}
            onChangeText={onDestQueryChange}
            placeholder="Ziel eingeben..."
            placeholderTextColor={colors.mutedForeground}
            onFocus={onFocusDest}
            returnKeyType="search"
            autoCorrect={false}
          />
          {isSearchingDest ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          {destQuery.length > 0 && !isSearchingDest ? (
            <Pressable onPress={onClearDest} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
