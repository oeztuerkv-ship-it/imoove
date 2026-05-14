export const onrodaTheme = {
  colors: {
    background: "#F2F2F7",
    surface: "#FFFFFF",
    surfaceSoft: "#F2F2F7",

    primary: "#DC2626",
    primarySoft: "#EF4444",

    text: "#1A1A1A",
    textSecondary: "#6E6A66",
    textMuted: "#9A948E",

    border: "#E8DED4",

    success: "#2E7D5B",
    warning: "#C48A3A",
    danger: "#B34040",
  },

  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 32,
    full: 999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  shadow: {
    soft: {
      shadowColor: "#1A1A1A",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
      elevation: 8,
    },
    card: {
      shadowColor: "#1A1A1A",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 18,
      elevation: 5,
    },
  },
} as const;

export type OnrodaTheme = typeof onrodaTheme;
