import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as Font from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppConfigProvider } from "@/context/AppConfigContext";
import { DriverProvider } from "@/context/DriverContext";
import { RideProvider } from "@/context/RideContext";
import { RideRequestProvider } from "@/context/RideRequestContext";
import { UserProvider } from "@/context/UserContext";

WebBrowser.maybeCompleteAuthSession();
SplashScreen.preventAutoHideAsync();

/**
 * Schriften nur über `expo-font` / `Font.loadAsync` laden.
 * Nicht `useFonts` aus `@expo-google-fonts/inter` verwenden — der Hook bindet oft eine zweite
 * React-Instanz (pnpm/Metro) → „Invalid hook call“ / `useState` of null.
 */
const ROOT_FONT_MAP = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  ...Feather.font,
  ...Ionicons.font,
  ...MaterialCommunityIcons.font,
};

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="ride" options={{ headerShown: false }} />
      <Stack.Screen name="status" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="google-auth" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="login-success" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="my-rides" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="help" options={{ headerShown: false }} />
      <Stack.Screen name="impressum" options={{ headerShown: false }} />
      <Stack.Screen name="personal-info" options={{ headerShown: false }} />
      <Stack.Screen name="wallet" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="reserve-ride" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="fahrt-reservieren" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="service-detail" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="fahrer-login" options={{ headerShown: false }} />
      <Stack.Screen name="driver/login" options={{ headerShown: false }} />
      <Stack.Screen name="driver/change-password" options={{ headerShown: false }} />
      <Stack.Screen name="driver/dashboard" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Font.loadAsync(ROOT_FONT_MAP)
      .then(() => {
        if (!cancelled) setFontsLoaded(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setFontError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  /** Kein frühes `return null`: sonst fehlt `UserProvider` kurz → useUser in Screens wirft. */
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <UserProvider>
                <AppConfigProvider>
                  <DriverProvider>
                    <RideRequestProvider>
                      <RideProvider>
                        <RootLayoutNav />
                      </RideProvider>
                    </RideRequestProvider>
                  </DriverProvider>
                </AppConfigProvider>
              </UserProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
