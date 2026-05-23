import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";

export type OnrodaLegalDocId = "agb" | "datenschutz";

export const ONRODA_LEGAL_DOC = {
  agb: "agb",
  datenschutz: "datenschutz",
} as const satisfies Record<OnrodaLegalDocId, OnrodaLegalDocId>;

/** Wie Fahrer-Login (`app/driver/login.tsx`): Icon 18px, gap 10, Label 15/600. */
export const LOGIN_ACTION_GAP = 10;
export const LOGIN_ACTION_ICON_SIZE = 18;

/** Leichter Shift — Icons wirken sonst optisch etwas zu weit links. */
export const LOGIN_ACTION_CONTENT_PAD_LEFT = 6;

/** Primär-/Social-Button: Icon + Text zentriert nebeneinander. */
export function loginActionButtonStyle(extra?: ViewStyle): ViewStyle {
  return {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: LOGIN_ACTION_GAP,
    ...extra,
  };
}

/** Weiße Social-Buttons (Google / E-Mail / Apple). */
export function socialLoginButtonStyle(extra?: ViewStyle): ViewStyle {
  return loginActionButtonStyle({
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingLeft: 16 + LOGIN_ACTION_CONTENT_PAD_LEFT,
    ...extra,
  });
}

/** Dunkler Anmelden-Button (E-Mail-Login). */
export function emailLoginSubmitButtonStyle(extra?: ViewStyle): ViewStyle {
  return loginActionButtonStyle({
    paddingLeft: LOGIN_ACTION_CONTENT_PAD_LEFT,
    ...extra,
  });
}

export function loginActionLabelStyle(extra?: TextStyle): TextStyle {
  return {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    ...extra,
  };
}

/** Feste Icon-Box — Vektor- und PNG-Icons gleich groß. */
export function LoginActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        width: LOGIN_ACTION_ICON_SIZE,
        height: LOGIN_ACTION_ICON_SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

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
  onPartnerRegisterPress: () => void;
  colors: FahrerHintColors;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  gap?: number;
};

/** Partner-Hinweis (z. B. Fahrer-Login unter „Noch kein Fahrerkonto?“). */
export function FahrerRegistrierenFooter({
  onPartnerRegisterPress,
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
        onPress={onPartnerRegisterPress}
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

const ONBOARDING_FEATURES = [
  {
    icon: "shield-check" as const,
    title: "Sicher & zuverlässig",
    text: "Deine Sicherheit hat bei uns Priorität.",
  },
  {
    icon: "ambulance" as const,
    title: "Krankenfahrten",
    text: "Fahrten zu Arzt, Klinik & mehr.",
  },
  {
    icon: "wheelchair-accessibility" as const,
    title: "Barrierefrei",
    text: "Rollstuhlgerechte Fahrzeuge verfügbar.",
  },
  {
    icon: "airplane" as const,
    title: "Flughafenservice",
    text: "Pünktlich und komfortabel zum Flughafen.",
  },
] as const;

type OnboardingFeatureIconsRowProps = {
  mutedColor: string;
  dividerColor: string;
  titleColor: string;
  compact?: boolean;
};

/** Vier Feature-Icons unter dem Login (Onboarding). */
export function OnboardingFeatureIconsRow({
  mutedColor,
  dividerColor,
  titleColor,
  compact = false,
}: OnboardingFeatureIconsRowProps) {
  const iconSize = compact ? 20 : 24;
  const titleSize = compact ? 8 : 9;
  const textSize = compact ? 7 : 8;

  return (
    <View style={{ flexDirection: "row", alignItems: "stretch" }}>
      {ONBOARDING_FEATURES.map((feature, index) => (
        <React.Fragment key={feature.title}>
          {index > 0 ? (
            <View
              style={{
                width: StyleSheet.hairlineWidth,
                backgroundColor: dividerColor,
                marginVertical: compact ? 2 : 4,
                opacity: 0.85,
              }}
            />
          ) : null}
          <View style={{ flex: 1, alignItems: "center", gap: compact ? 3 : 4, paddingHorizontal: compact ? 1 : 2 }}>
            <MaterialCommunityIcons name={feature.icon} size={iconSize} color={ONRODA_MARK_RED} />
            <Text
              style={{
                textAlign: "center",
                fontSize: textSize,
                lineHeight: textSize + 3,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: titleColor,
                  fontSize: titleSize,
                  lineHeight: titleSize + 3,
                }}
              >
                {feature.title}
              </Text>
              {"\n"}
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  color: mutedColor,
                  fontSize: textSize,
                  lineHeight: textSize + 3,
                }}
              >
                {feature.text}
              </Text>
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

type OnboardingSignupLegalFooterProps = {
  mutedColor: string;
  onAgbPress: () => void;
  onDatenschutzPress: () => void;
  fontSize?: number;
};

/** AGB / Datenschutz-Hinweis unter dem Onboarding. */
export function OnboardingSignupLegalFooter({
  mutedColor,
  onAgbPress,
  onDatenschutzPress,
  fontSize = 10,
}: OnboardingSignupLegalFooterProps) {
  const linkSize = fontSize;
  return (
    <Text
      style={{
        textAlign: "center",
        fontSize,
        fontFamily: "Inter_400Regular",
        color: mutedColor,
        lineHeight: fontSize + 5,
        paddingHorizontal: 8,
      }}
    >
      Mit deiner Anmeldung stimmst du unseren{" "}
      <Text
        style={{ color: ONRODA_MARK_RED, fontFamily: "Inter_600SemiBold", fontSize: linkSize }}
        onPress={onAgbPress}
      >
        AGB
      </Text>
      {" "}und{" "}
      <Text
        style={{ color: ONRODA_MARK_RED, fontFamily: "Inter_600SemiBold", fontSize: linkSize }}
        onPress={onDatenschutzPress}
      >
        Datenschutzrichtlinien
      </Text>
      {" "}zu.
    </Text>
  );
}
