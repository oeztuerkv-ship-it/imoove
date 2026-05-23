import "react-native-gesture-handler";
import React, { useCallback, useEffect, useState } from "react";
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
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IntroSplash, wasIntroSplashShownThisSession } from "@/components/IntroSplash";
import { SessionRestoreCoordinator } from "@/components/SessionRestoreCoordinator";
import { HOME_SHEET_BG } from "@/constants/homeSheetChrome";
import { AppConfigProvider } from "@/context/AppConfigContext";
import { DriverProvider } from "@/context/DriverContext";
import { RideProvider } from "@/context/RideContext";
import { RideRequestProvider } from "@/context/RideRequestContext";
import { LanguageProvider } from "@/context/LanguageContext";
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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: HOME_SHEET_BG },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="ride-select" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="ride" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="status" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="google-auth" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="login-success" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="my-rides" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="sponsors" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ headerShown: false }} />
      <Stack.Screen name="impressum" options={{ headerShown: false }} />
      <Stack.Screen name="legal-web" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="personal-info" options={{ headerShown: false }} />
      <Stack.Screen name="wallet" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="reserve-ride" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="fahrt-reservieren" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen
        name="new-booking"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          gestureEnabled: false,
          animation: "none",
        }}
      />
      <Stack.Screen name="booking-center" options={{ headerShown: false, gestureEnabled: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="booking-medical" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="booking-qr" options={{ headerShown: false }} />
      <Stack.Screen name="service-detail" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="fahrer-login" options={{ headerShown: false }} />
      <Stack.Screen name="driver" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState<Error | null>(null);
  const [introFinished, setIntroFinished] = useState(() => wasIntroSplashShownThisSession());

  const showIntro = !introFinished;
  const appReady = introFinished && (fontsLoaded || Boolean(fontError));

  const handleIntroFinish = useCallback(() => {
    setIntroFinished(true);
  }, []);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

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
    if (appReady) void SplashScreen.hideAsync();
  }, [appReady]);

  /** Kein frühes `return null`: sonst fehlt `UserProvider` kurz → useUser in Screens wirft. */
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={HOME_SHEET_BG} />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView
            style={{ flex: 1, backgroundColor: HOME_SHEET_BG }}
            pointerEvents={appReady ? "auto" : "none"}
          >
            <KeyboardProvider>
              <LanguageProvider>
              <UserProvider>
                <AppConfigProvider>
                  <DriverProvider>
                    <RideRequestProvider>
                      <RideProvider>
                        <SessionRestoreCoordinator />
                        <RootLayoutNav />
                      </RideProvider>
                    </RideRequestProvider>
                  </DriverProvider>
                </AppConfigProvider>
              </UserProvider>
              </LanguageProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
      {showIntro ? <IntroSplash onFinish={handleIntroFinish} /> : null}
      {!appReady && introFinished ? <View style={styles.bootBackdrop} pointerEvents="auto" /> : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    zIndex: 9999,
    elevation: 9999,
  },
});
