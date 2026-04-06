import * as Haptics from "expo-haptics";
import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useColors } from "@/hooks/useColors";
import { VEHICLES, type VehicleType, type VehicleOption } from "@/context/RideContext";
import { calculateFare, calculateOnrodaFixFare, formatEuro } from "@/utils/fareCalculator";

const CAR_ICON_COLOR = "#171717";
const WHEELCHAIR_ICON_COLOR = "#0369A1";

interface VehicleSelectorProps {
  selected: VehicleType;
  onSelect: (v: VehicleType) => void;
  distanceKm?: number;
}

function VehicleCard({
  vehicle,
  isSelected,
  onSelect,
  distanceKm,
}: {
  vehicle: VehicleOption;
  isSelected: boolean;
  onSelect: () => void;
  distanceKm?: number;
}) {
  const colors = useColors();
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    onSelect();
  };

  const price = distanceKm
    ? formatEuro(
        vehicle.id === "onroda"
          ? calculateOnrodaFixFare(distanceKm).total
          : Math.round(calculateFare(distanceKm).total * vehicle.multiplier * 100) / 100,
      )
    : null;

  const active = ONRODA_MARK_RED;
  return (
    <Animated.View style={{ transform: [{ scale }], width: 118, flexShrink: 0 }}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.card,
          {
            backgroundColor: isSelected ? active + "22" : colors.card,
            borderColor: isSelected ? active : colors.border,
            borderWidth: isSelected ? 2.5 : 1.5,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={vehicle.icon as any}
          size={26}
          color={vehicle.id === "wheelchair" ? WHEELCHAIR_ICON_COLOR : CAR_ICON_COLOR}
        />
        <Text
          style={[
            styles.cardName,
            { color: isSelected ? active : colors.foreground },
          ]}
        >
          {vehicle.name}
        </Text>
        {price ? (
          <Text
            style={[
              styles.cardPrice,
              { color: isSelected ? active : colors.primary },
            ]}
          >
            {price}
          </Text>
        ) : (
          <Text
            style={[
              styles.cardDesc,
              {
                color: isSelected ? active + "cc" : colors.mutedForeground,
              },
            ]}
          >
            {vehicle.description}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function VehicleSelector({ selected, onSelect, distanceKm }: VehicleSelectorProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {VEHICLES.map((v) => (
        <VehicleCard
          key={v.id}
          vehicle={v}
          isSelected={selected === v.id}
          onSelect={() => onSelect(v.id)}
          distanceKm={distanceKm}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
    paddingRight: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    alignItems: "center",
    gap: 5,
    minHeight: 90,
    justifyContent: "center",
  },
  cardName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  cardPrice: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  cardDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
