import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { type GeoLocation, searchLocation } from "@/utils/routing";

interface SearchBarProps {
  placeholder?: string;
  onSelect: (location: GeoLocation) => void;
  selectedValue?: string;
  iconName?: string;
  iconColor?: string;
  dropAbove?: boolean;
}

export function SearchBar({
  placeholder = "Wohin?",
  onSelect,
  selectedValue,
  iconName,
  iconColor,
  dropAbove = false,
}: SearchBarProps) {
  const colors = useColors();
  const [query, setQuery] = useState(selectedValue ?? "");
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelectingRef = useRef(false);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isFocused && selectedValue !== undefined) {
      setQuery(selectedValue);
    }
  }, [selectedValue]);

  const handleFocus = () => {
    setIsFocused(true);
    Animated.timing(scale, { toValue: 1.02, duration: 150, useNativeDriver: true }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    setTimeout(() => {
      if (!isSelectingRef.current) {
        setResults([]);
      }
      isSelectingRef.current = false;
    }, 350);
  };

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const locs = await searchLocation(text);
        setResults(locs.slice(0, 7));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleSelect = (loc: GeoLocation) => {
    isSelectingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuery(loc.displayName.split(",")[0]);
    setResults([]);
    Keyboard.dismiss();
    onSelect(loc);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
  };

  const showDropdown = results.length > 0 || isSearching;

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.card,
            borderColor: isFocused ? colors.primary : colors.border,
            transform: [{ scale }],
          },
        ]}
      >
        {iconName ? (
          <Ionicons
            name={iconName as any}
            size={18}
            color={iconColor ?? (isFocused ? colors.primary : colors.mutedForeground)}
          />
        ) : (
          <Feather
            name="search"
            size={18}
            color={isFocused ? colors.primary : colors.mutedForeground}
          />
        )}
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          blurOnSubmit={false}
        />
        {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
        {query.length > 0 && !isSearching && (
          <Pressable onPress={handleClear} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </Animated.View>

      {showDropdown && (
        <View
          style={[
            styles.dropdown,
            dropAbove ? styles.dropdownAbove : styles.dropdownBelow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: "#000",
            },
          ]}
        >
          {isSearching && results.length === 0 ? (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.searchingText, { color: colors.mutedForeground }]}>
                Suche läuft...
              </Text>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="always"
              scrollEnabled={results.length > 4}
              style={{ maxHeight: 260 }}
              showsVerticalScrollIndicator={false}
            >
              {results.map((item, index) => (
                <View key={index.toString()}>
                  {index > 0 && (
                    <View style={[styles.separator, { backgroundColor: colors.border }]} />
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      styles.result,
                      pressed && { backgroundColor: colors.muted },
                    ]}
                    onPressIn={() => { isSelectingRef.current = true; }}
                    onPress={() => handleSelect(item)}
                  >
                    <Feather name="map-pin" size={14} color={colors.primary} />
                    <Text
                      style={[styles.resultText, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {item.displayName}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    zIndex: 100,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  dropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 9999,
    elevation: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  dropdownBelow: {
    top: "100%",
    marginTop: 6,
  },
  dropdownAbove: {
    bottom: "100%",
    marginBottom: 6,
  },
  searchingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  searchingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  result: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
  },
  resultText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 38,
  },
});
