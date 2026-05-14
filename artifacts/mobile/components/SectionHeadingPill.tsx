import { StyleSheet, Text, View } from "react-native";

import { accountSheetPrimaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { rs } from "@/utils/scale";

/**
 * Sektionsüberschrift (Geldbörse + Konto): gleiche Schrift wie Konto-Zeilen (`accountRowLabel` / Geldbörse `payLabel`).
 */
export function SectionHeadingPill({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: "#FFFFFF",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: HOME_SHEET_RIM,
        borderRadius: rs(20),
        paddingHorizontal: rs(10),
        paddingVertical: rs(6),
      }}
    >
      <Text
        style={[accountSheetPrimaryLabel, { color: colors.foreground }]}
      >
        {label}
      </Text>
    </View>
  );
}
