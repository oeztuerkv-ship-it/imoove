import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import {
  CUSTOMER_PASSWORD_HINT,
  validateCustomerPasswordClient,
} from "@/utils/customerPasswordPolicy";

type Props = {
  password: string;
  confirm: string;
  onChangePassword: (v: string) => void;
  onChangeConfirm: (v: string) => void;
  colors: {
    foreground: string;
    mutedForeground: string;
    border: string;
    surface: string;
  };
  inputWrapStyle?: StyleProp<ViewStyle>;
  inputFieldStyle?: StyleProp<TextStyle>;
  onSubmitPassword?: () => void;
};

export function CustomerPasswordFields({
  password,
  confirm,
  onChangePassword,
  onChangeConfirm,
  colors,
  inputWrapStyle,
  inputFieldStyle,
  onSubmitPassword,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passwordError = useMemo(() => {
    if (!password.length) return null;
    return validateCustomerPasswordClient(password);
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirm.length) return null;
    if (password !== confirm) return "Passwörter stimmen nicht überein.";
    return null;
  }, [confirm, password]);

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 }}>
        {CUSTOMER_PASSWORD_HINT}
      </Text>

      <View style={inputWrapStyle}>
        <Feather name="lock" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[inputFieldStyle, { color: colors.foreground, flex: 1 }]}
          placeholder="Passwort"
          placeholderTextColor={colors.mutedForeground}
          value={password}
          onChangeText={onChangePassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable
          returnKeyType="next"
          textContentType="newPassword"
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={10}
          accessibilityLabel={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
        >
          <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={inputWrapStyle}>
        <Feather name="lock" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[inputFieldStyle, { color: colors.foreground, flex: 1 }]}
          placeholder="Passwort bestätigen"
          placeholderTextColor={colors.mutedForeground}
          value={confirm}
          onChangeText={onChangeConfirm}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          editable
          returnKeyType="done"
          onSubmitEditing={onSubmitPassword}
          textContentType="newPassword"
        />
        <Pressable
          onPress={() => setShowConfirm((v) => !v)}
          hitSlop={10}
          accessibilityLabel={showConfirm ? "Bestätigung verbergen" : "Bestätigung anzeigen"}
        >
          <Feather name={showConfirm ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {passwordError ? (
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#DC2626" }}>{passwordError}</Text>
      ) : null}
      {confirmError ? (
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#DC2626" }}>{confirmError}</Text>
      ) : null}
    </View>
  );
}

export function isCustomerPasswordFormValid(password: string, confirm: string): boolean {
  return (
    !validateCustomerPasswordClient(password) &&
    password.length > 0 &&
    password === confirm
  );
}
