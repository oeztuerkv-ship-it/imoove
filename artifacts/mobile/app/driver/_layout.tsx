import { Stack } from "expo-router";

/**
 * Fahrer-Navigation isoliert: Session-Restore resettet nur diesen Stack,
 * nicht die ganze App (Kunde/index bleibt getrennt).
 *
 * Stack-RESET läuft in `navigation.tsx` (useNavigation = Fahrer-Stack),
 * nicht hier — ein Bridge neben `<Stack>` nutzt sonst den Root-Navigator → RESET-Fehler.
 */
export default function DriverLayout() {
  return (
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
  );
}
