import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { VEHICLES, type VehicleType, type VehicleOption } from "@/context/RideContext";
import { calculateFare, formatEuro } from "@/utils/fareCalculator";

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
        Math.round(calculateFare(distanceKm).total * vehicle.multiplier * 100) / 100
      )
    : null;

  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.card,
          {
            backgroundColor: isSelected ? colors.primary : colors.card,
            borderColor: isSelected ? colors.primary : colors.border,
          },
        ]}
      >
        <Ionicons
          name={vehicle.icon as any}
          size={26}
          color={isSelected ? colors.primaryForeground : colors.foreground}
        />
        <Text
          style={[
            styles.cardName,
            { color: isSelected ? colors.primaryForeground : colors.foreground },
          ]}
        >
          {vehicle.name}
        </Text>
        {price ? (
          <Text
            style={[
              styles.cardPrice,
              { color: isSelected ? colors.primaryForeground : colors.primary },
            ]}
          >
            {price}
          </Text>
        ) : (
          <Text
            style={[
              styles.cardDesc,
              {
                color: isSelected
                  ? colors.primaryForeground + "bb"
                  : colors.mutedForeground,
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
    <View style={styles.row}>
      {VEHICLES.map((v) => (
        <VehicleCard
          key={v.id}
          vehicle={v}
          isSelected={selected === v.id}
          onSelect={() => onSelect(v.id)}
          distanceKm={distanceKm}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
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
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  cardPrice: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  cardDesc: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
