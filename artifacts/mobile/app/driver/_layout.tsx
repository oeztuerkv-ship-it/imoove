import { CommonActions } from "@react-navigation/native";
import { Stack, useNavigation } from "expo-router";
import { useEffect } from "react";

import {
  clearDriverStackReset,
  peekDriverStackReset,
  subscribeDriverStackReset,
} from "@/utils/driverStackReset";

/**
 * Wendet CommonActions.reset auf den **Fahrer-Stack** an (nicht Root).
 * Root-RESET mit `{ name: "driver", state: … }` wird von Expo Router nicht akzeptiert.
 */
function DriverStackResetBridge() {
  const navigation = useNavigation();

  useEffect(() => {
    const apply = () => {
      const req = peekDriverStackReset();
      if (!req) return;
      try {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: req.screen, params: req.params ?? {} }],
          }),
        );
        clearDriverStackReset();
      } catch {
        /* Navigator noch nicht bereit — pending bleibt für nächsten Versuch */
      }
    };

    const unsub = subscribeDriverStackReset(apply);
    apply();
    return unsub;
  }, [navigation]);

  return null;
}

/**
 * Fahrer-Navigation isoliert: Session-Restore resettet nur diesen Stack,
 * nicht die ganze App (Kunde/index bleibt getrennt).
 */
export default function DriverLayout() {
  return (
    <>
      <DriverStackResetBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="login" options={{ gestureEnabled: true }} />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="inbox" />
        <Stack.Screen
          name="navigation"
          options={{
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
            animation: "fade",
          }}
        />
      </Stack>
    </>
  );
}
