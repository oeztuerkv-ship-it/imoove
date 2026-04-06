import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DriverProvider } from "@/context/DriverContext";
import { RideProvider } from "@/context/RideContext";
import { RideRequestProvider } from "@/context/RideRequestContext";
import { UserProvider } from "@/context/UserContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="ride" options={{ headerShown: false }} />
      <Stack.Screen name="status" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="my-rides" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="help" options={{ headerShown: false }} />
      <Stack.Screen name="impressum" options={{ headerShown: false }} />
      <Stack.Screen name="personal-info" options={{ headerShown: false }} />
      <Stack.Screen name="wallet" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="reserve-ride" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="fahrt-reservieren" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="driver/login" options={{ headerShown: false }} />
      <Stack.Screen name="driver/dashboard" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <UserProvider>
                <DriverProvider>
                  <RideRequestProvider>
                    <RideProvider>
                      <RootLayoutNav />
                    </RideProvider>
                  </RideRequestProvider>
                </DriverProvider>
              </UserProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
