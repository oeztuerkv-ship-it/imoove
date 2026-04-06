import { Stack } from "expo-router";

/** Dashboard & Navigation; Anmeldung über Root-Route `/fahrer-login`. */
export default function DriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="navigation" />
    </Stack>
  );
}
