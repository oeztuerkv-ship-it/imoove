import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  defaultAddressPickValidation,
  EMPTY_SELECTED_ADDRESS,
  geoLocationToSelectedAddress,
  type SelectedAddress,
} from "@/components/booking/selectedAddress";
import { taxiAddressInputStyles as styles } from "@/components/booking/taxiAddressInputStyles";
import { HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { searchLocation, type GeoLocation } from "@/utils/routing";
import { rs } from "@/utils/scale";

const HELP_FIELD_FOCUS = "#111111";

type Colors = ReturnType<typeof useColors>;

export type AddressPickValidation = (
  selection: SelectedAddress,
  source?: GeoLocation,
) => { ok: true } | { ok: false; message: string };

/** Live-Taxi Route-Feld — 1:1 wie `AddressInput` in `new-booking.tsx` (routeRow + taxiRoute). */
export function TaxiAddressInput({
  value,
  subline,
  placeholder,
  onSelect,
  colors,
  showGps = false,
  onGpsPress,
  gpsLoading = false,
  userGps,
  onAfterSelect,
  onRouteClear,
  showClear = false,
  isDestination = false,
  inputRef: externalInputRef,
  validatePick = defaultAddressPickValidation,
}: {
  value: string;
  subline: string;
  placeholder: string;
  onSelect: (selection: SelectedAddress) => void;
  colors: Colors;
  showGps?: boolean;
  onGpsPress?: () => void;
  gpsLoading?: boolean;
  userGps?: { lat: number; lon: number } | null;
  onAfterSelect?: () => void;
  onRouteClear?: () => void;
  showClear?: boolean;
  isDestination?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  validatePick?: AddressPickValidation;
}) {
  const [query, setQuery] = useState(value);
  const [photonResults, setPhotonResults] = useState<GeoLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localInputRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? localInputRef;

  useEffect(() => {
    if (!value.trim()) {
      setQuery("");
      return;
    }
    if (!focused) return;
    setQuery(value);
  }, [focused, value]);

  const showPhotonResults = focused && query.length >= 2;

  const dismissEdit = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setFocused(false);
    setPhotonResults([]);
  };

  const enterEditMode = () => {
    setQuery(value);
    setFocused(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleChange = (text: string) => {
    setQuery(text);
    setPhotonResults([]);
    if (text.length === 0) {
      onSelect(EMPTY_SELECTED_ADDRESS);
    }
    if (debounce.current) clearTimeout(debounce.current);
    if (text.length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const locs = await searchLocation(text, userGps ?? undefined);
        setPhotonResults(locs.slice(0, isDestination ? 6 : 5));
      } catch {
        setPhotonResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handlePick = (selection: SelectedAddress, source?: GeoLocation) => {
    const check = validatePick(selection, source);
    if (!check.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Adresse unvollständig", check.message);
      return;
    }
    setQuery(selection.name);
    setPhotonResults([]);
    setFocused(false);
    inputRef.current?.blur();
    onSelect(selection);
    Haptics.selectionAsync();
    onAfterSelect?.();
  };

  const handlePhotonPick = (loc: GeoLocation) => {
    handlePick(geoLocationToSelectedAddress(loc), loc);
  };

  const hasSelection = value.trim().length > 0;
  const showSelectedPreview = hasSelection && !focused;
  const FieldShell = showSelectedPreview ? Pressable : View;

  const handleClear = () => {
    if (debounce.current) clearTimeout(debounce.current);
    setQuery("");
    setPhotonResults([]);
    setLoading(false);
    onSelect(EMPTY_SELECTED_ADDRESS);
    onRouteClear?.();
  };

  const fieldBorder = focused ? HELP_FIELD_FOCUS : HOME_SHEET_RIM;
  const fieldBorderWidth = focused ? 1.5 : StyleSheet.hairlineWidth;

  const showGpsBtn = showGps;
  const showClearBtn = showClear && focused && query.length > 0 && !loading;
  const showDestSpinner = isDestination && loading;
  const showRouteEditActions = false;

  return (
    <View style={styles.routeRowWrap}>
      <FieldShell
        style={[
          styles.routeRowPress,
          focused && styles.routeRowEditing,
          {
            backgroundColor: "transparent",
            borderColor: focused ? fieldBorder : "transparent",
            borderWidth: focused ? fieldBorderWidth : 0,
          },
        ]}
        {...(showSelectedPreview
          ? {
              onPress: () => {
                enterEditMode();
              },
            }
          : {})}
      >
        <View style={[styles.routeRowBody, styles.routeRowBodyGrow]}>
          {showSelectedPreview ? (
            <View style={[styles.addressPreview, styles.routeAddressPreview]}>
              <Text style={[styles.routeAddressLine1, { color: colors.foreground }]} numberOfLines={2}>
                {value}
              </Text>
              {subline ? (
                <Text style={[styles.routeAddressLine2, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {subline}
                </Text>
              ) : null}
            </View>
          ) : (
            <TextInput
              ref={inputRef}
              style={[styles.inputText, styles.routeRowInput, { color: colors.foreground }]}
              value={query}
              onChangeText={handleChange}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setTimeout(() => setFocused(false), 200);
              }}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="words"
            />
          )}
        </View>
        {showGpsBtn && onGpsPress ? (
          <Pressable hitSlop={8} onPress={onGpsPress} style={styles.liveGpsIconBtn}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="navigation" size={15} color={colors.primary} />
            )}
          </Pressable>
        ) : null}
        {showDestSpinner ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        {showClearBtn ? (
          <Pressable onPress={handleClear} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        {showRouteEditActions ? (
          <View style={styles.routeEditActionsInline}>
            <Pressable
              hitSlop={8}
              onPress={() => {
                handleClear();
                dismissEdit();
              }}
              style={({ pressed }) => [styles.routeIconBtn, { borderColor: HOME_SHEET_RIM, opacity: pressed ? 0.65 : 1 }]}
              accessibilityLabel="Adresse leeren"
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={dismissEdit}
              style={({ pressed }) => [styles.routeIconBtn, styles.routeIconBtnDone, { opacity: pressed ? 0.85 : 1 }]}
              accessibilityLabel="Fertig"
            >
              <Feather name="check" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}
        {showSelectedPreview && !showRouteEditActions ? (
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={styles.routePreviewTrailing} />
        ) : null}
      </FieldShell>

      {showPhotonResults ? (
        <View style={[styles.liveResultGroup, { borderColor: colors.border, marginTop: rs(4) }]}>
          {loading && photonResults.length === 0 ? (
            <View style={styles.liveSearchingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.liveSearchingText, { color: colors.mutedForeground }]}>Suche läuft...</Text>
            </View>
          ) : (
            photonResults.map((loc, i) => {
              const structured = geoLocationToSelectedAddress(loc);
              return (
                <React.Fragment key={`${loc.lat}-${loc.lon}-${i}`}>
                  {i > 0 ? <View style={[styles.liveResultDivider, { backgroundColor: colors.border }]} /> : null}
                  <Pressable
                    style={({ pressed }) => [styles.liveResultRow, pressed && { backgroundColor: colors.muted }]}
                    onPress={() => handlePhotonPick(loc)}
                  >
                    <View
                      style={[
                        styles.liveResultIcon,
                        { backgroundColor: isDestination ? colors.muted : "#F0F9FF" },
                      ]}
                    >
                      <Feather name="map-pin" size={15} color={isDestination ? colors.primary : "#3B82F6"} />
                    </View>
                    <View style={styles.liveResultText}>
                      <Text style={[styles.liveResultTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {structured.name}
                      </Text>
                      <Text style={[styles.liveResultSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {structured.subline || loc.displayName.split(",").slice(1, 3).join(",").trim()}
                      </Text>
                    </View>
                  </Pressable>
                </React.Fragment>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}
