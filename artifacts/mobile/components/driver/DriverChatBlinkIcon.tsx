import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

type Props = {
  unread: boolean;
  size?: number;
  color?: string;
};

export function DriverChatBlinkIcon({ unread, size = 18, color = "#166534" }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!unread) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, unread]);

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ opacity: unread ? pulse : 1 }}>
        <Feather name="message-circle" size={size} color={color} />
      </Animated.View>
      {unread ? <View style={styles.badge} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
});
