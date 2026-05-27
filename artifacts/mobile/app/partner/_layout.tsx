import { Stack } from "expo-router";
import React from "react";

import { PartnerProvider } from "@/context/PartnerContext";
import { HOME_SHEET_BG } from "@/constants/homeSheetChrome";

export default function PartnerLayout() {
  return (
    <PartnerProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: HOME_SHEET_BG },
        }}
      />
    </PartnerProvider>
  );
}
