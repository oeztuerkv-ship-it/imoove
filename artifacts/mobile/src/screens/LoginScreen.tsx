import React from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";

type NeuBeiOnrodaRegisterRowProps = {
  onRegisterPress: () => void;
  mutedColor: string;
  /** Abstand unter der Zeile (vor den Login-Buttons) */
  marginBottom?: number;
  /** Basis-Schriftgröße für die Zeile */
  fontSize?: number;
};

/**
 * Zeile wie Referenz „Bild 4“: Frage + roter Link/Button „Jetzt registrieren“.
 * Wird im Onboarding (`app/index.tsx`) und Profil-Login (`app/profile.tsx`) genutzt.
 */
export function NeuBeiOnrodaRegisterRow({
  onRegisterPress,
  mutedColor,
  marginBottom = 8,
  fontSize = 14,
}: NeuBeiOnrodaRegisterRowProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom,
      }}
    >
      <Text style={{ fontSize, fontFamily: "Inter_400Regular", color: mutedColor }}>
        Neu bei Onroda?
      </Text>
      <Pressable onPress={onRegisterPress} hitSlop={12}>
        <Text
          style={{
            fontSize,
            fontFamily: "Inter_600SemiBold",
            color: ONRODA_MARK_RED,
          }}
        >
          Jetzt registrieren
        </Text>
      </Pressable>
    </View>
  );
}

type FahrerHintColors = {
  foreground: string;
  mutedForeground: string;
  muted: string;
  border: string;
};

type FahrerRegistrierenFooterProps = {
  onAnmeldenPress: () => void;
  colors: FahrerHintColors;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  gap?: number;
};

/** Partner-Hinweis während Kunden-Registrierung (Link öffnet Partner-/Fahrerportal). */
export function FahrerRegistrierenFooter({
  onAnmeldenPress,
  colors,
  style,
  padding = 16,
  gap = 10,
}: FahrerRegistrierenFooterProps) {
  return (
    <View
      style={[
        {
          borderRadius: 20,
          borderWidth: 1,
          padding,
          gap,
          backgroundColor: colors.muted,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Text
        style={{
          textAlign: "center",
          fontSize: 16,
          fontFamily: "Inter_700Bold",
          color: colors.foreground,
          letterSpacing: 0.2,
        }}
      >
        Werde Onroda-Partner
      </Text>
      <Text
        style={{
          textAlign: "center",
          fontSize: 13,
          fontFamily: "Inter_400Regular",
          color: colors.mutedForeground,
          lineHeight: 19,
        }}
      >
        Du möchtest mit Onroda als Partner zusammenarbeiten? Starte hier mit der Registrierung.
      </Text>
      <Pressable
        onPress={onAnmeldenPress}
        style={{ alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 }}
        hitSlop={10}
      >
        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: ONRODA_MARK_RED }}>
          Registrieren
        </Text>
      </Pressable>
    </View>
  );
}
