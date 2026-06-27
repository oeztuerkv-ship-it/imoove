import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import {
  mapCustomerLegalError,
  openOnrodaLegalPage,
  recordCustomerLegalAcceptance,
} from "@/utils/customerLegalConsent";

type CustomerLegalConsentCheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  mutedColor: string;
  fontSize?: number;
  disabled?: boolean;
};

/** Checkbox + Links zu onroda.de/agb und onroda.de/datenschutz (Live-CMS). */
export function CustomerLegalConsentCheckbox({
  checked,
  onCheckedChange,
  mutedColor,
  fontSize = 11,
  disabled = false,
}: CustomerLegalConsentCheckboxProps) {
  const linkSize = fontSize;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      onPress={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      style={styles.checkboxRow}
      disabled={disabled}
    >
      <View
        style={[
          styles.checkboxBox,
          {
            borderColor: checked ? ONRODA_MARK_RED : mutedColor,
            backgroundColor: checked ? ONRODA_MARK_RED : "transparent",
          },
        ]}
      >
        {checked ? <Feather name="check" size={12} color="#fff" /> : null}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize,
          fontFamily: "Inter_400Regular",
          color: mutedColor,
          lineHeight: fontSize + 5,
        }}
      >
        Ich akzeptiere die{" "}
        <Text
          style={{ color: ONRODA_MARK_RED, fontFamily: "Inter_600SemiBold", fontSize: linkSize }}
          onPress={() => openOnrodaLegalPage("agb")}
        >
          AGB
        </Text>
        {" "}und die{" "}
        <Text
          style={{ color: ONRODA_MARK_RED, fontFamily: "Inter_600SemiBold", fontSize: linkSize }}
          onPress={() => openOnrodaLegalPage("datenschutz")}
        >
          Datenschutzerklärung
        </Text>
        .
      </Text>
    </Pressable>
  );
}

type CustomerLegalLinksFooterProps = {
  mutedColor: string;
  fontSize?: number;
};

/** Nur Links (ohne Zustimmungs-Checkbox) — z. B. unter Social-Login. */
export function CustomerLegalLinksFooter({
  mutedColor,
  fontSize = 10,
}: CustomerLegalLinksFooterProps) {
  const linkSize = fontSize;
  return (
    <Text
      style={{
        textAlign: "center",
        fontSize,
        fontFamily: "Inter_400Regular",
        color: mutedColor,
        lineHeight: fontSize + 5,
        paddingHorizontal: 8,
      }}
    >
      <Text
        style={{ color: ONRODA_MARK_RED, fontFamily: "Inter_600SemiBold", fontSize: linkSize }}
        onPress={() => openOnrodaLegalPage("agb")}
      >
        AGB
      </Text>
      {" · "}
      <Text
        style={{ color: ONRODA_MARK_RED, fontFamily: "Inter_600SemiBold", fontSize: linkSize }}
        onPress={() => openOnrodaLegalPage("datenschutz")}
      >
        Datenschutz
      </Text>
    </Text>
  );
}

type CustomerLegalConsentModalProps = {
  visible: boolean;
  onAccepted: () => void;
  onCancel: () => void;
  sessionToken: string;
  mutedColor: string;
  foregroundColor: string;
  surfaceColor: string;
  borderColor: string;
};

/** Nach OAuth, wenn noch keine Zustimmung gespeichert ist. */
export function CustomerLegalConsentModal({
  visible,
  onAccepted,
  onCancel,
  sessionToken,
  mutedColor,
  foregroundColor,
  surfaceColor,
  borderColor,
}: CustomerLegalConsentModalProps) {
  const [checked, setChecked] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setChecked(false);
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    if (!checked) {
      setError(mapCustomerLegalError("legal_acceptance_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await recordCustomerLegalAcceptance(sessionToken);
      if (!outcome.ok) {
        setError(mapCustomerLegalError(outcome.error));
        return;
      }
      onAccepted();
    } catch {
      setError(mapCustomerLegalError("legal_acceptance_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: surfaceColor, borderColor }]}>
          <Text style={[styles.modalTitle, { color: foregroundColor }]}>Konto abschließen</Text>
          <Text style={[styles.modalBody, { color: mutedColor }]}>
            Bevor du Onroda nutzen kannst, bestätige bitte unsere AGB und Datenschutzerklärung.
          </Text>
          <CustomerLegalConsentCheckbox
            checked={checked}
            onCheckedChange={setChecked}
            mutedColor={mutedColor}
            fontSize={12}
            disabled={submitting}
          />
          {error ? (
            <Text style={[styles.modalError, { color: ONRODA_MARK_RED }]}>{error}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnSecondary, { borderColor }]}
              onPress={onCancel}
              disabled={submitting}
            >
              <Text style={{ color: mutedColor, fontFamily: "Inter_600SemiBold" }}>Abbrechen</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                styles.modalBtnPrimary,
                { backgroundColor: checked && !submitting ? "#111111" : mutedColor },
              ]}
              onPress={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Weiter</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  modalBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  modalError: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnSecondary: {
    borderWidth: 1,
  },
  modalBtnPrimary: {},
});
