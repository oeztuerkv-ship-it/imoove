import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { TextInput, View } from "react-native";

import { TaxiAddressInput, type AddressPickValidation } from "@/components/booking/TaxiAddressInput";
import { taxiRouteCardStyles as styles } from "@/components/booking/taxiAddressInputStyles";
import type { SelectedAddress } from "@/components/booking/selectedAddress";
import { useColors } from "@/hooks/useColors";

export type TaxiRouteAddressCardHandle = {
  focusDestAddressField: () => void;
  blurAll: () => void;
};

/** Start/Ziel-Karte — 1:1 wie `renderRouteAddressCard()` in `new-booking.tsx`. */
export const TaxiRouteAddressCard = forwardRef<
  TaxiRouteAddressCardHandle,
  {
    from: SelectedAddress;
    to: SelectedAddress;
    onFromSelect: (addr: SelectedAddress) => void;
    onToSelect: (addr: SelectedAddress) => void;
    searchUserGps: { lat: number; lon: number } | null;
    gpsLoading: boolean;
    onGpsPickup: () => void;
    validateFromPick?: AddressPickValidation;
    validateToPick?: AddressPickValidation;
  }
>(function TaxiRouteAddressCard(
  {
    from,
    to,
    onFromSelect,
    onToSelect,
    searchUserGps,
    gpsLoading,
    onGpsPickup,
    validateFromPick,
    validateToPick,
  },
  ref,
) {
  const colors = useColors();
  const originAddressInputRef = useRef<TextInput>(null);
  const destAddressInputRef = useRef<TextInput>(null);

  const focusDestAddressField = () => {
    originAddressInputRef.current?.blur();
    setTimeout(() => destAddressInputRef.current?.focus(), 150);
  };

  const blurAll = () => {
    originAddressInputRef.current?.blur();
    destAddressInputRef.current?.blur();
  };

  useImperativeHandle(ref, () => ({ focusDestAddressField, blurAll }), []);

  return (
    <View style={[styles.routeAddressCard, { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }]}>
      <View style={styles.fahrzielRoute}>
        <View style={styles.fahrzielTimeline} pointerEvents="none">
          <View style={styles.fahrzielDotOrigin} />
          <View style={[styles.fahrzielConnector, { backgroundColor: colors.border }]} />
          <View style={[styles.fahrzielDotDest, { backgroundColor: colors.primary }]} />
        </View>
        <View style={styles.fahrzielFieldsCol}>
          <TaxiAddressInput
            showGps
            userGps={searchUserGps}
            inputRef={originAddressInputRef}
            onGpsPress={onGpsPickup}
            gpsLoading={gpsLoading}
            value={from.name}
            subline={from.subline}
            placeholder="Startadresse eingeben..."
            onSelect={onFromSelect}
            onAfterSelect={focusDestAddressField}
            colors={colors}
            validatePick={validateFromPick}
          />
          <View style={[styles.fahrzielFieldSep, { backgroundColor: colors.border }]} />
          <TaxiAddressInput
            showClear
            isDestination
            userGps={searchUserGps}
            inputRef={destAddressInputRef}
            value={to.name}
            subline={to.subline}
            placeholder="Ziel eingeben..."
            onSelect={onToSelect}
            colors={colors}
            validatePick={validateToPick}
          />
        </View>
      </View>
    </View>
  );
});
