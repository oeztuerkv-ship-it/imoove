import React from "react";
import Constants from "expo-constants";
import { Text, TurboModuleRegistry, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { GoogleNavDriveViewProps } from "@/components/driver/GoogleNavDriveView";

export default function GoogleNavigationTest() {
  const params = useLocalSearchParams<{ destLat?: string; destLon?: string }>();
  if (Constants.expoConfig?.extra?.googleNavigationEnabled !== true || !TurboModuleRegistry.get("NavModule")) {
    return <View><Text>Google-Navigation benötigt den separaten Test-Build.</Text></View>;
  }
  const Component = require("@/components/driver/GoogleNavDriveView").GoogleNavDriveView as React.ComponentType<GoogleNavDriveViewProps>;
  return <Component routeIdentity="diagnostic" destination={{ lat: Number(params.destLat ?? "48.7758"), lon: Number(params.destLon ?? "9.1829") }} />;
}
