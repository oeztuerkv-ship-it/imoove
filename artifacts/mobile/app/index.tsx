import { Stack } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
export default function HomePlaceholderScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
});
