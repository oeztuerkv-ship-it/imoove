import { Platform, type TextStyle, type ViewStyle } from "react-native";

import { rf, rs } from "@/utils/scale";

const androidLabel: TextStyle =
  Platform.OS === "android" ? { includeFontPadding: false } : {};

export const ACCOUNT_SHEET_FIELD_BORDER = "#3F3F46";
export const ACCOUNT_SHEET_FIELD_BORDER_FOCUS = "#111111";
export const ACCOUNT_SHEET_FIELD_BORDER_WIDTH = 1;
export const ACCOUNT_SHEET_FIELD_BORDER_WIDTH_FOCUS = 1.5;

export const accountSheetPrimaryLabel: TextStyle = {
  fontSize: rf(15),
  lineHeight: rf(20),
  fontFamily: "Inter_500Medium",
  ...androidLabel,
};

export const accountSheetSecondaryLabel: TextStyle = {
  fontSize: rf(13),
  lineHeight: rf(19),
  fontFamily: "Inter_400Regular",
  ...androidLabel,
};

export const accountSheetHeaderTitle: TextStyle = {
  fontSize: rf(17),
  lineHeight: rf(22),
  fontFamily: "Inter_600SemiBold",
  ...androidLabel,
};

export const accountSheetCardTitle: TextStyle = {
  fontSize: rf(16),
  lineHeight: rf(21),
  fontFamily: "Inter_600SemiBold",
  ...androidLabel,
};

export const accountSheetInputText: TextStyle = {
  fontSize: rf(15),
  lineHeight: rf(21),
  fontFamily: "Inter_400Regular",
  ...androidLabel,
};

export const accountSheetInputTextRelaxed: TextStyle = {
  ...accountSheetInputText,
  lineHeight: rf(24),
};

export const accountSheetModalHint: TextStyle = {
  ...accountSheetSecondaryLabel,
  lineHeight: rf(22),
};

export const accountSheetButtonLabel: TextStyle = {
  fontSize: rf(15),
  lineHeight: rf(20),
  fontFamily: "Inter_600SemiBold",
  ...androidLabel,
};

export const accountSheetToolbarAction: TextStyle = {
  fontSize: rf(14),
  lineHeight: rf(18),
  fontFamily: "Inter_600SemiBold",
  ...androidLabel,
};

export const accountSheetChipLabel: TextStyle = {
  fontSize: rf(12),
  lineHeight: rf(16),
  fontFamily: "Inter_600SemiBold",
  ...androidLabel,
};

export const accountSheetCaptionLabel: TextStyle = {
  fontSize: rf(11),
  lineHeight: rf(15),
  fontFamily: "Inter_500Medium",
  letterSpacing: 0.3,
  ...androidLabel,
};

export const accountSheetInputFieldBox: ViewStyle = {
  minHeight: rs(120),
  maxHeight: rs(200),
  borderRadius: rs(12),
  borderWidth: ACCOUNT_SHEET_FIELD_BORDER_WIDTH,
  paddingHorizontal: rs(12),
  paddingVertical: rs(14),
};
