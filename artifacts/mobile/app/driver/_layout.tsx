import { Stack } from "expo-router";

/**
 * Fahrer-Navigation isoliert: Session-Restore resettet nur diesen Stack,
 * nicht die ganze App (Kunde/index bleibt getrennt).
 *
 * Stack-RESET läuft in `navigation.tsx` (useNavigation = Fahrer-Stack),
 * nicht hier — ein Bridge neben `<Stack>` nutzt sonst den Root-Navigator → RESET-Fehler.
 */
const noSwipeBack = {
  gestureEnabled: false as const,
  fullScreenGestureEnabled: false as const,
};

export default function DriverLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        ...noSwipeBack,
      }}
    >
      <Stack.Screen name="login" options={{ gestureEnabled: true, fullScreenGestureEnabled: false }} />
      <Stack.Screen name="change-password" options={noSwipeBack} />
      <Stack.Screen name="dashboard" options={noSwipeBack} />
      <Stack.Screen
        name="inbox"
        options={{
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="create-reservation"
        options={{
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="create-funk"
        options={{
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
          animation: "slide_from_right",
        }}
      />
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
