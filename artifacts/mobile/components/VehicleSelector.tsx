import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
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
import {
  CUSTOMER_TAXAMETER_LABEL,
  customerVehicleSurchargeLabel,
  vehicleSurchargeFromEstimates,
} from "@/utils/customerFareDisplay";
import { fetchFareEstimate, type FareEstimateApiResult } from "@/utils/fareEstimateApi";

const CAR_ICON_COLOR = "#171717";
const WHEELCHAIR_ICON_COLOR = "#0369A1";

interface VehicleSelectorProps {
  selected: VehicleType;
  onSelect: (v: VehicleType) => void;
  fromFull: string;
  fromLat?: number;
  fromLon?: number;
  toFull: string;
  toLat?: number;
  toLon?: number;
}

function VehicleCard({
  vehicle,
  isSelected,
  onSelect,
  priceLabel,
  surchargeLabel,
}: {
  vehicle: VehicleOption;
  isSelected: boolean;
  onSelect: () => void;
  priceLabel: string | null;
  surchargeLabel: string | null;
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
        {priceLabel ? (
          <>
            <Text
              style={[
                styles.cardPrice,
                { color: "#2563EB" },
              ]}
            >
              {priceLabel}
            </Text>
            {surchargeLabel ? (
              <Text style={styles.cardSurcharge}>{surchargeLabel}</Text>
            ) : null}
          </>
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

export function VehicleSelector({
  selected,
  onSelect,
  fromFull,
  fromLat,
  fromLon,
  toFull,
  toLat,
  toLon,
}: VehicleSelectorProps) {
  const [estimateByVehicle, setEstimateByVehicle] = useState<Record<string, FareEstimateApiResult | null>>({});
  const [standardTotal, setStandardTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!fromFull.trim() || !toFull.trim()) {
      setEstimateByVehicle({});
      setStandardTotal(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, FareEstimateApiResult | null> = {};
      const routeInput = {
        fromFull,
        fromLat,
        fromLon,
        toFull,
        toLat,
        toLon,
      };
      await Promise.all(
        VEHICLES.map(async (v) => {
          next[v.id] = await fetchFareEstimate(v.id, routeInput);
        }),
      );
      if (!cancelled) {
        setEstimateByVehicle(next);
        setStandardTotal(next.standard?.total ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromFull, fromLat, fromLon, toFull, toLat, toLon]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {VEHICLES.map((v) => {
        const est = estimateByVehicle[v.id];
        const surcharge = vehicleSurchargeFromEstimates(v.id, est, standardTotal);
        return (
        <VehicleCard
          key={v.id}
          vehicle={v}
          isSelected={selected === v.id}
          onSelect={() => onSelect(v.id)}
          priceLabel={est ? CUSTOMER_TAXAMETER_LABEL : null}
          surchargeLabel={customerVehicleSurchargeLabel({ vehicle: v.id, surchargeEur: surcharge })}
        />
        );
      })}
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
  cardSurcharge: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    color: "#2563EB",
  },
  cardDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
